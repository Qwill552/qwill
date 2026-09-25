package com.qwill.app.consent

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.RectF
import android.view.View

class PosterBodyView(context: Context) : View(context) {
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val dst = RectF()
    private var layers: List<BodyLayer> = emptyList()
    private var single: Bitmap? = null
    private var mirrored = false

    var bleed: Float = 0f
        private set

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
    }

    fun setBody(body: PosterBody?) {
        layers = body?.layers ?: emptyList()
        bleed = body?.bleed ?: 0f
        single = null
        invalidate()
    }

    fun setBitmap(bitmap: Bitmap?, opacity: Float, filter: ColorFilter?, mirror: Boolean) {
        layers = emptyList()
        bleed = 0f
        single = bitmap
        mirrored = mirror
        paint.alpha = (opacity * 255f).toInt().coerceIn(0, 255)
        paint.colorFilter = filter
        invalidate()
    }

    override fun hasOverlappingRendering(): Boolean = layers.size > 1

    override fun onDraw(canvas: Canvas) {
        val image = single
        if (image != null) {
            if (image.isRecycled) return
            if (mirrored) {
                canvas.save()
                canvas.scale(-1f, 1f, width / 2f, height / 2f)
            }
            fitContain(image, width.toFloat(), height.toFloat())
            canvas.drawBitmap(image, null, dst, paint)
            if (mirrored) canvas.restore()
            return
        }
        if (layers.isEmpty()) return
        val scaleX = width / layers[0].width
        val scaleY = height / layers[0].height
        for (layer in layers) {
            if (layer.bitmap.isRecycled) continue
            dst.set(layer.left * scaleX, layer.top * scaleY, (layer.left + layer.width) * scaleX, (layer.top + layer.height) * scaleY)
            canvas.drawBitmap(layer.bitmap, null, dst, paint)
        }
    }

    private fun fitContain(image: Bitmap, boxW: Float, boxH: Float) {
        val scale = minOf(boxW / image.width, boxH / image.height)
        val w = image.width * scale
        val h = image.height * scale
        dst.set((boxW - w) / 2f, (boxH - h) / 2f, (boxW + w) / 2f, (boxH + h) / 2f)
    }
}
