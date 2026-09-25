package com.qwill.app.search

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.max

class SearchPillPainter(private val context: Context) {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shape = Path()
    private val lifted = Path()
    private val highlight = Path()
    private val shapeRect = RectF()
    private val border = RectF()
    private val builtFor = RectF()
    private var builtRadius = -1f

    fun draw(canvas: Canvas, rect: RectF, radius: Float) {
        val palette = Theme.palette
        val hairline = context.dp(HAIRLINE)
        if (builtFor != rect || builtRadius != radius) build(rect, radius, hairline)
        fill.color = withAlpha(palette.pulseGlass, FILL_ALPHA)
        canvas.drawPath(shape, fill)
        fill.color = withAlpha(palette.pulseGlass, HIGHLIGHT_ALPHA)
        canvas.drawPath(highlight, fill)
        stroke.strokeWidth = hairline
        stroke.color = withAlpha(palette.pulseGlass, BORDER_ALPHA)
        border.set(rect)
        border.inset(hairline / 2f, hairline / 2f)
        val inner = max(0f, radius - hairline / 2f)
        canvas.drawRoundRect(border, inner, inner, stroke)
    }

    fun clip(canvas: Canvas, rect: RectF, radius: Float) {
        if (builtFor != rect || builtRadius != radius) build(rect, radius, context.dp(HAIRLINE))
        canvas.clipPath(shape)
    }

    private fun build(rect: RectF, radius: Float, hairline: Float) {
        builtFor.set(rect)
        builtRadius = radius
        shape.reset()
        shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
        shapeRect.set(rect)
        shapeRect.offset(0f, hairline)
        lifted.reset()
        lifted.addRoundRect(shapeRect, radius, radius, Path.Direction.CW)
        highlight.reset()
        highlight.op(shape, lifted, Path.Op.DIFFERENCE)
    }

    companion object {
        const val HEIGHT = 44f
        const val RADIUS = 22f
        const val PAD_X = 15f
        const val HAIRLINE = 1f
        const val ICON = 16f
        const val ICON_GAP = 10f
        const val TEXT_SIZE = 15f
        const val FILL_ALPHA = 0.07f
        const val BORDER_ALPHA = 0.09f
        const val HIGHLIGHT_ALPHA = 0.12f
        const val ICON_ALPHA = 0.5f
        const val PLACEHOLDER_ALPHA = 0.42f

        val contentLeft: Float get() = HAIRLINE + PAD_X
    }
}

object SearchGlyph {
    private const val GRID = 16f
    private const val STROKE = 1.6f
    private val line = Path().apply {
        moveTo(11f, 11f)
        lineTo(15f, 15f)
    }

    fun draw(canvas: Canvas, left: Float, top: Float, size: Float, color: Int, paint: Paint) {
        paint.shader = null
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = color
        val save = canvas.save()
        canvas.translate(left, top)
        val scale = size / GRID
        canvas.scale(scale, scale)
        canvas.drawCircle(7f, 7f, 5f, paint)
        canvas.drawPath(line, paint)
        canvas.restoreToCount(save)
    }
}

class SearchTriggerView(context: Context, private val label: String) : View(context) {
    private val painter = SearchPillPainter(context)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, SearchPillPainter.TEXT_SIZE, context.resources.displayMetrics)
    }
    private val rect = RectF()
    private var shown: CharSequence = label

    init {
        isClickable = true
        isFocusable = true
        contentDescription = "Поиск"
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), Math.round(context.dp(SearchPillPainter.HEIGHT)))
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        pivotX = w / 2f
        pivotY = h / 2f
        val room = w - textLeft() - context.dp(SearchPillPainter.contentLeft)
        shown = TextUtils.ellipsize(label, textPaint, max(0f, room), TextUtils.TruncateAt.END)
    }

    private fun textLeft(): Float = context.dp(SearchPillPainter.contentLeft) + context.dp(SearchPillPainter.ICON) + context.dp(SearchPillPainter.ICON_GAP)

    override fun setPressed(pressed: Boolean) {
        super.setPressed(pressed)
        invalidate()
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        rect.set(0f, 0f, width.toFloat(), height.toFloat())
        painter.draw(canvas, rect, context.dp(SearchPillPainter.RADIUS))
        if (isFocused) {
            iconPaint.style = Paint.Style.STROKE
            iconPaint.strokeWidth = context.dp(2f)
            iconPaint.color = palette.primary
            val inset = context.dp(1f)
            rect.inset(inset, inset)
            canvas.drawRoundRect(rect, context.dp(SearchPillPainter.RADIUS) - inset, context.dp(SearchPillPainter.RADIUS) - inset, iconPaint)
        }
        val size = context.dp(SearchPillPainter.ICON)
        SearchGlyph.draw(canvas, context.dp(SearchPillPainter.contentLeft), (height - size) / 2f, size, withAlpha(palette.pulseInk, SearchPillPainter.ICON_ALPHA), iconPaint)
        textPaint.color = withAlpha(palette.pulseInk, SearchPillPainter.PLACEHOLDER_ALPHA)
        val metrics = textPaint.fontMetrics
        canvas.drawText(shown, 0, shown.length, textLeft(), height / 2f - (metrics.ascent + metrics.descent) / 2f, textPaint)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }
}

class SearchIconButton(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        isClickable = true
        isFocusable = true
        contentDescription = "Поиск"
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val side = Math.round(context.dp(TAP))
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
        paint.shader = null
        paint.style = Paint.Style.FILL
        paint.color = withAlpha(palette.pulseGlass, if (isPressed || isFocused) PRESSED_FILL else FILL)
        canvas.drawCircle(cx, cy, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = context.dp(1f)
        paint.color = withAlpha(palette.pulseGlass, BORDER)
        canvas.drawCircle(cx, cy, radius - context.dp(0.5f), paint)
        val size = context.dp(SearchPillPainter.ICON)
        SearchGlyph.draw(canvas, cx - size / 2f, cy - size / 2f, size, palette.pulseInk, paint)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.Button"
    }

    companion object {
        const val TAP = 44f
        const val CIRCLE = 36f
        private const val FILL = 0.06f
        private const val PRESSED_FILL = 0.14f
        private const val BORDER = 0.08f
    }
}
