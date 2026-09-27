package com.qwill.app.chat

import android.content.Context
import android.widget.OverScroller
import kotlin.math.abs
import kotlin.math.ceil

object FlingPrediction {
    fun rows(context: Context, velocityY: Int, averageRowHeight: Float): Int {
        if (velocityY == 0 || averageRowHeight <= 0f) return 0
        val scroller = OverScroller(context)
        scroller.fling(0, 0, 0, velocityY, 0, 0, Int.MIN_VALUE, Int.MAX_VALUE)
        val distance = abs(scroller.finalY)
        scroller.abortAnimation()
        return ceil(distance / averageRowHeight).toInt()
    }
}
