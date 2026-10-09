package dev.localshare.localshare

import android.content.Context
import android.content.Intent
import android.net.wifi.WifiManager
import android.os.Bundle
import android.provider.Settings
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val notificationMethodChannel = "dev.localshare.localshare/notification_sync"
    private val notificationEventChannel = "dev.localshare.localshare/notification_events"
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            val wifiManager = applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
            multicastLock = wifiManager?.createMulticastLock("LocalShareMulticastLock")?.apply {
                setReferenceCounted(true)
                acquire()
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, notificationMethodChannel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "isNotificationAccessGranted" -> result.success(isNotificationAccessGranted())
                    "openNotificationAccessSettings" -> {
                        try {
                            startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
                            result.success(true)
                        } catch (_: Exception) {
                            result.success(false)
                        }
                    }
                    else -> result.notImplemented()
                }
            }

        EventChannel(flutterEngine.dartExecutor.binaryMessenger, notificationEventChannel)
            .setStreamHandler(object : EventChannel.StreamHandler {
                private var listener: ((Map<String, Any?>) -> Unit)? = null

                override fun onListen(arguments: Any?, events: EventChannel.EventSink) {
                    val callback: (Map<String, Any?>) -> Unit = { event ->
                        runOnUiThread { events.success(event) }
                    }
                    listener = callback
                    NotificationEventBridge.addListener(callback)
                }

                override fun onCancel(arguments: Any?) {
                    listener?.let(NotificationEventBridge::removeListener)
                    listener = null
                }
            })
    }

    private fun isNotificationAccessGranted(): Boolean {
        val enabled = Settings.Secure.getString(
            contentResolver,
            "enabled_notification_listeners",
        ) ?: return false
        return enabled.split(':').any { component ->
            component.startsWith("$packageName/")
        }
    }

    override fun onDestroy() {
        try {
            multicastLock?.let {
                if (it.isHeld) {
                    it.release()
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        super.onDestroy()
    }
}
