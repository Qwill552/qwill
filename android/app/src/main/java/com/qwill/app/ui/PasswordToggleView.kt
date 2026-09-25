package com.qwill.app.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import com.qwill.app.ui.theme.dp

class PasswordToggleView(context: Context) : View(context) {
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

    var revealed: Boolean = false
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    override fun onDraw(canvas: Canvas) {
        val unit = context.dp(1f)
        val left = (width - ICON_GRID * unit) / 2f
        val top = (height - ICON_GRID * unit) / 2f
        path.reset()
        if (revealed) {
            path.moveTo(left + 6f * unit, top + 6f * unit)
            path.lineTo(left + 18f * unit, top + 18f * unit)
            path.moveTo(left + 18f * unit, top + 6f * unit)
            path.lineTo(left + 6f * unit, top + 18f * unit)
            canvas.drawPath(path, paint)
            return
        }
        path.moveTo(left + 2f * unit, top + 12f * unit)
        path.cubicTo(
            left + 6f * unit, top + 5.5f * unit,
            left + 18f * unit, top + 5.5f * unit,
            left + 22f * unit, top + 12f * unit,
        )
        path.cubicTo(
            left + 18f * unit, top + 18.5f * unit,
            left + 6f * unit, top + 18.5f * unit,
            left + 2f * unit, top + 12f * unit,
        )
        canvas.drawPath(path, paint)
        canvas.drawCircle(left + 12f * unit, top + 12f * unit, 2.6f * unit, paint)
    }

    private companion object {
        const val ICON_GRID = 24f
        const val ICON_STROKE = 1.6f
    }
}
