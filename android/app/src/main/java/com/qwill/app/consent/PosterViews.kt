package com.qwill.app.consent

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable
import android.view.View
import android.widget.TextView
import com.qwill.app.R
import com.qwill.app.ui.theme.PosterColors
import kotlin.math.max
import kotlin.math.min

fun Context.posterIcon(res: Int, color: Int, sizePx: Int): Drawable {
    @Suppress("DEPRECATION")
    val drawable = resources.getDrawable(res).mutate()
    drawable.setTint(color)
    drawable.setBounds(0, 0, sizePx, sizePx)
    return drawable
}

fun TextView.cssLineHeight(multiplier: Float) {
    includeFontPadding = false
    val metrics = paint.fontMetrics
    setLineSpacing(multiplier * textSize - (metrics.descent - metrics.ascent), 1f)
}

class ThemeToggleView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private var icon: Drawable? = null
    var pillWidth = 0f
    var pillHeight = 0f
    var knobPad = 0f
    var knobSize = 0f
    var iconSize = 0f
    var border = 1f
    var tapMin = 0f
    var dark = false
    var colors: PosterColors? = null

    init {
        isClickable = true
        isFocusable = true
    }

    fun refresh() {
        val palette = colors ?: return
        icon = context.posterIcon(if (dark) R.drawable.ic_poster_sun else R.drawable.ic_poster_moon, palette.toggleIcon, iconSize.toInt().coerceAtLeast(1))
        contentDescription = if (dark) PosterText.THEME_TO_LIGHT else PosterText.THEME_TO_DARK
        requestLayout()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(max(pillWidth, tapMin).toInt(), max(pillHeight, tapMin).toInt())
    }

    override fun onDraw(canvas: Canvas) {
        val palette = colors ?: return
        val left = (width - pillWidth) / 2f
        val top = (height - pillHeight) / 2f
        rect.set(left, top, left + pillWidth, top + pillHeight)
        val radius = pillHeight / 2f
        paint.style = Paint.Style.FILL
        paint.color = palette.lilac
        canvas.drawRoundRect(rect, radius, radius, paint)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = border
        paint.color = palette.toggleBorder
        rect.inset(border / 2f, border / 2f)
        canvas.drawRoundRect(rect, radius - border / 2f, radius - border / 2f, paint)
        paint.style = Paint.Style.FILL
        paint.color = palette.white
        val cy = top + pillHeight / 2f
        val cx = if (dark) left + pillWidth - knobPad - knobSize / 2f else left + knobPad + knobSize / 2f
        canvas.drawCircle(cx, cy, knobSize / 2f, paint)
        icon?.let {
            canvas.save()
            canvas.translate(cx - iconSize / 2f, cy - iconSize / 2f)
            it.draw(canvas)
            canvas.restore()
        }
    }
}

class DoneBadgeView(context: Context) : View(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var icon: Drawable? = null
    private var shaderKey = ""
    var colors: PosterColors? = null

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    override fun onDraw(canvas: Canvas) {
        val palette = colors ?: return
        val size = min(width, height).toFloat()
        val key = "$size:${palette.isDark}"
        if (key != shaderKey) {
            shaderKey = key
            val shape = CssGradient.circleFarthestCorner(size, size, 0.32f, 0.26f)
            paint.shader = RadialGradient(
                shape.centerX,
                shape.centerY,
                shape.radiusX,
                intArrayOf(palette.okLit, palette.ok, palette.okDeep),
                floatArrayOf(0f, 0.42f, 1f),
                Shader.TileMode.CLAMP,
            )
            icon = context.posterIcon(R.drawable.ic_poster_check, palette.white, (size * 0.55f).toInt().coerceAtLeast(1))
        }
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint)
        icon?.let {
            val side = it.bounds.width()
            canvas.save()
            canvas.translate((size - side) / 2f, (size - side) / 2f)
            it.draw(canvas)
            canvas.restore()
        }
    }
}
