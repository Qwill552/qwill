package com.qwill.app.chat.top

import android.graphics.Canvas
import android.graphics.Paint

object TypingDots {
    const val WIDTH = 18f
    const val GAP = 4f
    const val CYCLE_MS = 800L
    const val GROW_MS = 320L
    const val REST_RADIUS = 1.33f
    const val PEAK_RADIUS = 2.33f
    private val CENTERS = floatArrayOf(3f, 9f, 15f)
    private val OFFSETS = longArrayOf(0L, 150L, 300L)

    fun radius(index: Int, timeMs: Long): Float {
        val local = ((timeMs - OFFSETS[index]) % CYCLE_MS + CYCLE_MS) % CYCLE_MS
        val grow = PEAK_RADIUS - REST_RADIUS
        return when {
            local <= GROW_MS -> REST_RADIUS + grow * decelerate(local.toFloat() / GROW_MS)
            local <= GROW_MS * 2 -> REST_RADIUS + grow * (1f - decelerate((local - GROW_MS).toFloat() / GROW_MS))
            else -> REST_RADIUS
        }
    }

    fun draw(canvas: Canvas, left: Float, centerY: Float, density: Float, timeMs: Long?, paint: Paint) {
        paint.style = Paint.Style.FILL
        paint.shader = null
        for (index in CENTERS.indices) {
            val r = if (timeMs == null) REST_RADIUS else radius(index, timeMs)
            canvas.drawCircle(left + CENTERS[index] * density, centerY, r * density, paint)
        }
    }

    private fun decelerate(x: Float): Float {
        val t = x.coerceIn(0f, 1f)
        return 1f - (1f - t) * (1f - t)
    }
}
