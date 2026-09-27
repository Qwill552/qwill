package com.qwill.app.chat.wallpaper

import kotlin.math.roundToInt
import kotlin.math.sqrt

enum class PatternBlend { MULTIPLY, SOFT_LIGHT }

object BlendModes {
    fun multiply(backdrop: Float, source: Float): Float = backdrop * source

    fun softLight(backdrop: Float, source: Float): Float {
        if (source <= 0.5f) return backdrop - (1f - 2f * source) * backdrop * (1f - backdrop)
        val d = if (backdrop <= 0.25f) ((16f * backdrop - 12f) * backdrop + 4f) * backdrop else sqrt(backdrop)
        return backdrop + (2f * source - 1f) * (d - backdrop)
    }

    fun blend(mode: PatternBlend, backdrop: Float, source: Float): Float = when (mode) {
        PatternBlend.MULTIPLY -> multiply(backdrop, source)
        PatternBlend.SOFT_LIGHT -> softLight(backdrop, source)
    }

    fun compose(mode: PatternBlend, backdrop: Int, ink: Int, coverage: Float): Int {
        val alpha = ((ink ushr 24) / 255f) * coverage
        if (alpha <= 0f) return backdrop
        val red = channel(mode, (backdrop shr 16) and 0xFF, (ink shr 16) and 0xFF, alpha)
        val green = channel(mode, (backdrop shr 8) and 0xFF, (ink shr 8) and 0xFF, alpha)
        val blue = channel(mode, backdrop and 0xFF, ink and 0xFF, alpha)
        return (0xFF shl 24) or (red shl 16) or (green shl 8) or blue
    }

    private fun channel(mode: PatternBlend, backdrop: Int, source: Int, alpha: Float): Int {
        val cb = backdrop / 255f
        val mixed = (1f - alpha) * cb + alpha * blend(mode, cb, source / 255f)
        return (mixed * 255f).roundToInt().coerceIn(0, 255)
    }
}

object WallpaperPainter {
    fun gradient(width: Int, height: Int, spec: GradientSpec): IntArray {
        val pixels = IntArray(width * height)
        val layers = spec.layers.asReversed()
        val baseRed = ((spec.base shr 16) and 0xFF).toFloat()
        val baseGreen = ((spec.base shr 8) and 0xFF).toFloat()
        val baseBlue = (spec.base and 0xFF).toFloat()
        val count = layers.size
        val cx = FloatArray(count) { layers[it].atX * width }
        val cy = FloatArray(count) { layers[it].atY * height }
        val invRx = FloatArray(count) { 1f / (layers[it].widthShare * width) }
        val invRy = FloatArray(count) { 1f / (layers[it].heightShare * height) }
        for (y in 0 until height) {
            val py = y + 0.5f
            val row = y * width
            for (x in 0 until width) {
                val px = x + 0.5f
                var red = baseRed
                var green = baseGreen
                var blue = baseBlue
                for (index in 0 until count) {
                    val layer = layers[index]
                    val dx = (px - cx[index]) * invRx[index]
                    val dy = (py - cy[index]) * invRy[index]
                    val t = sqrt(dx * dx + dy * dy).coerceAtMost(1f)
                    val a0 = (layer.from ushr 24) / 255f
                    val a1 = (layer.to ushr 24) / 255f
                    val alpha = a0 + (a1 - a0) * t
                    if (alpha <= 0f) continue
                    val pr = premul(layer.from, 16, a0) + (premul(layer.to, 16, a1) - premul(layer.from, 16, a0)) * t
                    val pg = premul(layer.from, 8, a0) + (premul(layer.to, 8, a1) - premul(layer.from, 8, a0)) * t
                    val pb = premul(layer.from, 0, a0) + (premul(layer.to, 0, a1) - premul(layer.from, 0, a0)) * t
                    red = pr + red * (1f - alpha)
                    green = pg + green * (1f - alpha)
                    blue = pb + blue * (1f - alpha)
                }
                pixels[row + x] = (0xFF shl 24) or (clamp(red) shl 16) or (clamp(green) shl 8) or clamp(blue)
            }
        }
        return pixels
    }

    fun applyPattern(pixels: IntArray, width: Int, height: Int, mask: ByteArray, maskWidth: Int, maskHeight: Int, maskStride: Int, ink: Int, mode: PatternBlend) {
        if (maskWidth <= 0 || maskHeight <= 0) return
        val inkAlpha = (ink ushr 24) / 255f
        if (inkAlpha <= 0f) return
        for (y in 0 until height) {
            val maskRow = (y % maskHeight) * maskStride
            val row = y * width
            for (x in 0 until width) {
                val coverage = mask[maskRow + x % maskWidth].toInt() and 0xFF
                if (coverage == 0) continue
                val backdrop = pixels[row + x]
                pixels[row + x] = BlendModes.compose(mode, backdrop, ink, coverage / 255f)
            }
        }
    }

    private fun premul(color: Int, shift: Int, alpha: Float): Float = ((color shr shift) and 0xFF) * alpha

    private fun clamp(value: Float): Int = (value + 0.5f).toInt().coerceIn(0, 255)
}
