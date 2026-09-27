package com.qwill.app.chat

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.text.TextPaint
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil

class DayPill(private val context: Context) {
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.SEMIBOLD)
        textSize = px(TEXT)
        textAlign = Paint.Align.CENTER
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val rim = Path()
    private val shape = Path()
    private val shifted = Path()
    private var rimWidth = -1f
    var label: String = ""
        private set
    var width = 0f
        private set

    val height: Float get() = px(PAD_Y * 2) + px(TEXT) * TextScale.LINE_HEIGHT

    fun setLabel(value: String) {
        if (value == label && width > 0f) return
        label = value
        width = textPaint.measureText(value) + px(PAD_X * 2)
    }

    fun draw(canvas: Canvas, centerX: Float, top: Float, alpha: Float) {
        if (alpha <= 0f || label.isEmpty()) return
        val palette = Theme.palette
        val left = centerX - width / 2f
        rect.set(left, top, left + width, top + height)
        val radius = px(RADIUS)
        fillPaint.color = withAlpha(palette.pulseDock, FILL_ALPHA * alpha)
        canvas.drawRoundRect(rect, radius, radius, fillPaint)
        if (rimWidth != width) {
            rimWidth = width
            rect.offsetTo(0f, 0f)
            shape.reset()
            shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
            shifted.reset()
            shape.offset(0f, px(RIM), shifted)
            rim.reset()
            rim.op(shape, shifted, Path.Op.DIFFERENCE)
            rect.offsetTo(left, top)
        }
        fillPaint.color = withAlpha(palette.pulseGlass, RIM_ALPHA * alpha)
        val save = canvas.save()
        canvas.translate(left, top)
        canvas.drawPath(rim, fillPaint)
        canvas.restoreToCount(save)
        textPaint.color = withAlpha(palette.pulseInk, INK_ALPHA * alpha)
        val baseline = top + height / 2f - (textPaint.ascent() + textPaint.descent()) / 2f
        canvas.drawText(label, centerX, baseline, textPaint)
    }

    private fun px(dp: Float): Float = dp * context.resources.displayMetrics.density

    companion object {
        const val TEXT = 12f
        const val PAD_X = 13f
        const val PAD_Y = 5f
        const val RADIUS = 15f
        const val RIM = 1f
        const val FILL_ALPHA = 0.72f
        const val RIM_ALPHA = 0.14f
        const val INK_ALPHA = 0.72f
        const val TOP = 12f
        const val BOTTOM = 4f
    }
}

class DayDividerView(context: Context) : View(context) {
    private val pill = DayPill(context)
    var dayStartMs = 0L
        private set
    var covered = false
        set(value) {
            if (field == value) return
            field = value
            invalidate()
        }

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun bind(dayStart: Long, isCovered: Boolean) {
        dayStartMs = dayStart
        pill.setLabel(DayLabel.format(dayStart))
        contentDescription = pill.label
        covered = isCovered
        invalidate()
    }

    fun refreshLabel() {
        pill.setLabel(DayLabel.format(dayStartMs))
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val height = ceil(px(DayPill.TOP + DayPill.BOTTOM) + pill.height).toInt()
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), height)
    }

    override fun onDraw(canvas: Canvas) {
        if (covered) return
        pill.draw(canvas, width / 2f, px(DayPill.TOP), 1f)
    }

    private fun px(dp: Float): Float = dp * resources.displayMetrics.density
}

class UnreadDividerView(context: Context) : View(context) {
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.SEMIBOLD)
        textAlign = Paint.Align.CENTER
    }
    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var label = ""
    var sideLeft = 0
    var sideRight = 0

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun bind(count: Int, left: Int, right: Int) {
        label = if (count > 0) "Непрочитанные · $count" else "Непрочитанные"
        contentDescription = label
        sideLeft = left
        sideRight = right
        requestLayout()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        textPaint.textSize = px(Theme.textSize(TextScale.CAPTION))
        val height = ceil(px(TOP + BOTTOM) + textPaint.textSize * TextScale.LINE_HEIGHT).toInt()
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), height)
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        textPaint.textSize = px(Theme.textSize(TextScale.CAPTION))
        textPaint.color = palette.primary
        val textWidth = textPaint.measureText(label)
        val top = px(TOP)
        val lineHeight = textPaint.textSize * TextScale.LINE_HEIGHT
        val center = top + lineHeight / 2f
        val baseline = center - (textPaint.ascent() + textPaint.descent()) / 2f
        val left = sideLeft + px(SIDE)
        val right = width - sideRight - px(SIDE)
        val middle = (left + right) / 2f
        canvas.drawText(label, middle, baseline, textPaint)
        linePaint.color = withAlpha(palette.primary, LINE_ALPHA)
        val gap = px(GAP)
        val stroke = px(LINE)
        val textLeft = middle - textWidth / 2f - gap
        val textRight = middle + textWidth / 2f + gap
        if (textLeft > left) canvas.drawRect(left, center - stroke / 2f, textLeft, center + stroke / 2f, linePaint)
        if (right > textRight) canvas.drawRect(textRight, center - stroke / 2f, right, center + stroke / 2f, linePaint)
    }

    private fun px(dp: Float): Float = dp * resources.displayMetrics.density

    private companion object {
        const val TOP = 12f
        const val BOTTOM = 4f
        const val SIDE = 12f
        const val GAP = 12f
        const val LINE = 1f
        const val LINE_ALPHA = 0.45f
    }
}

class FloatingDateView(context: Context, private val onTap: (Long) -> Unit) : View(context) {
    private val pill = DayPill(context)
    private var dayStartMs = -1L
    private var shown = 0f
    private var target = 0f
    private var fadeAnimator: ValueAnimator? = null
    private var tracking = false

    val present: Boolean get() = dayStartMs >= 0

    val dayStart: Long get() = dayStartMs

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun show(dayStart: Long, offset: Float) {
        if (dayStart != dayStartMs) {
            dayStartMs = dayStart
            pill.setLabel(DayLabel.format(dayStart))
            contentDescription = "К началу дня, ${pill.label}"
        }
        translationY = offset
        fadeTo(1f, animated = false)
        invalidate()
    }

    fun hide(animated: Boolean) {
        fadeTo(0f, animated)
    }

    fun clear() {
        dayStartMs = -1L
        fadeTo(0f, animated = false)
        translationY = 0f
        invalidate()
    }

    fun refreshLabel() {
        if (dayStartMs < 0) return
        pill.setLabel(DayLabel.format(dayStartMs))
        invalidate()
    }

    val pillHeight: Float get() = pill.height

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), ceil(pill.height + px(TAP_EXTRA_Y) * 2).toInt())
    }

    override fun onDraw(canvas: Canvas) {
        if (!present) return
        pill.draw(canvas, width / 2f, px(TAP_EXTRA_Y), shown)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val interactive = present && target > 0f
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val half = pill.width / 2f + px(TAP_EXTRA_X)
                tracking = interactive && event.x >= width / 2f - half && event.x <= width / 2f + half
                return tracking
            }
            MotionEvent.ACTION_UP -> {
                if (!tracking) return false
                tracking = false
                performClick()
                return true
            }
            MotionEvent.ACTION_CANCEL -> tracking = false
        }
        return tracking
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.isVisibleToUser = present && target > 0f
        if (present && target > 0f) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK)
    }

    override fun performClick(): Boolean {
        super.performClick()
        if (present && target > 0f) {
            playSoundEffect(android.view.SoundEffectConstants.CLICK)
            onTap(dayStartMs)
        }
        return true
    }

    private fun fadeTo(value: Float, animated: Boolean) {
        if (target == value && (fadeAnimator != null || shown == value)) return
        target = value
        fadeAnimator?.cancel()
        fadeAnimator = null
        val duration = Motion.duration(Motion.CLOSE)
        if (!animated || duration <= 0L) {
            shown = value
            invalidate()
            return
        }
        fadeAnimator = ValueAnimator.ofFloat(shown, value).apply {
            this.duration = duration
            interpolator = Motion.easeScreen
            addUpdateListener {
                shown = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun px(dp: Float): Float = dp * resources.displayMetrics.density

    private companion object {
        const val TAP_EXTRA_Y = 10f
        const val TAP_EXTRA_X = 8f
    }
}

fun dayDividerHeight(context: Context): Float {
    val density = context.resources.displayMetrics.density
    return (DayPill.TOP + DayPill.BOTTOM + DayPill.PAD_Y * 2 + DayPill.TEXT * TextScale.LINE_HEIGHT) * density
}
