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
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import com.qwill.app.chats.ChatPreview
import com.qwill.app.consent.CssGradient
import com.qwill.app.emoji.Emoji
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.ripple
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max

class PinnedBannerView(context: Context, onJump: () -> Unit, onClose: () -> Unit) : FrameLayout(context) {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shape = Path()
    private val highlight = Path()
    private val rect = RectF()
    private var shapeFor = -1
    private var gradientDark: Boolean? = null
    private val body = Body(context)
    private val close = CloseButton(context)

    var shownMessageId: Long? = null
        private set

    var blur: SharedBlur? = null

    init {
        setWillNotDraw(false)
        val hairline = context.dpInt(BORDER)
        body.setOnClickListener { onJump() }
        close.setOnClickListener { onClose() }
        addView(body, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
            setMargins(hairline, hairline, hairline + context.dpInt(CLOSE), hairline)
        })
        addView(close, LayoutParams(context.dpInt(CLOSE), context.dpInt(CLOSE), Gravity.END or Gravity.CENTER_VERTICAL).apply {
            rightMargin = hairline
        })
        applyTheme()
    }

    fun setMessage(message: MessageDto, canUnpin: Boolean, animated: Boolean) {
        val text = previewText(message)
        val changedMessage = shownMessageId != null && shownMessageId != message.id
        shownMessageId = message.id
        body.setText(text, animated && changedMessage)
        body.contentDescription = "$LABEL: $text"
        close.contentDescription = if (canUnpin) "Открепить" else "Скрыть закреп"
    }

    fun forget() {
        shownMessageId = null
    }

    fun applyTheme() {
        val palette = Theme.palette
        body.background = ripple(0, context.dp(RADIUS), withAlpha(palette.primary, RIPPLE_ALPHA))
        gradientDark = null
        body.rebuild()
        invalidate()
        close.invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
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
        val shader = fillPaint.shader
        fillPaint.shader = null
        fillPaint.color = withAlpha(palette.pulseGlass, HIGHLIGHT)
        canvas.drawPath(highlight, fillPaint)
        fillPaint.shader = shader
        strokePaint.strokeWidth = hairline
        strokePaint.color = palette.pulseCapBorder
        rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
        canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, strokePaint)
    }

    private class Body(context: Context) : View(context) {
        private val labelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.SEMIBOLD) }
        private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.REGULAR) }
        private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private var text = ""
        private var previous: String? = null
        private var layout: StaticLayout? = null
        private var previousLayout: StaticLayout? = null
        private var builtFor = -1
        private var progress = 1f
        private var animator: ValueAnimator? = null

        init {
            isClickable = true
            isFocusable = true
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        }

        fun setText(next: String, animated: Boolean) {
            if (next == text && layout != null) return
            animator?.cancel()
            val animate = animated && Motion.animationsEnabled && isShown
            previous = if (animate) text else null
            previousLayout = if (animate) layout else null
            text = next
            layout = null
            if (!animate) {
                progress = 1f
                invalidate()
                return
            }
            progress = 0f
            val swap = ValueAnimator.ofFloat(0f, 1f)
            swap.duration = Motion.duration(SWAP_MS)
            swap.interpolator = EASE_OUT_QUINT
            swap.addUpdateListener {
                progress = it.animatedValue as Float
                invalidate()
            }
            swap.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (animator !== animation) return
                    animator = null
                    previous = null
                    previousLayout = null
                    progress = 1f
                    invalidate()
                }
            })
            animator = swap
            swap.start()
        }

        fun rebuild() {
            layout = null
            previousLayout = null
            builtFor = -1
            invalidate()
        }

        override fun onDetachedFromWindow() {
            super.onDetachedFromWindow()
            animator?.cancel()
            animator = null
            previous = null
            previousLayout = null
            progress = 1f
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            labelPaint.textSize = context.dp(Theme.textSize(TextScale.CAPTION))
            textPaint.textSize = context.dp(Theme.textSize(TextScale.META))
            val padLeft = context.dp(PAD_LEFT)
            val padY = context.dp(PAD_Y)
            barPaint.color = palette.primary
            val bar = context.dp(BAR)
            canvas.drawRoundRect(padLeft, padY, padLeft + bar, height - padY, bar / 2f, bar / 2f, barPaint)
            val left = padLeft + bar + context.dp(GAP)
            val room = max(0f, width - left - context.dp(PAD_RIGHT))
            if (builtFor != width) {
                builtFor = width
                layout = null
                previousLayout = null
            }
            val current = layout ?: build(text, room).also { layout = it }
            val gone = previous?.let { previousLayout ?: build(it, room).also { built -> previousLayout = built } }
            val labelHeight = labelPaint.fontMetrics.let { it.descent - it.ascent }
            val blockHeight = labelHeight + context.dp(LINE_GAP) + current.height
            val top = (height - blockHeight) / 2f
            val shift = context.dp(SWAP_SHIFT)
            val save = canvas.save()
            canvas.clipRect(0f, 0f, width.toFloat(), height.toFloat())
            if (gone != null) drawBlock(canvas, gone, left, room, top - shift * progress, 1f - progress, labelHeight)
            drawBlock(canvas, current, left, room, top + if (gone != null) shift * (1f - progress) else 0f, if (gone != null) progress else 1f, labelHeight)
            canvas.restoreToCount(save)
        }

        private fun drawBlock(canvas: Canvas, text: StaticLayout, left: Float, room: Float, top: Float, alpha: Float, labelHeight: Float) {
            val palette = Theme.palette
            val a = (alpha.coerceIn(0f, 1f) * 255).toInt()
            labelPaint.color = palette.primary
            labelPaint.alpha = a
            val label = TextUtils.ellipsize(LABEL, labelPaint, room, TextUtils.TruncateAt.END)
            canvas.drawText(label, 0, label.length, left, top - labelPaint.ascent(), labelPaint)
            textPaint.color = palette.pulseInk
            textPaint.alpha = a
            val save = canvas.save()
            canvas.translate(left, top + labelHeight + context.dp(LINE_GAP))
            text.draw(canvas)
            canvas.restoreToCount(save)
        }

        private fun build(value: String, room: Float): StaticLayout {
            val spanned = Emoji.replace(value, textPaint.textSize * EMOJI_SCALE)
            val shown = TextUtils.ellipsize(spanned, textPaint, room, TextUtils.TruncateAt.END)
            val width = ceil(max(1f, Layout.getDesiredWidth(shown, textPaint))).toInt()
            if (Build.VERSION.SDK_INT >= 23) {
                return StaticLayout.Builder.obtain(shown, 0, shown.length, textPaint, width).setMaxLines(1).setIncludePad(false).build()
            }
            @Suppress("DEPRECATION")
            return StaticLayout(shown, textPaint, width, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false)
        }

        override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(info)
            info.className = "android.widget.Button"
        }
    }

    private class CloseButton(context: Context) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        init {
            isClickable = true
            isFocusable = true
        }

        override fun setPressed(pressed: Boolean) {
            super.setPressed(pressed)
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            if (isPressed || isFocused) {
                paint.style = Paint.Style.FILL
                paint.color = withAlpha(palette.pulseInk, PRESSED_ALPHA)
                canvas.drawCircle(width / 2f, height / 2f, context.dp(PRESSED_RADIUS), paint)
            }
            val size = context.dp(CLOSE_ICON)
            QwillIcon.CLOSE.draw(canvas, (width - size) / 2f, (height - size) / 2f, size, withAlpha(palette.pulseInk, CLOSE_ALPHA), paint)
        }

        override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(info)
            info.className = "android.widget.Button"
        }
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean = true

    companion object {
        const val LABEL = "Закреплённое сообщение"
        private const val RADIUS = 14f
        private const val BORDER = 1f
        private const val GRADIENT_ANGLE = 130f
        private const val HIGHLIGHT = 0.16f
        private const val CLOSE = 44f
        private const val CLOSE_ICON = 16f
        private const val CLOSE_ALPHA = 0.45f
        private const val PRESSED_ALPHA = 0.08f
        private const val PRESSED_RADIUS = 16f
        private const val PAD_LEFT = 8f
        private const val PAD_RIGHT = 12f
        private const val PAD_Y = 8f
        private const val BAR = 3f
        private const val GAP = 10f
        private const val LINE_GAP = 2f
        private const val EMOJI_SCALE = 1.25f
        private const val SWAP_MS = 360L
        private const val SWAP_SHIFT = 12f
        private const val RIPPLE_ALPHA = 0.12f
        private val EASE_OUT_QUINT = PathInterpolator(0.23f, 1f, 0.32f, 1f)

        fun previewText(message: MessageDto): String {
            val content = message.content
            if (!content.isNullOrEmpty()) return ChatPreview.collapse(content)
            val attachment = message.attachment ?: return ""
            val voice = attachment.peaks != null || attachment.file.mimeType.startsWith("audio/")
            return if (voice) "Голосовое сообщение" else "Вложение"
        }
    }
}
