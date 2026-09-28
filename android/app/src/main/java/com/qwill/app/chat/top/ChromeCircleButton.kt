package com.qwill.app.chat.top

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class ChromeCircleButton(context: Context, private val icon: QwillIcon, label: String, private val danger: Boolean = false) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val clip = android.graphics.Path()

    var blur: SharedBlur? = null

    init {
        isClickable = true
        isFocusable = true
        contentDescription = label
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val side = context.dpInt(TAP)
        setMeasuredDimension(side, side)
    }

    override fun setPressed(pressed: Boolean) {
        val changed = pressed != isPressed
        super.setPressed(pressed)
        if (!changed) return
        val target = if (pressed) PRESSED_SCALE else 1f
        animate().scaleX(target).scaleY(target).setDuration(Motion.duration(PRESS_MS)).setInterpolator(Motion.easeScreen).start()
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val cx = width / 2f
        val cy = height / 2f
        val radius = context.dp(CIRCLE) / 2f
        blur?.let {
            clip.reset()
            clip.addCircle(cx, cy, radius, android.graphics.Path.Direction.CW)
            val save = canvas.save()
            canvas.clipPath(clip)
            it.draw(canvas, this)
            canvas.restoreToCount(save)
        }
        paint.style = Paint.Style.FILL
        paint.shader = null
        paint.color = withAlpha(palette.pulseGlass, FILL)
        canvas.drawCircle(cx, cy, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = context.dp(BORDER)
        paint.color = withAlpha(palette.pulseGlass, BORDER_ALPHA)
        canvas.drawCircle(cx, cy, radius - context.dp(BORDER) / 2f, paint)
        if (isFocused) {
            paint.strokeWidth = context.dp(FOCUS)
            paint.color = palette.primary
            canvas.drawCircle(cx, cy, radius + context.dp(FOCUS), paint)
        }
        val size = context.dp(ICON)
        icon.draw(canvas, cx - size / 2f, cy - size / 2f, size, if (danger) palette.danger else palette.pulseInk, paint)
    }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: android.graphics.Rect?) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
        invalidate()
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }

    companion object {
        const val TAP = 44f
        const val CIRCLE = 40f
        const val ICON = 22f
        private const val BORDER = 1f
        private const val FOCUS = 2f
        private const val FILL = 0.08f
        private const val BORDER_ALPHA = 0.10f
        private const val PRESSED_SCALE = 0.9f
        private const val PRESS_MS = 200L
    }
}
