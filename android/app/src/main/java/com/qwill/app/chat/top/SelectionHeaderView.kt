package com.qwill.app.chat.top

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.text.TextPaint
import android.view.MotionEvent
import android.view.View
import com.qwill.app.ui.CharDiffText
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max

class SelectionHeaderView(context: Context) : ChromeRowLayout(context, ACTION_GAP) {
    val close = ChromeCircleButton(context, QwillIcon.CLOSE, "Выйти из выделения")
    val capsule = SelectionCapsule(context)
    val copy = ChromeCircleButton(context, QwillIcon.COPY, "Копировать")
    val delete = ChromeCircleButton(context, QwillIcon.TRASH, "Удалить", danger = true)

    init {
        setParts(close, capsule, listOf(copy, delete))
    }

    fun setState(count: Int, canDelete: Boolean, animated: Boolean) {
        capsule.setCount(count, animated)
        delete.visibility = if (canDelete) View.VISIBLE else View.GONE
    }

    fun refresh() {
        capsule.refresh()
        for (view in listOf(close, copy, delete)) view.invalidate()
    }

    private companion object {
        const val ACTION_GAP = 2f
    }
}

class SelectionCapsule(context: Context) : View(context) {
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.SEMIBOLD) }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val shape = Path()
    private val highlight = Path()
    private val rect = RectF()
    private val count = CharDiffText()
    private var countValue = -1
    private var shapeFor = -1
    private var shadow: Bitmap? = null
    private var shadowKey = ""
    private var animator: ValueAnimator? = null

    var blur: SharedBlur? = null

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
    }

    fun setCount(value: Int, animated: Boolean) {
        val growing = countValue < 0 || value > countValue
        if (!count.set(PREFIX + value, growing)) return
        countValue = value
        contentDescription = count.text
        animator?.cancel()
        if (!animated || !Motion.animationsEnabled || !isShown) {
            count.progress = 1f
            invalidate()
            return
        }
        count.progress = 0f
        val next = ValueAnimator.ofFloat(0f, 1f)
        next.duration = Motion.duration(if (growing) GROW_MS else SHRINK_MS)
        next.interpolator = Motion.easeScreen
        next.addUpdateListener {
            count.progress = it.animatedValue as Float
            invalidate()
        }
        next.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (animator === animation) animator = null
            }
        })
        animator = next
        next.start()
    }

    fun refresh() {
        shadowKey = ""
        invalidate()
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean = true

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
        animator = null
        count.progress = 1f
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
        }
        drawShadow(canvas, palette.isDark)
        blur?.let {
            val save = canvas.save()
            canvas.clipPath(shape)
            it.draw(canvas, this)
            canvas.restoreToCount(save)
        }
        fillPaint.color = palette.chromeBg
        canvas.drawPath(shape, fillPaint)
        fillPaint.color = palette.chromeHighlight
        canvas.drawPath(highlight, fillPaint)
        strokePaint.strokeWidth = hairline
        strokePaint.color = palette.chromeBorder
        rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
        canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, strokePaint)
        textPaint.textSize = context.dp(Theme.textSize(TextScale.SCREEN_TITLE))
        textPaint.color = palette.textPrimary
        val baseline = height / 2f - (textPaint.ascent() + textPaint.descent()) / 2f
        val save = canvas.save()
        canvas.clipRect(hairline, hairline, width - hairline, height - hairline)
        count.draw(canvas, context.dp(BORDER + PAD_X), baseline, context.dp(COUNT_SHIFT), textPaint)
        canvas.restoreToCount(save)
    }

    private fun drawShadow(canvas: Canvas, dark: Boolean) {
        val y = context.dp(if (dark) DARK_Y else LIGHT_Y)
        val reach = context.dp(if (dark) DARK_BLUR else LIGHT_BLUR)
        val color = if (dark) withAlpha(Color.BLACK, DARK_ALPHA) else withAlpha(LIGHT_SHADOW, LIGHT_ALPHA)
        val key = "$width:$height:$dark"
        var bitmap = shadow
        if (bitmap == null || key != shadowKey) {
            bitmap?.recycle()
            val bw = ceil((width + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
            val bh = ceil((height + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
            bitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ALPHA_8)
            val sigma = reach / 2f * SHADOW_SCALE
            val blur = max(0.5f, (sigma - 0.5f) / 0.57735f)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                this.color = FixedColors.lift
                maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
            }
            val corner = context.dp(RADIUS) * SHADOW_SCALE
            val core = RectF(reach * SHADOW_SCALE, reach * SHADOW_SCALE, (reach + width) * SHADOW_SCALE, (reach + height) * SHADOW_SCALE)
            Canvas(bitmap).drawRoundRect(core, corner, corner, paint)
            shadow = bitmap
            shadowKey = key
        }
        shadowPaint.color = color
        rect.set(-reach, -reach + y, width + reach, height + reach + y)
        canvas.drawBitmap(bitmap, null, rect, shadowPaint)
    }

    private companion object {
        const val PREFIX = "Выбрано "
        const val GROW_MS = 180L
        const val SHRINK_MS = 150L
        const val RADIUS = 26f
        const val BORDER = 1f
        const val PAD_X = 12f
        const val COUNT_SHIFT = 10f
        const val LIGHT_Y = 4f
        const val LIGHT_BLUR = 16f
        const val LIGHT_ALPHA = 0.08f
        const val DARK_Y = 10f
        const val DARK_BLUR = 34f
        const val DARK_ALPHA = 0.46f
        const val SHADOW_SCALE = 0.25f
        val LIGHT_SHADOW = Color.rgb(20, 24, 35)
    }
}
