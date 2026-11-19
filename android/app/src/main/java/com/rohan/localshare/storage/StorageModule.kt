package com.rohan.localshare.storage

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.UiThreadUtil
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Native Android storage resolver adhering to Scoped Storage and SAF guidelines.
 * Also exposes all-files access management and system clipboard access.
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

    /**
     * Whether the app currently holds MANAGE_EXTERNAL_STORAGE (all-files) access.
     */
    @ReactMethod
    fun hasAllFilesAccess(promise: Promise) {
        try {
            val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                Environment.isExternalStorageManager()
            } else {
                true
            }
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.reject("ERR_ALL_FILES_ACCESS", e.localizedMessage, e)
        }
    }

    /**
     * Launch the system "All files access" settings screen for this app (Android 11+).
     */
    @ReactMethod
    fun requestAllFilesAccess(promise: Promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val intent = Intent(
                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:${reactApplicationContext.packageName}")
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                reactApplicationContext.startActivity(intent)
                promise.resolve(true)
            } else {
                promise.resolve(true)
            }
        } catch (e: Exception) {
            promise.reject("ERR_REQUEST_ALL_FILES_ACCESS", e.localizedMessage, e)
        }
    }

    /**
     * Open a remote media URL in the device's native player/browser.
     */
    @ReactMethod
    fun openRemoteStreamUrl(url: String, mimeType: String, promise: Promise) {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(Uri.parse(url), mimeType)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            reactApplicationContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_OPEN_STREAM", e.localizedMessage, e)
        }
    }

    @ReactMethod
    fun getClipboardText(promise: Promise) {
        val latch = CountDownLatch(1)
        var result = ""
        UiThreadUtil.runOnUiThread {
            try {
                val manager = reactApplicationContext
                    .getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                val clip = manager.primaryClip
                if (clip != null && clip.itemCount > 0) {
                    result = clip.getItemAt(0).coerceToText(reactApplicationContext)?.toString() ?: ""
                }
            } finally {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
        promise.resolve(result)
    }

    @ReactMethod
    fun setClipboardText(text: String, promise: Promise) {
        val latch = CountDownLatch(1)
        UiThreadUtil.runOnUiThread {
            try {
                val manager = reactApplicationContext
                    .getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                manager.setPrimaryClip(ClipData.newPlainText("LocalShare", text))
            } finally {
                latch.countDown()
            }
        }
        latch.await(2, TimeUnit.SECONDS)
        promise.resolve(true)
    }
}
