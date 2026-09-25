package com.qwill.app.messenger

import com.qwill.app.database.SyncCursor
import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatMuteInput
import com.qwill.app.model.ChatMuteResponse
import com.qwill.app.model.ChatListResponse
import com.qwill.app.model.CreatePrivateChatInput
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

    override fun cancelRequestsForGuid(guid: Int) {
        api.cancelRequestsForGuid(guid)
        socket.cancelRequestsForGuid(guid)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
