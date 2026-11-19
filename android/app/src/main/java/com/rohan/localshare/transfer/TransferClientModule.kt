package com.rohan.localshare.transfer

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import android.net.Uri
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okio.BufferedSink
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * Pinned HTTPS Client Module executing chunk uploads and session handshakes
 * with custom certificate fingerprint verification.
 * Complies with §7: rejects peers if certificate fingerprint does not match pinned trust store.
 */
class TransferClientModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TransferClientModule"

    private fun createPinnedClient(expectedFingerprint: String?): OkHttpClient {
        val trustManager = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}

            override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
                if (expectedFingerprint.isNullOrEmpty()) {
                    return // No pin configured
                }

                val serverCert = chain?.firstOrNull()
                    ?: throw java.security.cert.CertificateException("No server certificate presented")

                val md = MessageDigest.getInstance("SHA-256")
                val digest = md.digest(serverCert.publicKey.encoded)
                val hexString = digest.joinToString(":") { String.format("%02X", it) }
                val actualFingerprint = "SHA256:$hexString"

                if (!actualFingerprint.equals(expectedFingerprint, ignoreCase = true)) {
                    throw java.security.cert.CertificateException(
                        "Certificate pinning failure: expected $expectedFingerprint, got $actualFingerprint"
                    )
                }
            }

            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }

        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, arrayOf<TrustManager>(trustManager), java.security.SecureRandom())

        return OkHttpClient.Builder()
            .sslSocketFactory(sslContext.socketFactory, trustManager)
            .hostnameVerifier { _, _ -> true } // Pinned by cert fingerprint, not DNS name
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @ReactMethod
    fun sendSessionRequest(
        url: String,
        expectedFingerprint: String?,
        payloadJson: String,
        promise: Promise
    ) {
        Thread {
            try {
                val client = createPinnedClient(expectedFingerprint)
                val body = payloadJson.toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url(url)
                    .post(body)
                    .build()

                client.newCall(request).execute().use { response ->
                    val responseBody = response.body?.string() ?: "{}"
                    if (response.isSuccessful) {
                        promise.resolve(responseBody)
                    } else {
                        promise.reject("ERR_HTTP_${response.code}", responseBody)
                    }
                }
            } catch (e: Exception) {
                promise.reject("ERR_CLIENT_REQUEST_FAILED", e.localizedMessage, e)
            }
        }.start()
    }

    @ReactMethod
    fun uploadChunk(
        url: String,
        headers: ReadableMap,
        chunkBase64: String,
        promise: Promise
    ) {
        Thread {
            try {
                val expectedFingerprint = if (headers.hasKey("x-expected-fingerprint")) {
                    headers.getString("x-expected-fingerprint")
                } else null

                val client = createPinnedClient(expectedFingerprint)
                val chunkBytes = android.util.Base64.decode(chunkBase64, android.util.Base64.NO_WRAP)
                val body = chunkBytes.toRequestBody("application/octet-stream".toMediaType())

                val reqBuilder = Request.Builder().url(url).put(body)

                if (headers.hasKey("x-localshare-session-id")) {
                    reqBuilder.addHeader("x-localshare-session-id", headers.getString("x-localshare-session-id")!!)
                }
                if (headers.hasKey("x-file-id")) {
                    reqBuilder.addHeader("x-file-id", headers.getString("x-file-id")!!)
                }
                if (headers.hasKey("x-offset")) {
                    reqBuilder.addHeader("x-offset", headers.getString("x-offset")!!)
                }

                client.newCall(reqBuilder.build()).execute().use { response ->
                    val responseBody = response.body?.string() ?: "{}"
                    if (response.isSuccessful) {
                        promise.resolve(responseBody)
                    } else {
                        promise.reject("ERR_CHUNK_FAILED_${response.code}", responseBody)
                    }
                }
            } catch (e: Exception) {
                promise.reject("ERR_UPLOAD_CHUNK", e.localizedMessage, e)
            }
        }.start()
    }

    /**
     * Stream a real file slice (content:// URI or file path) directly to the remote
     * server as a PUT body. Binary bytes never cross the React Native bridge.
     */
    @ReactMethod
    fun uploadChunkFromUri(
        url: String,
        fileUri: String,
        offset: Double,
        length: Int,
        headers: ReadableMap,
        promise: Promise
    ) {
        Thread {
            try {
                val expectedFingerprint = if (headers.hasKey("x-expected-fingerprint")) {
                    headers.getString("x-expected-fingerprint")
                } else null

                val client = createPinnedClient(expectedFingerprint)
                val body = StreamingSliceRequestBody(fileUri, offset.toLong(), length)
                val reqBuilder = Request.Builder().url(url).put(body)

                if (headers.hasKey("x-localshare-session-id")) {
                    reqBuilder.addHeader("x-localshare-session-id", headers.getString("x-localshare-session-id")!!)
                }
                if (headers.hasKey("x-file-id")) {
                    reqBuilder.addHeader("x-file-id", headers.getString("x-file-id")!!)
                }
                if (headers.hasKey("x-offset")) {
                    reqBuilder.addHeader("x-offset", headers.getString("x-offset")!!)
                }

                client.newCall(reqBuilder.build()).execute().use { response ->
                    val responseBody = response.body?.string() ?: "{}"
                    if (response.isSuccessful) {
                        promise.resolve(responseBody)
                    } else {
                        promise.reject("ERR_CHUNK_FAILED_${response.code}", responseBody)
                    }
                }
            } catch (e: Exception) {
                promise.reject("ERR_UPLOAD_CHUNK_URI", e.localizedMessage, e)
            }
        }.start()
    }

    /**
     * Stream a remote /v1/fs/download file directly into Downloads/LocalShare/<fileName>.
     * Real bytes are written to disk; nothing is buffered in the JS layer.
     */
    @ReactMethod
    fun downloadUrlToFile(url: String, fileName: String, promise: Promise) {
        Thread {
            try {
                val dir = File(
                    android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS),
                    "LocalShare"
                )
                if (!dir.exists()) dir.mkdirs()
                val destFile = File(dir, fileName)

                val client = createPinnedClient(null)
                val request = Request.Builder().url(url).get().build()

                client.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) {
                        promise.reject("ERR_DOWNLOAD_HTTP_${response.code}", "HTTP ${response.code}")
                        return@use
                    }
                    val body = response.body
                        ?: run {
                            promise.reject("ERR_DOWNLOAD_EMPTY", "Empty response body")
                            return@use
                        }
                    body.byteStream().use { input ->
                        destFile.outputStream().use { output -> input.copyTo(output) }
                    }
                    val result = Arguments.createMap()
                    result.putString("savedPath", destFile.absolutePath)
                    result.putDouble("size", destFile.length().toDouble())
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                promise.reject("ERR_DOWNLOAD_URL", e.localizedMessage, e)
            }
        }.start()
    }

    private fun openSliceStream(fileUri: String): InputStream {
        return if (fileUri.startsWith("content://")) {
            reactApplicationContext.contentResolver.openInputStream(Uri.parse(fileUri))
                ?: throw java.io.FileNotFoundException("Cannot open content URI: $fileUri")
        } else {
            val clean = if (fileUri.startsWith("file://")) fileUri.removePrefix("file://") else fileUri
            FileInputStream(File(clean))
        }
    }

    /**
     * OkHttp RequestBody that streams [length] bytes starting at [offset] from a file
     * without loading the whole slice into memory.
     */
    private inner class StreamingSliceRequestBody(
        private val fileUri: String,
        private val offset: Long,
        private val length: Int
    ) : RequestBody() {
        override fun contentType(): MediaType = "application/octet-stream".toMediaType()

        override fun contentLength(): Long = length.toLong()

        override fun writeTo(sink: BufferedSink) {
            openSliceStream(fileUri).use { stream ->
                var toSkip = offset
                while (toSkip > 0) {
                    val skipped = stream.skip(toSkip)
                    if (skipped <= 0) break
                    toSkip -= skipped
                }

                val buffer = ByteArray(64 * 1024)
                var remaining = length
                while (remaining > 0) {
                    val read = stream.read(buffer, 0, minOf(buffer.size, remaining))
                    if (read == -1) break
                    sink.write(buffer, 0, read)
                    remaining -= read
                }
            }
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
}

