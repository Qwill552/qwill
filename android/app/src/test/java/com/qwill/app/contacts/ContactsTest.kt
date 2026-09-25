package com.qwill.app.contacts

import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.model.ChatType
import com.qwill.app.model.MessageDto
import com.qwill.app.realtime.PresenceInfo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ContactsTest {
    private val message = MessageDto(id = 1, chatId = "x")

    private fun person(id: String, name: String, started: Boolean = true, lastSeen: String = "2026-09-20T10:00:00.000Z") = ChatListItemDto(
        id = "chat-$id",
        type = ChatType.PRIVATE,
        title = name,
        otherMember = ChatMemberSummary(id = id, username = id, displayName = name, lastSeenAt = lastSeen),
        lastMessage = if (started) message else null,
    )

    private fun group(id: String) = ChatListItemDto(id = id, type = ChatType.GROUP, title = "Группа", lastMessage = message)

    private fun build(chats: List<ChatListItemDto>, query: String = "", presence: Map<String, PresenceInfo> = emptyMap()) =
        Contacts.build(chats, { presence[it] }, query)

    @Test
    fun sortedByNameWithRussianCollation() {
        val result = build(listOf(person("3", "Яна"), person("1", "борис"), person("2", "Анна"), person("4", "Ёжик"), person("6", "Ежевика")))
        assertEquals(listOf("Анна", "борис", "Ежевика", "Ёжик", "Яна"), result.contacts.map { it.name })
    }

    @Test
    fun letterOnlyOnFirstOfItsLetter() {
        val result = build(listOf(person("1", "Анна"), person("2", "Алла"), person("3", "Борис"), person("4", "берта")))
        assertEquals(listOf("Алла", "Анна", "берта", "Борис"), result.contacts.map { it.name })
        assertEquals(listOf("А", "", "Б", ""), result.contacts.map { it.letter })
    }

    @Test
    fun filterIsSubstringNotWordStart() {
        val chats = listOf(person("1", "Марианна"), person("2", "Анна Петрова"), person("3", "Борис"))
        assertEquals(listOf("Анна Петрова", "Марианна"), build(chats, " АНН ").contacts.map { it.name })
        assertEquals(listOf("Анна Петрова"), build(chats, "петр").contacts.map { it.name })
    }

    @Test
    fun emptyPrivatesAndGroupsAreNotContacts() {
        val result = build(listOf(person("1", "Пустой", started = false), group("g"), person("2", "Вера")))
        assertEquals(listOf("Вера"), result.contacts.map { it.name })
        assertTrue(result.hasContacts)
        assertFalse(build(listOf(person("1", "Пустой", started = false), group("g"))).hasContacts)
    }

    @Test
    fun hasContactsIgnoresFilter() {
        val result = build(listOf(person("1", "Вера")), "никто")
        assertTrue(result.contacts.isEmpty())
        assertTrue(result.hasContacts)
    }

    @Test
    fun livePresenceWinsOverChatSnapshot() {
        val presence = mapOf("1" to PresenceInfo(true, "2026-09-25T09:00:00.000Z"), "2" to PresenceInfo(false, "2026-09-25T08:00:00.000Z"))
        val result = build(listOf(person("1", "Анна"), person("2", "Борис"), person("3", "Вера")), presence = presence)
        assertEquals(listOf(true, false, false), result.contacts.map { it.online })
        assertEquals("2026-09-25T08:00:00.000Z", result.contacts[1].lastSeenAt)
        assertEquals("2026-09-20T10:00:00.000Z", result.contacts[2].lastSeenAt)
    }
}
