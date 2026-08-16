package com.qwill.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.Shader
import android.os.SystemClock
import android.provider.Settings
import android.util.AttributeSet
import android.view.View
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sin

class MeshGradientView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private class Blob(
        val color: Int,
        val baseX: Float,
        val baseY: Float,
        val spanX: Float,
        val spanY: Float,
        val radius: Float,
        val speedX: Int,
        val speedY: Int,
        val phaseX: Float,
        val phaseY: Float,
    ) {
        val shader: RadialGradient = RadialGradient(
            0f,
            0f,
            1f,
            intArrayOf(color, color and 0x00FFFFFF),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP,
        )
    }

    private val blobs = listOf(
        Blob(BLUE, 0.30f, 0.26f, 0.22f, 0.16f, 0.62f, 1, 2, 0.0f, 0.6f),
        Blob(VIOLET, 0.72f, 0.38f, 0.20f, 0.18f, 0.70f, 2, 1, 1.9f, 2.4f),
        Blob(LIGHT_BLUE, 0.50f, 0.60f, 0.26f, 0.14f, 0.55f, 1, 3, 3.4f, 1.1f),
        Blob(VIOLET, 0.22f, 0.80f, 0.18f, 0.20f, 0.60f, 3, 2, 5.0f, 4.2f),
        Blob(BLUE, 0.80f, 0.84f, 0.20f, 0.16f, 0.52f, 2, 3, 2.6f, 5.5f),
    )

    private val blobPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
    }
    private val blitPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val bufferCanvas = Canvas()
    private val localMatrix = Matrix()
    private val destination = Rect()

    private var buffer: Bitmap? = null
    private var startedAt = 0L
    private var animated = true

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        startedAt = SystemClock.elapsedRealtime()
        animated = Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) != 0f
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        buffer?.recycle()
        buffer = null
        destination.set(0, 0, w, h)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        buffer?.recycle()
        buffer = null
    }

    override fun onDraw(canvas: Canvas) {
        val target = ensureBuffer() ?: return
        val seconds = if (animated) (SystemClock.elapsedRealtime() - startedAt) / 1000f else 0f
        render(target, seconds)
        canvas.drawBitmap(target, null, destination, blitPaint)
        if (animated) postInvalidateOnAnimation()
    }

    private fun ensureBuffer(): Bitmap? {
        buffer?.let { return it }
        if (width <= 0 || height <= 0) return null
        val bufferHeight = max(1, (BUFFER_WIDTH * height.toFloat() / width).roundToInt())
        return Bitmap.createBitmap(BUFFER_WIDTH, bufferHeight, Bitmap.Config.ARGB_8888).also { buffer = it }
    }

    private fun render(target: Bitmap, seconds: Float) {
        val w = target.width.toFloat()
        val h = target.height.toFloat()
        val angle = seconds / CYCLE_SECONDS * TWO_PI

        bufferCanvas.setBitmap(target)
        bufferCanvas.drawColor(BACKGROUND, PorterDuff.Mode.SRC)

        blobs.forEach { blob ->
            val x = (blob.baseX + blob.spanX * sin(blob.speedX * angle + blob.phaseX)) * w
            val y = (blob.baseY + blob.spanY * cos(blob.speedY * angle + blob.phaseY)) * h
            val radius = blob.radius * w

            localMatrix.setScale(radius, radius)
            localMatrix.postTranslate(x, y)
            blob.shader.setLocalMatrix(localMatrix)

            blobPaint.shader = blob.shader
            bufferCanvas.drawCircle(x, y, radius, blobPaint)
        }

        blobPaint.shader = null
        bufferCanvas.setBitmap(null)
    }

    private companion object {
        const val BUFFER_WIDTH = 72
        const val CYCLE_SECONDS = 20f
        val TWO_PI = (Math.PI * 2).toFloat()

        val BACKGROUND = Color.parseColor("#0a0c12")
        val BLUE = Color.parseColor("#4d8dff")
        val VIOLET = Color.parseColor("#a05aff")
        val LIGHT_BLUE = Color.parseColor("#6aa5ff")
    }
}
