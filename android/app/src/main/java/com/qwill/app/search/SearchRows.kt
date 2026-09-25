package com.qwill.app.search

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.Interpolator
import android.view.animation.PathInterpolator
import com.qwill.app.QwillApplication
import com.qwill.app.emoji.Emoji
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.AvatarColor
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.OfficialMark
import com.qwill.app.ui.ServiceLogo
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max

abstract class PressableView(context: Context) : View(context) {
    var onTap: (() -> Unit)? = null
    var onLongPress: (() -> Unit)? = null

    var locked = false
        set(value) {
            if (field == value) return
            field = value
            if (value) cancelTouch()
        }

    protected var pressBg = 0f
        private set

    private var pressedShown = false
    private var bgAnimator: ValueAnimator? = null
    private var scaleAnimator: ValueAnimator? = null
    private var popAnimator: ValueAnimator? = null
    private var downX = 0f
    private var downY = 0f
    private var tracking = false
    private var longPressed = false
    private val moveCancel = context.dp(MOVE_CANCEL_DP)
    private val showPress = Runnable { setPressShown(true) }
    private val longPress = Runnable { fireLongPress() }

    val popping: Boolean get() = popAnimator != null

    var popped = false
        private set

    protected abstract val pressScale: Float
    protected abstract val pressBgMs: Long
    protected abstract val pressScaleMs: Long
    protected open val pressScaleCurve: Interpolator = EASE

    init {
        isClickable = true
        isFocusable = true
    }

    fun pop(onEnd: () -> Unit) {
        popAnimator?.cancel()
        locked = true
        if (!Motion.animationsEnabled) {
            alpha = 0f
            popped = true
            onEnd()
            return
        }
        popAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = Motion.duration(POP_MS)
            interpolator = null
            addUpdateListener { applyPop(it.animatedValue as Float) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (popAnimator !== animation) return
                    popAnimator = null
                    popped = true
                    onEnd()
                }
            })
            start()
        }
    }

    fun resetState() {
        val running = popAnimator
        popAnimator = null
        running?.cancel()
        popped = false
        bgAnimator?.cancel()
        scaleAnimator?.cancel()
        pressedShown = false
        pressBg = 0f
        scaleX = 1f
        scaleY = 1f
        alpha = 1f
        locked = false
    }

    private fun applyPop(t: Float) {
        if (t <= POP_PEAK) {
            val eased = POP_CURVE.getInterpolation(t / POP_PEAK)
            val scale = 1f + (POP_PEAK_SCALE - 1f) * eased
            scaleX = scale
            scaleY = scale
            alpha = 1f
            return
        }
        val eased = POP_CURVE.getInterpolation((t - POP_PEAK) / (1f - POP_PEAK))
        val scale = POP_PEAK_SCALE + (POP_END_SCALE - POP_PEAK_SCALE) * eased
        scaleX = scale
        scaleY = scale
        alpha = 1f - eased
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        pivotX = w / 2f
        pivotY = h / 2f
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        cancelTouch()
        bgAnimator?.cancel()
        scaleAnimator?.cancel()
        pressedShown = false
        pressBg = 0f
        if (popAnimator == null) {
            scaleX = 1f
            scaleY = 1f
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (locked) return true
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                tracking = true
                longPressed = false
                postDelayed(showPress, ViewConfiguration.getTapTimeout().toLong())
                if (onLongPress != null) postDelayed(longPress, LONG_PRESS_MS)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (tracking && hypot(event.x - downX, event.y - downY) > moveCancel) {
                    removeCallbacks(longPress)
                    removeCallbacks(showPress)
                    setPressShown(false)
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                if (!tracking) return true
                val fired = longPressed
                val moved = hypot(event.x - downX, event.y - downY) > moveCancel
                finishTouch()
                if (!fired && !moved) {
                    if (!pressedShown) setPressShown(true)
                    postDelayed({ setPressShown(false) }, RELEASE_DELAY_MS)
                    performClick()
                } else {
                    setPressShown(false)
                }
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                cancelTouch()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun performClick(): Boolean {
        super.performClick()
        if (!locked) onTap?.invoke()
        return true
    }

    override fun performLongClick(): Boolean {
        val action = onLongPress ?: return false
        if (!locked) action()
        return true
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
        info.isEnabled = !locked
        if (onLongPress != null) {
            info.addAction(AccessibilityNodeInfo.AccessibilityAction(AccessibilityNodeInfo.ACTION_LONG_CLICK, "Убрать из недавних"))
        }
    }

    private fun fireLongPress() {
        if (!tracking) return
        longPressed = true
        performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        setPressShown(false)
        onLongPress?.invoke()
    }

    private fun finishTouch() {
        tracking = false
        removeCallbacks(showPress)
        removeCallbacks(longPress)
    }

    private fun cancelTouch() {
        if (!tracking) return
        finishTouch()
        setPressShown(false)
    }

    private fun setPressShown(shown: Boolean) {
        if (shown == pressedShown) return
        pressedShown = shown
        bgAnimator?.cancel()
        scaleAnimator?.cancel()
        val bgTarget = if (shown) 1f else 0f
        val scaleTarget = if (shown) pressScale else 1f
        if (!Motion.animationsEnabled || !isAttachedToWindow) {
            pressBg = bgTarget
            scaleX = scaleTarget
            scaleY = scaleTarget
            invalidate()
            return
        }
        bgAnimator = ValueAnimator.ofFloat(pressBg, bgTarget).apply {
            duration = Motion.duration(pressBgMs)
            interpolator = EASE
            addUpdateListener {
                pressBg = it.animatedValue as Float
                invalidate()
            }
            start()
        }
        scaleAnimator = ValueAnimator.ofFloat(scaleX, scaleTarget).apply {
            duration = Motion.duration(pressScaleMs)
            interpolator = pressScaleCurve
            addUpdateListener {
                val value = it.animatedValue as Float
                scaleX = value
                scaleY = value
            }
            start()
        }
    }

    companion object {
        const val LONG_PRESS_MS = 500L
        const val MOVE_CANCEL_DP = 10f
        private const val RELEASE_DELAY_MS = 64L
        private const val POP_MS = 200L
        private const val POP_PEAK = 0.45f
        private const val POP_PEAK_SCALE = 1.16f
        private const val POP_END_SCALE = 0.2f
        val EASE: Interpolator = PathInterpolator(0.25f, 0.1f, 0.25f, 1f)
        private val POP_CURVE = PathInterpolator(0.2f, 0.9f, 0.25f, 1f)
    }
}

data class SearchRowModel(
    val key: String,
    val title: String,
    val avatarLabel: String,
    val avatarUrl: String?,
    val avatarColor: AvatarColor?,
    val colorKey: String,
    val isService: Boolean,
    val highlight: String,
    val preview: String? = null,
    val username: String? = null,
    val status: String? = null,
    val online: Boolean = false,
    val opening: Boolean = false,
)

class SearchRowView(context: Context) : PressableView(context) {
    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.MEDIUM)
        textSize = px(NAME_SIZE)
    }
    private val metaPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = px(META_SIZE)
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val rect = RectF()
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)
    private var model: SearchRowModel? = null
    private var laidOutFor: SearchRowModel? = null
    private var laidOutWidth = -1
    private var laidOutDark = false
    private var nameLayout: StaticLayout? = null
    private var metaLayout: StaticLayout? = null
    private var statusText = ""
    private var statusWidth = 0f

    override val pressScale: Float get() = PRESS_SCALE
    override val pressBgMs: Long get() = Motion.TAB
    override val pressScaleMs: Long get() = Motion.MENU

    fun bind(next: SearchRowModel) {
        val previous = model
        model = next
        if (previous?.key != next.key || popped) resetState()
        avatar.set(next.avatarLabel, next.avatarColor, next.colorKey, Fonts.message(FontWeight.BOLD))
        image.setImage(if (next.isService) null else QwillApplication.files.avatarRequest(next.avatarUrl), null, px(AVATAR).toInt(), small = true)
        locked = next.opening
        alpha = if (next.opening) DISABLED_ALPHA else 1f
        contentDescription = listOfNotNull(next.title, next.username?.let { "@$it" }, next.status, next.preview).joinToString(", ")
        if (width > 0 && (next != laidOutFor || laidOutDark != Theme.isDark)) layoutText()
        invalidate()
    }

    fun onThemeChanged() {
        if (width > 0 && model != null) layoutText()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), ceil(px(ROW_H)).toInt())
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w != laidOutWidth && model != null) layoutText()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
    }

    private fun layoutText() {
        val current = model ?: return
        val palette = Theme.palette
        laidOutFor = current
        laidOutWidth = width
        laidOutDark = Theme.isDark
        val bodyWidth = width - px(TEXT_LEFT) - px(PAD_X)
        var nameRoom = bodyWidth
        if (current.isService) nameRoom -= px(MARK_GAP) + px(MARK_SIZE)
        namePaint.color = palette.pulseInk
        val name = Highlight.apply(Emoji.replace(current.title, px(NAME_EMOJI)), current.highlight, palette.primary, Fonts.message(FontWeight.SEMIBOLD))
        nameLayout = singleLine(TextUtils.ellipsize(name, namePaint, max(0f, nameRoom), TextUtils.TruncateAt.END), namePaint)
        metaPaint.color = withAlpha(palette.pulseInk, META_ALPHA)
        statusText = current.status.orEmpty()
        statusWidth = if (statusText.isEmpty()) 0f else metaPaint.measureText(statusText)
        metaLayout = when {
            current.username != null -> {
                val handle = Highlight.apply("@${current.username}", current.highlight, palette.primary, Fonts.message(FontWeight.SEMIBOLD))
                val room = bodyWidth - if (statusWidth > 0f) statusWidth + px(STATUS_GAP) else 0f
                singleLine(TextUtils.ellipsize(handle, metaPaint, max(0f, room), TextUtils.TruncateAt.END), metaPaint)
            }
            current.preview != null -> {
                val preview = Emoji.replace(current.preview, px(META_EMOJI))
                singleLine(TextUtils.ellipsize(preview, metaPaint, max(0f, bodyWidth), TextUtils.TruncateAt.END), metaPaint)
            }
            else -> null
        }
    }

    private fun singleLine(text: CharSequence, paint: TextPaint): StaticLayout {
        val width = ceil(max(1f, Layout.getDesiredWidth(text, paint))).toInt()
        if (Build.VERSION.SDK_INT >= 23) {
            return StaticLayout.Builder.obtain(text, 0, text.length, paint, width).setMaxLines(1).setIncludePad(false).build()
        }
        @Suppress("DEPRECATION")
        return StaticLayout(text, paint, width, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false)
    }

    override fun onDraw(canvas: Canvas) {
        val current = model ?: return
        val palette = Theme.palette
        if (pressBg > 0f || isFocused) {
            fillPaint.shader = null
            fillPaint.color = withAlpha(palette.pulseGlass, if (isFocused) FOCUS_BG else PRESS_BG * pressBg)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fillPaint)
        }
        val size = px(AVATAR)
        val left = px(PAD_X)
        val top = (height - size) / 2f
        if (current.isService) {
            ServiceLogo.draw(canvas, context, left, top, size, bitmapPaint)
        } else {
            avatar.draw(canvas, left, top, size)
            rect.set(left, top, left + size, top + size)
            image.draw(canvas, rect, size / 2f)
        }
        val name = nameLayout ?: return
        val meta = metaLayout
        val nameHeight = name.height.toFloat()
        val metaHeight = meta?.height?.toFloat() ?: if (statusText.isNotEmpty()) metaLine() else 0f
        val total = nameHeight + if (metaHeight > 0f) px(BODY_GAP) + metaHeight else 0f
        var y = (height - total) / 2f
        val textLeft = px(TEXT_LEFT)
        drawLayout(canvas, name, textLeft, y)
        if (current.isService) {
            val markLeft = textLeft + name.getLineWidth(0) + px(MARK_GAP)
            OfficialMark.draw(canvas, markLeft, y + nameHeight / 2f, px(MARK_SIZE), fillPaint, iconPaint)
        }
        if (metaHeight <= 0f) return
        y += nameHeight + px(BODY_GAP)
        var x = textLeft
        if (meta != null) {
            drawLayout(canvas, meta, x, y)
            x += meta.getLineWidth(0) + px(STATUS_GAP)
        }
        if (statusText.isNotEmpty()) {
            metaPaint.color = if (current.online) palette.online else withAlpha(palette.pulseInk, META_ALPHA)
            val baseline = y + (meta?.getLineBaseline(0)?.toFloat() ?: -metaPaint.fontMetrics.ascent)
            canvas.drawText(statusText, x, baseline, metaPaint)
            metaPaint.color = withAlpha(palette.pulseInk, META_ALPHA)
        }
    }

    private fun metaLine(): Float = metaPaint.fontMetrics.let { it.descent - it.ascent }

    private fun drawLayout(canvas: Canvas, layout: StaticLayout, x: Float, y: Float) {
        val save = canvas.save()
        canvas.translate(x, y)
        layout.draw(canvas)
        canvas.restoreToCount(save)
    }

    private fun px(value: Float): Float = context.dp(value)

    private companion object {
        const val ROW_H = 60f
        const val PAD_X = 15f
        const val AVATAR = 44f
        const val TEXT_LEFT = PAD_X + AVATAR + 13f
        const val NAME_SIZE = 15f
        const val META_SIZE = 12.5f
        const val NAME_EMOJI = 20f
        const val META_EMOJI = 16f
        const val META_ALPHA = 0.42f
        const val BODY_GAP = 2f
        const val STATUS_GAP = 6f
        const val MARK_SIZE = 14f
        const val MARK_GAP = 5f
        const val PRESS_BG = 0.08f
        const val FOCUS_BG = 0.1f
        const val PRESS_SCALE = 0.98f
        const val DISABLED_ALPHA = 0.5f
    }
}

class RecentPersonView(context: Context) : PressableView(context) {
    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, NAME_SIZE, context.resources.displayMetrics)
        textAlign = Paint.Align.CENTER
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val rect = RectF()
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)
    private var entry: RecentSearchEntry? = null
    private var shown: CharSequence = ""

    override val pressScale: Float get() = PRESS_SCALE
    override val pressBgMs: Long get() = Motion.TAB
    override val pressScaleMs: Long get() = Motion.MENU

    val key: String? get() = entry?.let { RecentSearches.keyOf(it) }

    fun bind(next: RecentSearchEntry) {
        if (popped) resetState()
        entry = next
        avatar.set(next.title, next.avatarColor, RecentSearches.keyOf(next), Fonts.message(FontWeight.BOLD))
        image.setImage(if (next.isService) null else QwillApplication.files.avatarRequest(next.avatarUrl), null, context.dp(AVATAR).toInt(), small = true)
        contentDescription = next.title
        ellipsize()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val metrics = namePaint.fontMetrics
        val height = context.dp(PAD_Y) * 2 + context.dp(AVATAR) + context.dp(GAP) + (metrics.descent - metrics.ascent)
        setMeasuredDimension(ceil(context.dp(WIDTH)).toInt(), ceil(height).toInt())
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        ellipsize()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
    }

    private fun ellipsize() {
        val current = entry ?: return
        val room = context.dp(WIDTH) - context.dp(PAD_X) * 2
        shown = TextUtils.ellipsize(current.title, namePaint, room, TextUtils.TruncateAt.END)
    }

    override fun onDraw(canvas: Canvas) {
        val current = entry ?: return
        val palette = Theme.palette
        if (isFocused) {
            fillPaint.color = withAlpha(palette.pulseGlass, FOCUS_BG)
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            canvas.drawRoundRect(rect, context.dp(RADIUS), context.dp(RADIUS), fillPaint)
        }
        val size = context.dp(AVATAR)
        val left = (width - size) / 2f
        val top = context.dp(PAD_Y)
        if (current.isService) {
            ServiceLogo.draw(canvas, context, left, top, size, bitmapPaint)
        } else {
            avatar.draw(canvas, left, top, size)
            rect.set(left, top, left + size, top + size)
            image.draw(canvas, rect, size / 2f)
        }
        namePaint.color = withAlpha(palette.pulseInk, NAME_ALPHA)
        val baseline = top + size + context.dp(GAP) - namePaint.fontMetrics.ascent
        canvas.drawText(shown, 0, shown.length, width / 2f, baseline, namePaint)
    }

    private companion object {
        const val WIDTH = 74f
        const val PAD_X = 2f
        const val PAD_Y = 4f
        const val AVATAR = 54f
        const val GAP = 6f
        const val NAME_SIZE = 11.5f
        const val NAME_ALPHA = 0.72f
        const val RADIUS = 14f
        const val FOCUS_BG = 0.1f
        const val PRESS_SCALE = 0.94f
    }
}
