package com.qwill.app.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Checkable
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class QwillSwitch(context: Context) : View(context), Checkable {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val track = RectF()
    private var progress = 0f
    private var animator: ValueAnimator? = null
    private var checkedState = false

    var onCheckedChange: ((Boolean) -> Unit)? = null

    init {
        isClickable = true
        isFocusable = true
        setOnClickListener { toggle() }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(context.dpInt(TRACK_W), context.dpInt(Dimens.TAP_MIN))
    }

    override fun isChecked(): Boolean = checkedState

    override fun setChecked(checked: Boolean) {
        setChecked(checked, animated = true)
    }

    fun setChecked(checked: Boolean, animated: Boolean) {
        if (checked == checkedState) return
        checkedState = checked
        animator?.cancel()
        val target = if (checked) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isAttachedToWindow) {
            progress = target
            invalidate()
        } else {
            animator = ValueAnimator.ofFloat(progress, target).apply {
                duration = Motion.duration(Motion.MENU)
                interpolator = Motion.easeScreen
                addUpdateListener {
                    progress = it.animatedValue as Float
                    invalidate()
                }
                start()
            }
        }
        sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_CLICKED)
        onCheckedChange?.invoke(checked)
    }

    override fun toggle() {
        setChecked(!checkedState)
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val trackH = context.dp(TRACK_H)
        val top = (height - trackH) / 2f
        track.set(0f, top, width.toFloat(), top + trackH)
        paint.color = blend(palette.border, palette.primary, progress)
        canvas.drawRoundRect(track, trackH / 2f, trackH / 2f, paint)
        val radius = context.dp(THUMB) / 2f
        val cx = context.dp(THUMB_INSET) + radius + context.dp(THUMB_TRAVEL) * progress
        val cy = height / 2f
        paint.color = withAlpha(palette.scrimTint, if (palette.isDark) 0.34f else 0.06f)
        canvas.drawCircle(cx, cy + context.dp(1f), radius + context.dp(0.5f), paint)
        paint.color = palette.surface
        canvas.drawCircle(cx, cy, radius, paint)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = SWITCH_CLASS
        info.isCheckable = true
        info.isChecked = checkedState
    }

    override fun onInitializeAccessibilityEvent(event: AccessibilityEvent) {
        super.onInitializeAccessibilityEvent(event)
        event.className = SWITCH_CLASS
        event.isChecked = checkedState
    }

    companion object {
        const val SWITCH_CLASS = "android.widget.Switch"
        private const val TRACK_W = 50f
        private const val TRACK_H = 30f
        private const val THUMB = 24f
        private const val THUMB_INSET = 3f
        private const val THUMB_TRAVEL = 20f

        fun blend(from: Int, to: Int, amount: Float): Int {
            val t = amount.coerceIn(0f, 1f)
            fun channel(shift: Int): Int {
                val a = from shr shift and 0xFF
                val b = to shr shift and 0xFF
                return (a + (b - a) * t).toInt().coerceIn(0, 255) shl shift
            }
            return channel(24) or channel(16) or channel(8) or channel(0)
        }
    }
}
