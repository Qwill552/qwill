package com.qwill.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.os.SystemClock
import android.provider.Settings
import android.util.AttributeSet
import android.view.View
import kotlin.math.max
import kotlin.math.roundToInt

class MeshGradientView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private val blitPaint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val bufferCanvas = Canvas()
    private val destination = Rect()
    private val source = CallBackgroundSource()
    private val ownLocation = IntArray(2)
    private val sourceLocation = IntArray(2)

    private val sourceId: Int
    private var sourceView: View? = null
    private val sourceLayoutListener = OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> measureSource() }

    private var buffer: Bitmap? = null
    private var renderer: CallBackgroundRenderer? = null
    private var startedAt = 0L
    private var animated = true

    init {
        val typed = context.obtainStyledAttributes(attrs, R.styleable.MeshGradientView)
        sourceId = typed.getResourceId(R.styleable.MeshGradientView_qwillSource, NO_ID)
        typed.recycle()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        renderer = CallBackgroundStyle.read(context).createRenderer()
        releaseBuffer()
        startedAt = SystemClock.elapsedRealtime()
        animated = Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) != 0f
        bindSource()
        invalidate()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        sourceView?.removeOnLayoutChangeListener(sourceLayoutListener)
        sourceView = null
        renderer = null
        releaseBuffer()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        releaseBuffer()
        destination.set(0, 0, w, h)
        measureSource()
    }

    override fun onDraw(canvas: Canvas) {
        val active = renderer ?: return
        val target = ensureBuffer(active) ?: return
        val seconds = if (animated) (SystemClock.elapsedRealtime() - startedAt) / 1000f else 0f

        bufferCanvas.setBitmap(target)
        active.render(bufferCanvas, target.width.toFloat(), target.height.toFloat(), seconds, source)
        bufferCanvas.setBitmap(null)

        canvas.drawBitmap(target, null, destination, blitPaint)
        if (animated) postInvalidateOnAnimation()
    }

    private fun ensureBuffer(active: CallBackgroundRenderer): Bitmap? {
        buffer?.let { return it }
        if (width <= 0 || height <= 0) return null
        val bufferHeight = max(1, (active.bufferWidth * height.toFloat() / width).roundToInt())
        return Bitmap.createBitmap(active.bufferWidth, bufferHeight, Bitmap.Config.ARGB_8888)
            .also { buffer = it }
    }

    private fun releaseBuffer() {
        buffer?.recycle()
        buffer = null
    }

    private fun bindSource() {
        if (sourceId == NO_ID || sourceView != null) return
        val found = rootView?.findViewById<View>(sourceId) ?: return
        sourceView = found
        found.addOnLayoutChangeListener(sourceLayoutListener)
        measureSource()
    }

    private fun measureSource() {
        val target = sourceView ?: return
        if (width <= 0 || height <= 0 || target.width <= 0 || target.height <= 0) return

        getLocationInWindow(ownLocation)
        target.getLocationInWindow(sourceLocation)

        source.centerX = (sourceLocation[0] - ownLocation[0] + target.width / 2f) / width
        source.centerY = (sourceLocation[1] - ownLocation[1] + target.height / 2f) / height
        source.radius = max(target.width, target.height) / 2f / width
    }
}
