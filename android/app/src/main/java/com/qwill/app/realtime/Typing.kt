package com.qwill.app.realtime

import com.qwill.app.core.TaskQueue
import com.qwill.app.model.TypingPayload
import com.qwill.app.model.UserTypingEvent
import com.qwill.app.net.ApiJson
import com.qwill.app.net.RequestGuid

data class Typist(val userId: String, val displayName: String)

fun interface TypingListener {
    fun onTypingChanged(chatId: String?)
}

class TypingStore(
    private val main: TaskQueue,
    private val selfId: () -> String?,
    private val timeoutMs: Long = TIMEOUT_MS,
) {
    private val byChat = HashMap<String, MutableList<Typist>>()
    private val timers = HashMap<String, Runnable>()
    private val listeners = ArrayList<TypingListener>()

    fun attach(socket: SocketConnection) {
        socket.subscribe(SocketEvent.USER_TYPING, UserTypingEvent.serializer(), RequestGuid.NONE) { apply(it) }
        socket.addStateListener { if (it != ConnectionState.Connected) clear() }
    }

    fun typists(chatId: String): List<Typist> = byChat[chatId]?.toList().orEmpty()

    fun addListener(listener: TypingListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: TypingListener) {
        listeners.remove(listener)
    }

    fun apply(event: UserTypingEvent) {
        if (event.userId == selfId()) return
        val key = event.chatId + ":" + event.userId
        timers.remove(key)?.let { main.cancel(it) }
        if (!event.isTyping) {
            remove(event.chatId, event.userId)
            return
        }
        val timer = Runnable {
            timers.remove(key)
            remove(event.chatId, event.userId)
        }
        timers[key] = timer
        main.postDelayed(timer, timeoutMs)
        val list = byChat.getOrPut(event.chatId) { ArrayList() }
        if (list.none { it.userId == event.userId }) {
            list.add(Typist(event.userId, event.displayName))
            notify(event.chatId)
        }
    }

    fun clear() {
        for (timer in timers.values) main.cancel(timer)
        timers.clear()
        if (byChat.isEmpty()) return
        byChat.clear()
        notify(null)
    }

    private fun remove(chatId: String, userId: String) {
        val list = byChat[chatId] ?: return
        if (!list.removeAll { it.userId == userId }) return
        if (list.isEmpty()) byChat.remove(chatId)
        notify(chatId)
    }

    private fun notify(chatId: String?) {
        for (listener in ArrayList(listeners)) listener.onTypingChanged(chatId)
    }

    companion object {
        const val TIMEOUT_MS = 5_000L
    }
}

class TypingSender(
    private val socket: SocketConnection,
    private val chatId: String,
    private val main: TaskQueue,
    private val repeatMs: Long = REPEAT_MS,
    private val idleMs: Long = IDLE_MS,
) {
    private var typing = false

    private val repeatTask: Runnable = object : Runnable {
        override fun run() {
            if (!typing) return
            send(SocketEvent.TYPING_START)
            main.postDelayed(this, repeatMs)
        }
    }
    private val idleTask = Runnable { stop() }

    fun onTextChanged(text: String) {
        if (text.isBlank()) {
            stop()
            return
        }
        if (!typing) {
            typing = true
            send(SocketEvent.TYPING_START)
            main.postDelayed(repeatTask, repeatMs)
        }
        main.cancel(idleTask)
        main.postDelayed(idleTask, idleMs)
    }

    fun onSent() {
        stop()
    }

    fun onLeave() {
        stop()
    }

    private fun stop() {
        main.cancel(idleTask)
        main.cancel(repeatTask)
        if (!typing) return
        typing = false
        send(SocketEvent.TYPING_STOP)
    }

    private fun send(event: String) {
        socket.emit(event, ApiJson.encodeToJsonElement(TypingPayload.serializer(), TypingPayload(chatId)))
    }

    companion object {
        const val REPEAT_MS = 4_000L
        const val IDLE_MS = 3_000L
    }
}
