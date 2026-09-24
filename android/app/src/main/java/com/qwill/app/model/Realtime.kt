package com.qwill.app.model

import com.qwill.app.net.ApiError
import com.qwill.app.net.ErrorCode
import kotlinx.serialization.Serializable

@Serializable
data class UserPresenceEvent(
    val userId: String,
    val online: Boolean = false,
    val lastSeenAt: String = "",
)

@Serializable
data class UserTypingEvent(
    val chatId: String,
    val userId: String,
    val displayName: String = "",
    val isTyping: Boolean = false,
)

@Serializable
data class TypingPayload(val chatId: String)

@Serializable
data class VisibilityPayload(val visible: Boolean)

@Serializable
data class ChatReadPayload(val chatId: String, val messageId: Long)

@Serializable
data class SocketAck(
    val ok: Boolean = false,
    val error: SocketAckError? = null,
)

@Serializable
data class SocketAckError(
    val code: String = ErrorCode.INTERNAL,
    val message: String = ApiError.UNREADABLE_MESSAGE,
)
