package com.qwill.app.ui

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.View
import android.view.accessibility.AccessibilityEvent
import com.qwill.app.realtime.ConnectionState
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp

enum class TitleKind(val text: String, val animatedDots: Boolean) {
    BRAND("Qwill", false),
    WAITING("Ожидание сети", true),
    CONNECTING("Соединение", true),
    UPDATING("Обновление", true),
    IP_BANNED("Доступ с этого адреса закрыт", false),
}

object ConnectionTitleRule {
    const val SHOW_DELAY_MS = 300L

    fun kindOf(state: ConnectionState, ipBanned: Boolean): TitleKind = when {
        ipBanned -> TitleKind.IP_BANNED
        state == ConnectionState.WaitingForNetwork -> TitleKind.WAITING
        state == ConnectionState.Connecting -> TitleKind.CONNECTING
        state == ConnectionState.Updating -> TitleKind.UPDATING
        else -> TitleKind.BRAND
    }

    fun delayFor(kind: TitleKind): Long = when (kind) {
        TitleKind.CONNECTING, TitleKind.UPDATING -> SHOW_DELAY_MS
        else -> 0L
    }
}

class ConnectionTitle(context: Context) : View(context) {
    private val brandPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.BOLD)
        textSize = sp(BRAND_SIZE)
        letterSpacing = BRAND_TRACKING_PX / BRAND_SIZE
    }
    private val statusPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.SEMIBOLD)
        textSize = sp(STATUS_SIZE)
    }
    private var shown = TitleKind.BRAND
    private var leaving: TitleKind? = null
    private var target = TitleKind.BRAND
    private var progress = 1f
    private var animator: ValueAnimator? = null
    private val applyTarget = Runnable { startTransition(target) }

    val kind: TitleKind get() = shown

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
        contentDescription = shown.text
    }

    fun setState(state: ConnectionState, ipBanned: Boolean) {
        val next = ConnectionTitleRule.kindOf(state, ipBanned)
        if (next == target) return
        target = next
        removeCallbacks(applyTarget)
        if (next == shown && animator == null) return
        val delay = ConnectionTitleRule.delayFor(next)
        if (delay > 0L && isAttachedToWindow) postDelayed(applyTarget, delay) else startTransition(next)
    }

    fun onThemeChanged() {
        invalidate()
    }

    private fun startTransition(next: TitleKind) {
        if (animator != null) return
        if (next == shown) return
        leaving = shown
        shown = next
        contentDescription = next.text
        sendAccessibilityEvent(AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED)
        if (!Motion.animationsEnabled || !isAttachedToWindow) {
            finishTransition()
            return
        }
        progress = 0f
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = Motion.duration(SWAP_MS)
            interpolator = Motion.easeScreen
            addUpdateListener {
                progress = it.animatedValue as Float
                invalidate()
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (animator !== animation) return
                    animator = null
                    finishTransition()
                    if (target != shown) {
                        val delay = ConnectionTitleRule.delayFor(target)
                        if (delay > 0L) postDelayed(applyTarget, delay) else startTransition(target)
                    }
                }
            })
            start()
        }
    }

    private fun finishTransition() {
        leaving = null
        progress = 1f
        invalidate()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        removeCallbacks(applyTarget)
        animator?.cancel()
        animator = null
        leaving = null
        progress = 1f
        shown = target
        contentDescription = shown.text
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val height = resolveSize(context.dp(DEFAULT_HEIGHT).toInt(), heightMeasureSpec)
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), height)
    }

    override fun onDraw(canvas: Canvas) {
        val shift = context.dp(SHIFT_DP)
        val gone = leaving
        if (gone != null) drawKind(canvas, gone, shift * progress, 1f - progress)
        drawKind(canvas, shown, -shift * (1f - progress), if (gone != null) progress else 1f)
        if (shown.animatedDots && Motion.animationsEnabled && isShown) postInvalidateDelayed(DOTS_FRAME_MS)
    }

    private fun drawKind(canvas: Canvas, kind: TitleKind, dy: Float, alpha: Float) {
        if (alpha <= 0f) return
        val paint = if (kind == TitleKind.BRAND) brandPaint else statusPaint
        paint.color = Theme.palette.pulseInk
        val baseAlpha = (255 * alpha.coerceIn(0f, 1f)).toInt()
        paint.alpha = baseAlpha
        val metrics = paint.fontMetrics
        val baseline = height / 2f - (metrics.ascent + metrics.descent) / 2f + dy
        val dotWidth = if (kind.animatedDots) paint.measureText(DOT) * DOT_COUNT else 0f
        val room = (width - dotWidth).coerceAtLeast(0f)
        val text = TextUtils.ellipsize(kind.text, paint, room, TextUtils.TruncateAt.END)
        canvas.drawText(text, 0, text.length, 0f, baseline, paint)
        if (!kind.animatedDots || text.length != kind.text.length) return
        var x = paint.measureText(kind.text)
        val dot = paint.measureText(DOT)
        val phase = if (Motion.animationsEnabled) SystemClock.uptimeMillis() % DOTS_CYCLE_MS else DOTS_CYCLE_MS / 2
        for (index in 0 until DOT_COUNT) {
            paint.alpha = (baseAlpha * dotAlpha(index, phase)).toInt()
            canvas.drawText(DOT, x, baseline, paint)
            x += dot
        }
        paint.alpha = baseAlpha
    }

    private fun dotAlpha(index: Int, phase: Long): Float {
        val appear = index * DOT_STEP_MS
        return when {
            phase < appear -> 0f
            phase < appear + DOT_STEP_MS -> (phase - appear).toFloat() / DOT_STEP_MS
            phase < DOTS_HIDE_AT_MS -> 1f
            else -> 1f - (phase - DOTS_HIDE_AT_MS).toFloat() / (DOTS_CYCLE_MS - DOTS_HIDE_AT_MS)
        }
    }

    private fun sp(value: Float): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics)

    private companion object {
        const val BRAND_SIZE = 21f
        const val BRAND_TRACKING_PX = -0.3f
        const val STATUS_SIZE = 17f
        const val DEFAULT_HEIGHT = 44f
        const val SHIFT_DP = 20f
        const val SWAP_MS = 220L
        const val DOT = "."
        const val DOT_COUNT = 3
        const val DOT_STEP_MS = 300L
        const val DOTS_HIDE_AT_MS = 1200L
        const val DOTS_CYCLE_MS = 1500L
        const val DOTS_FRAME_MS = 32L
    }
}
