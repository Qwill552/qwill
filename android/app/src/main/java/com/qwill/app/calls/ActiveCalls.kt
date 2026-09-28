package com.qwill.app.calls

import com.qwill.app.model.CallDto
import com.qwill.app.model.CallEvent
import com.qwill.app.model.CallLiveEvent
import com.qwill.app.net.RequestGuid
import com.qwill.app.realtime.SocketConnection
import com.qwill.app.realtime.SocketEvent

fun interface ActiveCallsListener {
    fun onActiveCallsChanged(chatId: String)
}

class ActiveCalls {
    private val byChat = HashMap<String, CallDto>()
    private val listeners = ArrayList<ActiveCallsListener>()

    fun attach(socket: SocketConnection) {
        val none = RequestGuid.NONE
        socket.subscribe(SocketEvent.CALL_INVITE, CallEvent.serializer(), none) { put(it.call) }
        socket.subscribe(SocketEvent.CALL_PARTICIPANT_CHANGED, CallEvent.serializer(), none) { put(it.call) }
        socket.subscribe(SocketEvent.CALL_LIVE, CallLiveEvent.serializer(), none) { live(it.calls) }
        socket.subscribe(SocketEvent.CALL_ENDED, CallEvent.serializer(), none) { ended(it.call) }
    }

    fun callOf(chatId: String): CallDto? = byChat[chatId]

    fun addListener(listener: ActiveCallsListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: ActiveCallsListener) {
        listeners.remove(listener)
    }

    fun put(call: CallDto) {
        byChat[call.chatId] = call
        notify(call.chatId)
    }

    fun live(calls: List<CallDto>) {
        for (call in calls) byChat[call.chatId] = call
        for (call in calls) notify(call.chatId)
    }

    fun ended(call: CallDto) {
        if (byChat.remove(call.chatId) != null) notify(call.chatId)
    }

    fun clear() {
        val chats = byChat.keys.toList()
        byChat.clear()
        for (chatId in chats) notify(chatId)
    }

    private fun notify(chatId: String) {
        for (listener in ArrayList(listeners)) listener.onActiveCallsChanged(chatId)
    }
}
