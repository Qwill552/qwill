package com.qwill.app.chat

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.text.TextPaint
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.consent.CssGradient
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max

class JumpDownButton(context: Context, private val onJump: () -> Unit) : View(context) {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val badgeFill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val badgePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.BOLD)
        textAlign = Paint.Align.CENTER
        fontFeatureSettings = "'tnum' 1"
    }
    private val rect = RectF()
    private var badgeText = ""
    private var badgeShaderWidth = -1f
    private var shadow: Bitmap? = null
    private var progress = 0f
    private var visibleTarget = false
    private var animator: ValueAnimator? = null
    private var pressed = false

    val pad: Float get() = px(PAD)

    val shown: Boolean get() = visibleTarget

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = "К последним сообщениям"
        alpha = 0f
    }

    fun setCount(count: Int) {
        val text = when {
            count <= 0 -> ""
            count > MAX_BADGE -> "$MAX_BADGE+"
            else -> count.toString()
        }
        if (text == badgeText) return
        badgeText = text
        contentDescription = if (count > 0) "К последним сообщениям, непрочитанных: $count" else "К последним сообщениям"
        invalidate()
    }

    fun setShown(show: Boolean, animated: Boolean = true) {
        if (show == visibleTarget && (animator != null || progress == if (show) 1f else 0f)) return
        visibleTarget = show
        animator?.cancel()
        animator = null
        val target = if (show) 1f else 0f
        val duration = Motion.duration(Motion.MENU)
        if (!animated || duration <= 0L || !isAttachedToWindow) {
            apply(target)
            return
        }
        animator = ValueAnimator.ofFloat(progress, target).apply {
            this.duration = duration
            interpolator = Motion.easeScreen
            addUpdateListener { apply(it.animatedValue as Float) }
            start()
        }
    }

    private fun apply(value: Float) {
        progress = value
        alpha = value
        val scale = HIDDEN_SCALE + (1f - HIDDEN_SCALE) * value
        scaleX = scale
        scaleY = scale
        translationY = px(HIDDEN_SHIFT) * (1f - value)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        pivotX = w / 2f
        pivotY = h / 2f
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val side = ceil(px(Dimens.TAP_MIN + PAD * 2)).toInt()
        setMeasuredDimension(side, side)
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val size = px(Dimens.TAP_MIN)
        val left = px(PAD)
        val top = px(PAD)
        val cx = left + size / 2f
        val cy = top + size / 2f
        val shadowBitmap = shadow ?: buildShadow().also { shadow = it }
        val extent = px(SHADOW_EXTENT)
        rect.set(cx - extent / 2f, cy + px(SHADOW_Y) - extent / 2f, cx + extent / 2f, cy + px(SHADOW_Y) + extent / 2f)
        shadowPaint.color = SHADOW_COLOR
        canvas.drawBitmap(shadowBitmap, null, rect, shadowPaint)
        fillPaint.shader = null
        fillPaint.color = withAlpha(palette.pulseDock, if (pressed) PRESSED_ALPHA else FILL_ALPHA)
        canvas.drawCircle(cx, cy, size / 2f, fillPaint)
        strokePaint.strokeWidth = px(BORDER)
        strokePaint.color = withAlpha(palette.pulseGlass, BORDER_ALPHA)
        canvas.drawCircle(cx, cy, size / 2f - px(BORDER) / 2f, strokePaint)
        val icon = px(ICON)
        QwillIcon.CHEVRON_DOWN.draw(canvas, cx - icon / 2f, cy - icon / 2f, icon, palette.pulseInk, iconPaint)
        if (badgeText.isNotEmpty()) drawBadge(canvas, left + size + px(BADGE_OUT), top - px(BADGE_OUT), palette.pulseDock)
    }

    private fun drawBadge(canvas: Canvas, right: Float, top: Float, ringColor: Int) {
        badgePaint.textSize = px(BADGE_TEXT)
        val height = px(BADGE_H)
        val ring = px(BADGE_RING)
        val width = max(px(BADGE_MIN_W), badgePaint.measureText(badgeText) + px(BADGE_PAD) * 2 + ring * 2)
        rect.set(right - width, top, right, top + height)
        fillPaint.shader = null
        fillPaint.color = ringColor
        canvas.drawRoundRect(rect, height / 2f, height / 2f, fillPaint)
        rect.inset(ring, ring)
        if (badgeShaderWidth != rect.width()) {
            val line = CssGradient.linear(BADGE_ANGLE, rect.width(), rect.height())
            badgeFill.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, FixedColors.badgeFrom, FixedColors.badgeTo, Shader.TileMode.CLAMP)
            badgeShaderWidth = rect.width()
        }
        val save = canvas.save()
        canvas.translate(rect.left, rect.top)
        val inner = rect.height() / 2f
        rect.offsetTo(0f, 0f)
        canvas.drawRoundRect(rect, inner, inner, badgeFill)
        canvas.restoreToCount(save)
        badgePaint.color = FixedColors.lift
        val metrics = badgePaint.fontMetrics
        canvas.drawText(badgeText, right - width / 2f, top + height / 2f - (metrics.ascent + metrics.descent) / 2f, badgePaint)
    }

    private fun buildShadow(): Bitmap {
        val scale = resources.displayMetrics.density * SHADOW_SCALE
        val side = ceil(SHADOW_EXTENT * scale).toInt()
        val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ALPHA_8)
        val sigma = SHADOW_BLUR / 2f * scale
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF000000.toInt()
            maskFilter = BlurMaskFilter(max(0.5f, (sigma - 0.5f) / 0.57735f), BlurMaskFilter.Blur.NORMAL)
        }
        Canvas(bitmap).drawCircle(side / 2f, side / 2f, Dimens.TAP_MIN / 2f * scale, paint)
        return bitmap
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (!visibleTarget) return false
        val cx = width / 2f
        val cy = height / 2f
        val inside = hypot(event.x - cx, event.y - cy) <= px(Dimens.TAP_MIN) / 2f
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                if (!inside) return false
                pressed = true
                invalidate()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (pressed && !inside) {
                    pressed = false
                    invalidate()
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                val fire = pressed && inside
                pressed = false
                invalidate()
                if (fire) performClick()
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                pressed = false
                invalidate()
                return true
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        if (visibleTarget) {
            playSoundEffect(android.view.SoundEffectConstants.CLICK)
            onJump()
        }
        return true
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
        info.isVisibleToUser = visibleTarget
    }

    private fun px(dp: Float): Float = dp * resources.displayMetrics.density

    private companion object {
        const val PAD = 20f
        const val ICON = 22f
        const val BORDER = 1f
        const val FILL_ALPHA = 0.92f
        const val PRESSED_ALPHA = 1f
        const val BORDER_ALPHA = 0.10f
        const val HIDDEN_SCALE = 0.8f
        const val HIDDEN_SHIFT = 8f
        const val SHADOW_Y = 4f
        const val SHADOW_BLUR = 16f
        const val SHADOW_EXTENT = 84f
        const val SHADOW_SCALE = 0.5f
        val SHADOW_COLOR = withAlpha(0, 0.2f)
        const val BADGE_TEXT = 10f
        const val BADGE_H = 16f
        const val BADGE_MIN_W = 16f
        const val BADGE_PAD = 4f
        const val BADGE_RING = 2f
        const val BADGE_OUT = 5f
        const val BADGE_ANGLE = 140f
        const val MAX_BADGE = 99
    }
}

class FeedScrollThumb(context: Context, private val host: Host) : View(context) {
    interface Host {
        fun scrollFraction(): Float

        fun scrollByFraction(delta: Float)

        fun onThumbDrag(active: Boolean)
    }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private var visibility = 0f
    private var fadeAnimator: ValueAnimator? = null
    private var dragging = false
    private var startY = 0f
    private var startFraction = 0f
    var trackTop = 0f
    var trackBottom = 0f
    var edge = 0f
    private val hide = Runnable { fade(0f) }

    fun onScrolled() {
        if (!dragging) {
            fade(1f)
            removeCallbacks(hide)
            postDelayed(hide, HIDE_MS)
        }
        invalidate()
    }

    private fun thumbTop(): Float {
        val length = px(Dimens.SCROLLBAR_THUMB_H)
        val usable = max(0f, trackBottom - trackTop - length)
        return trackTop + host.scrollFraction().coerceIn(0f, 1f) * usable
    }

    override fun onDraw(canvas: Canvas) {
        if (visibility <= 0f) return
        val palette = Theme.palette
        val length = px(Dimens.SCROLLBAR_THUMB_H)
        val w = px(Dimens.SCROLLBAR_W)
        val right = width - edge
        val top = thumbTop()
        rect.set(right - w, top, right, top + length)
        paint.color = if (dragging) palette.scrollbarThumbActive else palette.scrollbarThumb
        paint.alpha = ((paint.color ushr 24) * visibility).toInt()
        canvas.drawRoundRect(rect, w / 2f, w / 2f, paint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                val length = px(Dimens.SCROLLBAR_THUMB_H)
                val top = thumbTop()
                val right = width - edge
                val left = right - px(Dimens.SCROLLBAR_W)
                val inside = event.x >= left - px(HIT_LEFT) && event.x <= right + px(HIT_RIGHT) &&
                    event.y >= top - px(HIT_Y) && event.y <= top + length + px(HIT_Y)
                if (!inside || trackBottom <= trackTop) return false
                dragging = true
                startY = event.y
                startFraction = host.scrollFraction()
                removeCallbacks(hide)
                fade(1f)
                parent?.requestDisallowInterceptTouchEvent(true)
                host.onThumbDrag(true)
                invalidate()
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (!dragging) return false
                val usable = max(1f, trackBottom - trackTop - px(Dimens.SCROLLBAR_THUMB_H))
                val wanted = (startFraction + (event.y - startY) / usable).coerceIn(0f, 1f)
                host.scrollByFraction(wanted - host.scrollFraction())
                invalidate()
                return true
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (!dragging) return false
                dragging = false
                host.onThumbDrag(false)
                postDelayed(hide, HIDE_MS)
                invalidate()
                return true
            }
        }
        return dragging
    }

    private fun fade(target: Float) {
        if (visibility == target && fadeAnimator == null) return
        fadeAnimator?.cancel()
        val duration = Motion.duration(Motion.SCROLLBAR)
        if (duration <= 0L) {
            visibility = target
            fadeAnimator = null
            invalidate()
            return
        }
        fadeAnimator = ValueAnimator.ofFloat(visibility, target).apply {
            this.duration = duration
            addUpdateListener {
                visibility = it.animatedValue as Float
                invalidate()
            }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (fadeAnimator === animation) fadeAnimator = null
                }
            })
            start()
        }
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        removeCallbacks(hide)
        fadeAnimator?.cancel()
        fadeAnimator = null
        visibility = 0f
        dragging = false
    }

    private fun px(dp: Float): Float = dp * resources.displayMetrics.density

    private companion object {
        const val HIDE_MS = 900L
        const val HIT_LEFT = 34f
        const val HIT_RIGHT = 10f
        const val HIT_Y = 12f
    }
}
