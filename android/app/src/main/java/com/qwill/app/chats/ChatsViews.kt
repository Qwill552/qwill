package com.qwill.app.chats

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.text.TextPaint
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.PathInterpolator
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.graphics.PathParser
import com.qwill.app.QwillApplication
import com.qwill.app.consent.CssGradient
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.PublicUser
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.QwillSwitch
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil

private fun Context.textPx(value: Float): Float = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, value, resources.displayMetrics)

class ChipView(context: Context, val filter: ChatFilter, private val onPick: (ChatFilter) -> Unit) : View(context) {
    private val labelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.SEMIBOLD)
        textSize = context.textPx(LABEL_SIZE)
    }
    private val countPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.SEMIBOLD)
        textSize = context.textPx(COUNT_SIZE)
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val gradientPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val pill = RectF()
    private var gradientWidth = -1f
    private var activeProgress = 0f
    private var animator: ValueAnimator? = null
    private var count = 0

    var active = false
        private set

    init {
        isClickable = true
        isFocusable = true
        setOnClickListener { onPick(filter) }
    }

    fun setCount(value: Int) {
        if (value == count) return
        count = value
        updateDescription()
        requestLayout()
        invalidate()
    }

    fun setActive(value: Boolean, animated: Boolean) {
        if (value == active) return
        active = value
        updateDescription()
        animator?.cancel()
        val target = if (value) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isAttachedToWindow) {
            activeProgress = target
            invalidate()
            return
        }
        animator = ValueAnimator.ofFloat(activeProgress, target).apply {
            duration = Motion.duration(SWITCH_MS)
            interpolator = CURVE
            addUpdateListener {
                activeProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    private fun updateDescription() {
        contentDescription = if (count > 0) "${filter.label}, $count" else filter.label
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        var width = context.dp(PAD_X) * 2 + labelPaint.measureText(filter.label)
        if (count > 0) width += context.dp(COUNT_GAP) + countPaint.measureText(count.toString())
        setMeasuredDimension(ceil(width).toInt(), context.dpInt(TAP_H))
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val height = context.dp(PILL_H)
        val top = (this.height - height) / 2f
        pill.set(0f, top, width.toFloat(), top + height)
        val radius = context.dp(RADIUS)
        val hairline = context.dp(1f)
        if (activeProgress < 1f) {
            fillPaint.color = withAlpha(palette.pulseGlass, INACTIVE_BG * (1f - activeProgress))
            canvas.drawRoundRect(pill, radius, radius, fillPaint)
        }
        if (activeProgress > 0f) {
            if (gradientWidth != width.toFloat()) {
                val line = CssGradient.linear(GRADIENT_ANGLE, width.toFloat(), height, 0f, top)
                gradientPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, FixedColors.chipActiveFrom, FixedColors.chipActiveTo, Shader.TileMode.CLAMP)
                gradientWidth = width.toFloat()
            }
            gradientPaint.alpha = (255 * activeProgress).toInt()
            canvas.drawRoundRect(pill, radius, radius, gradientPaint)
        }
        pill.inset(hairline / 2f, hairline / 2f)
        strokePaint.strokeWidth = hairline
        strokePaint.color = QwillSwitch.blend(withAlpha(palette.pulseGlass, INACTIVE_BORDER), FixedColors.chipActiveBorder, activeProgress)
        canvas.drawRoundRect(pill, radius, radius, strokePaint)
        val ink = QwillSwitch.blend(withAlpha(palette.pulseInk, INACTIVE_INK), FixedColors.lift, activeProgress)
        val metrics = labelPaint.fontMetrics
        val baseline = this.height / 2f - (metrics.ascent + metrics.descent) / 2f
        labelPaint.color = ink
        var x = context.dp(PAD_X)
        canvas.drawText(filter.label, x, baseline, labelPaint)
        if (count > 0) {
            x += labelPaint.measureText(filter.label) + context.dp(COUNT_GAP)
            countPaint.color = withAlpha(ink, (ink ushr 24) / 255f * COUNT_OPACITY)
            canvas.drawText(count.toString(), x, baseline, countPaint)
        }
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
        info.isCheckable = true
        info.isChecked = active
    }

    private companion object {
        const val PILL_H = 34f
        const val TAP_H = 44f
        const val PAD_X = 14f
        const val RADIUS = 18f
        const val LABEL_SIZE = 13.5f
        const val COUNT_SIZE = 11.5f
        const val COUNT_GAP = 7f
        const val COUNT_OPACITY = 0.65f
        const val INACTIVE_BG = 0.05f
        const val INACTIVE_BORDER = 0.07f
        const val INACTIVE_INK = 0.55f
        const val GRADIENT_ANGLE = 140f
        const val SWITCH_MS = 280L
        val CURVE = PathInterpolator(0.22f, 1f, 0.36f, 1f)
    }
}

class ChipsRow(context: Context, private val onPick: (ChatFilter) -> Unit) : HorizontalScrollView(context) {
    private val row = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }
    private var chips: List<ChipView> = emptyList()

    init {
        isHorizontalScrollBarEnabled = false
        overScrollMode = OVER_SCROLL_NEVER
        clipToPadding = false
        addView(row, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
    }

    fun setFilters(filters: List<ChatFilter>, selected: ChatFilter, counts: Map<ChatFilter, Int>) {
        if (chips.map { it.filter } != filters) {
            row.removeAllViews()
            chips = filters.map { filter -> ChipView(context, filter, onPick) }
            for ((index, chip) in chips.withIndex()) {
                row.addView(chip, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    if (index > 0) leftMargin = context.dpInt(GAP)
                })
            }
        }
        for (chip in chips) {
            chip.setCount(if (chip.filter == ChatFilter.ALL) 0 else counts[chip.filter] ?: 0)
            chip.setActive(chip.filter == selected, animated = true)
        }
    }

    fun onThemeChanged() {
        for (chip in chips) chip.invalidate()
    }

    private companion object {
        const val GAP = 8f
    }
}

class SkeletonView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val matrix = Matrix()
    private var shaderFor = 0
    private var shader: LinearGradient? = null
    private var startedAt = 0L

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val animated = Motion.animationsEnabled
        if (animated) {
            val key = palette.surface2 xor (palette.border * 31)
            if (shader == null || shaderFor != key) {
                shader = LinearGradient(0f, 0f, 4f, 0f, intArrayOf(palette.surface2, palette.border, palette.surface2), floatArrayOf(0.25f, 0.37f, 0.63f), Shader.TileMode.CLAMP)
                shaderFor = key
            }
            if (startedAt == 0L) startedAt = android.os.SystemClock.uptimeMillis()
        }
        val phase = if (animated) ((android.os.SystemClock.uptimeMillis() - startedAt) % CYCLE_MS) / CYCLE_MS.toFloat() else 0f
        val rowH = context.dp(ROW_PAD_Y) * 2 + context.dp(CIRCLE)
        val left = paddingLeft + context.dp(ROW_PAD_X)
        val circle = context.dp(CIRCLE)
        val bodyLeft = left + circle + context.dp(ROW_GAP)
        val bodyWidth = width - paddingRight - bodyLeft - context.dp(ROW_PAD_X)
        val barRadius = context.dp(BAR_RADIUS)
        for (index in 0 until ROWS) {
            val top = index * rowH + context.dp(ROW_PAD_Y)
            rect.set(left, top, left + circle, top + circle)
            fill(canvas, rect, circle / 2f, phase, animated, palette.surface2)
            val barsHeight = context.dp(BAR_FIRST_H) + context.dp(BAR_GAP) + context.dp(BAR_SECOND_H)
            var barTop = top + (circle - barsHeight) / 2f
            rect.set(bodyLeft, barTop, bodyLeft + bodyWidth * BAR_FIRST_W, barTop + context.dp(BAR_FIRST_H))
            fill(canvas, rect, barRadius, phase, animated, palette.surface2)
            barTop += context.dp(BAR_FIRST_H) + context.dp(BAR_GAP)
            rect.set(bodyLeft, barTop, bodyLeft + bodyWidth * BAR_SECOND_W, barTop + context.dp(BAR_SECOND_H))
            fill(canvas, rect, barRadius, phase, animated, palette.surface2)
        }
        if (animated && isShown) postInvalidateOnAnimation()
    }

    private fun fill(canvas: Canvas, box: RectF, radius: Float, phase: Float, animated: Boolean, flat: Int) {
        if (!animated) {
            paint.shader = null
            paint.color = flat
            canvas.drawRoundRect(box, radius, radius, paint)
            return
        }
        val width = box.width()
        val position = 1f - phase
        matrix.setScale(width, 1f)
        matrix.postTranslate(box.left - 3f * width * position, 0f)
        shader?.setLocalMatrix(matrix)
        paint.shader = shader
        paint.color = FixedColors.lift
        canvas.drawRoundRect(box, radius, radius, paint)
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, visibility)
        if (visibility == VISIBLE) invalidate()
    }

    private companion object {
        const val ROWS = 5
        const val ROW_PAD_X = 12f
        const val ROW_PAD_Y = 10f
        const val ROW_GAP = 12f
        const val CIRCLE = 54f
        const val BAR_FIRST_W = 0.45f
        const val BAR_SECOND_W = 0.70f
        const val BAR_FIRST_H = 14f
        const val BAR_SECOND_H = 12f
        const val BAR_GAP = 8f
        const val BAR_RADIUS = 10f
        const val CYCLE_MS = 1400L
    }
}

class EmptyStateView(context: Context) : LinearLayout(context) {
    private val illustration = Illustration(context)
    private val title = TextView(context)
    private val subtitle = TextView(context)

    init {
        orientation = VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        val pad = context.dpInt(PAD)
        setPadding(pad, pad * 2, pad, pad)
        addView(illustration, LayoutParams(context.dpInt(ART), context.dpInt(ART)))
        title.typeface = Fonts.message(FontWeight.SEMIBOLD)
        title.setTextSize(TypedValue.COMPLEX_UNIT_DIP, TITLE_SIZE)
        title.gravity = Gravity.CENTER
        addView(title, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dpInt(GAP) })
        subtitle.typeface = Fonts.message(FontWeight.REGULAR)
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_DIP, SUBTITLE_SIZE)
        subtitle.gravity = Gravity.CENTER
        subtitle.maxWidth = context.dpInt(SUBTITLE_MAX)
        subtitle.setLineSpacing(0f, SUBTITLE_LINE)
        addView(subtitle, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dpInt(GAP) })
        applyTheme()
    }

    fun setTexts(heading: String, detail: String) {
        title.text = heading
        subtitle.text = detail
    }

    fun applyTheme() {
        val palette = Theme.palette
        title.setTextColor(palette.textPrimary)
        subtitle.setTextColor(palette.textSecondary)
        illustration.invalidate()
    }

    private class Illustration(context: Context) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val cloud: Path = PathParser.createPathFromPathData(CLOUD)

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            val save = canvas.save()
            val scale = width / VIEWBOX
            canvas.scale(scale, scale)
            paint.style = Paint.Style.FILL
            paint.color = palette.primarySoft
            canvas.drawCircle(60f, 60f, 56f, paint)
            paint.color = palette.surface
            canvas.drawPath(cloud, paint)
            paint.style = Paint.Style.STROKE
            paint.strokeWidth = 3f
            paint.color = palette.primary
            canvas.drawPath(cloud, paint)
            paint.style = Paint.Style.FILL
            for (x in DOTS) canvas.drawCircle(x, 56f, 3.5f, paint)
            canvas.restoreToCount(save)
        }

        private companion object {
            const val VIEWBOX = 120f
            const val CLOUD = "M34 46a10 10 0 0 1 10-10h32a10 10 0 0 1 10 10v20a10 10 0 0 1-10 10H52l-12 10v-10h-6a10 10 0 0 1-10-10V46Z"
            val DOTS = floatArrayOf(52f, 64f, 76f)
        }
    }

    private companion object {
        const val PAD = 32f
        const val ART = 112f
        const val GAP = 12f
        const val TITLE_SIZE = 16f
        const val SUBTITLE_SIZE = 13f
        const val SUBTITLE_MAX = 260f
        const val SUBTITLE_LINE = 1.5f
    }
}

class HeaderAvatarView(context: Context) : View(context) {
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)
    private val rect = RectF()

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun setUser(user: PublicUser?) {
        avatar.set(user?.displayName ?: FALLBACK, user?.avatarColor, user?.displayName ?: FALLBACK, Fonts.message(FontWeight.BOLD))
        image.setImage(QwillApplication.files.avatarRequest(user?.avatarUrl), null, context.dpInt(SIZE), small = true)
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val side = context.dpInt(SIZE)
        setMeasuredDimension(side, side)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
    }

    override fun onDraw(canvas: Canvas) {
        val size = width.toFloat()
        avatar.draw(canvas, 0f, 0f, size)
        rect.set(0f, 0f, size, size)
        image.draw(canvas, rect, size / 2f)
    }

    private companion object {
        const val SIZE = 38f
        const val FALLBACK = "Q"
    }
}

class MoreButton(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        isClickable = true
        isFocusable = true
        contentDescription = "Меню"
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val side = context.dpInt(TAP)
        setMeasuredDimension(side, side)
    }

    override fun setPressed(pressed: Boolean) {
        super.setPressed(pressed)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val cx = width / 2f
        val cy = height / 2f
        val radius = context.dp(CIRCLE) / 2f
        paint.style = Paint.Style.FILL
        paint.color = withAlpha(palette.pulseGlass, if (isPressed) PRESSED_FILL else FILL)
        canvas.drawCircle(cx, cy, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = context.dp(1f)
        paint.color = withAlpha(palette.pulseGlass, BORDER)
        canvas.drawCircle(cx, cy, radius - context.dp(0.5f), paint)
        paint.style = Paint.Style.FILL
        paint.color = palette.pulseInk
        val dot = context.dp(DOT_RADIUS)
        val step = context.dp(DOT_STEP)
        for (index in -1..1) canvas.drawCircle(cx, cy + index * step, dot, paint)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }

    private companion object {
        const val TAP = 44f
        const val CIRCLE = 36f
        const val FILL = 0.06f
        const val PRESSED_FILL = 0.14f
        const val BORDER = 0.08f
        const val DOT_RADIUS = 1.8f
        const val DOT_STEP = 6f
    }
}
