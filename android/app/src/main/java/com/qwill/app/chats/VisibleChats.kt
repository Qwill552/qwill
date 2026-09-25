package com.qwill.app.chats

import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatType

enum class ChatFilter(val label: String) {
    ALL("Все"),
    UNREAD("Непрочитанные"),
    PRIVATE("Личные"),
    GROUPS("Группы"),
    SUPPORT("Предложка"),
    ;

    companion object {
        val REGULAR: List<ChatFilter> = listOf(ALL, UNREAD, PRIVATE, GROUPS)
        val ADMIN: List<ChatFilter> = listOf(ALL, SUPPORT)

        fun available(isAdmin: Boolean): List<ChatFilter> = if (isAdmin) ADMIN else REGULAR
    }
}

object VisibleChats {
    fun isEmptyPrivate(chat: ChatListItemDto): Boolean = chat.type == ChatType.PRIVATE && chat.lastMessage == null

    fun select(chats: List<ChatListItemDto>, filter: ChatFilter, isAdmin: Boolean): List<ChatListItemDto> {
        val started = chats.filter { !isEmptyPrivate(it) }
        return when (filter) {
            ChatFilter.UNREAD -> started.filter { it.unreadCount > 0 }
            ChatFilter.PRIVATE -> started.filter { it.type == ChatType.PRIVATE }
            ChatFilter.GROUPS -> started.filter { it.type == ChatType.GROUP }
            ChatFilter.SUPPORT -> started.filter { it.isSupportRequest }
            ChatFilter.ALL -> if (isAdmin) started.filter { !it.isSupportRequest } else started
        }
    }

    fun counts(chats: List<ChatListItemDto>, isAdmin: Boolean): Map<ChatFilter, Int> {
        val started = chats.filter { !isEmptyPrivate(it) }
        return mapOf(
            ChatFilter.ALL to started.count { !isAdmin || !it.isSupportRequest },
            ChatFilter.UNREAD to started.count { it.unreadCount > 0 },
            ChatFilter.PRIVATE to started.count { it.type == ChatType.PRIVATE },
            ChatFilter.GROUPS to started.count { it.type == ChatType.GROUP },
            ChatFilter.SUPPORT to started.count { it.isSupportRequest && it.unreadCount > 0 },
        )
    }

    fun firstUnreadIndex(visible: List<ChatListItemDto>): Int = visible.indexOfFirst { it.unreadCount > 0 }
}
