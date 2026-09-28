package com.qwill.app.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp

class DialogCloseButton(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        isClickable = true
        isFocusable = true
        contentDescription = "Закрыть"
    }

    override fun setPressed(pressed: Boolean) {
        super.setPressed(pressed)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        if (isPressed) {
            paint.style = Paint.Style.FILL
            paint.color = palette.primarySoft
            canvas.drawCircle(width / 2f, height / 2f, context.dp(VISUAL) / 2f, paint)
        }
        val size = context.dp(ICON)
        QwillIcon.CLOSE.draw(canvas, (width - size) / 2f, (height - size) / 2f, size, palette.textSecondary, paint)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }

    private companion object {
        const val VISUAL = 32f
        const val ICON = 18f
    }
}
