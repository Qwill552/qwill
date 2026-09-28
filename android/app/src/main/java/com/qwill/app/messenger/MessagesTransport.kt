package com.qwill.app.messenger

import com.qwill.app.database.SyncCursor
import com.qwill.app.model.BlockStateDto
import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatPinPayload
import com.qwill.app.model.ChatMuteInput
import com.qwill.app.model.ChatMuteResponse
import com.qwill.app.model.ChatListResponse
import com.qwill.app.model.ChatReadPayload
import com.qwill.app.model.CreatePrivateChatInput
import com.qwill.app.model.MembersResponse
import com.qwill.app.model.MessageBatchAck
import com.qwill.app.model.MessageDeleteBatchPayload
import com.qwill.app.model.MessageReactPayload
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageSendAck
import com.qwill.app.model.MessageSendPayload
import com.qwill.app.model.MessagesAround
import com.qwill.app.model.MessagesPage
import com.qwill.app.model.MessagesSyncResponse
import com.qwill.app.net.ApiCallback
import com.qwill.app.net.ApiClient
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ApiRequest
import com.qwill.app.realtime.SocketConnection
import com.qwill.app.realtime.SocketEvent
import java.net.URLEncoder

interface MessagesTransport {
    fun listChats(guid: Int, callback: ApiCallback<ChatListResponse>)

    fun getChat(chatId: String, guid: Int, callback: ApiCallback<ChatDto>)

    fun getMessages(chatId: String, before: Long?, after: Long?, guid: Int, callback: ApiCallback<MessagesPage>)

    fun getMessagesAround(chatId: String, messageId: Long, guid: Int, callback: ApiCallback<MessagesAround>)

    fun sync(chatId: String, cursor: SyncCursor, guid: Int, callback: ApiCallback<MessagesSyncResponse>)

    fun sendMessage(payload: MessageSendPayload, guid: Int, callback: ApiCallback<MessageDto>)

    fun setChatMuted(chatId: String, muted: Boolean, guid: Int, callback: ApiCallback<ChatMuteResponse>)

    fun deleteChat(chatId: String, forEveryone: Boolean, guid: Int, callback: ApiCallback<Unit>)

    fun createPrivateChat(username: String, guid: Int, callback: ApiCallback<ChatDto>)

    fun markRead(chatId: String, messageId: Long)

    fun react(chatId: String, messageId: Long, emoji: String)

    fun members(chatId: String, guid: Int, callback: ApiCallback<MembersResponse>)

    fun setBlocked(userId: String, blocked: Boolean, guid: Int, callback: ApiCallback<BlockStateDto>)

    fun pinMessage(chatId: String, messageId: Long?)

    fun deleteBatch(chatId: String, messageIds: List<Long>, guid: Int, callback: ApiCallback<List<MessageDto>>)

    fun cancelRequestsForGuid(guid: Int)
}

class ApiMessagesTransport(
    private val api: ApiClient,
    private val socket: SocketConnection,
) : MessagesTransport {
    override fun listChats(guid: Int, callback: ApiCallback<ChatListResponse>) {
        api.send(ApiRequest.get("/api/chats", ChatListResponse.serializer()), guid, callback)
    }

    override fun getChat(chatId: String, guid: Int, callback: ApiCallback<ChatDto>) {
        api.send(ApiRequest.get("/api/chats/${encode(chatId)}", ChatDto.serializer()), guid, callback)
    }

    override fun getMessages(chatId: String, before: Long?, after: Long?, guid: Int, callback: ApiCallback<MessagesPage>) {
        val query = when {
            before != null -> "?before=$before"
            after != null -> "?after=$after"
            else -> ""
        }
        api.send(ApiRequest.get("/api/chats/${encode(chatId)}/messages$query", MessagesPage.serializer()), guid, callback)
    }

    override fun getMessagesAround(chatId: String, messageId: Long, guid: Int, callback: ApiCallback<MessagesAround>) {
        api.send(ApiRequest.get("/api/chats/${encode(chatId)}/messages/around/$messageId", MessagesAround.serializer()), guid, callback)
    }

    override fun sync(chatId: String, cursor: SyncCursor, guid: Int, callback: ApiCallback<MessagesSyncResponse>) {
        val since = cursor.maxUpdatedAt?.let { "&sinceUpdatedAt=${encode(it)}" }.orEmpty()
        val path = "/api/chats/${encode(chatId)}/sync?sinceId=${cursor.maxId}$since"
        api.send(ApiRequest.get(path, MessagesSyncResponse.serializer()), guid, callback)
    }

    override fun sendMessage(payload: MessageSendPayload, guid: Int, callback: ApiCallback<MessageDto>) {
        socket.request(
            SocketEvent.MESSAGE_SEND,
            ApiJson.encodeToJsonElement(MessageSendPayload.serializer(), payload),
            { body ->
                ApiJson.decodeFromJsonElement(MessageSendAck.serializer(), body).message
                    ?: throw IllegalArgumentException("подтверждение без сообщения")
            },
            guid,
            callback,
        )
    }

    override fun setChatMuted(chatId: String, muted: Boolean, guid: Int, callback: ApiCallback<ChatMuteResponse>) {
        val request = ApiRequest(
            "PATCH",
            "/api/chats/${encode(chatId)}/mute",
            ApiRequest.parser(ChatMuteResponse.serializer()),
            body = { ApiJson.encodeToString(ChatMuteInput.serializer(), ChatMuteInput(muted)) },
        )
        api.send(request, guid, callback)
    }

    override fun deleteChat(chatId: String, forEveryone: Boolean, guid: Int, callback: ApiCallback<Unit>) {
        api.send(ApiRequest("DELETE", "/api/chats/${encode(chatId)}?forEveryone=$forEveryone", ApiRequest.NO_CONTENT), guid, callback)
    }

    override fun createPrivateChat(username: String, guid: Int, callback: ApiCallback<ChatDto>) {
        api.send(ApiRequest.post("/api/chats/private", CreatePrivateChatInput.serializer(), CreatePrivateChatInput(username), ChatDto.serializer()), guid, callback)
    }

    override fun markRead(chatId: String, messageId: Long) {
        socket.emit(SocketEvent.CHAT_READ, ApiJson.encodeToJsonElement(ChatReadPayload.serializer(), ChatReadPayload(chatId, messageId)))
    }

    override fun react(chatId: String, messageId: Long, emoji: String) {
        socket.emitDeferred(
            SocketEvent.MESSAGE_REACT,
            ApiJson.encodeToJsonElement(MessageReactPayload.serializer(), MessageReactPayload(chatId, messageId, emoji)),
        )
    }

    override fun members(chatId: String, guid: Int, callback: ApiCallback<MembersResponse>) {
        api.send(ApiRequest.get("/api/chats/${encode(chatId)}/members", MembersResponse.serializer()), guid, callback)
    }

    override fun setBlocked(userId: String, blocked: Boolean, guid: Int, callback: ApiCallback<BlockStateDto>) {
        val path = "/api/users/${encode(userId)}/block"
        val parse = ApiRequest.parser(BlockStateDto.serializer())
        val request = if (blocked) ApiRequest("POST", path, parse, body = { EMPTY_BODY }) else ApiRequest("DELETE", path, parse)
        api.send(request, guid, callback)
    }

    override fun pinMessage(chatId: String, messageId: Long?) {
        socket.emitDeferred(SocketEvent.CHAT_PIN, ChatPinPayload(chatId, messageId).toJson())
    }

    override fun deleteBatch(chatId: String, messageIds: List<Long>, guid: Int, callback: ApiCallback<List<MessageDto>>) {
        socket.request(
            SocketEvent.MESSAGE_DELETE_BATCH,
            ApiJson.encodeToJsonElement(MessageDeleteBatchPayload.serializer(), MessageDeleteBatchPayload(chatId, messageIds)),
            { body -> ApiJson.decodeFromJsonElement(MessageBatchAck.serializer(), body).messages.orEmpty() },
            guid,
            callback,
        )
    }

    override fun cancelRequestsForGuid(guid: Int) {
        api.cancelRequestsForGuid(guid)
        socket.cancelRequestsForGuid(guid)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    private companion object {
        const val EMPTY_BODY = "{}"
    }
}
