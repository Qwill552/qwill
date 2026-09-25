package com.qwill.app.consent

import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sqrt

object GaussianBlur {
    private const val PASSES = 3

    fun boxRadii(sigma: Float): IntArray {
        val ideal = sqrt(12f * sigma * sigma / PASSES + 1f)
        var lower = floor(ideal).toInt()
        if (lower % 2 == 0) lower--
        val upper = lower + 2
        val m = ((12f * sigma * sigma - PASSES * lower * lower - 4f * PASSES * lower - 3f * PASSES) / (-4f * lower - 4f)).roundToInt()
        return IntArray(PASSES) { index -> ((if (index < m) lower else upper) - 1) / 2 }
    }

    fun blurArgb(pixels: IntArray, width: Int, height: Int, sigma: Float) {
        if (sigma <= 0f || width == 0 || height == 0) return
        val size = width * height
        val a = IntArray(size)
        val r = IntArray(size)
        val g = IntArray(size)
        val b = IntArray(size)
        for (i in 0 until size) {
            val color = pixels[i]
            val alpha = color ushr 24
            a[i] = alpha
            r[i] = (color shr 16 and 0xFF) * alpha / 255
            g[i] = (color shr 8 and 0xFF) * alpha / 255
            b[i] = (color and 0xFF) * alpha / 255
        }
        val scratch = IntArray(size)
        for (radius in boxRadii(sigma)) {
            for (channel in arrayOf(a, r, g, b)) {
                boxHorizontal(channel, scratch, width, height, radius)
                boxVertical(scratch, channel, width, height, radius)
            }
        }
        for (i in 0 until size) {
            val alpha = a[i].coerceIn(0, 255)
            if (alpha == 0) {
                pixels[i] = 0
                continue
            }
            val red = (r[i] * 255 / alpha).coerceIn(0, 255)
            val green = (g[i] * 255 / alpha).coerceIn(0, 255)
            val blue = (b[i] * 255 / alpha).coerceIn(0, 255)
            pixels[i] = (alpha shl 24) or (red shl 16) or (green shl 8) or blue
        }
    }

    private fun boxHorizontal(source: IntArray, target: IntArray, width: Int, height: Int, radius: Int) {
        val span = radius * 2 + 1
        for (y in 0 until height) {
            val row = y * width
            var sum = 0
            for (x in 0..minOf(radius, width - 1)) sum += source[row + x]
            for (x in 0 until width) {
                target[row + x] = (sum + span / 2) / span
                val add = x + radius + 1
                val drop = x - radius
                if (add < width) sum += source[row + add]
                if (drop >= 0) sum -= source[row + drop]
            }
        }
    }

    private fun boxVertical(source: IntArray, target: IntArray, width: Int, height: Int, radius: Int) {
        val span = radius * 2 + 1
        for (x in 0 until width) {
            var sum = 0
            for (y in 0..minOf(radius, height - 1)) sum += source[y * width + x]
            for (y in 0 until height) {
                target[y * width + x] = (sum + span / 2) / span
                val add = y + radius + 1
                val drop = y - radius
                if (add < height) sum += source[add * width + x]
                if (drop >= 0) sum -= source[drop * width + x]
            }
        }
    }
}
