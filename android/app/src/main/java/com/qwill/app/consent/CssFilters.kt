package com.qwill.app.consent

import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

class ColorMatrix5(val values: FloatArray) {
    init {
        require(values.size == 20)
    }

    fun then(next: ColorMatrix5): ColorMatrix5 {
        val a = next.values
        val b = values
        val out = FloatArray(20)
        for (row in 0 until 4) {
            for (col in 0 until 5) {
                var sum = 0f
                for (k in 0 until 4) sum += a[row * 5 + k] * b[k * 5 + col]
                if (col == 4) sum += a[row * 5 + 4]
                out[row * 5 + col] = sum
            }
        }
        return ColorMatrix5(out)
    }

    fun apply(color: Int): Int {
        val alpha = color ushr 24 and 0xFF
        val r = (color shr 16 and 0xFF).toFloat()
        val g = (color shr 8 and 0xFF).toFloat()
        val b = (color and 0xFF).toFloat()
        val a = alpha.toFloat()
        fun channel(row: Int): Int {
            val m = values
            val v = m[row * 5] * r + m[row * 5 + 1] * g + m[row * 5 + 2] * b + m[row * 5 + 3] * a + m[row * 5 + 4]
            return v.roundToInt().coerceIn(0, 255)
        }
        return (channel(3) shl 24) or (channel(0) shl 16) or (channel(1) shl 8) or channel(2)
    }

    companion object {
        fun rgb(m: Array<FloatArray>, offset: Float = 0f): ColorMatrix5 = ColorMatrix5(
            floatArrayOf(
                m[0][0], m[0][1], m[0][2], 0f, offset,
                m[1][0], m[1][1], m[1][2], 0f, offset,
                m[2][0], m[2][1], m[2][2], 0f, offset,
                0f, 0f, 0f, 1f, 0f,
            ),
        )
    }
}

object CssFilters {
    private const val LUMA_R = 0.213f
    private const val LUMA_G = 0.715f
    private const val LUMA_B = 0.072f

    fun brightness(amount: Float): ColorMatrix5 = ColorMatrix5.rgb(
        arrayOf(floatArrayOf(amount, 0f, 0f), floatArrayOf(0f, amount, 0f), floatArrayOf(0f, 0f, amount)),
    )

    fun contrast(amount: Float): ColorMatrix5 = ColorMatrix5.rgb(
        arrayOf(floatArrayOf(amount, 0f, 0f), floatArrayOf(0f, amount, 0f), floatArrayOf(0f, 0f, amount)),
        offset = (0.5f - 0.5f * amount) * 255f,
    )

    fun sepia(amount: Float): ColorMatrix5 {
        val a = 1f - amount.coerceIn(0f, 1f)
        return ColorMatrix5.rgb(
            arrayOf(
                floatArrayOf(0.393f + 0.607f * a, 0.769f - 0.769f * a, 0.189f - 0.189f * a),
                floatArrayOf(0.349f - 0.349f * a, 0.686f + 0.314f * a, 0.168f - 0.168f * a),
                floatArrayOf(0.272f - 0.272f * a, 0.534f - 0.534f * a, 0.131f + 0.869f * a),
            ),
        )
    }

    fun hueRotate(degrees: Float): ColorMatrix5 {
        val radians = Math.toRadians(degrees.toDouble())
        val c = cos(radians).toFloat()
        val s = sin(radians).toFloat()
        return ColorMatrix5.rgb(
            arrayOf(
                floatArrayOf(LUMA_R + c * 0.787f - s * 0.213f, LUMA_G - c * 0.715f - s * 0.715f, LUMA_B - c * 0.072f + s * 0.928f),
                floatArrayOf(LUMA_R - c * 0.213f + s * 0.143f, LUMA_G + c * 0.285f + s * 0.140f, LUMA_B - c * 0.072f - s * 0.283f),
                floatArrayOf(LUMA_R - c * 0.213f - s * 0.787f, LUMA_G - c * 0.715f + s * 0.715f, LUMA_B + c * 0.928f + s * 0.072f),
            ),
        )
    }

    fun saturate(amount: Float): ColorMatrix5 = ColorMatrix5.rgb(
        arrayOf(
            floatArrayOf(LUMA_R + 0.787f * amount, LUMA_G - 0.715f * amount, LUMA_B - 0.072f * amount),
            floatArrayOf(LUMA_R - 0.213f * amount, LUMA_G + 0.285f * amount, LUMA_B - 0.072f * amount),
            floatArrayOf(LUMA_R - 0.213f * amount, LUMA_G - 0.715f * amount, LUMA_B + 0.928f * amount),
        ),
    )

    fun chain(vararg steps: ColorMatrix5): ColorMatrix5 = steps.reduce { acc, next -> acc.then(next) }

    fun applyEach(color: Int, steps: List<ColorMatrix5>): Int = steps.fold(color) { acc, step -> step.apply(acc) }

    val posterCloudNight: List<ColorMatrix5> = listOf(brightness(0.66f), sepia(0.28f), hueRotate(212f), saturate(1.6f))

    val posterSmokeNight: ColorMatrix5 = chain(brightness(0.4f), contrast(1.15f))

    val posterGooContrast: ColorMatrix5 = contrast(16f)
}
