package com.qwill.app.ui.glass

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.View
import android.view.ViewTreeObserver
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.Glass
import com.qwill.app.ui.theme.dp
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class GlassView(
    context: Context,
    private val source: View,
    private val blurDp: Float = Glass.CHROME_BLUR,
    saturation: Float = Glass.CHROME_SATURATION,
) : View(context) {

    var cornerRadius: Float = 0f
        set(value) {
            field = value
            shapeDirty = true
            invalidate()
        }

    var tint: Int = 0
        set(value) {
            field = value
            invalidate()
        }

    var borderColor: Int = 0
        set(value) {
            field = value
            invalidate()
        }

    var highlightColor: Int = 0
        set(value) {
            field = value
            invalidate()
        }

    val usesRenderEffect: Boolean get() = Build.VERSION.SDK_INT >= 31 && isHardwareAccelerated

    private val saturationFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(saturation) })
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = saturationFilter }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shape = Path()
    private val highlight = Path()
    private val borderShape = Path()
    private val bounds = RectF()
    private var shapeDirty = true
    private val selfLocation = IntArray(2)
    private val sourceLocation = IntArray(2)

    private var node: RenderNode? = null
    private var nodeEffectKey = -1
    private var bitmap: Bitmap? = null
    private var bitmapCanvas: Canvas? = null

    private val scrollListener = ViewTreeObserver.OnScrollChangedListener { invalidate() }
    private val layoutListener = ViewTreeObserver.OnGlobalLayoutListener { invalidate() }

    init {
        setWillNotDraw(false)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        viewTreeObserver.addOnScrollChangedListener(scrollListener)
        viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnScrollChangedListener(scrollListener)
        viewTreeObserver.removeOnGlobalLayoutListener(layoutListener)
        releaseBuffers()
        super.onDetachedFromWindow()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        shapeDirty = true
    }

    override fun onDraw(canvas: Canvas) {
        if (width == 0 || height == 0) return
        if (shapeDirty) buildShape()
        val sigma = context.dp(blurDp)
        val pad = ceil(sigma * PAD_SIGMAS).toInt()
        getLocationInWindow(selfLocation)
        source.getLocationInWindow(sourceLocation)
        val dx = (sourceLocation[0] - selfLocation[0]).toFloat()
        val dy = (sourceLocation[1] - selfLocation[1]).toFloat()

        canvas.save()
        canvas.clipPath(shape)
        if (Build.VERSION.SDK_INT >= 31 && canvas.isHardwareAccelerated) {
            drawWithRenderEffect(canvas, sigma, pad, dx, dy)
        } else {
            drawWithStackBlur(canvas, sigma, pad, dx, dy)
        }
        fillPaint.color = tint
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fillPaint)
        if (highlightColor != 0) {
            fillPaint.color = highlightColor
            canvas.drawPath(highlight, fillPaint)
        }
        canvas.restore()

        if (borderColor != 0) {
            borderPaint.color = borderColor
            canvas.drawPath(borderShape, borderPaint)
        }
    }

    private fun drawWithRenderEffect(canvas: Canvas, sigma: Float, pad: Int, dx: Float, dy: Float) {
        if (Build.VERSION.SDK_INT < 31) return
        val renderNode = node ?: RenderNode("glass").also { node = it }
        renderNode.setPosition(0, 0, width + pad * 2, height + pad * 2)
        val effectKey = sigma.roundToInt()
        if (effectKey != nodeEffectKey) {
            val radius = max(0f, (sigma - SKIA_SIGMA_BIAS) / SKIA_SIGMA_SCALE)
            val blur = RenderEffect.createBlurEffect(radius, radius, Shader.TileMode.CLAMP)
            renderNode.setRenderEffect(RenderEffect.createColorFilterEffect(saturationFilter, blur))
            nodeEffectKey = effectKey
        }
        val recording = renderNode.beginRecording()
        recording.translate(pad + dx, pad + dy)
        source.draw(recording)
        renderNode.endRecording()
        canvas.save()
        canvas.translate(-pad.toFloat(), -pad.toFloat())
        canvas.drawRenderNode(renderNode)
        canvas.restore()
    }

    private fun drawWithStackBlur(canvas: Canvas, sigma: Float, pad: Int, dx: Float, dy: Float) {
        val bw = ceil((width + pad * 2) / DOWNSAMPLE).toInt().coerceAtLeast(1)
        val bh = ceil((height + pad * 2) / DOWNSAMPLE).toInt().coerceAtLeast(1)
        var target = bitmap
        if (target == null || target.width != bw || target.height != bh) {
            target?.recycle()
            target = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888)
            bitmap = target
            bitmapCanvas = Canvas(target)
        }
        val offscreen = bitmapCanvas ?: return
        target.eraseColor(0)
        offscreen.save()
        offscreen.scale(1f / DOWNSAMPLE, 1f / DOWNSAMPLE)
        offscreen.translate(pad + dx, pad + dy)
        source.draw(offscreen)
        offscreen.restore()
        StackBlur.blur(target, stackRadius(sigma))
        canvas.save()
        canvas.translate(-pad.toFloat(), -pad.toFloat())
        canvas.scale(DOWNSAMPLE, DOWNSAMPLE)
        canvas.drawBitmap(target, 0f, 0f, bitmapPaint)
        canvas.restore()
    }

    private fun stackRadius(sigma: Float): Int = (STACK_SIGMA_RATIO * sigma / DOWNSAMPLE - 1f).roundToInt().coerceAtLeast(1)

    private fun buildShape() {
        val hairline = context.dp(Dimens.HAIRLINE)
        bounds.set(0f, 0f, width.toFloat(), height.toFloat())
        shape.reset()
        shape.addRoundRect(bounds, cornerRadius, cornerRadius, Path.Direction.CW)
        val shifted = Path()
        bounds.offset(0f, hairline)
        shifted.addRoundRect(bounds, cornerRadius, cornerRadius, Path.Direction.CW)
        highlight.reset()
        highlight.op(shape, shifted, Path.Op.DIFFERENCE)
        val half = hairline / 2f
        bounds.set(half, half, width - half, height - half)
        borderShape.reset()
        borderShape.addRoundRect(bounds, cornerRadius - half, cornerRadius - half, Path.Direction.CW)
        borderPaint.strokeWidth = hairline
        shapeDirty = false
    }

    private fun releaseBuffers() {
        bitmap?.recycle()
        bitmap = null
        bitmapCanvas = null
        if (Build.VERSION.SDK_INT >= 31) node?.discardDisplayList()
        node = null
        nodeEffectKey = -1
    }

    private companion object {
        const val DOWNSAMPLE = 8f
        const val PAD_SIGMAS = 2f
        const val SKIA_SIGMA_SCALE = 0.57735f
        const val SKIA_SIGMA_BIAS = 0.5f
        const val STACK_SIGMA_RATIO = 2.45f
    }
}
