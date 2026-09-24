package com.qwill.app.realtime

import com.qwill.app.auth.ExecutorQueue
import com.qwill.app.model.UserPresenceEvent
import com.qwill.app.model.UserTypingEvent
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.TimeZone

class RealtimeStoresTest {
    private lateinit var main: ExecutorQueue

    @Before
    fun setUp() {
        main = ExecutorQueue()
    }

    @After
    fun tearDown() {
        main.shutdown()
    }

    private fun <T> onMain(block: () -> T): T {
        var value: T? = null
        main.post { value = block() }
        main.drain()
        @Suppress("UNCHECKED_CAST")
        return value as T
    }

    @Test
    fun onlineNotConfirmedBySnapshotGoesOffline() {
        val presence = Presence(main, confirmMs = 200)
        onMain {
            presence.apply(UserPresenceEvent("a", online = true, lastSeenAt = "2026-09-24T10:00:00.000Z"))
            presence.apply(UserPresenceEvent("b", online = true, lastSeenAt = "2026-09-24T10:00:00.000Z"))
            presence.onConnected()
            presence.apply(UserPresenceEvent("b", online = true, lastSeenAt = "2026-09-24T11:00:00.000Z"))
        }
        Thread.sleep(400)
        val a = onMain { presence["a"]!! }
        val b = onMain { presence["b"]!! }
        assertFalse(a.online)
        assertEquals("2026-09-24T10:00:00.000Z", a.lastSeenAt)
        assertTrue(b.online)
        assertEquals(1, onMain { presence.onlineCount })
    }

    @Test
    fun seedDoesNotOverwriteLive() {
        val presence = Presence(main)
        onMain {
            presence.apply(UserPresenceEvent("a", online = true, lastSeenAt = "x"))
            presence.seed("a", "old")
            presence.seed("b", "old")
        }
        assertTrue(onMain { presence["a"]!!.online })
        assertEquals("old", onMain { presence["b"]!!.lastSeenAt })
    }

    @Test
    fun typingExpiresWithoutRepeatAndRepeatExtends() {
        val store = TypingStore(main, { "me" }, timeoutMs = 300)
        onMain { store.apply(UserTypingEvent("c", "u", "Анна", isTyping = true)) }
        Thread.sleep(200)
        onMain { store.apply(UserTypingEvent("c", "u", "Анна", isTyping = true)) }
        Thread.sleep(200)
        assertEquals(listOf(Typist("u", "Анна")), onMain { store.typists("c") })
        Thread.sleep(250)
        assertTrue(onMain { store.typists("c") }.isEmpty())
    }

    @Test
    fun typingStopRemovesAndOwnEventsAreIgnored() {
        val store = TypingStore(main, { "me" })
        onMain {
            store.apply(UserTypingEvent("c", "u", "Анна", isTyping = true))
            store.apply(UserTypingEvent("c", "me", "Я", isTyping = true))
        }
        assertEquals(listOf("u"), onMain { store.typists("c").map { it.userId } })
        onMain { store.apply(UserTypingEvent("c", "u", "Анна", isTyping = false)) }
        assertTrue(onMain { store.typists("c") }.isEmpty())
    }

    @Test
    fun typingClearsOnDisconnect() {
        val store = TypingStore(main, { "me" })
        onMain {
            store.apply(UserTypingEvent("c", "u", "Анна", isTyping = true))
            store.apply(UserTypingEvent("d", "v", "Вера", isTyping = true))
            store.clear()
        }
        assertTrue(onMain { store.typists("c") + store.typists("d") }.isEmpty())
    }

    @Test
    fun lastSeenMatchesWebFormat() {
        val zone = TimeZone.getTimeZone("Europe/Moscow")
        val now = 1_790_000_000_000L
        assertEquals("в сети", LastSeen.describe(PresenceInfo(true, ""), now, zone))
        assertEquals("был(а) в 17:13", LastSeen.format("2026-09-21T14:13:00.000Z", now, zone))
        assertEquals("был(а) 3 авг. в 21:47", LastSeen.format("2026-08-03T18:47:00.000Z", now, zone))
        assertEquals("был(а) 1 мая в 09:05", LastSeen.format("2026-05-01T06:05:00.000Z", now, zone))
        assertEquals("", LastSeen.format("не дата", now, zone))
    }
}
