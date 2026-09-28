package com.qwill.app.chat

import com.qwill.app.calls.ActiveCalls
import com.qwill.app.chat.selection.MessageSelection
import com.qwill.app.chat.selection.SelectionRules
import com.qwill.app.chat.top.ChatSubtitle
import com.qwill.app.chat.top.ChatTopLayout
import com.qwill.app.chat.top.HiddenPins
import com.qwill.app.chat.top.HiddenPinsStorage
import com.qwill.app.chat.top.Subtitle
import com.qwill.app.chat.top.SubtitleInput
import com.qwill.app.chat.top.SubtitleTone
import com.qwill.app.chat.top.TypingDots
import com.qwill.app.core.plural
import com.qwill.app.database.ME
import com.qwill.app.database.PEER
import com.qwill.app.database.member
import com.qwill.app.database.message
import com.qwill.app.model.CallDto
import com.qwill.app.model.CallParticipantDto
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.model.GroupMemberDTO
import com.qwill.app.model.GroupRole
import com.qwill.app.realtime.LastSeen
import com.qwill.app.realtime.PresenceInfo
import com.qwill.app.realtime.Typist
import com.qwill.app.ui.TitleKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.TimeZone

class PluralTest {
    private fun form(count: Int): String = plural(count, "участник", "участника", "участников")

    @Test
    fun russianForms() {
        val expected = mapOf(
            0 to "участников",
            1 to "участник",
            2 to "участника",
            4 to "участника",
            5 to "участников",
            11 to "участников",
            12 to "участников",
            14 to "участников",
            21 to "участник",
            22 to "участника",
            25 to "участников",
            101 to "участник",
            111 to "участников",
        )
        for ((count, word) in expected) assertEquals("$count", word, form(count))
    }
}

class ChatTopLayoutTest {
    @Test
    fun heightOfTopForAllCombinations() {
        assertEquals(56f, ChatTopLayout.contentTop(callVisible = false, pinnedVisible = false))
        assertEquals(112f, ChatTopLayout.contentTop(callVisible = false, pinnedVisible = true))
        assertEquals(116f, ChatTopLayout.contentTop(callVisible = true, pinnedVisible = false))
        assertEquals(172f, ChatTopLayout.contentTop(callVisible = true, pinnedVisible = true))
    }

    @Test
    fun bannersStackUnderHeader() {
        assertEquals(64f, ChatTopLayout.callTop())
        assertEquals(64f, ChatTopLayout.pinnedTop(callVisible = false))
        assertEquals(124f, ChatTopLayout.pinnedTop(callVisible = true))
    }
}

class ChatSubtitleTest {
    private val zone: TimeZone = TimeZone.getTimeZone("Europe/Moscow")
    private val now = 1_790_000_000_000L

    private fun input(
        connection: TitleKind = TitleKind.BRAND,
        service: Boolean = false,
        group: Boolean = false,
        members: List<ChatMemberSummary>? = null,
        typists: List<Typist> = emptyList(),
        online: Set<String> = emptySet(),
        other: ChatMemberSummary? = member(PEER),
    ) = SubtitleInput(
        connection = connection,
        service = service,
        group = group,
        members = members,
        myId = ME,
        typists = typists,
        otherMember = other,
        presence = { id -> if (id in online) PresenceInfo(true, "") else null },
    )

    private fun of(value: SubtitleInput): Subtitle? = ChatSubtitle.of(value, now, zone)

    private fun group(count: Int): List<ChatMemberSummary> = (0 until count).map { member(if (it == 0) ME else "m$it") }

    @Test
    fun connectionWinsOverEverything() {
        val waiting = of(input(connection = TitleKind.WAITING, typists = listOf(Typist(PEER, "Пётр")), online = setOf(PEER)))
        assertEquals(Subtitle("Ожидание сети", dots = true), waiting)
        assertEquals(Subtitle("Доступ с этого адреса закрыт"), of(input(connection = TitleKind.IP_BANNED)))
        assertEquals("Соединение", of(input(connection = TitleKind.CONNECTING, service = true))?.text)
    }

    @Test
    fun serviceChatHasNoSubtitle() {
        assertNull(of(input(service = true, online = setOf(PEER))))
    }

    @Test
    fun privateTypingAndStatus() {
        assertEquals(Subtitle("печатает…", SubtitleTone.ACCENT, typing = true), of(input(typists = listOf(Typist(PEER, "Пётр Иванов")))))
        assertEquals(Subtitle("в сети", SubtitleTone.ONLINE), of(input(online = setOf(PEER))))
        val expected = LastSeen.format(member(PEER).lastSeenAt, now, zone)
        assertEquals(Subtitle(expected), of(input()))
        assertNull(of(input(other = null)))
    }

    @Test
    fun groupTypingFormsUseFirstWord() {
        val one = listOf(Typist("a", "Иван Петров"))
        val two = one + Typist("b", "Мария")
        val four = two + Typist("c", "Олег") + Typist("d", "Анна")
        assertEquals("Иван печатает…", of(input(group = true, typists = one))?.text)
        assertEquals("Иван, Мария печатают…", of(input(group = true, typists = two))?.text)
        assertEquals("Иван, Мария и ещё 2 печатают…", of(input(group = true, typists = four))?.text)
        assertEquals(SubtitleTone.ACCENT, of(input(group = true, typists = one))?.tone)
    }

    @Test
    fun ownTypingIsIgnored() {
        assertEquals("в сети", of(input(typists = listOf(Typist(ME, "Я")), online = setOf(PEER)))?.text)
    }

    @Test
    fun groupMembersCount() {
        val expected = mapOf(
            1 to "1 участник",
            2 to "2 участника",
            5 to "5 участников",
            11 to "11 участников",
            21 to "21 участник",
            22 to "22 участника",
            112 to "112 участников",
        )
        for ((count, text) in expected) assertEquals(text, of(input(group = true, members = group(count)))?.text)
        assertNull(of(input(group = true, members = null)))
    }

    @Test
    fun onlineCountsSelfAndShowsOnlyWithSomeoneElse() {
        val members = group(5)
        assertEquals("5 участников", of(input(group = true, members = members, online = setOf(ME)))?.text)
        assertEquals("5 участников, 2 в сети", of(input(group = true, members = members, online = setOf("m1")))?.text)
        assertEquals("5 участников, 3 в сети", of(input(group = true, members = members, online = setOf("m1", "m3", ME)))?.text)
    }

    @Test
    fun typingDotsBreathe() {
        assertEquals(TypingDots.REST_RADIUS, TypingDots.radius(0, 0), 0.001f)
        assertEquals(TypingDots.PEAK_RADIUS, TypingDots.radius(0, 320), 0.001f)
        assertEquals(TypingDots.REST_RADIUS, TypingDots.radius(0, 640), 0.001f)
        assertEquals(TypingDots.REST_RADIUS, TypingDots.radius(0, 700), 0.001f)
        assertEquals(TypingDots.PEAK_RADIUS, TypingDots.radius(1, 470), 0.001f)
        assertEquals(TypingDots.PEAK_RADIUS, TypingDots.radius(2, 620), 0.001f)
        assertEquals(TypingDots.PEAK_RADIUS, TypingDots.radius(0, 1120), 0.001f)
    }
}

class SelectionRulesTest {
    @Test
    fun pendingAndDeletedAreNotSelectable() {
        assertTrue(SelectionRules.selectable(message(5)))
        assertFalse(SelectionRules.selectable(message(-3)))
        assertFalse(SelectionRules.selectable(message(5, deleted = true)))
    }

    @Test
    fun toggleStopsAtLimit() {
        val full = (1L..50L).toList()
        assertEquals(50, SelectionRules.LIMIT)
        assertEquals(full, SelectionRules.toggle(full, 51))
        assertEquals((1L..49L).toList(), SelectionRules.toggle(full, 50))
        assertEquals(listOf(1L, 2L), SelectionRules.toggle(listOf(1L), 2))
    }

    @Test
    fun dragAddsRangeAndBackingOffRemovesIt() {
        val ordered = (1L..10L).toList()
        val base = listOf(3L)
        val down = SelectionRules.rangeBetween(ordered, 3, 6)
        assertEquals(listOf(3L, 4L, 5L, 6L), SelectionRules.dragSelect(base, down, adding = true))
        val back = SelectionRules.rangeBetween(ordered, 3, 4)
        assertEquals(listOf(3L, 4L), SelectionRules.dragSelect(base, back, adding = true))
        val up = SelectionRules.rangeBetween(ordered, 3, 1)
        assertEquals(listOf(3L, 2L, 1L), up)
        assertEquals(listOf(3L, 2L, 1L), SelectionRules.dragSelect(base, up, adding = true))
    }

    @Test
    fun dragStartedOnSelectedRemoves() {
        val ordered = (1L..10L).toList()
        val base = listOf(1L, 2L, 5L, 6L, 7L, 9L)
        val range = SelectionRules.rangeBetween(ordered, 5, 7)
        assertEquals(listOf(1L, 2L, 9L), SelectionRules.dragSelect(base, range, adding = false))
    }

    @Test
    fun dragRespectsLimitFromStart() {
        val ordered = (1L..100L).toList()
        val base = (1L..48L).toList()
        val range = SelectionRules.rangeBetween(ordered, 60, 70)
        assertEquals(base + listOf(60L, 61L), SelectionRules.dragSelect(base, range, adding = true))
    }

    @Test
    fun deleteRights() {
        val mine = message(1, sender = ME)
        val theirs = message(2, sender = PEER)
        assertTrue(SelectionRules.canDelete(listOf(mine), ME, groupAdmin = false))
        assertFalse(SelectionRules.canDelete(listOf(mine, theirs), ME, groupAdmin = false))
        assertTrue(SelectionRules.canDelete(listOf(mine, theirs), ME, groupAdmin = true))
        assertFalse(SelectionRules.canDelete(emptyList(), ME, groupAdmin = true))
        val owner = listOf(GroupMemberDTO(ME, role = GroupRole.OWNER))
        val admin = listOf(GroupMemberDTO(ME, role = GroupRole.ADMIN))
        val plain = listOf(GroupMemberDTO(ME, role = GroupRole.MEMBER))
        assertTrue(SelectionRules.isGroupAdmin(true, owner, ME))
        assertTrue(SelectionRules.isGroupAdmin(true, admin, ME))
        assertFalse(SelectionRules.isGroupAdmin(true, plain, ME))
        assertFalse(SelectionRules.isGroupAdmin(false, owner, ME))
        assertFalse(SelectionRules.isGroupAdmin(true, null, ME))
    }

    @Test
    fun copyTextInTelegramFormat() {
        val one = message(3, content = "третье", sender = PEER)
        val two = message(1, content = "первое", sender = PEER)
        val three = message(2, content = "второе", sender = PEER)
        val mine = message(4, content = "моё", sender = ME)
        val empty = message(5, content = "", sender = PEER)
        assertEquals("первое", SelectionRules.copyText(listOf(two, empty)))
        assertEquals(
            "Имя u2:\nпервое\n\nвторое\n\nтретье\n\nИмя u1:\nмоё",
            SelectionRules.copyText(listOf(one, mine, two, three, empty)),
        )
        assertEquals("", SelectionRules.copyText(listOf(empty)))
    }

    @Test
    fun selectionClosesWhenEmpty() {
        val selection = MessageSelection()
        selection.start(4)
        assertTrue(selection.active)
        selection.set(listOf(4L, 5L))
        assertTrue(selection.removeAll(listOf(4L)))
        assertTrue(selection.active)
        selection.removeAll(listOf(5L))
        assertFalse(selection.active)
    }
}

class HiddenPinsTest {
    private class MemoryStorage : HiddenPinsStorage {
        val values = HashMap<String, String>()

        override fun read(userId: String): String? = values[userId]

        override fun write(userId: String, value: String) {
            values[userId] = value
        }

        override fun clear() {
            values.clear()
        }
    }

    @Test
    fun hiddenUntilAnotherPin() {
        val storage = MemoryStorage()
        var user: String? = ME
        val pins = HiddenPins(storage) { user }
        pins.hide("c1", 10)
        assertTrue(pins.isHidden("c1", 10))
        assertFalse(pins.isHidden("c1", 11))
        assertFalse(pins.isHidden("c2", 10))
        user = PEER
        assertFalse(pins.isHidden("c1", 10))
        user = ME
        assertTrue(HiddenPins(storage) { ME }.isHidden("c1", 10))
        pins.clear()
        assertFalse(pins.isHidden("c1", 10))
        assertTrue(storage.values.isEmpty())
    }
}

class ActiveCallsTest {
    private fun call(chatId: String, vararg left: Boolean) = CallDto(
        id = "call-$chatId",
        chatId = chatId,
        participants = left.mapIndexed { index, gone -> CallParticipantDto(member("p$index"), leftAt = if (gone) "2026-09-28T10:00:00.000Z" else null) },
    )

    @Test
    fun keepsCallPerChat() {
        val calls = ActiveCalls()
        val changed = ArrayList<String>()
        calls.addListener { changed.add(it) }
        calls.put(call("g1", false))
        assertEquals(1, calls.callOf("g1")?.activeParticipants?.size)
        calls.put(call("g1", false, false, true))
        assertEquals(2, calls.callOf("g1")?.activeParticipants?.size)
        calls.live(listOf(call("g2", false), call("g3", false)))
        assertEquals("call-g2", calls.callOf("g2")?.id)
        calls.ended(call("g1"))
        assertNull(calls.callOf("g1"))
        calls.ended(call("g9"))
        assertEquals(listOf("g1", "g1", "g2", "g3", "g1"), changed)
        calls.clear()
        assertNull(calls.callOf("g2"))
    }
}
