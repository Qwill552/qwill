package com.qwill.app

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.cos
import kotlin.math.sin

class LegacyMeshGradientRenderer : CallBackgroundRenderer {

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
    private val localMatrix = Matrix()

    override val bufferWidth = 72

    override fun render(
        canvas: Canvas,
        width: Float,
        height: Float,
        seconds: Float,
        source: CallBackgroundSource,
    ) {
        val angle = seconds / CYCLE_SECONDS * TWO_PI

        canvas.drawColor(BACKGROUND, PorterDuff.Mode.SRC)

        blobs.forEach { blob ->
            val x = (blob.baseX + blob.spanX * sin(blob.speedX * angle + blob.phaseX)) * width
            val y = (blob.baseY + blob.spanY * cos(blob.speedY * angle + blob.phaseY)) * height
            val radius = blob.radius * width

            localMatrix.setScale(radius, radius)
            localMatrix.postTranslate(x, y)
            blob.shader.setLocalMatrix(localMatrix)

            blobPaint.shader = blob.shader
            canvas.drawCircle(x, y, radius, blobPaint)
        }

        blobPaint.shader = null
    }

    private companion object {
        const val CYCLE_SECONDS = 20f
        val TWO_PI = (Math.PI * 2).toFloat()

        val BACKGROUND = Color.parseColor("#0a0c12")
        val BLUE = Color.parseColor("#4d8dff")
        val VIOLET = Color.parseColor("#a05aff")
        val LIGHT_BLUE = Color.parseColor("#6aa5ff")
    }
}
