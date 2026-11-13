package com.rohan.localshare.crypto

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileInputStream
import java.security.MessageDigest

/**
 * Native streaming SHA-256 computation over local files with progress reporting.
 */
class HashingModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "HashingModule"

    @ReactMethod
    fun computeFileHash(filePath: String, promise: Promise) {
        val file = File(filePath)
        if (!file.exists() || !file.isFile) {
            promise.reject("ERR_FILE_NOT_FOUND", "File does not exist: $filePath")
            return
        }

        try {
            val totalBytes = file.length()
            var processedBytes = 0L
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(65536) // 64 KB buffer

            FileInputStream(file).use { fis ->
                var read: Int
                while (fis.read(buffer).also { read = it } != -1) {
                    digest.update(buffer, 0, read)
                    processedBytes += read

                    // Emit progress
                    val params = Arguments.createMap()
                    params.putString("filePath", filePath)
                    params.putDouble("totalBytes", totalBytes.toDouble())
                    params.putDouble("processedBytes", processedBytes.toDouble())
                    sendEvent("HashingProgress", params)
                }
            }

            val hashBytes = digest.digest()
            val hexString = hashBytes.joinToString("") { String.format("%02x", it) }

            val result = Arguments.createMap()
            result.putString("sha256", hexString)
            result.putString("filePath", filePath)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERR_HASHING_FAILED", e.localizedMessage, e)
        }
    }

    private fun sendEvent(eventName: String, params: Any?) {
        if (reactApplicationContext.hasActiveReactInstance()) {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
        }
    }

    companion object {
        fun computeSha256(file: File): String {
            val digest = MessageDigest.getInstance("SHA-256")
            val buffer = ByteArray(65536)
            FileInputStream(file).use { fis ->
                var read: Int
                while (fis.read(buffer).also { read = it } != -1) {
                    digest.update(buffer, 0, read)
                }
            }
            return digest.digest().joinToString("") { String.format("%02x", it) }
        }
    }
}
