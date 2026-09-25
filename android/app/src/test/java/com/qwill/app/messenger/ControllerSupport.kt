package com.qwill.app.messenger

import com.qwill.app.core.TaskQueue
import com.qwill.app.database.SyncCursor
import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatListResponse
import com.qwill.app.model.ChatMuteResponse
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageSendPayload
import com.qwill.app.model.MessagesAround
import com.qwill.app.model.MessagesPage
import com.qwill.app.model.MessagesSyncResponse
import com.qwill.app.net.ApiCallback
import com.qwill.app.net.ApiResult
import com.qwill.app.net.NetworkError

class ManualQueue : TaskQueue {
    private class Delayed(val at: Long, val order: Long, val task: Runnable)

    var now = 0L
        private set

    private val ready = ArrayDeque<Runnable>()
    private val delayed = ArrayList<Delayed>()
    private var running = false
    private var order = 0L

    override fun post(task: Runnable) {
        ready.addLast(task)
        runReady()
    }

    override fun postDelayed(task: Runnable, delayMs: Long) {
        delayed.add(Delayed(now + delayMs, order++, task))
    }

    override fun cancel(task: Runnable) {
        ready.removeAll { it === task }
        delayed.removeAll { it.task === task }
    }

    fun advance(ms: Long) {
        val target = now + ms
        while (true) {
            val next = delayed.filter { it.at <= target }.minWithOrNull(compareBy<Delayed>({ it.at }, { it.order })) ?: break
            delayed.remove(next)
            now = next.at
            next.task.run()
            runReady()
        }
        now = target
    }

    fun pendingDelays(): List<Long> = delayed.sortedBy { it.at }.map { it.at - now }

    private fun runReady() {
        if (running) return
        running = true
        try {
            while (ready.isNotEmpty()) ready.removeFirst().run()
        } finally {
            running = false
        }
    }
}

class FakeTransport : MessagesTransport {
    class Held<T>(val call: String, val callback: ApiCallback<T>) {
        fun reply(result: ApiResult<T>) = callback.onResult(result)
    }

    val calls = ArrayList<String>()
    val sent = ArrayList<MessageSendPayload>()
    val heldSends = ArrayList<Held<MessageDto>>()
    val cancelled = ArrayList<Int>()

    var chatList: () -> ApiResult<ChatListResponse> = { ApiResult.Success(ChatListResponse()) }
    var chat: (String) -> ApiResult<ChatDto>? = { ApiResult.Failure(NetworkError()) }
    var messages: (String, Long?, Long?) -> ApiResult<MessagesPage>? = { _, _, _ -> ApiResult.Success(MessagesPage()) }
    var around: (String, Long) -> ApiResult<MessagesAround>? = { _, _ -> ApiResult.Failure(NetworkError()) }
    var sync: (String, SyncCursor) -> ApiResult<MessagesSyncResponse>? = { _, _ -> ApiResult.Success(MessagesSyncResponse()) }
    var send: (MessageSendPayload) -> ApiResult<MessageDto>? = { null }
    var mute: (String, Boolean) -> ApiResult<ChatMuteResponse>? = { _, muted -> ApiResult.Success(ChatMuteResponse(muted)) }
    var delete: (String, Boolean) -> ApiResult<Unit>? = { _, _ -> ApiResult.Success(Unit) }
    val heldDeletes = ArrayList<Held<Unit>>()

    override fun listChats(guid: Int, callback: ApiCallback<ChatListResponse>) {
        calls.add("chats")
        callback.onResult(chatList())
    }

    override fun getChat(chatId: String, guid: Int, callback: ApiCallback<ChatDto>) {
        calls.add("chat:$chatId")
        chat(chatId)?.let { callback.onResult(it) }
    }

    override fun getMessages(chatId: String, before: Long?, after: Long?, guid: Int, callback: ApiCallback<MessagesPage>) {
        calls.add("messages:$chatId:${before ?: "-"}:${after ?: "-"}")
        messages(chatId, before, after)?.let { callback.onResult(it) }
    }

    override fun getMessagesAround(chatId: String, messageId: Long, guid: Int, callback: ApiCallback<MessagesAround>) {
        calls.add("around:$chatId:$messageId")
        around(chatId, messageId)?.let { callback.onResult(it) }
    }

    override fun sync(chatId: String, cursor: SyncCursor, guid: Int, callback: ApiCallback<MessagesSyncResponse>) {
        calls.add("sync:$chatId:${cursor.maxId}")
        sync(chatId, cursor)?.let { callback.onResult(it) }
    }

    override fun sendMessage(payload: MessageSendPayload, guid: Int, callback: ApiCallback<MessageDto>) {
        calls.add("send:${payload.clientId}")
        sent.add(payload)
        val result = send(payload)
        if (result == null) heldSends.add(Held("send:${payload.clientId}", callback)) else callback.onResult(result)
    }

    override fun setChatMuted(chatId: String, muted: Boolean, guid: Int, callback: ApiCallback<ChatMuteResponse>) {
        calls.add("mute:$chatId:$muted")
        mute(chatId, muted)?.let { callback.onResult(it) }
    }

    override fun deleteChat(chatId: String, forEveryone: Boolean, guid: Int, callback: ApiCallback<Unit>) {
        calls.add("delete:$chatId:$forEveryone")
        val result = delete(chatId, forEveryone)
        if (result == null) heldDeletes.add(Held("delete:$chatId", callback)) else callback.onResult(result)
    }

    override fun cancelRequestsForGuid(guid: Int) {
        cancelled.add(guid)
    }

    fun callsStartingWith(prefix: String): List<String> = calls.filter { it.startsWith(prefix) }
}
