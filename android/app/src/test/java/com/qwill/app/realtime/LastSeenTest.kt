package com.qwill.app.realtime

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.TimeZone

class LastSeenTest {
    private val zone = TimeZone.getTimeZone("Europe/Moscow")
    private val now = 1_790_000_000_000L

    @Test
    fun shortFormatHasTimeOnlyToday() {
        assertEquals("был(а) в 17:13", LastSeen.formatShort("2026-09-21T14:13:00.000Z", now, zone))
        assertEquals("был(а) 3 авг.", LastSeen.formatShort("2026-08-03T18:47:00.000Z", now, zone))
        assertEquals("был(а) 1 мая", LastSeen.formatShort("2026-05-01T06:05:00.000Z", now, zone))
        assertEquals("был(а) 20 сент.", LastSeen.formatShort("2026-09-20T20:59:00.000Z", now, zone))
        assertEquals("", LastSeen.formatShort("не дата", now, zone))
    }
}
