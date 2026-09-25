package com.qwill.app.consent

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.Drawable
import kotlin.math.ceil
import kotlin.math.max

class CssLinearDrawable(
    private val angle: Float,
    private var colors: IntArray,
    private var positions: FloatArray?,
    private val radius: (Rect) -> Float,
) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()

    fun setColors(colors: IntArray, positions: FloatArray? = null) {
        this.colors = colors
        this.positions = positions
        rebuild(bounds)
        invalidateSelf()
    }

    override fun onBoundsChange(bounds: Rect) {
        rebuild(bounds)
    }

    private fun rebuild(bounds: Rect) {
        if (bounds.isEmpty) return
        val line = CssGradient.linear(angle, bounds.width().toFloat(), bounds.height().toFloat(), bounds.left.toFloat(), bounds.top.toFloat())
        paint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, colors, positions, Shader.TileMode.CLAMP)
    }

    override fun draw(canvas: Canvas) {
        rect.set(bounds)
        val r = radius(bounds)
        canvas.drawRoundRect(rect, r, r, paint)
    }

    override fun setAlpha(alpha: Int) {
        paint.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        paint.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}

class PosterCardDrawable(
    private val cornerRadius: () -> Float,
    private val strokeWidth: () -> Float,
    private val shadowOffset: Float,
    private val shadowSigma: Float,
) : Drawable() {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val rect = RectF()
    private val shadowDst = RectF()
    private var shadow: Bitmap? = null
    private var shadowKey = ""
    var fill: Int = 0
    var stroke: Int = 0
    var shadowColor: Int = 0
        set(value) {
            if (field == value) return
            field = value
            shadowKey = ""
            rebuildShadow()
        }

    override fun onBoundsChange(bounds: Rect) {
        rebuildShadow()
    }

    private fun rebuildShadow() {
        val b = bounds
        if (b.isEmpty || shadowColor ushr 24 == 0) {
            shadow?.recycle()
            shadow = null
            return
        }
        val radius = cornerRadius()
        val key = "${b.width()}x${b.height()}@$radius#$shadowColor"
        if (key == shadowKey && shadow != null) return
        shadowKey = key
        shadow?.recycle()
        val spread = shadowSigma * 3f
        val scale = SHADOW_SCALE
        val fullW = b.width() + 2f * spread
        val fullH = b.height() + 2f * spread + shadowOffset
        val w = max(1, ceil(fullW * scale).toInt())
        val h = max(1, ceil(fullH * scale).toInt())
        val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.scale(scale, scale)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = shadowColor }
        canvas.drawRoundRect(RectF(spread, spread + shadowOffset, spread + b.width(), spread + shadowOffset + b.height()), radius, radius, paint)
        val pixels = IntArray(w * h)
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
        GaussianBlur.blurArgb(pixels, w, h, shadowSigma * scale)
        bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
        val clear = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR) }
        canvas.drawRoundRect(RectF(spread, spread, spread + b.width(), spread + b.height()), radius, radius, clear)
        shadow = bitmap
        shadowDst.set(b.left - spread, b.top - spread, b.right + spread, b.bottom + spread + shadowOffset)
    }

    override fun draw(canvas: Canvas) {
        shadow?.let { canvas.drawBitmap(it, null, shadowDst, bitmapPaint) }
        val radius = cornerRadius()
        rect.set(bounds)
        fillPaint.color = fill
        canvas.drawRoundRect(rect, radius, radius, fillPaint)
        val stroke = strokeWidth()
        if (stroke > 0f && this.stroke ushr 24 != 0) {
            strokePaint.strokeWidth = stroke
            strokePaint.color = this.stroke
            rect.inset(stroke / 2f, stroke / 2f)
            canvas.drawRoundRect(rect, radius - stroke / 2f, radius - stroke / 2f, strokePaint)
        }
    }

    fun release() {
        shadow?.recycle()
        shadow = null
        shadowKey = ""
    }

    override fun setAlpha(alpha: Int) {}

    override fun setColorFilter(colorFilter: ColorFilter?) {}

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT

    private companion object {
        const val SHADOW_SCALE = 0.25f
    }
}

class BubbleDrawable(private val radius: Float, private val tail: Float) : Drawable() {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val path = Path()
    var color: Int
        get() = paint.color
        set(value) {
            paint.color = value
            invalidateSelf()
        }

    override fun draw(canvas: Canvas) {
        val b = bounds
        val bodyBottom = b.bottom - tail
        path.reset()
        path.addRoundRect(RectF(b.left.toFloat(), b.top.toFloat(), b.right.toFloat(), bodyBottom), radius, radius, Path.Direction.CW)
        val cx = b.exactCenterX()
        path.moveTo(cx - tail, bodyBottom - 0.5f)
        path.lineTo(cx + tail, bodyBottom - 0.5f)
        path.lineTo(cx, b.bottom.toFloat())
        path.close()
        canvas.drawPath(path, paint)
    }

    override fun setAlpha(alpha: Int) {
        paint.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        paint.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.TRANSLUCENT
}
