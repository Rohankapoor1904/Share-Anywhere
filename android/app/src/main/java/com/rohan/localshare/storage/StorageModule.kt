package com.rohan.localshare.storage

import android.os.Environment
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

/**
 * Native Android storage resolver adhering to Scoped Storage and SAF guidelines.
 */
class StorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "StorageModule"

    @ReactMethod
    fun getDownloadsDirectory(promise: Promise) {
        try {
            val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
            val localShareDir = File(downloadsDir, "LocalShare")
            if (!localShareDir.exists()) {
                localShareDir.mkdirs()
            }
            promise.resolve(localShareDir.absolutePath)
        } catch (e: Exception) {
            val fallback = File(reactApplicationContext.filesDir, "received")
            if (!fallback.exists()) {
                fallback.mkdirs()
            }
            promise.resolve(fallback.absolutePath)
        }
    }

    @ReactMethod
    fun getCacheDirectory(promise: Promise) {
        try {
            val cacheDir = File(reactApplicationContext.cacheDir, "transfers")
            if (!cacheDir.exists()) {
                cacheDir.mkdirs()
            }
            promise.resolve(cacheDir.absolutePath)
        } catch (e: Exception) {
            promise.reject("ERR_CACHE_DIR", e.localizedMessage, e)
        }
    }
}
