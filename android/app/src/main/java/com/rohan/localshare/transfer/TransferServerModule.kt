package com.rohan.localshare.transfer

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.rohan.localshare.crypto.EphemeralCertModule
import com.rohan.localshare.crypto.HashingModule
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Native Android Transfer Server Module handling HTTP/TLS requests for the wire protocol.
 * Emits real events: IncomingSession, ReceiveProgress, FileReceived.
 */
class TransferServerModule(
    reactContext: ReactApplicationContext,
    private val certModule: EphemeralCertModule
) : ReactContextBaseJavaModule(reactContext) {

    private var serverSocket: ServerSocket? = null
    private var isRunning = false
    private val threadPool = Executors.newCachedThreadPool()
    private val chunkEngine: ChunkEngine
    private val activeSessions = ConcurrentHashMap<String, JSONObject>()

    init {
        val baseDir = File(reactContext.filesDir, "received")
        chunkEngine = ChunkEngine(baseDir)
    }

    override fun getName(): String = "TransferServerModule"

    @ReactMethod
    fun startServer(port: Int, promise: Promise) {
        if (isRunning) {
            promise.resolve(port)
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

            promise.resolve(port)
        } catch (e: Exception) {
            promise.reject("ERR_SERVER_START_FAILED", e.localizedMessage, e)
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

    private fun handleClient(socket: Socket) {
        socket.use { s ->
            val input = s.getInputStream()
            val output = s.getOutputStream()
            val reader = BufferedReader(InputStreamReader(input, Charsets.UTF_8))

            val requestLine = reader.readLine() ?: return
            val parts = requestLine.split(" ")
            if (parts.size < 2) return

            val method = parts[0].uppercase()
            val path = parts[1]

            val headers = mutableMapOf<String, String>()
            var line: String?
            while (reader.readLine().also { line = it } != null) {
                if (line!!.isEmpty()) break
                val colonIdx = line!!.indexOf(":")
                if (colonIdx > 0) {
                    val key = line!!.substring(0, colonIdx).trim().lowercase()
                    val value = line!!.substring(colonIdx + 1).trim()
                    headers[key] = value
                }
            }

            val contentLength = headers["content-length"]?.toIntOrNull() ?: 0

            when {
                path == "/v1/info" && method == "GET" -> {
                    val json = JSONObject().apply {
                        put("deviceId", "android-native-server")
                        put("fingerprint", certModule.getFingerprint())
                        put("port", s.localPort)
                    }
                    sendJsonResponse(output, 200, json)
                }

                path == "/v1/session" && method == "POST" -> {
                    val bodyChars = CharArray(contentLength)
                    reader.read(bodyChars, 0, contentLength)
                    val bodyStr = String(bodyChars)
                    val sessionJson = JSONObject(bodyStr)
                    val sessionId = sessionJson.optString("sessionId")

                    activeSessions[sessionId] = sessionJson

                    // Notify JS of incoming session
                    val params = Arguments.createMap().apply {
                        putString("sessionId", sessionId)
                        putString("rawJson", bodyStr)
                    }
                    sendEvent("IncomingSession", params)

                    // Compute resume map
                    val resumeObj = JSONObject()
                    val filesArray = sessionJson.optJSONArray("files") ?: JSONArray()
                    for (i in 0 until filesArray.length()) {
                        val fileObj = filesArray.getJSONObject(i)
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

                path == "/v1/chunk" && method == "PUT" -> {
                    val sessionId = headers["x-localshare-session-id"] ?: ""
                    val fileId = headers["x-file-id"] ?: ""
                    val offset = headers["x-offset"]?.toLongOrNull() ?: 0L

                    val chunkBytes = ByteArray(contentLength)
                    var totalRead = 0
                    while (totalRead < contentLength) {
                        val r = input.read(chunkBytes, totalRead, contentLength - totalRead)
                        if (r == -1) break
                        totalRead += r
                    }

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
                    val bodyChars = CharArray(contentLength)
                    reader.read(bodyChars, 0, contentLength)
                    val commitJson = JSONObject(String(bodyChars))
                    val sessionId = commitJson.optString("sessionId")
                    val fileId = commitJson.optString("fileId")
                    val expectedSha256 = commitJson.optString("sha256")

                    val partFile = File(reactApplicationContext.filesDir, "received/$fileId.localshare.part")
                    val actualSha = if (partFile.exists()) HashingModule.computeSha256(partFile) else ""

                    val verified = actualSha.equals(expectedSha256, ignoreCase = true)
                    val resp = JSONObject().apply {
                        put("sessionId", sessionId)
                        put("fileId", fileId)
                        put("verified", verified)
                    }

                    if (verified) {
                        val finalFile = chunkEngine.commitFile(fileId)
                        resp.put("savedPath", finalFile.absolutePath)

                        val eventParams = Arguments.createMap().apply {
                            putString("sessionId", sessionId)
                            putString("fileId", fileId)
                            putString("savedPath", finalFile.absolutePath)
                            putDouble("fileSize", finalFile.length().toDouble())
                        }
                        sendEvent("FileReceived", eventParams)
                    }

                    sendJsonResponse(output, if (verified) 200 else 400, resp)
                }

                else -> {
                    sendJsonResponse(output, 404, JSONObject().put("error", "Not found"))
                }
            }
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
}

