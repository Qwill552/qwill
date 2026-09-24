package com.qwill.app.realtime

import com.qwill.app.core.TaskQueue
import com.qwill.app.model.UserPresenceEvent
import com.qwill.app.net.RequestGuid

data class PresenceInfo(val online: Boolean, val lastSeenAt: String)

fun interface PresenceListener {
    fun onPresenceChanged(userId: String?)
}

class Presence(
    private val main: TaskQueue,
    private val confirmMs: Long = CONFIRM_MS,
) {
    private val byUser = HashMap<String, PresenceInfo>()
    private val unconfirmed = HashSet<String>()
    private val listeners = ArrayList<PresenceListener>()
    private val expireTask = Runnable { expireUnconfirmed() }

    val onlineCount: Int get() = byUser.values.count { it.online }

    fun attach(socket: SocketConnection) {
        socket.subscribe(SocketEvent.USER_PRESENCE, UserPresenceEvent.serializer(), RequestGuid.NONE) { apply(it) }
        socket.addConnectedListener { onConnected() }
    }

    operator fun get(userId: String): PresenceInfo? = byUser[userId]

    fun addListener(listener: PresenceListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: PresenceListener) {
        listeners.remove(listener)
    }

    fun apply(event: UserPresenceEvent) {
        unconfirmed.remove(event.userId)
        byUser[event.userId] = PresenceInfo(event.online, event.lastSeenAt)
        notify(event.userId)
    }

    fun seed(userId: String, lastSeenAt: String) {
        if (userId in byUser) return
        byUser[userId] = PresenceInfo(false, lastSeenAt)
        notify(userId)
    }

    fun onConnected() {
        main.cancel(expireTask)
        unconfirmed.clear()
        for ((userId, info) in byUser) if (info.online) unconfirmed.add(userId)
        if (unconfirmed.isNotEmpty()) main.postDelayed(expireTask, confirmMs)
    }

    fun clear() {
        main.cancel(expireTask)
        unconfirmed.clear()
        if (byUser.isEmpty()) return
        byUser.clear()
        notify(null)
    }

    private fun expireUnconfirmed() {
        val expired = ArrayList(unconfirmed)
        unconfirmed.clear()
        for (userId in expired) {
            val info = byUser[userId] ?: continue
            byUser[userId] = info.copy(online = false)
            notify(userId)
        }
    }

    private fun notify(userId: String?) {
        for (listener in ArrayList(listeners)) listener.onPresenceChanged(userId)
    }

    companion object {
        const val CONFIRM_MS = 3_000L
    }
}
