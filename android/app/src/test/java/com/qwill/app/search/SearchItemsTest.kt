package com.qwill.app.search

import com.qwill.app.model.AvatarColor
import com.qwill.app.model.ChatSearchResult
import com.qwill.app.model.ChatType
import com.qwill.app.model.SearchResultsDto
import com.qwill.app.model.UserSearchResult
import com.qwill.app.net.ApiJson
import com.qwill.app.realtime.PresenceInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchItemsTest {
    private val now = 1_790_000_000_000L
    private val chat = ChatSearchResult(id = "g1", type = ChatType.GROUP, title = "Анна и друзья", lastMessagePreview = "Привет")
    private val user = UserSearchResult(id = "u1", username = "anna", displayName = "Анна", lastSeenAt = "2026-09-21T14:13:00.000Z")

    private fun build(state: SearchState, recents: List<RecentSearchEntry> = emptyList(), presence: Map<String, PresenceInfo> = emptyMap()) =
        SearchItems.build(state, recents, { presence[it] }, now)

    @Test
    fun parsesSearchResultsLikeServerSendsThem() {
        val raw = """
            {"chats":[{"id":"g1","type":"GROUP","title":"Группа","avatarUrl":null,"avatarColor":null,"lastMessagePreview":null,"isService":false}],
             "users":[{"id":"u1","username":"anna","displayName":"Анна","avatarUrl":"/api/files/f1","avatarColor":"violet","lastSeenAt":"2026-09-21T14:13:00.000Z","isContact":true,"extra":1}]}
        """.trimIndent()
        val parsed = ApiJson.decodeFromString(SearchResultsDto.serializer(), raw)
        assertEquals(ChatType.GROUP, parsed.chats.single().type)
        assertNull(parsed.chats.single().avatarColor)
        assertEquals(AvatarColor.VIOLET, parsed.users.single().avatarColor)
        assertTrue(parsed.users.single().isContact)
    }

    @Test
    fun emptyQueryShowsRecentsOrInvitation() {
        val invitation = build(SearchState(query = "  "))
        assertEquals(listOf(SearchItem.Empty(SearchItems.RECENT_EMPTY, null)), invitation)
        val recents = listOf(
            RecentSearchEntry(kind = RecentKind.USER, title = "Анна", username = "anna"),
            RecentSearchEntry(chatId = "g1", kind = RecentKind.CHAT, title = "Группа", type = ChatType.GROUP),
        )
        val items = build(SearchState(query = "", results = SearchResultsDto(users = listOf(user))), recents)
        assertEquals(listOf("section:Недавние", "people", "section:Недавние чаты", "recent:chat:g1"), items.map { it.key })
    }

    @Test
    fun waitingWithoutResultsShowsHintOnly() {
        assertEquals(listOf(SearchItem.Hint), build(SearchState(query = "ан", loading = true)))
        assertTrue(build(SearchState(query = "ан")).isEmpty())
    }

    @Test
    fun failureReplacesResults() {
        val items = build(SearchState(query = "ан", results = SearchResultsDto(chats = listOf(chat)), failure = SearchFailure.NETWORK))
        assertEquals(listOf(SearchItem.Failure("Нет соединения с сервером")), items)
    }

    @Test
    fun nothingFound() {
        assertEquals(listOf(SearchItem.Empty(SearchItems.EMPTY_TITLE, SearchItems.EMPTY_SUBTITLE)), build(SearchState(query = "zz", results = SearchResultsDto())))
    }

    @Test
    fun resultsStayWithHintWhileNextRequestIsPending() {
        val items = build(SearchState(query = "@анн", results = SearchResultsDto(listOf(chat), listOf(user)), loading = true, openingUserId = "u1"))
        assertEquals(listOf("section:Чаты", "chat:g1", "section:Глобальный поиск", "user:u1", "hint"), items.map { it.key })
        val row = (items[3] as SearchItem.UserRow).row
        assertEquals("анн", row.highlight)
        assertTrue(row.opening)
        assertFalse(row.online)
        assertEquals("anna", row.username)
        assertEquals("Привет", (items[1] as SearchItem.ChatRow).row.preview)
    }

    @Test
    fun livePresenceDecidesUserStatus() {
        val online = build(SearchState(query = "ан", results = SearchResultsDto(users = listOf(user))), presence = mapOf("u1" to PresenceInfo(true, "")))
        val onlineRow = (online[1] as SearchItem.UserRow).row
        assertEquals("в сети", onlineRow.status)
        assertTrue(onlineRow.online)
        val offline = build(SearchState(query = "ан", results = SearchResultsDto(users = listOf(user))))
        assertTrue((offline[1] as SearchItem.UserRow).row.status!!.startsWith("был(а)"))
    }
}
