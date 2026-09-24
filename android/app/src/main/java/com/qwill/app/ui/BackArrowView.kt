package com.qwill.app.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import com.qwill.app.ui.theme.dp

class BackArrowView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = context.dp(ICON_STROKE)
    }
    private val path = Path()

    var color: Int
        get() = paint.color
        set(value) {
            paint.color = value
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        val unit = context.dp(1f)
        val left = (width - ICON_GRID * unit) / 2f
        val top = (height - ICON_GRID * unit) / 2f
        path.reset()
        path.moveTo(left + 15f * unit, top + 5f * unit)
        path.lineTo(left + 8f * unit, top + 12f * unit)
        path.lineTo(left + 15f * unit, top + 19f * unit)
        canvas.drawPath(path, paint)
    }

    private companion object {
        const val ICON_GRID = 24f
        const val ICON_STROKE = 2f
    }
}
