package com.qwill.app.consent

import kotlin.math.abs

class CubicBezier(private val x1: Float, private val y1: Float, private val x2: Float, private val y2: Float) {
    fun valueAt(x: Float): Float {
        if (x <= 0f) return 0f
        if (x >= 1f) return 1f
        return curve(solveT(x), y1, y2)
    }

    private fun solveT(x: Float): Float {
        var t = x
        repeat(8) {
            val error = curve(t, x1, x2) - x
            if (abs(error) < EPSILON) return t
            val slope = slope(t, x1, x2)
            if (abs(slope) < 1e-6f) return@repeat
            t -= error / slope
        }
        var low = 0f
        var high = 1f
        t = x
        repeat(40) {
            val value = curve(t, x1, x2)
            if (abs(value - x) < EPSILON) return t
            if (value < x) low = t else high = t
            t = (low + high) / 2f
        }
        return t
    }

    private fun curve(t: Float, p1: Float, p2: Float): Float {
        val inv = 1f - t
        return 3f * inv * inv * t * p1 + 3f * inv * t * t * p2 + t * t * t
    }

    private fun slope(t: Float, p1: Float, p2: Float): Float {
        val inv = 1f - t
        return 3f * inv * inv * p1 + 6f * inv * t * (p2 - p1) + 3f * t * t * (1f - p2)
    }

    companion object {
        private const val EPSILON = 1e-5f
        val EASE_IN_OUT = CubicBezier(0.42f, 0f, 0.58f, 1f)
        val SPRING = CubicBezier(0.2f, 1.5f, 0.4f, 1f)
    }
}

class LoopClock {
    private var accumulatedMs = 0L
    private var startedAtMs = -1L

    val running: Boolean get() = startedAtMs >= 0

    fun start(nowMs: Long) {
        if (running) return
        startedAtMs = nowMs
    }

    fun stop(nowMs: Long) {
        if (!running) return
        accumulatedMs += nowMs - startedAtMs
        startedAtMs = -1
    }

    fun elapsed(nowMs: Long): Long = if (running) accumulatedMs + (nowMs - startedAtMs) else accumulatedMs

    fun finishEntrance(entranceMs: Long) {
        if (accumulatedMs < entranceMs) accumulatedMs = entranceMs
    }

    companion object {
        fun swing(elapsedMs: Long, periodMs: Long): Float {
            val phase = (elapsedMs % periodMs).toFloat() / periodMs
            return if (phase < 0.5f) {
                CubicBezier.EASE_IN_OUT.valueAt(phase * 2f)
            } else {
                1f - CubicBezier.EASE_IN_OUT.valueAt((phase - 0.5f) * 2f)
            }
        }

        fun entrance(elapsedMs: Long, delayMs: Long, durationMs: Long): Float {
            val progress = ((elapsedMs - delayMs).toFloat() / durationMs).coerceIn(0f, 1f)
            return CubicBezier.SPRING.valueAt(progress)
        }

        fun lerp(from: Float, to: Float, amount: Float): Float = from + (to - from) * amount
    }
}
