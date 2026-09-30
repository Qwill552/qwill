package com.qwill.app.chat.selection

import kotlin.math.abs

object SwipeReply {
    const val START_MM = 4f
    const val LIMIT = 80f
    const val THRESHOLD = 50f
    const val ICON_FROM = 20f
    const val ICON_SPAN = 30f
    const val RETURN_MS = 180L
    const val OWN_SHARE = 0.5f

    fun shouldStart(dx: Float, dy: Float, startPx: Float): Boolean = dx <= -startPx && abs(dx) / 3f > abs(dy)

    fun offset(dx: Float, limitPx: Float): Float = dx.coerceIn(-limitPx, 0f)

    fun progress(offset: Float, fromPx: Float, spanPx: Float): Float = ((-offset - fromPx) / spanPx).coerceIn(0f, 1f)

    fun crossed(offset: Float, thresholdPx: Float): Boolean = -offset >= thresholdPx

    fun iconCenterX(rowWidth: Float, offset: Float, own: Boolean): Float = rowWidth + offset * if (own) OWN_SHARE else 1f
}
