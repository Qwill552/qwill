package com.qwill.app.chat

import com.qwill.app.database.ME
import com.qwill.app.database.PEER
import com.qwill.app.database.member
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageType
import com.qwill.app.ui.theme.FixedColors
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

private val ZONE: TimeZone = TimeZone.getTimeZone("Europe/Moscow")

private fun at(year: Int, month: Int, day: Int, hour: Int = 10, minute: Int = 0): Long =
    Calendar.getInstance(ZONE).apply {
        clear()
        set(year, month - 1, day, hour, minute, 0)
    }.timeInMillis

private fun feed(vararg ids: Long): List<MessageDto> = ids.map { MessageDto(id = it, chatId = "c1") }

private fun ids(list: List<MessageDto>): List<Long> = list.map { it.id }

class FeedWindowTest {
    @Test
    fun olderPageGoesBeforeFeed() {
        assertEquals(listOf(3L, 4L, 5L, 6L), ids(FeedWindow.merge(feed(5, 6), feed(3, 4), FeedSide.OLDER)))
    }

    @Test
    fun newerPageGoesBeforePending() {
        assertEquals(listOf(5L, 6L, 7L, -1L), ids(FeedWindow.merge(feed(5, -1), feed(6, 7), FeedSide.NEWER)))
    }

    @Test
    fun knownMessagesAreNotDuplicated() {
        assertEquals(listOf(4L, 5L, 6L), ids(FeedWindow.merge(feed(5, 6), feed(4, 5, 6), FeedSide.OLDER)))
    }

    @Test
    fun pageOfKnownKeepsSameList() {
        val list = feed(5, 6)
        assertSame(list, FeedWindow.merge(list, feed(5, 6), FeedSide.OLDER))
    }

    @Test
    fun shortFeedIsNotTrimmed() {
        val result = FeedWindow.trim(feed(1, 2, 3), FeedSide.OLDER, 6, FeedKeepRange(1, 3))
        assertFalse(result.trimmed)
    }

    @Test
    fun withoutVisibleRangeNothingIsTrimmed() {
        assertFalse(FeedWindow.trim(feed(1, 2, 3, 4, 5, 6, 7, 8), FeedSide.OLDER, 6, null).trimmed)
    }

    @Test
    fun loadingOlderCutsFarBottom() {
        val result = FeedWindow.trim(feed(1, 2, 3, 4, 5, 6, 7, 8), FeedSide.OLDER, 6, FeedKeepRange(2, 4))
        assertTrue(result.trimmed)
        assertEquals(listOf(1L, 2L, 3L, 4L, 5L, 6L), ids(result.list))
    }

    @Test
    fun loadingNewerCutsFarTop() {
        val result = FeedWindow.trim(feed(1, 2, 3, 4, 5, 6, 7, 8), FeedSide.NEWER, 6, FeedKeepRange(5, 7))
        assertTrue(result.trimmed)
        assertEquals(listOf(3L, 4L, 5L, 6L, 7L, 8L), ids(result.list))
    }

    @Test
    fun visibleRangeIsNeverCut() {
        val result = FeedWindow.trim(feed(1, 2, 3, 4, 5, 6, 7, 8), FeedSide.OLDER, 6, FeedKeepRange(1, 8))
        assertFalse(result.trimmed)
    }

    @Test
    fun pendingAtBottomIsNeverCut() {
        val result = FeedWindow.trim(feed(1, 2, 3, 4, 5, 6, 7, -1), FeedSide.OLDER, 6, FeedKeepRange(1, 2))
        assertFalse(result.trimmed)
        assertEquals(listOf(1L, 2L, 3L, 4L, 5L, 6L, 7L, -1L), ids(result.list))
    }

    @Test
    fun accumulatorLimitIsWebNumber() {
        val list = (1L..1001L).toList().let { feed(*it.toLongArray()) }
        val result = FeedWindow.trim(list, FeedSide.OLDER, FeedWindow.ACCUMULATOR_LIMIT, FeedKeepRange(1, 10))
        assertEquals(1000, result.list.size)
        assertEquals(50, FeedWindow.PAGE_SIZE)
        assertEquals(100, FeedWindow.PREFETCH_ROWS)
    }

    @Test
    fun keepRangeSkipsPending() {
        assertEquals(FeedKeepRange(3, 9), FeedWindow.keepRange(listOf(9L, -1L, 3L, 5L)))
        assertNull(FeedWindow.keepRange(listOf(-1L)))
    }
}

class FeedFollowTest {
    private val viewport = 800f
    private val reserve = 140f
    private val bubble = 90f

    private fun atBottom(scrollHeight: Float): Float = scrollHeight - viewport

    private fun input(
        lastId: Long? = 42,
        prevLastId: Long? = 41,
        liveMessageId: Long = 42,
        isOwnLast: Boolean = false,
        wasNewest: Boolean = true,
        isAutoScrolling: Boolean = false,
        prevScrollHeight: Float = 5000f,
        scrollHeight: Float = prevScrollHeight + bubble,
        scrollTop: Float = atBottom(prevScrollHeight),
    ): FollowInput = FollowInput(
        lastId = lastId,
        prevLastId = prevLastId,
        liveMessageId = liveMessageId,
        isOwnLast = isOwnLast,
        wasNewest = wasNewest,
        isAutoScrolling = isAutoScrolling,
        distanceBefore = FeedFollow.distanceBeforeGrowth(scrollHeight, prevScrollHeight, scrollTop, viewport, reserve),
        threshold = 120f,
    )

    @Test
    fun atBottomFollowsForeign() {
        assertTrue(FeedFollow.shouldFollow(input()))
        assertTrue(FeedFollow.shouldFollow(input(scrollTop = atBottom(5000f) - 1)))
        assertTrue(FeedFollow.shouldFollow(input(scrollTop = atBottom(5000f) - reserve + 10)))
    }

    @Test
    fun screenAboveDoesNotFollow() {
        assertFalse(FeedFollow.shouldFollow(input(scrollTop = atBottom(5000f) - viewport)))
    }

    @Test
    fun tallArrivalDoesNotUnstick() {
        assertTrue(FeedFollow.shouldFollow(input(scrollHeight = 5900f)))
    }

    @Test
    fun nothingArrivedOrTailNotLoaded() {
        assertFalse(FeedFollow.shouldFollow(input(lastId = 41)))
        assertFalse(FeedFollow.shouldFollow(input(wasNewest = false)))
    }

    @Test
    fun ownPullsFromAnywhereButOnlyWhenSent() {
        assertTrue(FeedFollow.shouldFollow(input(isOwnLast = true, lastId = -1, liveMessageId = -1, scrollTop = 0f)))
        assertFalse(FeedFollow.shouldFollow(input(isOwnLast = true, lastId = 900, liveMessageId = 0, scrollTop = 0f)))
    }

    @Test
    fun loadedPageDoesNotPullReaderDown() {
        assertFalse(
            FeedFollow.shouldFollow(
                input(lastId = 700, prevLastId = 650, liveMessageId = 0, scrollHeight = 8000f, scrollTop = atBottom(5000f) - viewport * 3),
            ),
        )
        assertFalse(
            FeedFollow.shouldFollow(
                input(isOwnLast = true, lastId = 700, prevLastId = 650, liveMessageId = 0, scrollHeight = 8000f, scrollTop = atBottom(5000f) - viewport * 3),
            ),
        )
        assertTrue(FeedFollow.shouldFollow(input(lastId = 700, prevLastId = 650, liveMessageId = 0, scrollHeight = 8000f)))
    }

    @Test
    fun secondMessageCatchesUnfinishedScroll() {
        assertTrue(FeedFollow.shouldFollow(input(lastId = 43, prevLastId = 42, liveMessageId = 43, isAutoScrolling = true, scrollTop = atBottom(5000f) - 400)))
        assertFalse(
            FeedFollow.shouldFollow(
                input(lastId = 700, prevLastId = 650, liveMessageId = 0, isAutoScrolling = true, scrollHeight = 8000f, scrollTop = atBottom(5000f) - viewport * 3),
            ),
        )
    }

    @Test
    fun followThresholdIsFiftyAndSnapIsEight() {
        assertEquals(50f, FeedFollow.FOLLOW_DP)
        assertEquals(8f, FeedFollow.BOTTOM_SNAP_DP)
        assertEquals(120f, FeedFollow.STICK_DP)
        val stood = FollowInput(42, 41, 42, false, true, false, 50f, FeedFollow.FOLLOW_DP)
        assertTrue(FeedFollow.shouldFollow(stood))
        assertFalse(FeedFollow.shouldFollow(stood.copy(distanceBefore = 51f)))
    }
}

class StickyDateTest {
    private val row = 100f
    private val divider = 38f
    private val days = setOf(0, 5)
    private val tops = FloatArray(10) { it * row }

    private fun at(clip: Float): StickyPlace? = StickyDate.compute(tops, tops.size, { it in days }, clip, divider)

    @Test
    fun noRowsNoPill() {
        assertNull(StickyDate.compute(FloatArray(0), 0, { true }, 0f, divider))
    }

    @Test
    fun atTopPillIsOnLine() {
        assertEquals(StickyPlace(0, 0, 0f), at(0f))
    }

    @Test
    fun farNextDayDoesNotShift() {
        assertEquals(0f, at(450f)!!.offset)
        assertEquals(0f, at(row * 5 - divider)!!.offset)
    }

    @Test
    fun approachingDayPushesByItsHeight() {
        assertEquals(-8f, at(470f)!!.offset)
        assertEquals(-37f, at(499f)!!.offset)
    }

    @Test
    fun handOffHappensOnLine() {
        assertEquals(StickyPlace(4, 0, -37f), at(499f))
        assertEquals(StickyPlace(5, 5, 0f), at(500f))
    }

    @Test
    fun pillNeverDisappears() {
        for (clip in 0 until (row * 10).toInt()) assertTrue("clip=$clip", at(clip.toFloat()) != null)
    }

    @Test
    fun dividerAboveTheWindowIsUsedWhenNotAttached() {
        val visible = floatArrayOf(-30f, 70f, 170f)
        val place = StickyDate.compute(visible, 3, { it == 2 }, 0f, divider, dayAbove = true)
        assertEquals(StickyPlace(0, -1, 0f), place)
        assertNull(StickyDate.compute(visible, 3, { it == 2 }, 0f, divider, dayAbove = false))
        assertNull(StickyDate.compute(floatArrayOf(40f, 140f), 2, { it == 0 }, 0f, divider, dayAbove = true))
    }
}

class DayLabelTest {
    private val now = at(2026, 8, 27, 15)

    @Test
    fun todayAtAnyTime() {
        assertEquals("Сегодня", DayLabel.format(at(2026, 8, 27, 23, 59), now, ZONE))
        assertEquals("Сегодня", DayLabel.format(at(2026, 8, 27, 0, 0), now, ZONE))
    }

    @Test
    fun yesterdayByCalendar() {
        assertEquals("Вчера", DayLabel.format(at(2026, 8, 26, 23), now, ZONE))
    }

    @Test
    fun weekdayCapitalized() {
        assertEquals("Вторник", DayLabel.format(at(2026, 8, 25), now, ZONE))
        assertEquals("Пятница", DayLabel.format(at(2026, 8, 21), now, ZONE))
    }

    @Test
    fun weekAndOlderThisYear() {
        assertEquals("20 августа", DayLabel.format(at(2026, 8, 20), now, ZONE))
    }

    @Test
    fun previousYearWithYearMark() {
        assertEquals("27 августа 2025 г.", DayLabel.format(at(2025, 8, 27), now, ZONE))
    }

    @Test
    fun dayKeyAndClock() {
        assertEquals("2026-08-05", DayLabel.dayKey(at(2026, 8, 5, 0, 30), ZONE))
        assertEquals("09:05", DayLabel.hourMinute(at(2026, 8, 5, 9, 5), ZONE))
    }
}

class FeedRowsTest {
    private fun message(id: Long, sender: String, atMs: Long, clientId: String? = null): Pair<MessageDto, Long> =
        MessageDto(id = id, chatId = "c1", clientId = clientId, sender = member(sender), type = MessageType.TEXT, content = "m$id", createdAt = "t$id") to atMs

    private fun build(items: List<Pair<MessageDto, Long>>, anchor: Long? = null, unread: Int = 0): List<FeedRow> {
        val times = items.associate { it.first.createdAt to it.second }
        return FeedRows.build(items.map { it.first }, ME, anchor, unread, { times.getValue(it.createdAt) }, ZONE)
    }

    private fun shape(rows: List<FeedRow>): List<String> = rows.map {
        when (it) {
            is FeedRow.Day -> "D"
            is FeedRow.Unread -> "U"
            is FeedRow.Message -> "${it.message.id}${if (it.sameAuthorAsPrev) "<" else ""}${if (it.sameAuthorAsNext) ">" else ""}"
        }
    }

    @Test
    fun dayDividerOnMidnight() {
        val rows = build(listOf(message(1, PEER, at(2026, 9, 1, 23, 58)), message(2, PEER, at(2026, 9, 2, 0, 1))))
        assertEquals(listOf("D", "1", "D", "2"), shape(rows))
    }

    @Test
    fun seriesBreaksOnFiveMinutesAndAuthor() {
        val base = at(2026, 9, 1, 12)
        val window = 5 * 60 * 1000L
        val rows = build(
            listOf(
                message(1, PEER, base),
                message(2, PEER, base + window - 1),
                message(3, PEER, base + window * 2),
                message(4, ME, base + window * 2 + 1),
            ),
        )
        assertEquals(listOf("D", "1>", "2<", "3", "4"), shape(rows))
    }

    @Test
    fun unreadStaysBeforeAnchorWhenNewArrive() {
        val base = at(2026, 9, 1, 12)
        val first = build(listOf(message(1, PEER, base), message(2, PEER, base + 1)), anchor = 2, unread = 1)
        assertEquals(listOf("D", "1>", "U", "2<"), shape(first))
        val later = build(listOf(message(1, PEER, base), message(2, PEER, base + 1), message(3, PEER, base + 2)), anchor = 2, unread = 1)
        assertEquals(listOf("D", "1>", "U", "2<>", "3<"), shape(later))
        assertEquals(1, (later[2] as FeedRow.Unread).count)
    }

    @Test
    fun keyKeepsClientIdAfterSent() {
        val base = at(2026, 9, 1, 12)
        val pending = build(listOf(message(-5, ME, base, clientId = "x")))
        val sent = build(listOf(message(77, ME, base, clientId = "x")))
        assertEquals(pending[1].key, sent[1].key)
        val ids = RowIds()
        assertEquals(ids.idOf(pending[1].key), ids.idOf(sent[1].key))
        assertEquals("m:9", FeedRow.keyOf(MessageDto(id = 9, chatId = "c1")))
    }

    @Test
    fun dayKeysStayUniqueForOutOfOrderPending() {
        val base = at(2026, 9, 1, 12)
        val rows = build(listOf(message(1, PEER, base), message(2, PEER, at(2026, 9, 2, 12)), message(-1, ME, base + 1, clientId = "p")))
        val keys = rows.filterIsInstance<FeedRow.Day>().map { it.key }
        assertEquals(keys.size, keys.toSet().size)
    }
}

class TextLinksTest {
    private fun spans(text: String?): List<Triple<SpanKind, String, String?>> = TextLinks.split(text).map { Triple(it.kind, it.value, it.href) }

    private fun t(value: String) = Triple(SpanKind.TEXT, value, null)

    private fun l(value: String) = Triple(SpanKind.LINK, value, value)

    @Test
    fun linksAmongText() {
        assertEquals(listOf(t("смотри "), l("https://example.com"), t(" там")), spans("смотри https://example.com там"))
        assertEquals(listOf(l("https://a.com"), t(" "), l("https://b.com")), spans("https://a.com https://b.com"))
        assertEquals(listOf(l("https://example.com"), t(" текст")), spans("https://example.com текст"))
        assertEquals(listOf(t("текст "), l("https://example.com")), spans("текст https://example.com"))
    }

    @Test
    fun trailingPunctuationAndBrackets() {
        assertEquals(listOf(t("см. "), l("https://example.com"), t(".")), spans("см. https://example.com."))
        assertEquals(listOf(t("(см. "), l("https://example.com"), t(")")), spans("(см. https://example.com)"))
        val url = "https://en.wikipedia.org/wiki/Bracket_(disambiguation)"
        assertEquals(listOf(l(url)), spans(url))
    }

    @Test
    fun notLinks() {
        assertEquals(listOf(t("javascript:alert(1)")), spans("javascript:alert(1)"))
        assertEquals(listOf(t("data:text/html,<script>alert(1)</script>")), spans("data:text/html,<script>alert(1)</script>"))
        assertEquals(listOf(t("это example.com/path не ссылка")), spans("это example.com/path не ссылка"))
        assertEquals(listOf(t("пусто https:// тут")), spans("пусто https:// тут"))
        assertEquals(listOf(t("")), spans(""))
        assertEquals(listOf(t("")), spans(null))
    }

    @Test
    fun unicodeHostAndRanges() {
        val url = "https://пример.рф/страница"
        assertEquals(listOf(t("ссылка "), l(url), t(" тут")), spans("ссылка $url тут"))
        assertEquals(listOf(LinkRange(7, 7 + url.length, url)), TextLinks.ranges("ссылка $url тут"))
        assertEquals(listOf(l("https://a.com"), t(" b")), spans("https://a.com b"))
    }
}

class AuthorTintTest {
    @Test
    fun hashMatchesWeb() {
        val expected = mapOf(
            "u1" to FixedColors.tintTeal,
            "cmf3x9l0a0000ab12cd34ef56" to FixedColors.tintGreen,
            "Ёжик" to FixedColors.tintRed,
            "a" to FixedColors.tintBlue,
            "clzq8w2k30001" to FixedColors.tintTeal,
            "user_42" to FixedColors.tintIndigo,
            "00000000-0000-0000-0000-000000000000" to FixedColors.tintViolet,
            "zzzzzzzzzzzzzzzzzzzz" to FixedColors.tintViolet,
        )
        for ((key, color) in expected) assertEquals(key, color, AuthorTint.of(key))
    }
}
