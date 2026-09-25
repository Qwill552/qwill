package com.qwill.app.chats

import com.qwill.app.realtime.ConnectionState
import com.qwill.app.ui.ConnectionTitleRule
import com.qwill.app.ui.TitleKind
import org.junit.Assert.assertEquals
import org.junit.Test

class FrozenUpdatesTest {
    @Test
    fun appliesImmediatelyWhenNotHeld() {
        val applied = ArrayList<Int>()
        val frozen = FrozenUpdates<Int>()
        frozen.submit(1) { applied.add(it) }
        assertEquals(listOf(1), applied)
    }

    @Test
    fun heldChangesCollapseIntoOneBatchAfterRelease() {
        val applied = ArrayList<Int>()
        val frozen = FrozenUpdates<Int>()
        frozen.hold("finger", true) { applied.add(it) }
        frozen.submit(1) { applied.add(it) }
        frozen.submit(2) { applied.add(it) }
        frozen.submit(3) { applied.add(it) }
        assertEquals(emptyList<Int>(), applied)
        frozen.hold("finger", false) { applied.add(it) }
        assertEquals(listOf(3), applied)
    }

    @Test
    fun releaseWaitsForEveryHolder() {
        val applied = ArrayList<Int>()
        val frozen = FrozenUpdates<Int>()
        frozen.hold("finger", true) { applied.add(it) }
        frozen.hold("menu", true) { applied.add(it) }
        frozen.submit(7) { applied.add(it) }
        frozen.hold("finger", false) { applied.add(it) }
        assertEquals(emptyList<Int>(), applied)
        frozen.hold("menu", false) { applied.add(it) }
        assertEquals(listOf(7), applied)
        frozen.hold("menu", false) { applied.add(it) }
        assertEquals(listOf(7), applied)
    }

    @Test
    fun connectionTitleKindsAndDelays() {
        assertEquals(TitleKind.WAITING, ConnectionTitleRule.kindOf(ConnectionState.WaitingForNetwork, false))
        assertEquals(TitleKind.CONNECTING, ConnectionTitleRule.kindOf(ConnectionState.Connecting, false))
        assertEquals(TitleKind.UPDATING, ConnectionTitleRule.kindOf(ConnectionState.Updating, false))
        for (state in listOf(ConnectionState.Connected, ConnectionState.Sleeping, ConnectionState.Off)) {
            assertEquals(TitleKind.BRAND, ConnectionTitleRule.kindOf(state, false))
        }
        assertEquals(TitleKind.IP_BANNED, ConnectionTitleRule.kindOf(ConnectionState.Updating, true))
        assertEquals(300L, ConnectionTitleRule.delayFor(TitleKind.CONNECTING))
        assertEquals(300L, ConnectionTitleRule.delayFor(TitleKind.UPDATING))
        assertEquals(0L, ConnectionTitleRule.delayFor(TitleKind.WAITING))
        assertEquals(0L, ConnectionTitleRule.delayFor(TitleKind.IP_BANNED))
        assertEquals(0L, ConnectionTitleRule.delayFor(TitleKind.BRAND))
    }
}
