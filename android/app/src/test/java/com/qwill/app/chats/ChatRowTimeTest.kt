package com.qwill.app.chats

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class ChatRowTimeTest {
    private val zone = TimeZone.getTimeZone("Asia/Yekaterinburg")

    private fun at(year: Int, month: Int, day: Int, hour: Int = 12, minute: Int = 0): Long =
        Calendar.getInstance(zone).apply {
            clear()
            set(year, month - 1, day, hour, minute, 0)
        }.timeInMillis

    private fun format(moment: Long, now: Long): String = ChatRowTime.formatMs(moment, now, zone)

    @Test
    fun todayShowsClock() {
        val now = at(2026, 9, 25, 23, 50)
        assertEquals("09:05", format(at(2026, 9, 25, 9, 5), now))
        assertEquals("00:05", format(at(2026, 9, 25, 0, 5), now))
    }

    @Test
    fun yesterdayCrossesMidnight() {
        assertEquals("вчера", format(at(2026, 9, 24, 23, 58), at(2026, 9, 25, 0, 1)))
    }

    @Test
    fun weekdayForTwoToSixDays() {
        val now = at(2026, 9, 25)
        assertEquals("ср", format(at(2026, 9, 23), now))
        assertEquals("сб", format(at(2026, 9, 19), now))
        assertEquals("18 сент.", format(at(2026, 9, 18), now))
    }

    @Test
    fun shortMonthsMatchIntl() {
        val now = at(2026, 12, 31)
        val expected = listOf("янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.")
        for ((index, month) in expected.withIndex()) assertEquals("3 $month", format(at(2026, index + 1, 3), now))
    }

    @Test
    fun earlierYearShowsDigits() {
        assertEquals("03.08.25", format(at(2025, 8, 3), at(2026, 9, 25)))
        assertEquals("31.12.25", format(at(2025, 12, 31), at(2026, 1, 10)))
        assertEquals("ср", format(at(2025, 12, 31), at(2026, 1, 3)))
        assertEquals("вчера", format(at(2025, 12, 31), at(2026, 1, 1)))
    }

    @Test
    fun parsesServerIso() {
        val utc = TimeZone.getTimeZone("UTC")
        val now = Calendar.getInstance(utc).apply {
            clear()
            set(2026, 8, 25, 12, 0, 0)
        }.timeInMillis
        assertEquals("09:05", ChatRowTime.format("2026-09-25T09:05:00.000Z", now, utc))
        assertEquals("", ChatRowTime.format("не дата", now, utc))
    }
}
