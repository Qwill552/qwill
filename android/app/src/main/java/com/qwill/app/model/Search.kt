package com.qwill.app.model

import kotlinx.serialization.Serializable

@Serializable
data class ChatSearchResult(
    val id: String,
    val type: ChatType = ChatType.PRIVATE,
    val title: String = "",
    val avatarUrl: String? = null,
    val avatarColor: AvatarColor? = null,
    val lastMessagePreview: String? = null,
    val isService: Boolean = false,
)

@Serializable
data class UserSearchResult(
    val id: String,
    val username: String = "",
    val displayName: String = "",
    val avatarUrl: String? = null,
    val avatarColor: AvatarColor = AvatarColor.BLUE,
    val lastSeenAt: String = "",
    val isContact: Boolean = false,
)

@Serializable
data class SearchResultsDto(
    val chats: List<ChatSearchResult> = emptyList(),
    val users: List<UserSearchResult> = emptyList(),
)

@Serializable
data class CreatePrivateChatInput(val username: String)
