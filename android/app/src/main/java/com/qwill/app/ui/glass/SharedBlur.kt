package com.qwill.app.ui.glass

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.RenderEffect
import android.graphics.RenderNode
import android.graphics.Shader
import android.os.Build
import android.view.View
import com.qwill.app.ui.theme.dp
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class SharedBlur(private val source: View, private val blurDp: Float, saturation: Float) {
    private val saturationFilter = ColorMatrixColorFilter(ColorMatrix().apply { setSaturation(saturation) })
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG).apply { colorFilter = saturationFilter }
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

    fun addConsumer(view: View) {
        if (view !in consumers) consumers.add(view)
    }

    fun update(host: View, width: Int, height: Int, hardware: Boolean) {
        this.host = host
        if (width <= 0 || height <= 0) {
            recorded = false
            return
        }
        val sigma = host.context.dp(blurDp)
        pad = ceil(sigma * PAD_SIGMAS).toInt()
        host.getLocationInWindow(hostLocation)
        source.getLocationInWindow(sourceLocation)
        val dx = (sourceLocation[0] - hostLocation[0]).toFloat()
        val dy = (sourceLocation[1] - hostLocation[1]).toFloat()
        if (Build.VERSION.SDK_INT >= 31 && hardware) {
            recordNode(width, height, sigma, dx, dy)
        } else {
            recordBitmap(width, height, sigma, dx, dy)
            for (view in consumers) view.invalidate()
        }
        recorded = true
    }

    fun draw(canvas: Canvas, consumer: View) {
        val owner = host ?: return
        if (!recorded) return
        owner.getLocationInWindow(hostLocation)
        consumer.getLocationInWindow(viewLocation)
        val save = canvas.save()
        canvas.translate((hostLocation[0] - viewLocation[0]).toFloat(), (hostLocation[1] - viewLocation[1]).toFloat())
        val renderNode = node
        if (Build.VERSION.SDK_INT >= 31 && canvas.isHardwareAccelerated && renderNode != null) {
            canvas.translate(-pad.toFloat(), -pad.toFloat())
            canvas.drawRenderNode(renderNode)
        } else {
            val target = bitmap
            if (target != null) {
                canvas.translate(-pad.toFloat(), -pad.toFloat())
                canvas.scale(DOWNSAMPLE, DOWNSAMPLE)
                canvas.drawBitmap(target, 0f, 0f, bitmapPaint)
            }
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

    private fun recordNode(width: Int, height: Int, sigma: Float, dx: Float, dy: Float) {
        if (Build.VERSION.SDK_INT < 31) return
        val renderNode = node ?: RenderNode("sharedBlur").also { node = it }
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
    }

    private fun recordBitmap(width: Int, height: Int, sigma: Float, dx: Float, dy: Float) {
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
        StackBlur.blur(target, (STACK_SIGMA_RATIO * sigma / DOWNSAMPLE - 1f).roundToInt().coerceAtLeast(1))
    }

    private companion object {
        const val DOWNSAMPLE = 8f
        const val PAD_SIGMAS = 2f
        const val SKIA_SIGMA_SCALE = 0.57735f
        const val SKIA_SIGMA_BIAS = 0.5f
        const val STACK_SIGMA_RATIO = 2.45f
    }
}
