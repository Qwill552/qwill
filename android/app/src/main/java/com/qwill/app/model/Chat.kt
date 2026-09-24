package com.qwill.app.model

import kotlinx.serialization.Serializable

@Serializable
enum class ChatType { PRIVATE, GROUP }

@Serializable
enum class MessageType { TEXT, MEDIA, SYSTEM, CALL, ANNOUNCEMENT, UNKNOWN }

@Serializable
enum class GroupRole { OWNER, ADMIN, MEMBER, UNKNOWN }

@Serializable
enum class CallKind { AUDIO, VIDEO, UNKNOWN }

@Serializable
enum class CallStatus { RINGING, ACTIVE, ENDED, MISSED, DECLINED, UNKNOWN }

@Serializable
data class ChatMemberSummary(
    val id: String,
    val username: String = "",
    val displayName: String = "",
    val avatarUrl: String? = null,
    val avatarColor: AvatarColor = AvatarColor.BLUE,
    val lastSeenAt: String = "",
    val isService: Boolean = false,
)

@Serializable
data class GroupMemberDTO(
    val userId: String,
    val username: String = "",
    val displayName: String = "",
    val avatarUrl: String? = null,
    val avatarColor: AvatarColor = AvatarColor.BLUE,
    val role: GroupRole = GroupRole.UNKNOWN,
    val joinedAt: String = "",
)

@Serializable
data class FileDto(
    val id: String,
    val mimeType: String = "",
    val size: Long = 0,
    val url: String = "",
)

@Serializable
data class AttachmentDto(
    val id: String,
    val file: FileDto,
    val thumbnail: FileDto? = null,
    val preview: FileDto? = null,
    val originalName: String = "",
    val width: Int? = null,
    val height: Int? = null,
    val duration: Double? = null,
    val peaks: List<Double>? = null,
    val blurhash: String? = null,
)

@Serializable
data class MessageReplyPreviewDto(
    val id: Long,
    val senderName: String = "",
    val content: String? = null,
    val hasAttachment: Boolean = false,
    val deletedAt: String? = null,
)

@Serializable
data class MessageForwardPreviewDto(
    val id: Long,
    val senderName: String = "",
)

@Serializable
data class MessageReactionDto(
    val emoji: String,
    val userIds: List<String> = emptyList(),
)

@Serializable
data class MessageCallDto(
    val id: String,
    val kind: CallKind = CallKind.UNKNOWN,
    val status: CallStatus = CallStatus.UNKNOWN,
    val startedAt: String? = null,
    val endedAt: String? = null,
)

@Serializable
data class MessageAnnouncementDto(
    val id: String,
    val androidVersionCode: Int? = null,
    val androidVersionName: String? = null,
    val windowsVersionName: String? = null,
    val changelog: List<String> = emptyList(),
)

@Serializable
data class MessageDto(
    val id: Long,
    val chatId: String,
    val clientId: String? = null,
    val albumId: String? = null,
    val sender: ChatMemberSummary? = null,
    val type: MessageType = MessageType.UNKNOWN,
    val content: String? = null,
    val attachment: AttachmentDto? = null,
    val replyToId: Long? = null,
    val replyTo: MessageReplyPreviewDto? = null,
    val forwardedFrom: MessageForwardPreviewDto? = null,
    val call: MessageCallDto? = null,
    val announcement: MessageAnnouncementDto? = null,
    val reactions: List<MessageReactionDto> = emptyList(),
    val editedAt: String? = null,
    val deletedAt: String? = null,
    val createdAt: String = "",
)

@Serializable
data class ChatListItemDto(
    val id: String,
    val type: ChatType = ChatType.PRIVATE,
    val title: String = "",
    val avatarUrl: String? = null,
    val otherMember: ChatMemberSummary? = null,
    val lastMessage: MessageDto? = null,
    val updatedAt: String = "",
    val unreadCount: Int = 0,
    val muted: Boolean = false,
    val isSupportRequest: Boolean = false,
    val iBlocked: Boolean = false,
    val blockedMe: Boolean = false,
)

@Serializable
data class ChatDto(
    val id: String,
    val type: ChatType = ChatType.PRIVATE,
    val title: String = "",
    val avatarUrl: String? = null,
    val otherMember: ChatMemberSummary? = null,
    val lastMessage: MessageDto? = null,
    val updatedAt: String = "",
    val unreadCount: Int = 0,
    val muted: Boolean = false,
    val isSupportRequest: Boolean = false,
    val iBlocked: Boolean = false,
    val blockedMe: Boolean = false,
    val members: List<ChatMemberSummary> = emptyList(),
    val readCursors: Map<String, Long?> = emptyMap(),
    val pinnedMessage: MessageDto? = null,
) {
    fun toListItem(): ChatListItemDto = ChatListItemDto(
        id = id,
        type = type,
        title = title,
        avatarUrl = avatarUrl,
        otherMember = otherMember,
        lastMessage = lastMessage,
        updatedAt = updatedAt,
        unreadCount = unreadCount,
        muted = muted,
        isSupportRequest = isSupportRequest,
        iBlocked = iBlocked,
        blockedMe = blockedMe,
    )
}

@Serializable
data class ChatListResponse(val chats: List<ChatListItemDto> = emptyList())

@Serializable
data class MessagesPage(
    val messages: List<MessageDto> = emptyList(),
    val hasMore: Boolean = false,
)

@Serializable
data class MessagesAround(
    val messages: List<MessageDto> = emptyList(),
    val hasMoreBefore: Boolean = false,
    val hasMoreAfter: Boolean = false,
)

@Serializable
data class MessagesSyncResponse(
    val created: List<MessageDto> = emptyList(),
    val changed: List<MessageDto> = emptyList(),
    val maxId: Long? = null,
    val maxUpdatedAt: String? = null,
    val hasMore: Boolean = false,
)

@Serializable
data class MessageSendAck(
    val ok: Boolean = false,
    val message: MessageDto? = null,
    val error: SocketAckError? = null,
)

@Serializable
data class MessageSendPayload(
    val chatId: String,
    val clientId: String,
    val content: String? = null,
    val replyToId: Long? = null,
    val attachment: MessageAttachmentInput? = null,
    val albumId: String? = null,
)

@Serializable
data class MessageUpdatedEvent(val message: MessageDto)

@Serializable
data class MessageDeletedBatchEvent(
    val chatId: String,
    val messages: List<MessageDto> = emptyList(),
)

@Serializable
data class MessageReactionEvent(
    val chatId: String,
    val messageId: Long,
    val reactions: List<MessageReactionDto> = emptyList(),
)

@Serializable
data class ChatPinnedEvent(
    val chatId: String,
    val message: MessageDto? = null,
)

@Serializable
data class ChatDeletedEvent(val chatId: String)

@Serializable
data class ChatReadEvent(
    val chatId: String,
    val userId: String,
    val lastReadMessageId: Long,
)

@Serializable
data class ChatUpdatedEvent(
    val chatId: String,
    val title: String = "",
    val avatarUrl: String? = null,
    val updatedAt: String = "",
)

@Serializable
data class ChatBlockEvent(
    val chatId: String,
    val userId: String = "",
    val iBlocked: Boolean = false,
    val blockedMe: Boolean = false,
)

@Serializable
data class MemberChangedEvent(
    val type: String,
    val chatId: String,
    val member: GroupMemberDTO? = null,
    val userId: String? = null,
    val role: GroupRole? = null,
) {
    companion object {
        const val ADDED = "added"
        const val REMOVED = "removed"
        const val ROLE = "role"
        const val LEFT = "left"
    }
}
