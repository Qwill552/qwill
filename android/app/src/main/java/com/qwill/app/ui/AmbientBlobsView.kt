package com.qwill.app.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.View
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.Glass
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha

class AmbientBlobsView(context: Context) : View(context) {
    private class Blob(
        val color: Int,
        val size: Float,
        val blurDp: Float,
        val centerX: (w: Float, vh: Float) -> Float,
        val centerY: (h: Float, vh: Float) -> Float,
    )

    private val blobs = listOf(
        Blob(FixedColors.blobBlue, 45f, Glass.BLOB_BLUE_BLUR, { _, vh -> -12f * vh + 22.5f * vh }, { _, vh -> -8f * vh + 22.5f * vh }),
        Blob(FixedColors.blobViolet, 40f, Glass.BLOB_VIOLET_BLUR, { w, vh -> w + 13f * vh - 20f * vh }, { _, vh -> 24f * vh + 20f * vh }),
        Blob(FixedColors.blobTeal, 42f, Glass.BLOB_TEAL_BLUR, { _, vh -> -5f * vh + 21f * vh }, { h, vh -> h + 12f * vh - 21f * vh }),
    )
    private val paints = blobs.map { Paint(Paint.ANTI_ALIAS_FLAG) }
    private var shadersFor = -1L

    fun onThemeChanged() {
        shadersFor = -1L
        invalidate()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        shadersFor = -1L
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        canvas.drawColor(palette.bg)
        val key = (width.toLong() shl 32) or height.toLong() xor if (palette.isDark) 1L else 0L
        if (key != shadersFor) buildShaders(palette.blobOpacity)
        shadersFor = key
        val w = width.toFloat()
        val h = height.toFloat()
        val vh = h / 100f
        for ((index, blob) in blobs.withIndex()) {
            val radius = gradientRadius(blob, vh)
            canvas.drawCircle(blob.centerX(w, vh), blob.centerY(h, vh), radius, paints[index])
        }
    }

    private fun gradientRadius(blob: Blob, vh: Float): Float = blob.size * vh * GRADIENT_REACH + context.dp(blob.blurDp) * BLUR_REACH

    private fun buildShaders(opacity: Float) {
        val w = width.toFloat()
        val h = height.toFloat()
        val vh = h / 100f
        for ((index, blob) in blobs.withIndex()) {
            val radius = gradientRadius(blob, vh).coerceAtLeast(1f)
            val alpha = (blob.color ushr 24) / 255f * opacity
            val core = withAlpha(blob.color, alpha)
            val half = withAlpha(blob.color, alpha * 0.5f)
            paints[index].shader = RadialGradient(
                blob.centerX(w, vh),
                blob.centerY(h, vh),
                radius,
                intArrayOf(core, half, withAlpha(blob.color, 0f)),
                floatArrayOf(0f, 0.45f, 1f),
                Shader.TileMode.CLAMP,
            )
        }
    }

    private companion object {
        const val GRADIENT_REACH = 0.495f
        const val BLUR_REACH = 1.5f
    }
}
