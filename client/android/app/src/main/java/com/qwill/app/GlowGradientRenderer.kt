package com.qwill.app

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Shader
import kotlin.math.max
import kotlin.math.sin

class GlowGradientRenderer : CallBackgroundRenderer {

    private val field = RadialGradient(
        0f,
        0f,
        1f,
        intArrayOf(CORE, INNER, OUTER, OUTER and 0x00FFFFFF),
        floatArrayOf(0f, 0.34f, 0.66f, 1f),
        Shader.TileMode.CLAMP,
    )

    private val halo = RadialGradient(
        0f,
        0f,
        1f,
        intArrayOf(CORE, CORE and 0x00FFFFFF),
        floatArrayOf(0f, 1f),
        Shader.TileMode.CLAMP,
    )

    private val fieldPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = field }
    private val haloPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        shader = halo
        xfermode = PorterDuffXfermode(PorterDuff.Mode.SCREEN)
    }

    private val fieldMatrix = Matrix()
    private val haloMatrix = Matrix()

    override val bufferWidth = 96

    override fun render(
        canvas: Canvas,
        width: Float,
        height: Float,
        seconds: Float,
        source: CallBackgroundSource,
    ) {
        val angle = seconds / CYCLE_SECONDS * TWO_PI
        val centerX = source.centerX * width
        val centerY = source.centerY * height
        val span = max(width, height)

        canvas.drawColor(BACKGROUND, PorterDuff.Mode.SRC)

        val fieldRadius = span *
            (FIELD_RADIUS + FIELD_BREATH * sin(angle) + FIELD_RIPPLE * sin(2f * angle + RIPPLE_PHASE))
        val eccentricity = ECCENTRICITY * sin(2f * angle + SKEW_PHASE)
        fieldMatrix.setScale(fieldRadius * (1f + eccentricity), fieldRadius * (1f - eccentricity))
        fieldMatrix.postRotate(angle * DEGREES_PER_RADIAN)
        fieldMatrix.postTranslate(centerX, centerY)
        field.setLocalMatrix(fieldMatrix)
        canvas.drawRect(0f, 0f, width, height, fieldPaint)

        val haloRadius = source.radius * width * (HALO_RADIUS + HALO_BREATH * sin(angle + HALO_PHASE))
        haloMatrix.setScale(haloRadius, haloRadius)
        haloMatrix.postTranslate(centerX, centerY)
        halo.setLocalMatrix(haloMatrix)
        canvas.drawCircle(centerX, centerY, haloRadius, haloPaint)
    }

    private companion object {
        const val CYCLE_SECONDS = 24f
        val TWO_PI = (Math.PI * 2).toFloat()
        val DEGREES_PER_RADIAN = (180.0 / Math.PI).toFloat()

        const val FIELD_RADIUS = 0.44f
        const val FIELD_BREATH = 0.05f
        const val FIELD_RIPPLE = 0.025f
        const val RIPPLE_PHASE = 1.1f
        const val ECCENTRICITY = 0.12f
        const val SKEW_PHASE = 0.4f
        const val HALO_RADIUS = 2.1f
        const val HALO_BREATH = 0.25f
        const val HALO_PHASE = 2.0f

        val BACKGROUND = Color.parseColor("#0a0c12")
        val CORE = Color.parseColor("#6aa5ff")
        val INNER = Color.parseColor("#4d8dff")
        val OUTER = Color.parseColor("#a05aff")
    }
}
