package com.rohan.localshare.transfer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.Environment
import android.webkit.MimeTypeMap
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.rohan.localshare.crypto.EphemeralCertModule
import com.rohan.localshare.crypto.HashingModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.net.URLDecoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Native Android Transfer Server Module handling HTTP requests for the wire protocol.
 * Emits real events: IncomingSession, ReceiveProgress, FileReceived.
 * Requires explicit user approval (native notification + JS prompt) before accepting a session.
 */
class TransferServerModule(
    reactContext: ReactApplicationContext,
    private val certModule: EphemeralCertModule
) : ReactContextBaseJavaModule(reactContext) {

    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val threadPool = Executors.newCachedThreadPool()
    private val receivedDir: File
    private val chunkEngine: ChunkEngine
    private val activeSessions = ConcurrentHashMap<String, JSONObject>()
    private val pendingApprovals = ConcurrentHashMap<String, CountDownLatch>()
    private val approvalResults = ConcurrentHashMap<String, Boolean>()
    private var selfDeviceId: String = "android-device"
    private var selfDisplayName: String = "Android Phone"
    private var selfPlatform: String = "android"

    init {
        receivedDir = resolveReceivedDir(reactContext)
        chunkEngine = ChunkEngine(receivedDir)
    }

    override fun getName(): String = "TransferServerModule"

    /**
     * Pick a writable directory for received files. Public Downloads/LocalShare is used on
     * pre-scoped-storage devices; on Android 10+ (scoped storage) we use the app-private
     * received dir, which is always writable without MANAGE_EXTERNAL_STORAGE.
     */
    private fun resolveReceivedDir(context: ReactApplicationContext): File {
        val fallback = File(context.filesDir, "received")
        return try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
                val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                val dir = File(downloads, "LocalShare")
                if (!dir.exists()) dir.mkdirs()
                if (dir.isDirectory && dir.canWrite()) dir else fallback
            } else {
                fallback
            }
        } catch (e: Exception) {
            fallback
        }
    }

    @ReactMethod
    fun updateDeviceInfo(info: ReadableMap) {
        if (info.hasKey("deviceId")) selfDeviceId = info.getString("deviceId") ?: selfDeviceId
        if (info.hasKey("displayName")) selfDisplayName = info.getString("displayName") ?: selfDisplayName
        if (info.hasKey("platform")) selfPlatform = info.getString("platform") ?: selfPlatform
    }

    @ReactMethod
    fun startServer(port: Int, promise: Promise? = null) {
        if (isRunning) {
            promise?.resolve(port)
            return
        }

        try {
            serverSocket = ServerSocket(port)
            isRunning = true

            threadPool.execute {
                while (isRunning) {
                    try {
                        val clientSocket = serverSocket?.accept() ?: break
                        threadPool.execute {
                            handleClient(clientSocket)
                        }
                    } catch (e: Exception) {
                        if (!isRunning) break
                    }
                }
            }

            promise?.resolve(port)
        } catch (e: Exception) {
            promise?.reject("ERR_SERVER_START_FAILED", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun stopServer(promise: Promise? = null) {
        isRunning = false
        try {
            serverSocket?.close()
            serverSocket = null
            promise?.resolve(true)
        } catch (e: Exception) {
            promise?.reject("ERR_SERVER_STOP_FAILED", e.localizedMessage, e)
        }
    }

    /**
     * Called from JS when the user accepts or declines an incoming session request.
     * Releases the waiting HTTP handler thread.
     */
    @ReactMethod
    fun respondToSession(sessionId: String, accepted: Boolean, promise: Promise? = null) {
        approvalResults[sessionId] = accepted
        pendingApprovals[sessionId]?.countDown()
        promise?.resolve(true)
    }

    /**
     * The default root directory exposed to a remote explorer.
     * Prefers the shared external storage root when readable, else Downloads, else app files.
     */
    private fun browseRoot(): File {
        val storage = Environment.getExternalStorageDirectory()
        if (storage != null && storage.canRead()) return storage
        val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        if (downloads != null && downloads.canRead()) return downloads
        return reactApplicationContext.filesDir
    }

    /**
     * Resolve a client path against the browse root, defaulting to the root.
     */
    private fun resolveFsPath(requested: String?): File {
        val root = browseRoot()
        return if (requested.isNullOrEmpty()) root else File(requested)
    }

    private fun mimeTypeFor(file: File): String {
        val ext = file.extension.lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

    private fun copyRecursive(source: File, destination: File) {
        if (source.isDirectory) {
            if (!destination.exists()) destination.mkdirs()
            source.listFiles()?.forEach { child ->
                copyRecursive(child, File(destination, child.name))
            }
        } else {
            destination.parentFile?.mkdirs()
            FileInputStream(source).use { input ->
                destination.outputStream().use { output -> input.copyTo(output) }
            }
        }
    }

    private fun uniqueFile(candidate: File): File {
        if (!candidate.exists()) return candidate
        val dir = candidate.parentFile ?: File("/")
        val name = candidate.name
        val dot = name.lastIndexOf('.')
        val base = if (dot > 0) name.substring(0, dot) else name
        val ext = if (dot > 0) name.substring(dot) else ""
        var counter = 2
        var next = File(dir, "$base ($counter)$ext")
        while (next.exists()) {
            counter += 1
            next = File(dir, "$base ($counter)$ext")
        }
        return next
    }

    private fun buildFsListing(requested: String?): JSONObject {
        val root = browseRoot()
        val current = resolveFsPath(requested)
        if (!current.exists() || !current.isDirectory) {
            throw IllegalArgumentException("Requested path is not a directory")
        }
        val children = current.listFiles() ?: emptyArray()
        val dirs = children.filter { it.isDirectory }.sortedBy { it.name.lowercase() }
        val files = children.filter { it.isFile }.sortedBy { it.name.lowercase() }

        val entries = JSONArray()
        (dirs + files).forEach { child ->
            entries.put(JSONObject().apply {
                put("name", child.name)
                put("path", child.absolutePath)
                put("isDirectory", child.isDirectory)
                put("size", if (child.isFile) child.length() else 0L)
                put("lastModified", child.lastModified())
                put("mimeType", if (child.isDirectory) "inode/directory" else mimeTypeFor(child))
            })
        }

        val isAtRoot = current.absolutePath == root.absolutePath
        return JSONObject().apply {
            put("currentPath", current.absolutePath)
            put("parentPath", if (isAtRoot) JSONObject.NULL else current.parentFile?.absolutePath)
            put("entries", entries)
        }
    }

    private fun copyFsEntry(body: JSONObject): String {
        val source = File(body.optString("sourcePath"))
        if (!source.exists()) throw IllegalArgumentException("Source does not exist")
        val requestedDest = body.optString("destinationPath", "")
        val destination = if (requestedDest.isEmpty() || File(requestedDest).absolutePath == source.absolutePath) {
            val dot = source.name.lastIndexOf('.')
            val base = if (dot > 0) source.name.substring(0, dot) else source.name
            val ext = if (dot > 0) source.name.substring(dot) else ""
            uniqueFile(File(source.parentFile, "$base (Copy)$ext"))
        } else {
            uniqueFile(File(requestedDest))
        }
        copyRecursive(source, destination)
        return destination.absolutePath
    }

    private fun deleteFsEntry(body: JSONObject): String {
        val target = File(body.optString("path"))
        if (!target.exists()) throw IllegalArgumentException("Path does not exist")
        val deleted = target.absolutePath
        if (!target.deleteRecursively()) {
            throw IllegalStateException("Failed to delete $deleted")
        }
        return deleted
    }

    /**
     * Stream a file to the client with HTTP Range (206) support.
     */
    private fun streamFsFile(output: OutputStream, target: File, rangeHeader: String?) {
        val total = target.length()
        val mime = mimeTypeFor(target)

        if (rangeHeader != null && rangeHeader.startsWith("bytes=")) {
            val spec = rangeHeader.removePrefix("bytes=")
            val dash = spec.indexOf('-')
            val startPart = if (dash >= 0) spec.substring(0, dash) else spec
            val endPart = if (dash >= 0) spec.substring(dash + 1) else ""
            var start = startPart.toLongOrNull() ?: 0L
            var end = endPart.toLongOrNull() ?: (total - 1)
            if (start < 0) start = 0
            if (end >= total) end = total - 1
            if (start > end) {
                output.write("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$total\r\nConnection: close\r\n\r\n".toByteArray())
                output.flush()
                return
            }
            val length = end - start + 1
            val header = "HTTP/1.1 206 Partial Content\r\n" +
                    "Content-Type: $mime\r\n" +
                    "Content-Length: $length\r\n" +
                    "Content-Range: bytes $start-$end/$total\r\n" +
                    "Accept-Ranges: bytes\r\n" +
                    "Connection: close\r\n\r\n"
            output.write(header.toByteArray(Charsets.UTF_8))
            FileInputStream(target).use { fis ->
                fis.channel.position(start)
                val buffer = ByteArray(64 * 1024)
                var remaining = length
                while (remaining > 0) {
                    val read = fis.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                    if (read == -1) break
                    output.write(buffer, 0, read)
                    remaining -= read
                }
            }
            output.flush()
            return
        }

        val header = "HTTP/1.1 200 OK\r\n" +
                "Content-Type: $mime\r\n" +
                "Content-Length: $total\r\n" +
                "Accept-Ranges: bytes\r\n" +
                "Connection: close\r\n\r\n"
        output.write(header.toByteArray(Charsets.UTF_8))
        BufferedInputStream(FileInputStream(target)).use { input ->
            input.copyTo(output)
        }
        output.flush()
    }

    /**
     * Read the system clipboard text on the main UI thread.
     */
    private fun readClipboardText(): String {
        var result = ""
        val latch = CountDownLatch(1)
        UiThreadUtil.runOnUiThread {
            try {
                val manager = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = manager.primaryClip
                if (clip != null && clip.itemCount > 0) {
                    result = clip.getItemAt(0).coerceToText(reactApplicationContext)?.toString() ?: ""
                }
            } finally {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
        return result
    }

    /**
     * Write text to the system clipboard on the main UI thread.
     */
    private fun writeClipboardText(text: String) {
        val latch = CountDownLatch(1)
        UiThreadUtil.runOnUiThread {
            try {
                val manager = reactApplicationContext.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                manager.setPrimaryClip(ClipData.newPlainText("LocalShare", text))
            } finally {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
    }

    /**
     * Extract and URL-decode a query parameter from a raw request target (e.g. "/x?path=%2Fa").
     */
    private fun urlQueryParam(requestTarget: String, key: String): String? {
        val qIndex = requestTarget.indexOf('?')
        if (qIndex < 0) return null
        val query = requestTarget.substring(qIndex + 1)
        for (pair in query.split("&")) {
            if (pair.isEmpty()) continue
            val eq = pair.indexOf('=')
            val rawKey = if (eq >= 0) pair.substring(0, eq) else pair
            if (rawKey != key) continue
            val rawValue = if (eq >= 0) pair.substring(eq + 1) else ""
            return try {
                URLDecoder.decode(rawValue, "UTF-8")
            } catch (e: Exception) {
                rawValue
            }
        }
        return null
    }

    /**
     * Read a single HTTP header line (terminated by CRLF) directly from the raw stream,
     * one byte at a time. Returns null at EOF. Never buffers binary body bytes.
     */
    private fun readHeaderLine(input: InputStream): String? {
        val sb = java.lang.StringBuilder()
        var prev = -1
        while (true) {
            val curr = input.read()
            if (curr == -1) {
                return if (sb.isEmpty()) null else sb.toString()
            }
            if (prev == '\r'.code && curr == '\n'.code) {
                sb.setLength(sb.length - 1)
                return sb.toString()
            }
            sb.append(curr.toChar())
            prev = curr
        }
    }

    private fun handleClient(clientSocket: Socket) {
        try {
            clientSocket.use { s ->
                val input = s.getInputStream()
                val output = s.getOutputStream()

                val requestLine = readHeaderLine(input) ?: return
                val parts = requestLine.split(" ")
                if (parts.size < 2) return

                val method = parts[0].uppercase()
                val requestTarget = parts[1]
                // Strip any query string so route matching is exact; queries are read via urlQueryParam.
                val path = requestTarget.substringBefore('?')

                val headers = mutableMapOf<String, String>()
                while (true) {
                    val line = readHeaderLine(input) ?: break
                    if (line.isEmpty()) break
                    val colonIdx = line.indexOf(":")
                    if (colonIdx > 0) {
                        val key = line.substring(0, colonIdx).trim().lowercase()
                        val value = line.substring(colonIdx + 1).trim()
                        headers[key] = value
                    }
                }

                val contentLength = headers["content-length"]?.toIntOrNull() ?: 0
                val isChunked = headers["transfer-encoding"]?.contains("chunked", ignoreCase = true) == true

                // Read exactly contentLength bytes of the request body from the raw stream.
                fun readFixedBody(): ByteArray {
                    if (contentLength <= 0) return ByteArray(0)
                    val body = ByteArray(contentLength)
                    var read = 0
                    while (read < contentLength) {
                        val r = input.read(body, read, contentLength - read)
                        if (r == -1) break
                        read += r
                    }
                    return if (read == contentLength) body else body.copyOf(read)
                }

                /**
                 * Decode an RFC 7230 chunked body. Node's http client (used by the PC
                 * gateway) omits Content-Length and streams chunked, so reading a fixed
                 * length silently produced an empty body and broke every PC handshake.
                 */
                fun readChunkedBody(): ByteArray {
                    val out = java.io.ByteArrayOutputStream()
                    while (true) {
                        val sizeLine = readHeaderLine(input) ?: break
                        if (sizeLine.isEmpty()) continue
                        val sizeHex = sizeLine.substringBefore(';').trim()
                        val size = sizeHex.toIntOrNull(16) ?: break
                        if (size == 0) {
                            // Consume optional trailers up to the terminating blank line.
                            while (true) {
                                val trailer = readHeaderLine(input) ?: break
                                if (trailer.isEmpty()) break
                            }
                            break
                        }
                        val chunk = ByteArray(size)
                        var read = 0
                        while (read < size) {
                            val r = input.read(chunk, read, size - read)
                            if (r == -1) break
                            read += r
                        }
                        out.write(chunk, 0, read)
                        // Each chunk is followed by CRLF.
                        readHeaderLine(input)
                    }
                    return out.toByteArray()
                }

                fun readBody(): ByteArray = if (isChunked) readChunkedBody() else readFixedBody()

                when {
                    path == "/v1/info" && method == "GET" -> {
                        val json = JSONObject().apply {
                            put("deviceId", selfDeviceId)
                            put("displayName", selfDisplayName)
                            put("fingerprint", certModule.getFingerprint())
                            put("port", s.localPort)
                            put("platform", selfPlatform)
                            put("useTls", false)
                        }
                        sendJsonResponse(output, 200, json)
                    }

                    (path == "/api/localsend/v2/info" || path == "/v2/info") && method == "GET" -> {
                        val json = JSONObject().apply {
                            put("alias", selfDisplayName)
                            put("version", "2.2")
                            put("deviceModel", "Android")
                            put("deviceType", "mobile")
                            put("fingerprint", certModule.getFingerprint())
                            put("port", s.localPort)
                            put("protocol", "http")
                            put("download", true)
                        }
                        sendJsonResponse(output, 200, json)
                    }

                    path == "/v1/session" && method == "POST" -> {
                        val bodyStr = String(readBody(), Charsets.UTF_8)
                        val sessionJson = JSONObject(bodyStr)
                        val sessionId = sessionJson.optString("sessionId")
                        val senderName = sessionJson.optJSONObject("sender")
                            ?.optString("displayName")
                            ?.takeIf { it.isNotEmpty() }
                            ?: "Nearby Device"
                        val filesArray = sessionJson.optJSONArray("files") ?: JSONArray()
                        var totalBytes = 0L
                        for (i in 0 until filesArray.length()) {
                            totalBytes += filesArray.optJSONObject(i)?.optLong("fileSize") ?: 0L
                        }

                        activeSessions[sessionId] = sessionJson

                        // Register the latch BEFORE emitting to JS. The JS approval
                        // callback can arrive on another thread the instant the event is
                        // delivered; creating the latch afterwards dropped that approval
                        // and left the sender blocked for the full 30s timeout.
                        val latch = CountDownLatch(1)
                        pendingApprovals[sessionId] = latch

                        // Notify JS (prompt + metadata) and raise a high-priority OS notification.
                        val params = Arguments.createMap().apply {
                            putString("sessionId", sessionId)
                            putString("rawJson", bodyStr)
                            putString("senderName", senderName)
                            putInt("fileCount", filesArray.length())
                            putDouble("totalBytes", totalBytes.toDouble())
                        }
                        sendEvent("IncomingSession", params)
                        showIncomingRequestNotification(sessionId, senderName, filesArray.length())

                        // Wait for explicit user approval (max 30 seconds).
                        latch.await(30, TimeUnit.SECONDS)
                        val accepted = approvalResults.remove(sessionId) ?: false
                        pendingApprovals.remove(sessionId)

                        if (!accepted) {
                            val rejectResp = JSONObject().apply {
                                put("sessionId", sessionId)
                                put("accepted", false)
                                put("reason", "rejected_by_user")
                            }
                            sendJsonResponse(output, 200, rejectResp)
                        } else {
                            // Compute resume map
                            val resumeObj = JSONObject()
                            for (i in 0 until filesArray.length()) {
                                val fileObj = filesArray.optJSONObject(i) ?: continue
                                val fileId = fileObj.getString("fileId")
                                val offset = chunkEngine.getResumeOffset(fileId)
                                resumeObj.put(fileId, offset)
                            }

                            val resp = JSONObject().apply {
                                put("sessionId", sessionId)
                                put("accepted", true)
                                put("resume", resumeObj)
                            }
                            sendJsonResponse(output, 200, resp)
                        }
                    }

                    path == "/v1/chunk" && method == "PUT" -> {
                        val sessionId = headers["x-localshare-session-id"] ?: ""
                        val fileId = headers["x-file-id"] ?: ""
                        val offset = headers["x-offset"]?.toLongOrNull() ?: 0L

                        val chunkBytes = readBody()
                        val totalRead = chunkBytes.size

                        chunkEngine.writeChunk(fileId, offset, chunkBytes)

                        val progressParams = Arguments.createMap().apply {
                            putString("sessionId", sessionId)
                            putString("fileId", fileId)
                            putDouble("transferredBytes", (offset + totalRead).toDouble())
                            putDouble("speed", 0.0)
                        }
                        sendEvent("ReceiveProgress", progressParams)

                        val ack = JSONObject().apply {
                            put("sessionId", sessionId)
                            put("fileId", fileId)
                            put("offset", offset)
                            put("received", totalRead)
                        }
                        sendJsonResponse(output, 200, ack)
                    }

                    path == "/v1/file/commit" && method == "POST" -> {
                        val commitJson = JSONObject(String(readBody(), Charsets.UTF_8))
                        val sessionId = commitJson.optString("sessionId")
                        val fileId = commitJson.optString("fileId")
                        val expectedSha256 = commitJson.optString("sha256")

                        val partFile = File(receivedDir, "$fileId.localshare.part")
                        val actualSha = if (partFile.exists()) HashingModule.computeSha256(partFile) else ""

                        // Preserve the original file name advertised in the session handshake,
                        // stripping any path components to prevent traversal outside the store.
                        val sessionJson = activeSessions[sessionId]
                        val advertisedName = sessionJson?.optJSONArray("files")?.let { filesArr ->
                            (0 until filesArr.length())
                                .mapNotNull { filesArr.optJSONObject(it) }
                                .firstOrNull { it.optString("fileId") == fileId }
                                ?.optString("fileName")
                        }
                        val originalName = advertisedName
                            ?.let { File(it).name }
                            ?.takeIf { it.isNotEmpty() && it != "." && it != ".." }
                            ?: fileId

                        val verified = actualSha.equals(expectedSha256, ignoreCase = true)
                        val resp = JSONObject().apply {
                            put("sessionId", sessionId)
                            put("fileId", fileId)
                            put("verified", verified)
                        }

                        if (verified) {
                            val finalFile = chunkEngine.commitFile(fileId, originalName)
                            resp.put("savedPath", finalFile.absolutePath)

                            val eventParams = Arguments.createMap().apply {
                                putString("sessionId", sessionId)
                                putString("fileId", fileId)
                                putString("fileName", finalFile.name)
                                putString("savedPath", finalFile.absolutePath)
                                putDouble("fileSize", finalFile.length().toDouble())
                            }
                            sendEvent("FileReceived", eventParams)
                        }

                        sendJsonResponse(output, if (verified) 200 else 400, resp)
                    }

                    path == "/v1/fs/list" && method == "GET" -> {
                        val requested = urlQueryParam(requestTarget, "path")
                        try {
                            sendJsonResponse(output, 200, buildFsListing(requested))
                        } catch (e: Exception) {
                            sendJsonResponse(output, 404, JSONObject().put("error", e.message ?: "List failed"))
                        }
                    }

                    path == "/v1/fs/download" && method == "GET" -> {
                        val requested = urlQueryParam(requestTarget, "path")
                        val target = if (requested.isNullOrEmpty()) null else File(requested)
                        if (target == null || !target.exists() || !target.isFile) {
                            sendJsonResponse(output, 404, JSONObject().put("error", "File not found"))
                        } else {
                            val header = "HTTP/1.1 200 OK\r\n" +
                                    "Content-Type: application/octet-stream\r\n" +
                                    "Content-Length: ${target.length()}\r\n" +
                                    "Content-Disposition: attachment; filename=\"${target.name}\"\r\n" +
                                    "Connection: close\r\n\r\n"
                            output.write(header.toByteArray(Charsets.UTF_8))
                            BufferedInputStream(FileInputStream(target)).use { input ->
                                input.copyTo(output)
                            }
                            output.flush()
                        }
                    }

                    path == "/v1/fs/stream" && method == "GET" -> {
                        val requested = urlQueryParam(requestTarget, "path")
                        val target = if (requested.isNullOrEmpty()) null else File(requested)
                        if (target == null || !target.exists() || !target.isFile) {
                            sendJsonResponse(output, 404, JSONObject().put("error", "File not found"))
                        } else {
                            streamFsFile(output, target, headers["range"])
                        }
                    }

                    path == "/v1/fs/copy" && method == "POST" -> {
                        try {
                            val newPath = copyFsEntry(JSONObject(String(readBody(), Charsets.UTF_8)))
                            sendJsonResponse(output, 200, JSONObject().apply {
                                put("success", true)
                                put("newPath", newPath)
                            })
                        } catch (e: Exception) {
                            sendJsonResponse(output, 400, JSONObject().put("error", e.message ?: "Copy failed"))
                        }
                    }

                    path == "/v1/fs/delete" && method == "POST" -> {
                        try {
                            val deletedPath = deleteFsEntry(JSONObject(String(readBody(), Charsets.UTF_8)))
                            sendJsonResponse(output, 200, JSONObject().apply {
                                put("success", true)
                                put("deletedPath", deletedPath)
                            })
                        } catch (e: Exception) {
                            sendJsonResponse(output, 400, JSONObject().put("error", e.message ?: "Delete failed"))
                        }
                    }

                    path == "/v1/clipboard" && method == "GET" -> {
                        sendJsonResponse(output, 200, JSONObject().apply {
                            put("text", readClipboardText())
                            put("timestamp", System.currentTimeMillis())
                        })
                    }

                    path == "/v1/clipboard" && method == "POST" -> {
                        val body = JSONObject(String(readBody(), Charsets.UTF_8))
                        writeClipboardText(body.optString("text", ""))
                        sendJsonResponse(output, 200, JSONObject().put("success", true))
                    }

                    else -> {
                        sendJsonResponse(output, 404, JSONObject().put("error", "Not found"))
                    }
                }
            }
        } catch (e: Exception) {
            // Socket disconnects or malformed requests must never crash the app.
            e.printStackTrace()
        }
    }

    /**
     * True when this app is allowed to post notifications on the running OS version.
     */
    private fun canPostNotifications(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactApplicationContext.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(reactApplicationContext).areNotificationsEnabled()
        }
    }

    private fun showIncomingRequestNotification(sessionId: String, senderName: String, fileCount: Int) {
        // Posting without POST_NOTIFICATIONS throws SecurityException on Android 13+.
        if (!canPostNotifications()) return
        try {
            val manager = reactApplicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    REQUEST_CHANNEL_ID,
                    "Incoming Transfer Requests",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Alerts when a nearby device wants to send files"
                }
                manager.createNotificationChannel(channel)
            }

            val notification = NotificationCompat.Builder(reactApplicationContext, REQUEST_CHANNEL_ID)
                .setContentTitle("Incoming file transfer")
                .setContentText("Incoming file transfer from $senderName ($fileCount file(s))")
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .build()

            manager.notify(REQUEST_NOTIFICATION_ID + (sessionId.hashCode() and 0xFFFF), notification)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun sendJsonResponse(output: OutputStream, statusCode: Int, json: JSONObject) {
        val bytes = json.toString().toByteArray(Charsets.UTF_8)
        val header = "HTTP/1.1 $statusCode OK\r\n" +
                "Content-Type: application/json\r\n" +
                "Content-Length: ${bytes.size}\r\n" +
                "Connection: close\r\n\r\n"
        output.write(header.toByteArray(Charsets.UTF_8))
        output.write(bytes)
        output.flush()
    }

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for React Native NativeEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for React Native NativeEventEmitter
    }

    companion object {
        const val REQUEST_CHANNEL_ID = "localshare_incoming_requests"
        const val REQUEST_NOTIFICATION_ID = 53400
    }
}
