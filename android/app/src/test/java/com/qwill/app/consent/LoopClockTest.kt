package com.qwill.app.consent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LoopClockTest {
    @Test
    fun swingEasesEachHalfOfTheCycle() {
        assertEquals(0f, LoopClock.swing(0, 9_000), 1e-4f)
        assertEquals(1f, LoopClock.swing(4_500, 9_000), 1e-4f)
        assertEquals(0.5f, LoopClock.swing(2_250, 9_000), 1e-3f)
        assertEquals(0.5f, LoopClock.swing(6_750, 9_000), 1e-3f)
        assertEquals(0f, LoopClock.swing(9_000, 9_000), 1e-4f)
        assertEquals(CubicBezier.EASE_IN_OUT.valueAt(0.2f), LoopClock.swing(900, 9_000), 1e-4f)
        assertTrue(LoopClock.swing(450, 9_000) < 0.05f)
    }

    @Test
    fun clockStopsAndResumesFromTheSamePlace() {
        val clock = LoopClock()
        clock.start(1_000)
        assertEquals(500L, clock.elapsed(1_500))
        clock.stop(1_700)
        assertEquals(700L, clock.elapsed(50_000))
        clock.start(60_000)
        assertEquals(1_000L, clock.elapsed(60_300))
    }

    @Test
    fun entranceWaitsForItsDelayAndOvershoots() {
        assertEquals(0f, LoopClock.entrance(100, 120, 800), 1e-6f)
        assertEquals(1f, LoopClock.entrance(920, 120, 800), 1e-6f)
        val peak = (0..800 step 10).maxOf { LoopClock.entrance(120L + it, 120, 800) }
        assertTrue("spring overshoots: $peak", peak > 1.05f)
    }

    @Test
    fun cubicBezierIsSymmetricForEaseInOut() {
        val ease = CubicBezier.EASE_IN_OUT
        assertEquals(0.5f, ease.valueAt(0.5f), 1e-4f)
        assertEquals(1f - ease.valueAt(0.3f), ease.valueAt(0.7f), 1e-4f)
    }
}
