package com.qwill.app.search

import com.qwill.app.messenger.ManualQueue
import com.qwill.app.model.ChatType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RecentSearchesTest {
    private class MemoryStorage : RecentSearchStorage {
        val byUser = HashMap<String, String>()
        var reads = 0

        override fun read(userId: String): String? {
            reads++
            return byUser[userId]
        }

        override fun write(userId: String, value: String) {
            byUser[userId] = value
        }

        override fun clear() {
            byUser.clear()
        }
    }

    private val queue = ManualQueue()
    private val storage = MemoryStorage()
    private var userId: String? = "me"
    private val recents = RecentSearches(storage, queue, queue) { userId }

    private fun person(username: String = "alice", chatId: String? = null, title: String = "Алиса") = RecentSearchEntry(
        chatId = chatId,
        kind = RecentKind.USER,
        title = title,
        username = username,
        type = ChatType.PRIVATE,
    )

    private fun chat(chatId: String = "chat-1") = RecentSearchEntry(chatId = chatId, kind = RecentKind.CHAT, title = "Группа", type = ChatType.GROUP)

    private fun reload(): RecentSearches = RecentSearches(storage, queue, queue) { userId }.also { it.ensureLoaded() }

    @Test
    fun personWithoutChatIdIsKeyedByUsername() {
        recents.remember(person())
        assertEquals(1, recents.entries.size)
        assertNull(recents.entries.single().chatId)
        assertEquals("user:alice", RecentSearches.keyOf(recents.entries.single()))
    }

    @Test
    fun rememberingSamePersonAgainDoesNotDuplicate() {
        recents.remember(person(chatId = null))
        recents.remember(person(chatId = "chat-2", title = "Алиса (обновлено)"))
        assertEquals(listOf("Алиса (обновлено)"), recents.entries.map { it.title })
    }

    @Test
    fun personAndChatWithSameIdAreDifferentEntries() {
        recents.remember(chat("same-id"))
        recents.remember(person(username = "bob", chatId = "same-id"))
        assertEquals(2, recents.entries.size)
    }

    @Test
    fun forgetRemovesOnlyItsOwnKey() {
        recents.remember(person())
        recents.remember(chat())
        recents.forget(RecentSearches.keyOf(person()))
        assertEquals(listOf(RecentKind.CHAT), recents.entries.map { it.kind })
    }

    @Test
    fun newestFirstAndLimitedToTwenty() {
        for (index in 1..25) recents.remember(chat("c$index"))
        assertEquals(RecentSearches.LIMIT, recents.entries.size)
        assertEquals("c25", recents.entries.first().chatId)
        assertEquals("c6", recents.entries.last().chatId)
        recents.remember(chat("c10"))
        assertEquals("c10", recents.entries.first().chatId)
        assertEquals(RecentSearches.LIMIT, recents.entries.size)
    }

    @Test
    fun persistsPerAccountAndSurvivesReload() {
        recents.remember(person())
        assertEquals(listOf("user:alice"), reload().entries.map { RecentSearches.keyOf(it) })
        userId = "other"
        assertTrue(reload().entries.isEmpty())
    }

    @Test
    fun readsStorageOncePerAccount() {
        recents.ensureLoaded()
        recents.ensureLoaded()
        recents.remember(chat())
        assertEquals(1, storage.reads)
    }

    @Test
    fun clearWipesMemoryAndStorage() {
        recents.remember(person())
        recents.clear()
        assertTrue(recents.entries.isEmpty())
        assertTrue(storage.byUser.isEmpty())
        assertTrue(reload().entries.isEmpty())
    }

    @Test
    fun brokenStorageReadsAsEmpty() {
        assertTrue(RecentSearches.parse("{не json").isEmpty())
        assertTrue(RecentSearches.parse(null).isEmpty())
        val tolerant = RecentSearches.parse("[{\"chatId\":null,\"kind\":\"user\",\"title\":\"А\",\"username\":\"a\",\"extra\":1}]")
        assertEquals(listOf("user:a"), tolerant.map { RecentSearches.keyOf(it) })
    }
}
