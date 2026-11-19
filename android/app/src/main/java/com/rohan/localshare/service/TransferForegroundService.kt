package com.rohan.localshare.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Android Foreground Service to maintain CPU wake locks and network execution during active file transfers.
 * Complies with Android 14 (targetSdk 34) dataSync foreground service type.
 */
class TransferForegroundService : Service() {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()

        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "LocalShare:TransferWakeLock"
        ).apply {
            setReferenceCounted(false)
            acquire(10 * 60 * 1000L) // 10 minutes timeout
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra("title") ?: "LocalShare Active"
        val content = intent?.getStringExtra("content") ?: "Transferring files over local network..."
        val progress = intent?.getIntExtra("progress", -1) ?: -1

        val notification = buildNotification(title, content, progress)

        // startForeground() throws ForegroundServiceStartNotAllowedException when the
        // process is background-restricted, and SecurityException when the dataSync type
        // permission is missing. Both escape onStartCommand and kill the process, so a
        // receive from a PC crashed the app instead of merely skipping the notification.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        // Live progress updates arrive as repeated startService() intents; re-notify so
        // the ongoing notification reflects real bytes rather than a static "transferring".
        // notify() throws SecurityException on Android 13+ when POST_NOTIFICATIONS was
        // denied, and an exception here kills the service thread and the app with it.
        if (progress >= 0 && canPostNotifications()) {
            NotificationManagerCompat.from(this).notify(NOTIFICATION_ID, notification)
        }

        return START_NOT_STICKY
    }

    private fun canPostNotifications(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
        } else {
            NotificationManagerCompat.from(this).areNotificationsEnabled()
        }
    }

    override fun onDestroy() {
        wakeLock?.let {
            if (it.isHeld) {
                it.release()
            }
        }
        wakeLock = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun buildNotification(title: String, content: String, progress: Int): Notification {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)

        if (progress in 0..100) {
            builder.setProgress(100, progress, false)
        }

        return builder.build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "LocalShare File Transfers",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows progress of active local network file transfers"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    companion object {
        const val CHANNEL_ID = "localshare_transfers_channel"
        const val NOTIFICATION_ID = 53319
    }
}

/**
 * React Native Module exposing Foreground Service lifecycle controls.
 */
class TransferForegroundServiceModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "TransferForegroundService"

    @ReactMethod
    fun startService(title: String, content: String) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, TransferForegroundService::class.java).apply {
                putExtra("title", title)
                putExtra("content", content)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            sendEvent("ServiceState", "started")
        } catch (e: Exception) {
            // Foreground service start can be rejected by the OS in background-restricted states
            sendEvent("ServiceState", "start_failed")
        }
    }

    /**
     * Push a live progress update into the running foreground-service notification.
     * @param progress integer percentage 0-100, or -1 for an indeterminate/plain update.
     */
    @ReactMethod
    fun updateProgress(title: String, content: String, progress: Int) {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, TransferForegroundService::class.java).apply {
                putExtra("title", title)
                putExtra("content", content)
                putExtra("progress", progress)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }

            sendEvent("ServiceState", "progress")
        } catch (e: Exception) {
            // Service may be stopped or background-restricted; surface the failure to JS.
            sendEvent("ServiceState", "progress_failed")
        }
    }

    @ReactMethod
    fun stopService() {
        try {
            val context = reactApplicationContext
            val intent = Intent(context, TransferForegroundService::class.java)
            context.stopService(intent)

            sendEvent("ServiceState", "stopped")
        } catch (e: Exception) {
            sendEvent("ServiceState", "stop_failed")
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

