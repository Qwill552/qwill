package com.qwill.app.ui.wheel

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.os.Vibrator
import android.text.TextPaint
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.roundToInt

class WheelPicker(context: Context, private val label: String) : View(context) {
    private enum class Kind { FLING, SETTLE, STEP }

    private class Run(val kind: Kind, val startedAt: Long, val durationMs: Float, val distance: Float, val curve: (Float) -> Float) {
        var travelled = 0f
    }

    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.MEDIUM)
        textAlign = Paint.Align.CENTER
    }
    private val linePaint = Paint()
    private val configuration = ViewConfiguration.get(context)
    private val touchSlop = configuration.scaledTouchSlop
    private val minFling = configuration.scaledMinimumFlingVelocity
    private val maxFling = configuration.scaledMaximumFlingVelocity / FLING_CAP_DIVISOR
    private val longPressMs = ViewConfiguration.getLongPressTimeout().toLong()
    private val canTick: Boolean by lazy { Build.VERSION.SDK_INT >= 26 && vibrator()?.hasAmplitudeControl() == true }

    var format: (Int) -> String = { it.toString() }
    var onChange: ((Int) -> Unit)? = null
    var textOffsetDp = 0f

    var value = 0
        private set
    private var min = 0
    private var max = 0
    private var count = VISIBLE_PORTRAIT
    private var textSize = 0f
    private var gap = 0f
    private var element = 0f
    private var initialOffset = 0f
    private var offset = 0f
    private var run: Run? = null
    private var tracker: VelocityTracker? = null
    private var dragging = false
    private var downY = 0f
    private var lastY = 0f
    private var downAt = 0L
    private var repeating = false
    private var repeatUp = false

    private val frame = object : Runnable {
        override fun run() {
            advance()
        }
    }
    private val repeat = object : Runnable {
        override fun run() {
            repeating = true
            stepByOne(repeatUp)
            postDelayed(this, Motion.WHEEL_STEP)
        }
    }

    init {
        isFocusable = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    val moving: Boolean get() = dragging || run != null

    fun setRange(low: Int, high: Int) {
        if (low == min && high == max) return
        min = low
        max = high
        invalidate()
    }

    fun setValue(next: Int) {
        if (moving) return
        if (next != value) {
            value = next
            offset = initialOffset
            contentDescription = describe()
        }
        invalidate()
    }

    fun refresh() {
        requestLayout()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val metrics = resources.displayMetrics
        count = if (metrics.widthPixels > metrics.heightPixels) VISIBLE_LANDSCAPE else VISIBLE_PORTRAIT
        val height = (context.dp(ITEM) * count).roundToInt()
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), height)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        measureGeometry()
    }

    private fun measureGeometry() {
        textSize = context.dp(Theme.textSize(TEXT_SCALE))
        textPaint.textSize = textSize
        val h = height.toFloat()
        gap = ((h + textSize - count * textSize) / count).roundToInt().toFloat()
        element = textSize + gap
        initialOffset = h / 2f - element * (count / 2)
        offset = initialOffset
    }

    override fun onDraw(canvas: Canvas) {
        if (textSize != context.dp(Theme.textSize(TEXT_SCALE))) measureGeometry()
        if (element <= 0f) return
        val palette = Theme.palette
        val h = height.toFloat()
        val center = h / 2f
        val middle = count / 2
        val x = width / 2f + context.dp(textOffsetDp)
        linePaint.color = palette.primary
        val line = context.dp(LINE)
        val top = (h - textSize - gap) / 2f
        val bottom = (h + textSize + gap) / 2f
        canvas.drawRect(0f, top, width.toFloat(), top + line, linePaint)
        canvas.drawRect(0f, bottom - line, width.toFloat(), bottom, linePaint)
        textPaint.color = palette.textPrimary
        val baseAlpha = textPaint.alpha
        for (slot in 0 until count) {
            val slotValue = value + slot - middle
            if (slotValue < min || slotValue > max) continue
            val y = offset + slot * element
            val save = canvas.save()
            var alpha = 1f
            var textCenter = y
            if (count > VISIBLE_LANDSCAPE) {
                val closeness = WheelScroller.edgeFalloff(if (y < center) y / center else (h - y) / center)
                textCenter = if (y < center) y + (1f - closeness) * textSize else y - (1f - closeness) * textSize
                canvas.scale(0.8f + closeness * 0.2f, closeness, x, textCenter)
                if (closeness < ALPHA_EDGE) alpha = closeness / ALPHA_EDGE
            }
            textPaint.alpha = (baseAlpha * alpha).toInt()
            canvas.drawText(format(slotValue), x, textCenter - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
            textPaint.alpha = baseAlpha
            canvas.restoreToCount(save)
        }
    }

    private fun scrollBy(delta: Float) {
        if (element <= 0f) return
        if (delta > 0f && value <= min && offset + delta > initialOffset) {
            offset = initialOffset
            invalidate()
            return
        }
        if (delta < 0f && value >= max && offset + delta < initialOffset) {
            offset = initialOffset
            invalidate()
            return
        }
        offset += delta
        var next = value
        while (offset - initialOffset > gap) {
            offset -= element
            next -= 1
            if (next <= min && offset > initialOffset) offset = initialOffset
        }
        while (offset - initialOffset < -gap) {
            offset += element
            next += 1
            if (next >= max && offset < initialOffset) offset = initialOffset
        }
        setValueInternal(next)
        invalidate()
    }

    private fun setValueInternal(next: Int) {
        val clamped = next.coerceIn(min, max)
        if (clamped == value) return
        value = clamped
        contentDescription = describe()
        if (Build.VERSION.SDK_INT >= 27 && canTick) performHapticFeedback(HapticFeedbackConstants.TEXT_HANDLE_MOVE, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING)
        onChange?.invoke(clamped)
    }

    private fun stopMotion() {
        removeCallbacks(frame)
        run = null
    }

    private fun startMotion(kind: Kind, distance: Float, durationMs: Float, curve: (Float) -> Float) {
        stopMotion()
        if (durationMs <= 1f || distance == 0f || !Motion.animationsEnabled) {
            scrollBy(distance)
            if (kind == Kind.FLING) settle()
            return
        }
        run = Run(kind, SystemClock.uptimeMillis(), durationMs, distance, curve)
        postOnAnimation(frame)
    }

    private fun advance() {
        val current = run ?: return
        val progress = ((SystemClock.uptimeMillis() - current.startedAt) / current.durationMs).coerceIn(0f, 1f)
        val travelled = current.curve(progress) * current.distance
        scrollBy(travelled - current.travelled)
        current.travelled = travelled
        if (run !== current) return
        if (progress < 1f) {
            postOnAnimation(frame)
            return
        }
        run = null
        if (current.kind == Kind.FLING) settle()
    }

    private fun settle() {
        var delta = initialOffset - offset
        if (delta == 0f) return
        if (abs(delta) > element / 2f) delta += if (delta > 0f) -element else element
        startMotion(Kind.SETTLE, delta, Motion.WHEEL_SETTLE.toFloat(), WheelScroller::decelerate)
    }

    private fun stepByOne(increment: Boolean) {
        if (element <= 0f) return
        stopMotion()
        var aligned = initialOffset - offset
        if (aligned != 0f) {
            if (abs(aligned) > element / 2f) aligned += if (aligned > 0f) -element else element
            scrollBy(aligned)
        }
        startMotion(Kind.STEP, if (increment) -element else element, Motion.WHEEL_STEP.toFloat(), WheelScroller::viscousFluid)
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                parent?.requestDisallowInterceptTouchEvent(true)
                val wasMoving = run != null
                stopMotion()
                dragging = false
                repeating = false
                downY = event.y
                lastY = event.y
                downAt = event.eventTime
                tracker?.recycle()
                tracker = VelocityTracker.obtain().also { it.addMovement(event) }
                val top = (height - textSize - gap) / 2f
                val bottom = (height + textSize + gap) / 2f
                if (!wasMoving && (event.y < top || event.y > bottom)) {
                    repeatUp = event.y > bottom
                    postDelayed(repeat, longPressMs)
                }
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                tracker?.addMovement(event)
                if (!dragging) {
                    if (abs(event.y - downY) <= touchSlop) return true
                    removeCallbacks(repeat)
                    if (repeating) {
                        repeating = false
                        stopMotion()
                    }
                    dragging = true
                    lastY = event.y
                    return true
                }
                scrollBy(event.y - lastY)
                lastY = event.y
                return true
            }
            MotionEvent.ACTION_UP -> {
                removeCallbacks(repeat)
                val velocityTracker = tracker
                velocityTracker?.addMovement(event)
                velocityTracker?.computeCurrentVelocity(1000, maxFling.toFloat())
                val velocity = velocityTracker?.yVelocity ?: 0f
                tracker?.recycle()
                tracker = null
                val wasDragging = dragging
                dragging = false
                if (repeating) {
                    repeating = false
                    return true
                }
                if (abs(velocity) > minFling && Motion.animationsEnabled) {
                    val fling = WheelScroller.flingOf(velocity)
                    startMotion(Kind.FLING, fling.distance, fling.durationMs, WheelScroller::flingProgress)
                    return true
                }
                val travelled = abs(event.y - downY)
                if (!wasDragging && travelled <= touchSlop && event.eventTime - downAt < TAP_WINDOW_MS) {
                    val slot = floor(event.y / element).toInt() - count / 2
                    if (slot > 0) stepByOne(true) else if (slot < 0) stepByOne(false)
                    if (slot != 0) playSoundEffect(android.view.SoundEffectConstants.CLICK)
                    return true
                }
                settle()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                removeCallbacks(repeat)
                tracker?.recycle()
                tracker = null
                dragging = false
                repeating = false
                settle()
                return true
            }
        }
        return true
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        removeCallbacks(repeat)
        stopMotion()
        tracker?.recycle()
        tracker = null
        dragging = false
        offset = initialOffset
    }

    private fun describe(): String = "$label: ${format(value)}"

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.SeekBar"
        info.contentDescription = describe()
        info.isScrollable = true
        info.rangeInfo = AccessibilityNodeInfo.RangeInfo.obtain(AccessibilityNodeInfo.RangeInfo.RANGE_TYPE_INT, min.toFloat(), max.toFloat(), value.toFloat())
        if (value < max) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_FORWARD)
        if (value > min) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_SCROLL_BACKWARD)
    }

    override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean {
        when (action) {
            AccessibilityNodeInfo.ACTION_SCROLL_FORWARD -> {
                if (value >= max || moving) return false
                stepByOne(true)
                sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_SELECTED)
                return true
            }
            AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD -> {
                if (value <= min || moving) return false
                stepByOne(false)
                sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_SELECTED)
                return true
            }
        }
        return super.performAccessibilityAction(action, arguments)
    }

    @Suppress("DEPRECATION")
    private fun vibrator(): Vibrator? = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator

    private companion object {
        const val ITEM = 42f
        const val TEXT_SCALE = 1.2f
        const val LINE = 2f
        const val ALPHA_EDGE = 0.1f
        const val VISIBLE_PORTRAIT = 5
        const val VISIBLE_LANDSCAPE = 3
        const val FLING_CAP_DIVISOR = 8
        const val TAP_WINDOW_MS = 300L
    }
}
