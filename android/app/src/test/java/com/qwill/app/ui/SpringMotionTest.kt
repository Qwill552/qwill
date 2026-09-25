package com.qwill.app.ui

import org.junit.Assert.assertTrue
import org.junit.Test

class SpringMotionTest {
    private val spring = SpringMotion(stiffness = 600f, dampingRatio = 0.5f)

    @Test
    fun settlesToZero() {
        val v0 = -350f
        val duration = spring.settleDurationMs(0f, v0, 0.5f)
        val late = spring.valueAt(duration / 1000f + 0.2f, 0f, v0)
        assertTrue(kotlin.math.abs(late) < 1f)
    }

    @Test
    fun firstMovementIsTowardsNegative() {
        val v0 = -350f
        val early = spring.valueAt(0.01f, 0f, v0)
        assertTrue(early < 0f)
    }

    @Test
    fun signAlternatesAsItDecays() {
        val v0 = -350f
        val samples = (1..200).map { spring.valueAt(it * 0.01f, 0f, v0) }
        val firstNegativeIndex = samples.indexOfFirst { it < -0.01f }
        assertTrue(firstNegativeIndex >= 0)
        val laterPositiveIndex = samples.withIndex().indexOfFirst { (index, value) -> index > firstNegativeIndex && value > 0.01f }
        assertTrue(laterPositiveIndex > firstNegativeIndex)
    }

    @Test
    fun zeroInitialVelocityStaysAtStart() {
        assertTrue(spring.valueAt(0f, 5f, 0f) == 5f)
    }

    @Test
    fun brokenSpringDoesNotSettleFast() {
        val loose = SpringMotion(stiffness = 10f, dampingRatio = 0.5f)
        val v0 = -350f
        val tight = spring.settleDurationMs(0f, v0, 0.5f)
        val slow = loose.settleDurationMs(0f, v0, 0.5f)
        assertTrue(slow > tight)
    }
}
