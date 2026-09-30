package com.qwill.app.chat.bottom

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max

class DockCapsule(private val view: View, private val radiusDp: Float) {
    var blur: SharedBlur? = null

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val shape = Path()
    private val highlight = Path()
    private val rect = RectF()
    private var shapeKey = ""
    private var shadow: Bitmap? = null
    private var shadowKey = ""

    fun draw(canvas: Canvas) {
        val width = view.width
        val height = view.height
        if (width == 0 || height == 0) return
        val context = view.context
        val palette = Theme.palette
        val hairline = context.dp(BORDER)
        val radius = minOf(context.dp(radiusDp), height / 2f)
        val key = "$width:$height"
        if (key != shapeKey) {
            shapeKey = key
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            shape.reset()
            shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
            val lifted = Path()
            rect.offset(0f, hairline)
            lifted.addRoundRect(rect, radius, radius, Path.Direction.CW)
            highlight.reset()
            highlight.op(shape, lifted, Path.Op.DIFFERENCE)
        }
        drawShadow(canvas, width, height, radius)
        blur?.let {
            val save = canvas.save()
            canvas.clipPath(shape)
            it.draw(canvas, view)
            canvas.restoreToCount(save)
        }
        fillPaint.color = withAlpha(palette.pulseDock, FILL_ALPHA)
        canvas.drawPath(shape, fillPaint)
        fillPaint.color = withAlpha(palette.pulseGlass, HIGHLIGHT_ALPHA)
        canvas.drawPath(highlight, fillPaint)
        strokePaint.strokeWidth = hairline
        strokePaint.color = withAlpha(palette.pulseGlass, BORDER_ALPHA)
        rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
        canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, strokePaint)
    }

    fun clip(canvas: Canvas) {
        canvas.clipPath(shape)
    }

    private fun drawShadow(canvas: Canvas, width: Int, height: Int, radius: Float) {
        val context = view.context
        val reach = context.dp(SHADOW_BLUR)
        val spread = context.dp(SHADOW_SPREAD)
        val key = "$width:$height"
        var bitmap = shadow
        if (bitmap == null || key != shadowKey) {
            bitmap?.recycle()
            val bw = ceil((width + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
            val bh = ceil((height + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
            bitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ALPHA_8)
            val sigma = reach / 2f * SHADOW_SCALE
            val blurRadius = max(0.5f, (sigma - 0.5f) / 0.57735f)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = FixedColors.lift
                maskFilter = BlurMaskFilter(blurRadius, BlurMaskFilter.Blur.NORMAL)
            }
            val inset = minOf(spread, height / 2f, width / 2f)
            val corner = max(0f, radius - inset) * SHADOW_SCALE
            val core = RectF((reach + inset) * SHADOW_SCALE, (reach + inset) * SHADOW_SCALE, (reach + width - inset) * SHADOW_SCALE, (reach + height - inset) * SHADOW_SCALE)
            Canvas(bitmap).drawRoundRect(core, corner, corner, paint)
            shadow = bitmap
            shadowKey = key
        }
        shadowPaint.color = withAlpha(Color.BLACK, SHADOW_ALPHA)
        val y = context.dp(SHADOW_Y)
        rect.set(-reach, -reach + y, width + reach, height + reach + y)
        canvas.drawBitmap(bitmap, null, rect, shadowPaint)
    }

    private companion object {
        const val BORDER = 1f
        const val FILL_ALPHA = 0.62f
        const val HIGHLIGHT_ALPHA = 0.14f
        const val BORDER_ALPHA = 0.12f
        const val SHADOW_Y = 18f
        const val SHADOW_BLUR = 40f
        const val SHADOW_SPREAD = 16f
        const val SHADOW_ALPHA = 0.5f
        const val SHADOW_SCALE = 0.25f
    }
}
