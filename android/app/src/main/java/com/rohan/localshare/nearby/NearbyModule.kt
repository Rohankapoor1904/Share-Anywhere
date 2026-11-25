package com.rohan.localshare.nearby

import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Environment
import android.os.ParcelFileDescriptor
import android.provider.Settings
import android.util.Log
import androidx.core.location.LocationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.common.api.CommonStatusCodes
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.ConnectionsClient
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy
import java.io.File
import java.io.FileInputStream
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.io.InputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Offline phone-to-phone transport over Google Nearby Connections (BLE discovery,
 * Bluetooth bootstrap, automatic Wi-Fi Direct / hotspot / LAN bandwidth upgrade).
 *
 * The module moves bytes only. Every decision (who may send, which file a payload is,
 * whether the hash matched) lives in JS (`src/engine/nearbyController.js`), so the LAN
 * and Nearby paths share one approval and transfer model.
 *
 * Events: NearbyEndpointFound, NearbyEndpointLost, NearbyConnectionInitiated,
 * NearbyConnectionResult, NearbyDisconnected, NearbyControl, NearbyIncomingFile,
 * NearbyPayloadProgress.
 *
 * Payload ids are 64-bit and cross the bridge as strings (a JS number loses precision
 * above 2^53).
 */
class NearbyModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val client: ConnectionsClient by lazy { Nearby.getConnectionsClient(reactApplicationContext) }
    private val ioExecutor = Executors.newSingleThreadExecutor()

    private class OutgoingFile(val payload: Payload, val pfd: ParcelFileDescriptor, val totalBytes: Long)

    private class IncomingFile(val endpointId: String, val payload: Payload) {
        @Volatile var complete: Boolean = false
        @Volatile var totalBytes: Long = 0L
    }

    /** FILE payloads this device created; removed when they reach a terminal state. */
    private val outgoing = ConcurrentHashMap<Long, OutgoingFile>()

    /** FILE payloads received from peers; removed once saved or discarded. */
    private val incoming = ConcurrentHashMap<Long, IncomingFile>()

    /** payloadId -> [lastEmitMillis, lastEmitBytes] for 150 ms throttled progress + speed. */
    private val progressClock = ConcurrentHashMap<Long, LongArray>()

    override fun getName(): String = "NearbyModule"

    // ---------------------------------------------------------------------------------
    // Availability
    // ---------------------------------------------------------------------------------

    @ReactMethod
    fun isSupported(promise: Promise) {
        val result = Arguments.createMap()
        try {
            val status = GoogleApiAvailability.getInstance()
                .isGooglePlayServicesAvailable(reactApplicationContext)
            val ok = status == ConnectionResult.SUCCESS
            result.putBoolean("supported", ok)
            result.putString(
                "reason",
                if (ok) "" else "Google Play Services is not available on this device (code $status)"
            )
        } catch (e: Exception) {
            Log.w(TAG, "Play Services availability check failed", e)
            result.putBoolean("supported", false)
            result.putString("reason", e.localizedMessage ?: "Google Play Services check failed")
        }
        promise.resolve(result)
    }

    /** Android 12 and older need the system Location service on for BLE / Wi-Fi scanning. */
    @ReactMethod
    fun isLocationServiceEnabled(promise: Promise) {
        try {
            val manager = reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            promise.resolve(manager != null && LocationManagerCompat.isLocationEnabled(manager))
        } catch (e: Exception) {
            promise.reject("ERR_LOCATION_STATE", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun openLocationSettings(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_LOCATION_SETTINGS", e.localizedMessage, e)
        }
    }

    // ---------------------------------------------------------------------------------
    // Advertising / discovery
    // ---------------------------------------------------------------------------------

    @ReactMethod
    fun startAdvertising(endpointInfo: String, promise: Promise) {
        val options = AdvertisingOptions.Builder().setStrategy(STRATEGY).build()
        client.startAdvertising(endpointInfo.toByteArray(Charsets.UTF_8), SERVICE_ID, lifecycleCallback, options)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e ->
                if (statusOf(e) == ConnectionsStatusCodes.STATUS_ALREADY_ADVERTISING) {
                    promise.resolve(true)
                } else {
                    promise.reject("ERR_NEARBY_ADVERTISE", describe(e), e)
                }
            }
    }

    @ReactMethod
    fun startDiscovery(promise: Promise) {
        val options = DiscoveryOptions.Builder().setStrategy(STRATEGY).build()
        client.startDiscovery(SERVICE_ID, discoveryCallback, options)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e ->
                if (statusOf(e) == ConnectionsStatusCodes.STATUS_ALREADY_DISCOVERING) {
                    promise.resolve(true)
                } else {
                    promise.reject("ERR_NEARBY_DISCOVERY", describe(e), e)
                }
            }
    }

    @ReactMethod
    fun stopAdvertising(promise: Promise) {
        client.stopAdvertising()
        promise.resolve(true)
    }

    @ReactMethod
    fun stopDiscovery(promise: Promise) {
        client.stopDiscovery()
        promise.resolve(true)
    }

    /** Tears down advertising, discovery and every connection; drops unsaved payloads. */
    @ReactMethod
    fun stopAll(promise: Promise) {
        client.stopAllEndpoints()
        for (id in outgoing.keys.toList()) releaseOutgoing(id)
        for (id in incoming.keys.toList()) discardIncoming(id)
        progressClock.clear()
        promise.resolve(true)
    }

    // ---------------------------------------------------------------------------------
    // Connections
    // ---------------------------------------------------------------------------------

    @ReactMethod
    fun requestConnection(endpointId: String, endpointInfo: String, promise: Promise) {
        client.requestConnection(endpointInfo.toByteArray(Charsets.UTF_8), endpointId, lifecycleCallback)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e ->
                if (statusOf(e) == ConnectionsStatusCodes.STATUS_ALREADY_CONNECTED_TO_ENDPOINT) {
                    promise.resolve(true)
                } else {
                    promise.reject("ERR_NEARBY_CONNECT", describe(e), e)
                }
            }
    }

    @ReactMethod
    fun acceptConnection(endpointId: String, promise: Promise) {
        client.acceptConnection(endpointId, payloadCallback)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e -> promise.reject("ERR_NEARBY_ACCEPT", describe(e), e) }
    }

    @ReactMethod
    fun rejectConnection(endpointId: String, promise: Promise) {
        client.rejectConnection(endpointId)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e -> promise.reject("ERR_NEARBY_REJECT", describe(e), e) }
    }

    @ReactMethod
    fun disconnect(endpointId: String, promise: Promise) {
        client.disconnectFromEndpoint(endpointId)
        dropIncomingFor(endpointId)
        promise.resolve(true)
    }

    // ---------------------------------------------------------------------------------
    // Payloads
    // ---------------------------------------------------------------------------------

    /** Sends one LocalShare control message (UTF-8 JSON) as a BYTES payload. */
    @ReactMethod
    fun sendControl(endpointId: String, json: String, promise: Promise) {
        val bytes = json.toByteArray(Charsets.UTF_8)
        if (bytes.size > MAX_BYTES_PAYLOAD) {
            promise.reject("ERR_NEARBY_CONTROL_TOO_LARGE", "Control message is ${bytes.size} bytes (max $MAX_BYTES_PAYLOAD)")
            return
        }
        client.sendPayload(endpointId, Payload.fromBytes(bytes))
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e -> promise.reject("ERR_NEARBY_SEND_CONTROL", describe(e), e) }
    }

    /**
     * Opens the file and builds its FILE payload without sending it, so JS can announce
     * the payload id (fileStart) before the bytes start flowing.
     */
    @ReactMethod
    fun prepareFile(pathOrUri: String, promise: Promise) {
        try {
            val pfd = openForRead(pathOrUri)
            val payload = Payload.fromFile(pfd)
            val size = pfd.statSize
            outgoing[payload.id] = OutgoingFile(payload, pfd, size)
            val result = Arguments.createMap().apply {
                putString("payloadId", payload.id.toString())
                putDouble("totalBytes", size.toDouble())
            }
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_NEARBY_PREPARE_FILE", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun sendPreparedFile(endpointId: String, payloadIdStr: String, promise: Promise) {
        val id = payloadIdStr.toLongOrNull()
        val record = id?.let { outgoing[it] }
        if (id == null || record == null) {
            promise.reject("ERR_NEARBY_UNKNOWN_PAYLOAD", "No prepared file for payload $payloadIdStr")
            return
        }
        client.sendPayload(endpointId, record.payload)
            .addOnSuccessListener { promise.resolve(true) }
            .addOnFailureListener { e ->
                releaseOutgoing(id)
                promise.reject("ERR_NEARBY_SEND_FILE", describe(e), e)
            }
    }

    @ReactMethod
    fun cancelPayload(payloadIdStr: String, promise: Promise) {
        val id = payloadIdStr.toLongOrNull()
        if (id == null) {
            promise.reject("ERR_NEARBY_BAD_PAYLOAD_ID", "Invalid payload id: $payloadIdStr")
            return
        }
        client.cancelPayload(id)
            .addOnCompleteListener { task ->
                releaseOutgoing(id)
                discardIncoming(id)
                if (task.isSuccessful) {
                    promise.resolve(true)
                } else {
                    // Already finished or never started: nothing is left in flight either way.
                    Log.w(TAG, "cancelPayload($payloadIdStr) reported: ${task.exception?.message}")
                    promise.resolve(false)
                }
            }
    }

    /** Deletes the Nearby temp copy of a received payload that will not be kept. */
    @ReactMethod
    fun discardReceivedFile(payloadIdStr: String, promise: Promise) {
        val id = payloadIdStr.toLongOrNull()
        if (id == null) {
            promise.reject("ERR_NEARBY_BAD_PAYLOAD_ID", "Invalid payload id: $payloadIdStr")
            return
        }
        promise.resolve(discardIncoming(id))
    }

    /**
     * Moves a fully received payload into the LocalShare received folder under the
     * sender-announced name, hashing it on the way, then removes Nearby's temp copy and
     * indexes the file in MediaStore so it shows up in the gallery / Files app.
     */
    @ReactMethod
    fun saveReceivedFile(payloadIdStr: String, fileName: String, promise: Promise) {
        val id = payloadIdStr.toLongOrNull()
        if (id == null) {
            promise.reject("ERR_NEARBY_BAD_PAYLOAD_ID", "Invalid payload id: $payloadIdStr")
            return
        }
        val record = incoming[id]
        if (record == null) {
            promise.reject("ERR_NEARBY_UNKNOWN_PAYLOAD", "No received file for payload $payloadIdStr")
            return
        }
        if (!record.complete) {
            promise.reject("ERR_NEARBY_PAYLOAD_INCOMPLETE", "Payload $payloadIdStr has not finished transferring")
            return
        }
        ioExecutor.execute {
            var target: File? = null
            try {
                target = uniqueFile(File(resolveReceivedDir(), sanitizeName(fileName)))
                val digest = MessageDigest.getInstance("SHA-256")
                var size = 0L
                openIncoming(record.payload).use { input ->
                    FileOutputStream(target).use { out ->
                        val buffer = ByteArray(COPY_BUFFER)
                        while (true) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            out.write(buffer, 0, read)
                            digest.update(buffer, 0, read)
                            size += read
                        }
                        out.fd.sync()
                    }
                }
                incoming.remove(id)
                deleteNearbyTemp(record.payload)
                MediaScannerConnection.scanFile(reactApplicationContext, arrayOf(target.absolutePath), null, null)

                val result = Arguments.createMap().apply {
                    putString("payloadId", payloadIdStr)
                    putString("savedPath", target.absolutePath)
                    putString("fileName", target.name)
                    putDouble("fileSize", size.toDouble())
                    putString("sha256", digest.digest().joinToString("") { String.format("%02x", it) })
                }
                promise.resolve(result)
            } catch (e: Exception) {
                if (target != null && target.exists() && !target.delete()) {
                    Log.w(TAG, "Could not remove partial copy ${target.absolutePath}")
                }
                promise.reject("ERR_NEARBY_SAVE_FAILED", e.localizedMessage, e)
            }
        }
    }

    /** Removes a saved file that failed verification. Only files inside the received folder. */
    @ReactMethod
    fun deleteSavedFile(path: String, promise: Promise) {
        try {
            val dir = resolveReceivedDir().canonicalFile
            val file = File(path).canonicalFile
            if (!file.path.startsWith(dir.path + File.separator)) {
                promise.reject("ERR_NEARBY_DELETE_OUTSIDE", "Refusing to delete a file outside ${dir.path}")
                return
            }
            promise.resolve(!file.exists() || file.delete())
        } catch (e: Exception) {
            promise.reject("ERR_NEARBY_DELETE_FAILED", e.localizedMessage, e)
        }
    }

    // ---------------------------------------------------------------------------------
    // Callbacks
    // ---------------------------------------------------------------------------------

    private val discoveryCallback = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            sendEvent("NearbyEndpointFound", Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("endpointName", info.endpointName ?: "")
                putString("endpointInfo", decodeInfo(info.endpointInfo))
            })
        }

        override fun onEndpointLost(endpointId: String) {
            sendEvent("NearbyEndpointLost", Arguments.createMap().apply {
                putString("endpointId", endpointId)
            })
        }
    }

    private val lifecycleCallback = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            sendEvent("NearbyConnectionInitiated", Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("endpointName", info.endpointName ?: "")
                putString("endpointInfo", decodeInfo(info.endpointInfo))
                putString("authDigits", info.authenticationDigits ?: "")
                putBoolean("isIncoming", info.isIncomingConnection)
            })
        }

        override fun onConnectionResult(endpointId: String, resolution: ConnectionResolution) {
            val code = resolution.status.statusCode
            sendEvent("NearbyConnectionResult", Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putBoolean("connected", code == CommonStatusCodes.SUCCESS)
                putInt("statusCode", code)
                putString(
                    "statusMessage",
                    resolution.status.statusMessage ?: CommonStatusCodes.getStatusCodeString(code)
                )
            })
        }

        override fun onDisconnected(endpointId: String) {
            dropIncomingFor(endpointId)
            sendEvent("NearbyDisconnected", Arguments.createMap().apply {
                putString("endpointId", endpointId)
            })
        }
    }

    private val payloadCallback = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            when (payload.type) {
                Payload.Type.BYTES -> {
                    val bytes = payload.asBytes()
                    if (bytes == null) {
                        Log.w(TAG, "BYTES payload ${payload.id} from $endpointId had no data")
                        return
                    }
                    sendEvent("NearbyControl", Arguments.createMap().apply {
                        putString("endpointId", endpointId)
                        putString("json", String(bytes, Charsets.UTF_8))
                    })
                }
                Payload.Type.FILE -> {
                    incoming[payload.id] = IncomingFile(endpointId, payload)
                    sendEvent("NearbyIncomingFile", Arguments.createMap().apply {
                        putString("endpointId", endpointId)
                        putString("payloadId", payload.id.toString())
                        putDouble("totalBytes", (payload.asFile()?.size ?: -1L).toDouble())
                    })
                }
                else -> {
                    // STREAM payloads are not part of the LocalShare protocol.
                    Log.w(TAG, "Cancelling unsupported payload type ${payload.type} from $endpointId")
                    client.cancelPayload(payload.id)
                }
            }
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) {
            val id = update.payloadId
            val direction = when {
                outgoing.containsKey(id) -> "send"
                incoming.containsKey(id) -> "receive"
                else -> return // BYTES control payloads and already-released files
            }
            val status = when (update.status) {
                PayloadTransferUpdate.Status.SUCCESS -> "success"
                PayloadTransferUpdate.Status.FAILURE -> "failure"
                PayloadTransferUpdate.Status.CANCELED -> "canceled"
                else -> "in_progress"
            }
            val terminal = status != "in_progress"
            val now = System.currentTimeMillis()
            val clock = progressClock.getOrPut(id) { longArrayOf(0L, 0L) }
            val elapsed = now - clock[0]
            if (!terminal && clock[0] != 0L && elapsed < PROGRESS_INTERVAL_MS) return
            val speed = if (clock[0] != 0L && elapsed > 0) {
                ((update.bytesTransferred - clock[1]) * 1000.0) / elapsed
            } else {
                0.0
            }
            clock[0] = now
            clock[1] = update.bytesTransferred

            if (direction == "receive") {
                incoming[id]?.let { record ->
                    record.totalBytes = update.totalBytes
                    if (status == "success") record.complete = true
                }
            }

            sendEvent("NearbyPayloadProgress", Arguments.createMap().apply {
                putString("endpointId", endpointId)
                putString("payloadId", id.toString())
                putDouble("bytesTransferred", update.bytesTransferred.toDouble())
                putDouble("totalBytes", update.totalBytes.toDouble())
                putDouble("speed", speed)
                putString("status", status)
                putString("direction", direction)
            })

            if (terminal) {
                progressClock.remove(id)
                if (direction == "send") releaseOutgoing(id)
                // A received file that failed or was cancelled is never saved.
                if (direction == "receive" && status != "success") discardIncoming(id)
            }
        }
    }

    // ---------------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------------

    private fun openForRead(pathOrUri: String): ParcelFileDescriptor {
        return if (pathOrUri.startsWith("content://")) {
            reactApplicationContext.contentResolver.openFileDescriptor(Uri.parse(pathOrUri), "r")
                ?: throw FileNotFoundException("Cannot open content URI: $pathOrUri")
        } else {
            val file = File(if (pathOrUri.startsWith("file://")) pathOrUri.removePrefix("file://") else pathOrUri)
            if (!file.isFile) throw FileNotFoundException("File does not exist: $pathOrUri")
            ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        }
    }

    private fun openIncoming(payload: Payload): InputStream {
        val file = payload.asFile() ?: throw FileNotFoundException("Payload ${payload.id} is not a file")
        val uri = file.asUri()
        if (uri != null) {
            return reactApplicationContext.contentResolver.openInputStream(uri)
                ?: throw FileNotFoundException("Cannot open received payload URI $uri")
        }
        @Suppress("DEPRECATION")
        val javaFile = file.asJavaFile()
        if (javaFile != null && javaFile.isFile) return FileInputStream(javaFile)
        return ParcelFileDescriptor.AutoCloseInputStream(file.asParcelFileDescriptor())
    }

    /** Removes Nearby's own temp copy of a received FILE payload. */
    private fun deleteNearbyTemp(payload: Payload) {
        val file = payload.asFile() ?: return
        try {
            val uri = file.asUri()
            if (uri != null) {
                reactApplicationContext.contentResolver.delete(uri, null, null)
            } else {
                @Suppress("DEPRECATION")
                val javaFile = file.asJavaFile()
                if (javaFile != null && javaFile.exists() && !javaFile.delete()) {
                    Log.w(TAG, "Could not delete Nearby temp file ${javaFile.absolutePath}")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed deleting Nearby temp payload ${payload.id}", e)
        }
        try {
            payload.close()
        } catch (e: Exception) {
            Log.w(TAG, "Failed closing payload ${payload.id}", e)
        }
    }

    private fun discardIncoming(id: Long): Boolean {
        val record = incoming.remove(id) ?: return false
        deleteNearbyTemp(record.payload)
        return true
    }

    private fun dropIncomingFor(endpointId: String) {
        for ((id, record) in incoming.entries.toList()) {
            if (record.endpointId == endpointId && !record.complete) discardIncoming(id)
        }
    }

    private fun releaseOutgoing(id: Long) {
        val record = outgoing.remove(id) ?: return
        try {
            record.pfd.close()
        } catch (e: Exception) {
            Log.w(TAG, "Failed closing outgoing file descriptor for payload $id", e)
        }
    }

    /** Same destination rules as TransferServerModule, so both transports land together. */
    private fun resolveReceivedDir(): File {
        val fallback = File(reactApplicationContext.filesDir, "received")
        if (!fallback.exists()) fallback.mkdirs()
        return try {
            val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val dir = File(downloads, "LocalShare")
            if (!dir.exists()) dir.mkdirs()
            if (dir.isDirectory && dir.canWrite()) dir else fallback
        } catch (e: Exception) {
            Log.w(TAG, "Public Downloads/LocalShare unavailable, using app storage", e)
            fallback
        }
    }

    private fun uniqueFile(candidate: File): File {
        if (!candidate.exists()) return candidate
        val name = candidate.nameWithoutExtension
        val ext = candidate.extension.let { if (it.isEmpty()) "" else ".$it" }
        var index = 1
        while (true) {
            val next = File(candidate.parentFile, "$name ($index)$ext")
            if (!next.exists()) return next
            index++
        }
    }

    private fun sanitizeName(raw: String): String {
        val base = File(raw).name
            .replace(Regex("[\\u0000-\\u001f\\\\/:*?\"<>|]"), "_")
            .trim()
            .take(200)
        return if (base.isEmpty() || base == "." || base == "..") "nearby-file" else base
    }

    private fun decodeInfo(bytes: ByteArray?): String =
        if (bytes == null || bytes.isEmpty()) "" else String(bytes, Charsets.UTF_8)

    private fun statusOf(e: Exception): Int = (e as? ApiException)?.statusCode ?: -1

    private fun describe(e: Exception): String {
        val code = statusOf(e)
        return if (code >= 0) {
            "Nearby status $code: ${e.localizedMessage ?: CommonStatusCodes.getStatusCodeString(code)}"
        } else {
            e.localizedMessage ?: e.toString()
        }
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

    override fun invalidate() {
        client.stopAllEndpoints()
        for (id in outgoing.keys.toList()) releaseOutgoing(id)
        ioExecutor.shutdown()
        super.invalidate()
    }

    companion object {
        private const val TAG = "LocalShareNearby"
        const val SERVICE_ID = "com.rohan.localshare"
        private val STRATEGY: Strategy = Strategy.P2P_POINT_TO_POINT
        /** ConnectionsClient.MAX_BYTES_DATA_SIZE (32 KiB). */
        const val MAX_BYTES_PAYLOAD = 32768
        private const val COPY_BUFFER = 256 * 1024
        private const val PROGRESS_INTERVAL_MS = 150L
    }
}
