package com.qwill.app.chat

import com.qwill.app.chat.calendar.CalendarFilter
import com.qwill.app.chat.calendar.CalendarMonths
import com.qwill.app.chat.calendar.ChatCalendarData
import com.qwill.app.chat.calendar.DateBounds
import com.qwill.app.chat.calendar.DateParts
import com.qwill.app.chat.search.ChatSearch
import com.qwill.app.chat.search.ChatSearchMode
import com.qwill.app.chat.search.ChatSearchText
import com.qwill.app.chat.search.ChatSearchTransport
import com.qwill.app.chat.search.MemberSuggest
import com.qwill.app.chat.search.SearchCancel
import com.qwill.app.database.ME
import com.qwill.app.database.message
import com.qwill.app.model.ChatCalendarDay
import com.qwill.app.model.ChatCalendarResponse
import com.qwill.app.model.ChatSearchResponse
import com.qwill.app.model.GroupMemberDTO
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiResult
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import com.qwill.app.ui.wheel.WheelScroller
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

private class FakeSearchTransport : ChatSearchTransport {
    class Call(val q: String, val before: Long?, val from: String?, val done: (ApiResult<ChatSearchResponse>) -> Unit) {
        var cancelled = false
    }

    val calls = ArrayList<Call>()
    val jumps = ArrayList<Pair<Long, (JumpOutcome) -> Unit>>()

    override fun search(q: String, before: Long?, fromUserId: String?, done: (ApiResult<ChatSearchResponse>) -> Unit): SearchCancel {
        val call = Call(q, before, fromUserId, done)
        calls.add(call)
        return SearchCancel { call.cancelled = true }
    }

    override fun jump(messageId: Long, done: (JumpOutcome) -> Unit) {
        jumps.add(messageId to done)
    }
}

private fun page(ids: List<Long>, total: Int, hasMore: Boolean): ApiResult<ChatSearchResponse> =
    ApiResult.Success(ChatSearchResponse(ids.map { message(it) }, total, hasMore))

class ChatSearchTest {
    private val transport = FakeSearchTransport()
    private var changes = 0
    private val search = ChatSearch(transport) { changes++ }

    @Test
    fun openRunsEmptyQueryWithoutJump() {
        search.open()
        assertTrue(search.open)
        assertEquals(1, transport.calls.size)
        assertEquals("", transport.calls[0].q)
        assertNull(transport.calls[0].before)
        transport.calls[0].done(page(listOf(30, 20, 10), 42, true))
        assertEquals(3, search.results.size)
        assertEquals(42, search.total)
        assertEquals(0, search.index)
        assertTrue(transport.jumps.isEmpty())
    }

    @Test
    fun typingSendsNothingUntilSubmit() {
        search.open()
        search.setDraft("п")
        search.setDraft("пр")
        search.setDraft("при")
        assertEquals(1, transport.calls.size)
        search.submit()
        assertEquals(2, transport.calls.size)
        assertEquals("при", transport.calls[1].q)
        transport.calls[1].done(page(listOf(50, 40), 2, false))
        assertEquals(listOf(50L), transport.jumps.map { it.first })
    }

    @Test
    fun erasingToEmptyRunsWholeHistoryWithoutJump() {
        search.open()
        search.setDraft("слово")
        search.setDraft("")
        assertEquals(2, transport.calls.size)
        assertEquals("", transport.calls[1].q)
        assertTrue(transport.calls[0].cancelled)
        transport.calls[1].done(page(listOf(9), 1, false))
        assertTrue(transport.jumps.isEmpty())
    }

    @Test
    fun typingInListModeReturnsToChat() {
        search.open()
        transport.calls[0].done(page(listOf(3, 2, 1), 3, false))
        search.setMode(ChatSearchMode.LIST)
        assertEquals(ChatSearchMode.LIST, search.mode)
        search.setDraft("x")
        assertEquals(ChatSearchMode.CHAT, search.mode)
    }

    @Test
    fun listModeNeedsResults() {
        search.open()
        transport.calls[0].done(page(emptyList(), 0, false))
        search.setMode(ChatSearchMode.LIST)
        assertEquals(ChatSearchMode.CHAT, search.mode)
    }

    @Test
    fun olderAtLoadedEdgeLoadsMoreAndMoves() {
        search.open()
        transport.calls[0].done(page(listOf(30, 20), 4, true))
        search.next()
        assertEquals(1, search.index)
        assertEquals(20L, transport.jumps.last().first)
        search.next()
        assertEquals(2, transport.calls.size)
        assertEquals(20L, transport.calls[1].before)
        transport.calls[1].done(page(listOf(10, 5), 4, false))
        assertEquals(2, search.index)
        assertEquals(10L, transport.jumps.last().first)
        search.next()
        search.next()
        assertEquals(3, search.index)
        assertFalse(search.canOlder)
        search.next()
        assertEquals(3, search.index)
        assertEquals(2, transport.calls.size)
    }

    @Test
    fun newerStopsAtZero() {
        search.open()
        transport.calls[0].done(page(listOf(30, 20), 2, false))
        search.prev()
        assertEquals(0, search.index)
        assertTrue(transport.jumps.isEmpty())
        assertFalse(search.canNewer)
        search.next()
        assertTrue(search.canNewer)
        search.prev()
        assertEquals(0, search.index)
    }

    @Test
    fun lateAnswerOfStaleQueryIsDropped() {
        search.open()
        search.setDraft("новое")
        search.submit()
        transport.calls[0].done(page(listOf(1), 1, false))
        assertTrue(search.results.isEmpty())
        assertTrue(search.loading)
        transport.calls[1].done(page(listOf(7, 6), 2, false))
        assertEquals(listOf(7L, 6L), search.results.map { it.id })
    }

    @Test
    fun selectSetsIndexAndChat() {
        search.open()
        transport.calls[0].done(page(listOf(3, 2, 1), 3, false))
        search.setMode(ChatSearchMode.LIST)
        search.select(2)
        assertEquals(2, search.index)
        assertEquals(ChatSearchMode.CHAT, search.mode)
        assertEquals(1L, transport.jumps.last().first)
    }

    @Test
    fun pickSearchesByAuthorWithJump() {
        search.open()
        search.startPicking()
        assertTrue(search.picking)
        search.setDraft("ан")
        assertEquals(1, transport.calls.size)
        search.submit()
        assertEquals(1, transport.calls.size)
        search.pick(GroupMemberDTO("u7", "anna", "Анна"))
        assertFalse(search.picking)
        assertEquals("", search.draft)
        assertEquals("u7", transport.calls.last().from)
        transport.calls.last().done(page(listOf(11, 4), 2, false))
        assertEquals(11L, transport.jumps.last().first)
        search.setDraft("слово")
        search.submit()
        assertEquals("u7", transport.calls.last().from)
        assertEquals("слово", transport.calls.last().q)
    }

    @Test
    fun clearCaptionStepsBackTwice() {
        search.open()
        search.startPicking()
        search.pick(GroupMemberDTO("u7", "anna", "Анна"))
        val before = transport.calls.size
        search.clearCaption()
        assertNull(search.from)
        assertTrue(search.picking)
        assertEquals(before + 1, transport.calls.size)
        assertNull(transport.calls.last().from)
        transport.calls.last().done(page(listOf(1), 1, false))
        assertTrue(transport.jumps.isEmpty())
        search.clearCaption()
        assertFalse(search.picking)
    }

    @Test
    fun closeCancelsEverything() {
        search.open()
        search.close()
        assertFalse(search.open)
        assertTrue(transport.calls[0].cancelled)
        transport.calls[0].done(page(listOf(1), 1, false))
        assertTrue(search.results.isEmpty())
    }

    @Test
    fun errorTexts() {
        search.open()
        transport.calls[0].done(ApiResult.Failure(NetworkError()))
        assertEquals(NetworkError.MESSAGE, search.error)
        search.submit()
        transport.calls[1].done(ApiResult.Failure(ApiError(500, ErrorCode.INTERNAL, "boom")))
        assertEquals(ChatSearch.SEARCH_FAILED, search.error)
        search.submit()
        transport.calls[2].done(page(listOf(5, 4), 2, false))
        transport.jumps.last().second(JumpOutcome.FAILED)
        assertEquals(ChatSearch.JUMP_FAILED, search.error)
        search.next()
        transport.jumps.last().second(JumpOutcome.OK)
        assertNull(search.error)
    }

    @Test
    fun supersededJumpOutcomeIgnored() {
        search.open()
        search.submit()
        transport.calls[1].done(page(listOf(5, 4), 2, false))
        val first = transport.jumps.last().second
        search.next()
        first(JumpOutcome.FAILED)
        assertNull(search.error)
    }
}

class ChatSearchTextTest {
    private fun list(total: Int): String = ChatSearchText.counter(null, false, total, total, 0, ChatSearchMode.LIST)

    @Test
    fun counterStates() {
        assertEquals("1 из 42", ChatSearchText.counter(null, false, 30, 42, 0, ChatSearchMode.CHAT))
        assertEquals("Ничего не найдено", ChatSearchText.counter(null, false, 0, 0, 0, ChatSearchMode.CHAT))
        assertEquals("Ищу…", ChatSearchText.counter(null, true, 0, 0, 0, ChatSearchMode.CHAT))
        assertEquals("Ошибка", ChatSearchText.counter("Ошибка", true, 5, 5, 2, ChatSearchMode.LIST))
    }

    @Test
    fun listForms() {
        assertEquals("1 результат", list(1))
        assertEquals("2 результата", list(2))
        assertEquals("5 результатов", list(5))
        assertEquals("11 результатов", list(11))
        assertEquals("21 результат", list(21))
        assertEquals("22 результата", list(22))
        assertEquals("112 результатов", list(112))
    }
}

class MemberSuggestTest {
    private val anna = GroupMemberDTO("a", "anna_p", "Анна Петрова")
    private val boris = GroupMemberDTO("b", "boris", "Борис")
    private val yozhik = GroupMemberDTO("c", "hedgehog", "Ёжик Туманный")
    private val me = GroupMemberDTO(ME, "me", "Я Сам")
    private val all = listOf(anna, boris, yozhik, me)

    @Test
    fun withoutMe() {
        assertFalse(MemberSuggest.filter(all, "", emptyList(), ME).any { it.userId == ME })
    }

    @Test
    fun recentAuthorsFirst() {
        val result = MemberSuggest.filter(all, "", listOf("c", "b"), ME)
        assertEquals(listOf("c", "b", "a"), result.map { it.userId })
    }

    @Test
    fun matchesStarts() {
        assertTrue(MemberSuggest.filter(all, "petr", emptyList(), ME).isEmpty())
        assertEquals(listOf("a"), MemberSuggest.filter(all, "петр", emptyList(), ME).map { it.userId })
        assertTrue(MemberSuggest.filter(all, "етров", emptyList(), ME).isEmpty())
        assertEquals(listOf("a"), MemberSuggest.filter(all, "anna", emptyList(), ME).map { it.userId })
        assertEquals(listOf("a"), MemberSuggest.filter(all, "анна п", emptyList(), ME).map { it.userId })
        assertEquals(listOf("b"), MemberSuggest.filter(all, "БОР", emptyList(), ME).map { it.userId })
        assertEquals(listOf("c"), MemberSuggest.filter(all, "ежик", emptyList(), ME).map { it.userId })
        assertEquals(listOf("c"), MemberSuggest.filter(all, "туман", emptyList(), ME).map { it.userId })
    }

    @Test
    fun emptyQueryIsEveryone() {
        assertEquals(3, MemberSuggest.filter(all, "  ", emptyList(), ME).size)
        assertTrue(MemberSuggest.filter(null, "", emptyList(), ME).isEmpty())
    }

    @Test
    fun captionNameIsFirstWordUpToTen() {
        assertEquals("Анна", MemberSuggest.firstName(anna))
        assertEquals("Константин", MemberSuggest.firstName(GroupMemberDTO("x", "k", "Константинопольский")))
        assertEquals("anna", MemberSuggest.firstName(GroupMemberDTO("x", "anna", "")))
    }
}

class DateBoundsTest {
    private val min = DateParts(2020, 0, 15)
    private val max = DateParts(2026, 8, 30)

    @Test
    fun wantedDayIsKeptApart() {
        val february = DateBounds.resolve(DateParts(2025, 1, 31), min, max)
        assertEquals(28, february.parts.day)
        val leap = DateBounds.resolve(DateParts(2024, 1, 31), min, max)
        assertEquals(29, leap.parts.day)
        val march = DateBounds.resolve(DateParts(2025, 2, 31), min, max)
        assertEquals(31, march.parts.day)
    }

    @Test
    fun lowerYearLimitsMonthAndDay() {
        val resolved = DateBounds.resolve(DateParts(2020, 0, 3), min, max)
        assertEquals(0..11, DateBounds.resolve(DateParts(2021, 5, 3), min, max).months)
        assertEquals(0, resolved.months.first)
        assertEquals(15, resolved.days.first)
        assertEquals(15, resolved.parts.day)
        val before = DateBounds.resolve(DateParts(2019, 5, 3), min, max)
        assertEquals(2020, before.parts.year)
    }

    @Test
    fun currentYearStopsAtToday() {
        val resolved = DateBounds.resolve(DateParts(2026, 11, 31), min, max)
        assertEquals(8, resolved.parts.month)
        assertEquals(30, resolved.parts.day)
        assertEquals(8, resolved.months.last)
        assertEquals(30, resolved.days.last)
    }

    @Test
    fun keyPads() {
        assertEquals("2024-02-09", DateParts(2024, 1, 9).key)
        assertEquals(DateParts(2024, 1, 9), DateParts.ofKey("2024-02-09"))
    }
}

class WheelScrollerTest {
    @Test
    fun flingUsesRawPixels() {
        val fast = WheelScroller.flingOf(2000f)
        assertEquals(1000f, fast.durationMs, 0.5f)
        assertEquals(800f, fast.distance, 0.5f)
        val slow = WheelScroller.flingOf(1000f)
        assertEquals(669f, slow.durationMs, 1f)
        assertEquals(268f, slow.distance, 1f)
        assertEquals(-268f, WheelScroller.flingOf(-1000f).distance, 1f)
    }

    @Test
    fun splineIsMonotonic() {
        val spline = WheelScroller.SPLINE
        assertEquals(0f, spline[0], 1e-4f)
        assertEquals(1f, spline[spline.size - 1], 1e-6f)
        for (index in 1 until spline.size) assertTrue(spline[index] >= spline[index - 1])
        assertEquals(0f, WheelScroller.flingProgress(0f), 0f)
        assertEquals(1f, WheelScroller.flingProgress(1f), 0f)
    }

    @Test
    fun curves() {
        assertEquals(0f, WheelScroller.viscousFluid(0f), 1e-5f)
        assertEquals(1f, WheelScroller.viscousFluid(1f), 1e-5f)
        assertEquals(0f, WheelScroller.decelerate(0f), 0f)
        assertEquals(1f, WheelScroller.decelerate(1f), 0f)
        assertEquals(0.96875f, WheelScroller.decelerate(0.5f), 1e-5f)
        assertEquals(0f, WheelScroller.edgeFalloff(-3f), 1e-5f)
        assertEquals(1f, WheelScroller.edgeFalloff(4f), 1e-5f)
        assertTrue(WheelScroller.edgeFalloff(0.1f) > 0.1f)
    }
}

class CalendarMonthsTest {
    @Test
    fun blanksFromMonday() {
        assertEquals(0, CalendarMonths.leadingBlanks(CalendarMonths.index(2026, 5)))
        assertEquals(1, CalendarMonths.leadingBlanks(CalendarMonths.index(2026, 8)))
        assertEquals(6, CalendarMonths.leadingBlanks(CalendarMonths.index(2026, 1)))
        assertEquals(2, CalendarMonths.leadingBlanks(CalendarMonths.index(2025, 0)))
    }

    @Test
    fun februaryLength() {
        assertEquals(28, CalendarMonths.dayCount(CalendarMonths.index(2025, 1)))
        assertEquals(29, CalendarMonths.dayCount(CalendarMonths.index(2024, 1)))
        assertEquals(31, CalendarMonths.dayCount(CalendarMonths.index(2025, 11)))
    }

    @Test
    fun indexRoundTrip() {
        val index = CalendarMonths.indexOfKey("2025-09-17")
        assertEquals(2025, CalendarMonths.yearOf(index))
        assertEquals(8, CalendarMonths.monthOf(index))
        assertEquals(CalendarMonths.index(2026, 0), CalendarMonths.index(2025, 11) + 1)
        assertEquals("Сентябрь 2025", CalendarMonths.title(index))
        assertEquals("2025-09-01", CalendarMonths.firstDay(index))
        assertEquals("2025-09-30", CalendarMonths.lastDay(index))
        assertEquals("2025-09-07", CalendarMonths.dayKey(index, 7))
        assertEquals("3 февраля 2025 г.", CalendarMonths.dayTitle("2025-02-03"))
        assertEquals(6, CalendarMonths.rows(CalendarMonths.index(2026, 2)))
    }

    @Test
    fun dataRequestsMonthsOnce() {
        val requests = ArrayList<Pair<String, String>>()
        val answers = ArrayList<(ChatCalendarResponse?) -> Unit>()
        val data = ChatCalendarData({ from, to, done ->
            requests.add(from to to)
            answers.add(done)
        }) {}
        val september = CalendarMonths.index(2025, 8)
        data.ensure(september - 2, september)
        assertEquals("2025-07-01" to "2025-09-30", requests[0])
        data.ensure(september - 2, september)
        assertEquals(1, requests.size)
        assertFalse(data.isSettled(september))
        answers[0](ChatCalendarResponse(listOf(ChatCalendarDay("2025-09-03", 4, 77)), "2024-01-05", "2026-09-30"))
        assertTrue(data.isSettled(september))
        assertEquals(77L, data.days["2025-09-03"]?.firstMessageId)
        data.ensure(september - 5, september - 3)
        answers[1](null)
        data.ensure(september - 5, september - 3)
        assertEquals(3, requests.size)
    }
}

class SearchDateLabelTest {
    private val zone = TimeZone.getTimeZone("Europe/Moscow")

    private fun at(year: Int, month: Int, day: Int, hour: Int, minute: Int): Long =
        Calendar.getInstance(zone).apply {
            clear()
            set(year, month, day, hour, minute)
        }.timeInMillis

    @Test
    fun attachmentDateTime() {
        val now = at(2026, 8, 30, 18, 0)
        assertEquals("сегодня в 14:02", DayLabel.attachmentDateTime(at(2026, 8, 30, 14, 2), now, zone))
        assertEquals("12 сент. в 09:05", DayLabel.attachmentDateTime(at(2026, 8, 12, 9, 5), now, zone))
        assertEquals("12 сент. 2024 г. в 09:05", DayLabel.attachmentDateTime(at(2024, 8, 12, 9, 5), now, zone))
        assertEquals("3 мая в 23:59", DayLabel.attachmentDateTime(at(2026, 4, 3, 23, 59), now, zone))
        assertEquals("1 февр. в 00:00", DayLabel.attachmentDateTime(at(2026, 1, 1, 0, 0), now, zone))
    }
}

class ChatRequestsTest {
    @Test
    fun searchPath() {
        assertEquals("/api/chats/c1/messages/search?q=", ChatRequests.searchPath("c1", "", null, null))
        assertEquals(
            "/api/chats/c1/messages/search?q=%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82+%26+%D0%BC%D0%B8%D1%80&before=120&fromUserId=u+7",
            ChatRequests.searchPath("c1", "привет & мир", 120L, "u 7"),
        )
    }

    @Test
    fun calendarPath() {
        assertEquals(
            "/api/chats/c1/calendar?tz=Europe%2FMoscow&from=2025-07-01&to=2025-09-30&filter=media",
            ChatRequests.calendarPath("c1", "2025-07-01", "2025-09-30", CalendarFilter.MEDIA, "Europe/Moscow"),
        )
        assertTrue(ChatRequests.calendarPath("c1", "a", "b", CalendarFilter.ALL, "UTC").endsWith("filter=all"))
    }
}
