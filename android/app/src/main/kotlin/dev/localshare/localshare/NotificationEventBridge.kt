package dev.localshare.localshare

import java.util.ArrayDeque
import java.util.concurrent.CopyOnWriteArraySet

/**
 * Small in-process bridge between NotificationListenerService and Flutter.
 *
 * Notifications can arrive while the Flutter engine is stopped, so a bounded
 * queue is retained until an EventChannel listener is attached.
 */
object NotificationEventBridge {
    private const val MAX_PENDING_EVENTS = 100
    private val pendingEvents = ArrayDeque<Map<String, Any?>>()
    private val listeners = CopyOnWriteArraySet<(Map<String, Any?>) -> Unit>()

    @Synchronized
    fun publish(event: Map<String, Any?>) {
        if (listeners.isEmpty()) {
            if (pendingEvents.size == MAX_PENDING_EVENTS) {
                pendingEvents.removeFirst()
            }
            pendingEvents.addLast(event)
            return
        }
        listeners.forEach { it(event) }
    }

    @Synchronized
    fun addListener(listener: (Map<String, Any?>) -> Unit) {
        listeners.add(listener)
        while (pendingEvents.isNotEmpty()) {
            listener(pendingEvents.removeFirst())
        }
    }

    @Synchronized
    fun removeListener(listener: (Map<String, Any?>) -> Unit) {
        listeners.remove(listener)
    }
}
