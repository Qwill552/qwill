package com.qwill.app.chats

import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatType
import com.qwill.app.model.MessageDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class VisibleChatsTest {
    private val someMessage = MessageDto(id = 7, chatId = "any")

    private fun chat(
        id: String = "chat-1",
        type: ChatType = ChatType.PRIVATE,
        last: MessageDto? = null,
        unread: Int = 0,
        support: Boolean = false,
    ) = ChatListItemDto(
        id = id,
        type = type,
        title = "Борис",
        lastMessage = last,
        updatedAt = "2026-08-25T10:00:00.000Z",
        unreadCount = unread,
        isSupportRequest = support,
    )

    @Test
    fun emptyPrivateChatIsHidden() {
        val chats = listOf(chat("empty"), chat("started", last = someMessage))
        assertEquals(listOf("started"), VisibleChats.select(chats, ChatFilter.ALL, false).map { it.id })
    }

    @Test
    fun emptyGroupIsShown() {
        val chats = listOf(chat("group", type = ChatType.GROUP))
        assertEquals(listOf("group"), VisibleChats.select(chats, ChatFilter.ALL, false).map { it.id })
    }

    @Test
    fun emptyPrivateChatIsHiddenUnderPrivateFilter() {
        val chats = listOf(chat("empty"), chat("started", last = someMessage))
        assertEquals(listOf("started"), VisibleChats.select(chats, ChatFilter.PRIVATE, false).map { it.id })
    }

    @Test
    fun emptyPrivateDetection() {
        assertTrue(VisibleChats.isEmptyPrivate(chat()))
        assertFalse(VisibleChats.isEmptyPrivate(chat(last = someMessage)))
        assertFalse(VisibleChats.isEmptyPrivate(chat(type = ChatType.GROUP)))
    }

    @Test
    fun supportFilterShowsOnlyRequests() {
        val chats = listOf(chat("friend", last = someMessage), chat("ticket", last = someMessage, support = true))
        assertEquals(listOf("ticket"), VisibleChats.select(chats, ChatFilter.SUPPORT, false).map { it.id })
    }

    @Test
    fun adminAllExcludesRequestsRegularAllIncludesThem() {
        val chats = listOf(chat("friend", last = someMessage), chat("ticket", last = someMessage, support = true))
        assertEquals(listOf("friend"), VisibleChats.select(chats, ChatFilter.ALL, true).map { it.id })
        assertEquals(listOf("friend", "ticket"), VisibleChats.select(chats, ChatFilter.ALL, false).map { it.id })
    }

    @Test
    fun unreadAndGroupFiltersKeepControllerOrder() {
        val chats = listOf(
            chat("b", type = ChatType.GROUP, unread = 2),
            chat("a", last = someMessage, unread = 1),
            chat("c", type = ChatType.GROUP),
        )
        assertEquals(listOf("b", "a"), VisibleChats.select(chats, ChatFilter.UNREAD, false).map { it.id })
        assertEquals(listOf("b", "c"), VisibleChats.select(chats, ChatFilter.GROUPS, false).map { it.id })
    }

    @Test
    fun countsFollowWebRules() {
        val chats = listOf(
            chat("empty"),
            chat("friend", last = someMessage, unread = 3),
            chat("group", type = ChatType.GROUP),
            chat("ticket", last = someMessage, support = true, unread = 1),
            chat("readTicket", last = someMessage, support = true),
        )
        val regular = VisibleChats.counts(chats, isAdmin = false)
        assertEquals(4, regular[ChatFilter.ALL])
        assertEquals(2, regular[ChatFilter.UNREAD])
        assertEquals(3, regular[ChatFilter.PRIVATE])
        assertEquals(1, regular[ChatFilter.GROUPS])
        val admin = VisibleChats.counts(chats, isAdmin = true)
        assertEquals(2, admin[ChatFilter.ALL])
        assertEquals(1, admin[ChatFilter.SUPPORT])
    }

    @Test
    fun adminSeesAllAndSupportChipsOnly() {
        assertEquals(listOf(ChatFilter.ALL, ChatFilter.SUPPORT), ChatFilter.available(isAdmin = true))
        assertEquals(listOf(ChatFilter.ALL, ChatFilter.UNREAD, ChatFilter.PRIVATE, ChatFilter.GROUPS), ChatFilter.available(isAdmin = false))
    }

    @Test
    fun firstUnreadIndexPicksTopmostUnreadRow() {
        val rows = listOf(chat("a", last = someMessage), chat("b", last = someMessage, unread = 2), chat("c", last = someMessage, unread = 1))
        assertEquals(1, VisibleChats.firstUnreadIndex(rows))
        assertEquals(-1, VisibleChats.firstUnreadIndex(rows.take(1)))
    }
}
