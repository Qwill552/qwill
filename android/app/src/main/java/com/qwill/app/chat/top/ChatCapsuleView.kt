package com.qwill.app.chat.top

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.os.SystemClock
import android.text.TextPaint
import android.text.TextUtils
import android.view.MotionEvent
import android.view.View
import com.qwill.app.QwillApplication
import com.qwill.app.consent.CssGradient
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.AvatarColor
import com.qwill.app.ui.AppForeground
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.ConnectionDots
import com.qwill.app.ui.OfficialMark
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.ServiceLogo
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Palette
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.max

data class CapsuleModel(
    val title: String,
    val avatarColor: AvatarColor?,
    val avatarKey: String,
    val avatarUrl: String?,
    val service: Boolean,
    val official: Boolean,
    val muted: Boolean,
)

class ChatCapsuleView(context: Context) : View(context) {
    private val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.BOLD)
        textSize = context.dp(TITLE_SIZE)
        letterSpacing = TITLE_TRACKING / TITLE_SIZE
    }
    private val subtitlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.REGULAR)
        textSize = context.dp(SUBTITLE_SIZE)
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val markPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val shape = Path()
    private val highlight = Path()
    private val rect = RectF()
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)
    private var shapeFor = -1
    private var gradientDark: Boolean? = null

    var blur: SharedBlur? = null

    private var model: CapsuleModel? = null
    private var current: Subtitle? = null
    private var leaving: Subtitle? = null
    private var fading: Subtitle? = null
    private var swap = 1f
    private var presence = 0f
    private var swapAnimator: ValueAnimator? = null
    private var presenceAnimator: ValueAnimator? = null

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
    }

    fun setModel(next: CapsuleModel) {
        if (next == model) return
        val previous = model
        model = next
        if (previous?.avatarUrl != next.avatarUrl || previous?.avatarKey != next.avatarKey || previous?.avatarColor != next.avatarColor || previous?.title != next.title) {
            avatar.set(next.title.ifEmpty { FALLBACK }, next.avatarColor, next.avatarKey, Fonts.message(FontWeight.BOLD))
            image.setImage(if (next.service) null else QwillApplication.files.avatarRequest(next.avatarUrl), null, context.dpInt(AVATAR), small = true)
        }
        updateDescription()
        invalidate()
    }

    fun setSubtitle(next: Subtitle?, animated: Boolean) {
        if (next == current) return
        val animate = animated && Motion.animationsEnabled && isAttachedToWindow && isShown
        val before = current
        current = next
        when {
            before == null && next != null -> {
                fading = null
                leaving = null
                swap = 1f
                runPresence(1f, animate)
            }
            before != null && next == null -> {
                fading = before
                leaving = null
                swap = 1f
                runPresence(0f, animate)
            }
            else -> {
                fading = null
                leaving = if (animate) before else null
                runSwap(animate)
                if (presence < 1f) runPresence(1f, animate)
            }
        }
        updateDescription()
        invalidate()
    }

    fun refresh() {
        gradientDark = null
        invalidate()
    }

    private fun runPresence(target: Float, animate: Boolean) {
        presenceAnimator?.cancel()
        if (!animate) {
            presence = target
            fading = null
            return
        }
        val animator = ValueAnimator.ofFloat(presence, target)
        animator.duration = Motion.duration(TITLE_MS)
        animator.interpolator = Motion.easeScreen
        animator.addUpdateListener {
            presence = it.animatedValue as Float
            invalidate()
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (presenceAnimator !== animation) return
                presenceAnimator = null
                if (target == 0f) fading = null
                invalidate()
            }
        })
        presenceAnimator = animator
        animator.start()
    }

    private fun runSwap(animate: Boolean) {
        swapAnimator?.cancel()
        if (!animate) {
            swap = 1f
            leaving = null
            return
        }
        swap = 0f
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(SWAP_MS)
        animator.interpolator = Motion.easeScreen
        animator.addUpdateListener {
            swap = it.animatedValue as Float
            invalidate()
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (swapAnimator !== animation) return
                swapAnimator = null
                leaving = null
                swap = 1f
                invalidate()
            }
        })
        swapAnimator = animator
        animator.start()
    }

    private fun updateDescription() {
        val title = model?.title ?: FALLBACK_TITLE
        val subtitle = current?.text
        contentDescription = if (subtitle.isNullOrEmpty()) title else "$title, $subtitle"
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), context.dpInt(HEIGHT))
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
        swapAnimator?.cancel()
        presenceAnimator?.cancel()
        swapAnimator = null
        presenceAnimator = null
        swap = 1f
        leaving = null
        fading = null
        presence = if (current != null) 1f else 0f
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean = true

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        drawShape(canvas, palette)
        val current = model
        val avatarLeft = context.dp(BORDER + PAD_LEFT)
        val avatarTop = (height - context.dp(AVATAR)) / 2f
        val avatarSize = context.dp(AVATAR)
        if (current?.service == true) {
            ServiceLogo.draw(canvas, context, avatarLeft, avatarTop, avatarSize, bitmapPaint)
        } else {
            avatar.draw(canvas, avatarLeft, avatarTop, avatarSize)
            rect.set(avatarLeft, avatarTop, avatarLeft + avatarSize, avatarTop + avatarSize)
            image.draw(canvas, rect, avatarSize / 2f)
        }
        val textLeft = avatarLeft + avatarSize + context.dp(AVATAR_GAP)
        val textRight = width - context.dp(BORDER + PAD_RIGHT)
        drawTitle(canvas, current, textLeft, textRight, palette)
        var animating = false
        val subtitleCenter = context.dp(SUBTITLE_CENTER)
        val shift = context.dp(SWAP_SHIFT)
        val shown = this.current
        val gone = fading
        if (shown != null) {
            val leavingNow = leaving
            if (leavingNow != null) animating = drawSubtitle(canvas, leavingNow, textLeft, textRight, subtitleCenter - shift * swap, (1f - swap) * presence, palette) || animating
            animating = drawSubtitle(canvas, shown, textLeft, textRight, subtitleCenter + shift * (1f - swap), (if (leavingNow != null) swap else 1f) * presence, palette) || animating
        } else if (gone != null) {
            animating = drawSubtitle(canvas, gone, textLeft, textRight, subtitleCenter, presence, palette) || animating
        }
        if (animating && Motion.animationsEnabled && AppForeground.active && isShown) {
            if (shown?.typing == true) postInvalidateOnAnimation() else postInvalidateDelayed(ConnectionDots.FRAME_MS)
        }
    }

    private fun drawShape(canvas: Canvas, palette: Palette) {
        val hairline = context.dp(BORDER)
        val radius = context.dp(RADIUS)
        if (shapeFor != width) {
            shapeFor = width
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            shape.reset()
            shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
            val lifted = Path()
            rect.offset(0f, hairline)
            lifted.addRoundRect(rect, radius, radius, Path.Direction.CW)
            highlight.reset()
            highlight.op(shape, lifted, Path.Op.DIFFERENCE)
            gradientDark = null
        }
        if (gradientDark != palette.isDark) {
            val line = CssGradient.linear(GRADIENT_ANGLE, width.toFloat(), height.toFloat())
            fillPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, palette.pulseCapFrom, palette.pulseCapTo, Shader.TileMode.CLAMP)
            gradientDark = palette.isDark
        }
        blur?.let {
            val save = canvas.save()
            canvas.clipPath(shape)
            it.draw(canvas, this)
            canvas.restoreToCount(save)
        }
        canvas.drawPath(shape, fillPaint)
        iconPaint.style = Paint.Style.FILL
        iconPaint.shader = null
        iconPaint.color = withAlpha(palette.pulseGlass, HIGHLIGHT)
        canvas.drawPath(highlight, iconPaint)
        strokePaint.strokeWidth = hairline
        strokePaint.color = palette.pulseCapBorder
        rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
        canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, strokePaint)
    }

    private fun drawTitle(canvas: Canvas, current: CapsuleModel?, left: Float, right: Float, palette: Palette) {
        val title = current?.title?.ifEmpty { null } ?: FALLBACK_TITLE
        val markSize = if (current?.official == true) context.dp(MARK) + context.dp(MARK_GAP) else 0f
        val muteSize = if (current?.muted == true) context.dp(MUTE) + context.dp(MARK_GAP) else 0f
        val room = max(0f, right - left - markSize - muteSize)
        val shown = TextUtils.ellipsize(title, titlePaint, room, TextUtils.TruncateAt.END)
        val centered = context.dp(HEIGHT) / 2f
        val center = centered + (context.dp(TITLE_CENTER) - centered) * presence
        titlePaint.color = palette.pulseInk
        val baseline = center - (titlePaint.ascent() + titlePaint.descent()) / 2f
        canvas.drawText(shown, 0, shown.length, left, baseline, titlePaint)
        var x = left + titlePaint.measureText(shown, 0, shown.length)
        if (current?.official == true) {
            x += context.dp(MARK_GAP)
            OfficialMark.draw(canvas, x, center, context.dp(MARK), markPaint, iconPaint)
            x += context.dp(MARK)
        }
        if (current?.muted == true) {
            x += context.dp(MARK_GAP)
            val size = context.dp(MUTE)
            QwillIcon.MUTE.draw(canvas, x, center - size / 2f, size, withAlpha(palette.pulseInk, SUBTITLE_ALPHA), iconPaint)
        }
    }

    private fun drawSubtitle(canvas: Canvas, subtitle: Subtitle, left: Float, right: Float, center: Float, alpha: Float, palette: Palette): Boolean {
        if (alpha <= 0f) return subtitle.typing || subtitle.dots
        val color = when (subtitle.tone) {
            SubtitleTone.ONLINE -> palette.online
            SubtitleTone.ACCENT -> palette.primary
            SubtitleTone.DEFAULT -> withAlpha(palette.pulseInk, SUBTITLE_ALPHA)
        }
        val baseAlpha = (android.graphics.Color.alpha(color) * alpha.coerceIn(0f, 1f)).toInt()
        subtitlePaint.color = color
        subtitlePaint.alpha = baseAlpha
        var x = left
        if (subtitle.typing) {
            iconPaint.color = color
            iconPaint.alpha = baseAlpha
            val animated = Motion.animationsEnabled
            TypingDots.draw(canvas, x, center, resources.displayMetrics.density, if (animated) SystemClock.uptimeMillis() else null, iconPaint)
            x += context.dp(TypingDots.WIDTH + TypingDots.GAP)
        }
        val dotsWidth = if (subtitle.dots) subtitlePaint.measureText(ConnectionDots.DOT) * ConnectionDots.COUNT else 0f
        val room = max(0f, right - x - dotsWidth)
        val shown = TextUtils.ellipsize(subtitle.text, subtitlePaint, room, TextUtils.TruncateAt.END)
        val baseline = center - (subtitlePaint.ascent() + subtitlePaint.descent()) / 2f
        canvas.drawText(shown, 0, shown.length, x, baseline, subtitlePaint)
        if (subtitle.dots && shown.length == subtitle.text.length) {
            var dotX = x + subtitlePaint.measureText(subtitle.text)
            val dot = subtitlePaint.measureText(ConnectionDots.DOT)
            val phase = ConnectionDots.phase()
            for (index in 0 until ConnectionDots.COUNT) {
                subtitlePaint.alpha = (baseAlpha * ConnectionDots.alpha(index, phase)).toInt()
                canvas.drawText(ConnectionDots.DOT, dotX, baseline, subtitlePaint)
                dotX += dot
            }
        }
        return subtitle.typing || subtitle.dots
    }

    companion object {
        const val HEIGHT = 52f
        private const val RADIUS = 24f
        private const val BORDER = 1f
        private const val PAD_LEFT = 6f
        private const val PAD_RIGHT = 14f
        private const val AVATAR = 40f
        private const val AVATAR_GAP = 11f
        private const val TITLE_SIZE = 16f
        private const val TITLE_TRACKING = -0.2f
        private const val SUBTITLE_SIZE = 12.5f
        private const val SUBTITLE_ALPHA = 0.45f
        private const val TITLE_CENTER = 17.875f
        private const val SUBTITLE_CENTER = 36f
        private const val MARK = 16f
        private const val MUTE = 14f
        private const val MARK_GAP = 4f
        private const val GRADIENT_ANGLE = 130f
        private const val HIGHLIGHT = 0.16f
        private const val TITLE_MS = 180L
        private const val SWAP_MS = 200L
        private const val SWAP_SHIFT = 4f
        private const val FALLBACK = "?"
        private const val FALLBACK_TITLE = "…"
    }
}
