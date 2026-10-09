package dev.localshare.localshare

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class NotificationSyncService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        publish("posted", sbn)
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        publish("removed", sbn)
    }

    private fun publish(type: String, sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val event = mutableMapOf<String, Any?>(
            "type" to type,
            "key" to sbn.key,
            "packageName" to sbn.packageName,
            "postTime" to sbn.postTime,
            "id" to sbn.id,
            "tag" to sbn.tag,
        )

        // These fields are optional and may be absent for non-text notifications.
        extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.let {
            event["title"] = it
        }
        extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.let {
            event["text"] = it
        }
        NotificationEventBridge.publish(event)
    }
}
