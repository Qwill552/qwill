package com.qwill.app.chat.search

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.text.TextPaint
import android.text.TextUtils
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.chat.bottom.DockCapsule
import com.qwill.app.ui.CharDiffText
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.ripple
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.max
import kotlin.math.roundToInt

class ChatSearchBar(context: Context) : ViewGroup(context) {
    val calendar = BarIconButton(context, QwillIcon.CALENDAR, "Перейти к дате")
    val from = BarIconButton(context, QwillIcon.USER, "Искать по участнику")
    val counter = CounterView(context)
    val toggle = ModeToggleView(context)
    private val capsule = DockCapsule(this, RADIUS)

    var blur: SharedBlur?
        get() = capsule.blur
        set(value) {
            capsule.blur = value
        }

    init {
        setWillNotDraw(false)
        clipChildren = false
        addView(calendar)
        addView(from)
        addView(counter)
        addView(toggle)
    }

    fun setButtons(calendarShown: Boolean, fromShown: Boolean) {
        val calendarVisibility = if (calendarShown) View.VISIBLE else View.GONE
        val fromVisibility = if (fromShown) View.VISIBLE else View.GONE
        if (calendar.visibility == calendarVisibility && from.visibility == fromVisibility) return
        calendar.visibility = calendarVisibility
        from.visibility = fromVisibility
        requestLayout()
    }

    fun refresh() {
        counter.refresh()
        toggle.refresh()
        calendar.refresh()
        from.refresh()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = context.dpInt(HEIGHT)
        val tap = MeasureSpec.makeMeasureSpec(context.dpInt(TAP), MeasureSpec.EXACTLY)
        var used = context.dp(PAD_X * 2)
        for (button in listOf(calendar, from)) {
            if (button.visibility == GONE) continue
            button.measure(tap, tap)
            used += button.measuredWidth + context.dp(GAP)
        }
        toggle.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED), tap)
        used += toggle.measuredWidth + context.dp(GAP)
        counter.measure(MeasureSpec.makeMeasureSpec(max(0, (width - used).roundToInt()), MeasureSpec.EXACTLY), tap)
        setMeasuredDimension(width, height)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val center = (b - t) / 2
        var x = context.dp(PAD_X)
        for (view in listOf(calendar, from, counter)) {
            if (view.visibility == GONE) continue
            val left = x.roundToInt()
            view.layout(left, center - view.measuredHeight / 2, left + view.measuredWidth, center + view.measuredHeight / 2)
            x += view.measuredWidth + context.dp(GAP)
        }
        val right = (r - l) - context.dpInt(PAD_X)
        toggle.layout(right - toggle.measuredWidth, center - toggle.measuredHeight / 2, right, center + toggle.measuredHeight / 2)
    }

    override fun onDraw(canvas: Canvas) {
        capsule.draw(canvas)
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean = true

    companion object {
        const val HEIGHT = 48f
        private const val RADIUS = 24f
        private const val PAD_X = 8f
        private const val GAP = 8f
        private const val TAP = 44f
    }
}

class BarIconButton(context: Context, private val icon: QwillIcon, label: String) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        isClickable = true
        isFocusable = true
        contentDescription = label
        refresh()
    }

    fun refresh() {
        background = ripple(0, context.dp(TAP / 2f), withAlpha(Theme.palette.pulseInk, PRESS_ALPHA))
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val size = context.dp(ICON)
        icon.draw(canvas, (width - size) / 2f, (height - size) / 2f, size, withAlpha(Theme.palette.pulseInk, SOFT_ALPHA), paint)
        if (isFocused) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = context.dp(FOCUS)
            paint.color = Theme.palette.primary
            canvas.drawCircle(width / 2f, height / 2f, width / 2f - context.dp(FOCUS), paint)
        }
    }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: android.graphics.Rect?) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
        invalidate()
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }

    private companion object {
        const val TAP = 44f
        const val ICON = 20f
        const val FOCUS = 2f
        const val SOFT_ALPHA = 0.45f
        const val PRESS_ALPHA = 0.08f
    }
}

class CounterView(context: Context) : View(context) {
    private val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.REGULAR)
        textSize = context.dp(TEXT_SIZE)
    }
    private val text = CharDiffText()
    private var full = ""
    private var animator: ValueAnimator? = null

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
    }

    fun set(value: String, up: Boolean, animated: Boolean) {
        full = value
        contentDescription = value
        val shown = fit(value)
        if (!text.set(shown, up)) return
        animator?.cancel()
        if (!animated || !Motion.animationsEnabled || !isShown) {
            text.progress = 1f
            invalidate()
            return
        }
        text.progress = 0f
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = Motion.duration(SWAP_MS)
            interpolator = Motion.easeOutQuint
            addUpdateListener {
                text.progress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    fun refresh() {
        invalidate()
    }

    private fun fit(value: String): String {
        if (width <= 0) return value
        return TextUtils.ellipsize(value, paint, width.toFloat(), TextUtils.TruncateAt.END).toString()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        text.set(fit(full), true)
        text.progress = 1f
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
        animator = null
        text.progress = 1f
    }

    override fun onDraw(canvas: Canvas) {
        paint.color = withAlpha(Theme.palette.pulseInk, SOFT_ALPHA)
        val baseline = height / 2f - (paint.ascent() + paint.descent()) / 2f
        val save = canvas.save()
        canvas.clipRect(0, 0, width, height)
        text.drawCentered(canvas, width / 2f, baseline, context.dp(SHIFT), paint)
        canvas.restoreToCount(save)
    }

    private companion object {
        const val TEXT_SIZE = 14f
        const val SOFT_ALPHA = 0.45f
        const val SWAP_MS = 280L
        const val SHIFT = 10f
    }
}

class ModeToggleView(context: Context) : View(context) {
    private val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.MEDIUM)
        textAlign = Paint.Align.CENTER
    }
    private var list = false
    private var swap = 1f
    private var enabledShown = 1f
    private var swapAnimator: ValueAnimator? = null
    private var enableAnimator: ValueAnimator? = null

    init {
        isClickable = true
        isFocusable = true
        contentDescription = LIST
        refresh()
    }

    fun setState(listMode: Boolean, enabled: Boolean, animated: Boolean) {
        val animate = animated && Motion.animationsEnabled && isShown
        if (listMode != list) {
            list = listMode
            contentDescription = if (listMode) CHAT else LIST
            swapAnimator?.cancel()
            if (animate) {
                swap = 0f
                swapAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
                    duration = Motion.duration(SWAP_MS)
                    interpolator = Motion.easeOutQuint
                    addUpdateListener {
                        swap = it.animatedValue as Float
                        invalidate()
                    }
                    start()
                }
            } else {
                swap = 1f
            }
        }
        if (isEnabled != enabled) {
            isEnabled = enabled
            val target = if (enabled) 1f else DISABLED_ALPHA
            enableAnimator?.cancel()
            if (animate) {
                enableAnimator = ValueAnimator.ofFloat(enabledShown, target).apply {
                    duration = Motion.duration(Motion.MENU)
                    interpolator = Motion.easeScreen
                    addUpdateListener {
                        enabledShown = it.animatedValue as Float
                        invalidate()
                    }
                    start()
                }
            } else {
                enabledShown = target
            }
        }
        invalidate()
    }

    fun refresh() {
        paint.textSize = context.dp(Theme.fontSize.base)
        background = ripple(0, context.dp(TAP / 2f), withAlpha(Theme.palette.primary, PRESS_ALPHA))
        requestLayout()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        paint.textSize = context.dp(Theme.fontSize.base)
        val text = max(paint.measureText(LIST), paint.measureText(CHAT)) + context.dp(PAD_X * 2)
        setMeasuredDimension(max(text, context.dp(TAP)).roundToInt(), MeasureSpec.getSize(heightMeasureSpec))
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val baseAlpha = (255 * enabledShown).toInt()
        val baseline = height / 2f - (paint.ascent() + paint.descent()) / 2f
        val cx = width / 2f
        val cy = height / 2f
        paint.color = palette.primary
        if (swap < 1f) {
            val gone = if (list) LIST else CHAT
            drawLabel(canvas, gone, cx, cy, baseline, 1f - swap, baseAlpha)
        }
        drawLabel(canvas, if (list) CHAT else LIST, cx, cy, baseline, swap, baseAlpha)
        if (isFocused) {
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = context.dp(FOCUS)
            canvas.drawRoundRect(context.dp(FOCUS), context.dp(FOCUS), width - context.dp(FOCUS), height - context.dp(FOCUS), height / 2f, height / 2f, paint)
            paint.style = Paint.Style.FILL
        }
    }

    private fun drawLabel(canvas: Canvas, label: String, cx: Float, cy: Float, baseline: Float, shown: Float, baseAlpha: Int) {
        if (shown <= 0f) return
        val scale = HIDDEN_SCALE + (1f - HIDDEN_SCALE) * shown
        val save = canvas.save()
        canvas.scale(scale, scale, cx, cy)
        paint.alpha = (baseAlpha * shown).toInt()
        canvas.drawText(label, cx, baseline, paint)
        canvas.restoreToCount(save)
    }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: android.graphics.Rect?) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
        invalidate()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        swapAnimator?.cancel()
        enableAnimator?.cancel()
        swap = 1f
        enabledShown = if (isEnabled) 1f else DISABLED_ALPHA
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }

    companion object {
        const val LIST = "Списком"
        const val CHAT = "В чате"
        private const val TAP = 44f
        private const val PAD_X = 12f
        private const val FOCUS = 2f
        private const val SWAP_MS = 420L
        private const val HIDDEN_SCALE = 0.7f
        private const val DISABLED_ALPHA = 0.5f
        private const val PRESS_ALPHA = 0.12f
    }
}
