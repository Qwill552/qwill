package com.qwill.app.ui.glass

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.View
import com.qwill.app.ui.theme.dp
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class SharedBlur(
    private val source: View,
    private val underlay: View?,
    private val radiusDp: Float,
    saturation: Float,
) {
    private val saturationFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(saturation) })
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = saturationFilter }
    private val edgePaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
    private var edgeFor = -1
    private val hostLocation = IntArray(2)
    private val sourceLocation = IntArray(2)
    private val viewLocation = IntArray(2)
    private val consumers = ArrayList<View>()
    private var node: RenderNode? = null
    private var nodeEffectKey = -1
    private var bitmap: Bitmap? = null
    private var bitmapCanvas: Canvas? = null
    private var host: View? = null
    private var recorded = false
    private var pad = 0
    private var phase = 0
    private var recordedPhase = 0
    private var scale = MIN_SCALE

    fun onScrolled(dy: Int) {
        phase = ((phase + dy) % scale + scale) % scale
    }

    fun addConsumer(view: View) {
        if (view !in consumers) consumers.add(view)
    }

    fun update(host: View, width: Int, height: Int, hardware: Boolean) {
        this.host = host
        if (width <= 0 || height <= 0) {
            recorded = false
            return
        }
        val radius = host.context.dp(radiusDp)
        val sigma = BlurMath.radiusToSigma(radius)
        val nextScale = BlurMath.scaleFor(sigma, MIN_SCALE, MAX_LOW_SIGMA)
        if (nextScale != scale) {
            scale = nextScale
            phase %= scale
            nodeEffectKey = -1
        }
        pad = ceil(sigma * PAD_SIGMAS / scale).toInt() * scale
        host.getLocationInWindow(hostLocation)
        source.getLocationInWindow(sourceLocation)
        val dx = (sourceLocation[0] - hostLocation[0]).toFloat()
        val dy = (sourceLocation[1] - hostLocation[1]).toFloat()
        recordedPhase = phase
        val bw = ceil((width + pad * 2f) / scale).toInt().coerceAtLeast(1)
        val bh = ceil((height + pad * 2f + scale) / scale).toInt().coerceAtLeast(1)
        if (Build.VERSION.SDK_INT >= 31 && hardware) {
            recordNode(bw, bh, radius, dx, dy)
        } else {
            recordBitmap(bw, bh, radius, dx, dy)
            for (view in consumers) view.invalidate()
        }
        recorded = true
    }

    fun draw(canvas: Canvas, consumer: View) {
        val owner = host ?: return
        consumer.getLocationInWindow(viewLocation)
        underlay?.let { back ->
            back.getLocationInWindow(sourceLocation)
            val save = canvas.save()
            canvas.translate((sourceLocation[0] - viewLocation[0]).toFloat(), (sourceLocation[1] - viewLocation[1]).toFloat())
            back.draw(canvas)
            canvas.restoreToCount(save)
        }
        if (!recorded) return
        owner.getLocationInWindow(hostLocation)
        val save = canvas.save()
        canvas.translate((hostLocation[0] - viewLocation[0] - pad).toFloat(), (hostLocation[1] - viewLocation[1] - pad).toFloat())
        canvas.scale(scale.toFloat(), scale.toFloat())
        val renderNode = node
        if (Build.VERSION.SDK_INT >= 31 && canvas.isHardwareAccelerated && renderNode != null) {
            canvas.drawRenderNode(renderNode)
        } else {
            bitmap?.let { canvas.drawBitmap(it, 0f, -recordedPhase.toFloat() / scale, bitmapPaint) }
        }
        canvas.restoreToCount(save)
    }

    fun release() {
        bitmap?.recycle()
        bitmap = null
        bitmapCanvas = null
        if (Build.VERSION.SDK_INT >= 31) node?.discardDisplayList()
        node = null
        nodeEffectKey = -1
        recorded = false
    }

    private fun recordNode(bw: Int, bh: Int, radius: Float, dx: Float, dy: Float) {
        if (Build.VERSION.SDK_INT < 31) return
        val renderNode = node ?: RenderNode("sharedBlur").also { node = it }
        renderNode.setPosition(0, 0, bw, bh)
        renderNode.translationY = -recordedPhase.toFloat() / scale
        val effectKey = radius.roundToInt()
        if (effectKey != nodeEffectKey) {
            val scaled = BlurMath.downscaleRadius(radius, scale.toFloat())
            val blur = RenderEffect.createBlurEffect(scaled, scaled, Shader.TileMode.CLAMP)
            renderNode.setRenderEffect(RenderEffect.createColorFilterEffect(saturationFilter, blur))
            nodeEffectKey = effectKey
        }
        val recording = renderNode.beginRecording()
        recording.scale(1f / scale, 1f / scale)
        recording.translate(pad + dx, pad + dy + recordedPhase)
        drawSource(recording)
        renderNode.endRecording()
    }

    private fun recordBitmap(bw: Int, bh: Int, radius: Float, dx: Float, dy: Float) {
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
        offscreen.scale(1f / scale, 1f / scale)
        offscreen.translate(pad + dx, pad + dy + recordedPhase)
        drawSource(offscreen)
        offscreen.restore()
        val sigma = BlurMath.radiusToSigma(radius)
        StackBlur.blur(target, (STACK_SIGMA_RATIO * sigma / scale - 1f).roundToInt().coerceAtLeast(1))
    }

    private fun drawSource(canvas: Canvas) {
        val fade = scale * EDGE_FADE_STEPS
        if (edgeFor != fade) {
            edgeFor = fade
            edgePaint.shader = LinearGradient(0f, 0f, 0f, fade.toFloat(), 0, -0x1000000, Shader.TileMode.CLAMP)
        }
        val width = source.width.toFloat()
        val height = source.height.toFloat()
        val save = canvas.saveLayer(0f, 0f, width, height, null)
        source.draw(canvas)
        canvas.drawRect(0f, 0f, width, fade.toFloat(), edgePaint)
        canvas.restoreToCount(save)
    }

    private companion object {
        const val EDGE_FADE_STEPS = 2
        const val MIN_SCALE = 8
        const val MAX_LOW_SIGMA = 3f
        const val PAD_SIGMAS = 2f
        const val STACK_SIGMA_RATIO = 2.45f
    }
}

object BlurMath {
    private const val SIGMA_SCALE = 0.57735f

    fun radiusToSigma(radius: Float): Float = if (radius > 0f) SIGMA_SCALE * radius + 0.5f else 0f

    fun sigmaToRadius(sigma: Float): Float = if (sigma > 0.5f) (sigma - 0.5f) / SIGMA_SCALE else 0f

    fun downscaleRadius(radius: Float, scale: Float): Float = max(1f, sigmaToRadius(radiusToSigma(radius) / scale))

    fun scaleFor(sigma: Float, minScale: Int, maxLowSigma: Float): Int {
        var scale = minScale
        while (sigma / scale > maxLowSigma && scale < MAX_SCALE) scale *= 2
        return scale
    }

    private const val MAX_SCALE = 128
}
