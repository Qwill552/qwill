package com.qwill.app.ui.glass

import android.graphics.Bitmap
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

object StackBlur {
    private var pixels = IntArray(0)
    private var red = IntArray(0)
    private var green = IntArray(0)
    private var blue = IntArray(0)
    private var alpha = IntArray(0)
    private var tableRadius = -1
    private var table = IntArray(0)

    fun blur(bitmap: Bitmap, radius: Int) {
        if (radius < 1) return
        val w = bitmap.width
        val h = bitmap.height
        val size = w * h
        if (pixels.size < size) {
            pixels = IntArray(size)
            red = IntArray(size)
            green = IntArray(size)
            blue = IntArray(size)
            alpha = IntArray(size)
        }
        bitmap.getPixels(pixels, 0, w, 0, 0, w, h)
        pass(w, h, radius)
        bitmap.setPixels(pixels, 0, w, 0, 0, w, h)
    }

    private fun pass(w: Int, h: Int, radius: Int) {
        val wm = w - 1
        val hm = h - 1
        val div = radius + radius + 1
        if (tableRadius != radius) {
            val divSum = ((div + 1) shr 1).let { it * it }
            table = IntArray(256 * divSum) { it / divSum }
            tableRadius = radius
        }
        val table = table
        val vmin = IntArray(max(w, h))
        val stack = Array(div) { IntArray(4) }
        val r1 = radius + 1

        var yi = 0
        var yw = 0
        for (y in 0 until h) {
            var rin = 0; var gin = 0; var bin = 0; var ain = 0
            var rout = 0; var gout = 0; var bout = 0; var aout = 0
            var rsum = 0; var gsum = 0; var bsum = 0; var asum = 0
            for (i in -radius..radius) {
                val p = pixels[yi + min(wm, max(i, 0))]
                val sir = stack[i + radius]
                sir[0] = (p shr 16) and 0xff
                sir[1] = (p shr 8) and 0xff
                sir[2] = p and 0xff
                sir[3] = (p ushr 24) and 0xff
                val rbs = r1 - abs(i)
                rsum += sir[0] * rbs; gsum += sir[1] * rbs; bsum += sir[2] * rbs; asum += sir[3] * rbs
                if (i > 0) {
                    rin += sir[0]; gin += sir[1]; bin += sir[2]; ain += sir[3]
                } else {
                    rout += sir[0]; gout += sir[1]; bout += sir[2]; aout += sir[3]
                }
            }
            var stackPointer = radius
            for (x in 0 until w) {
                red[yi] = table[rsum]; green[yi] = table[gsum]; blue[yi] = table[bsum]; alpha[yi] = table[asum]
                rsum -= rout; gsum -= gout; bsum -= bout; asum -= aout
                val stackStart = stackPointer - radius + div
                var sir = stack[stackStart % div]
                rout -= sir[0]; gout -= sir[1]; bout -= sir[2]; aout -= sir[3]
                if (y == 0) vmin[x] = min(x + radius + 1, wm)
                val p = pixels[yw + vmin[x]]
                sir[0] = (p shr 16) and 0xff
                sir[1] = (p shr 8) and 0xff
                sir[2] = p and 0xff
                sir[3] = (p ushr 24) and 0xff
                rin += sir[0]; gin += sir[1]; bin += sir[2]; ain += sir[3]
                rsum += rin; gsum += gin; bsum += bin; asum += ain
                stackPointer = (stackPointer + 1) % div
                sir = stack[stackPointer % div]
                rout += sir[0]; gout += sir[1]; bout += sir[2]; aout += sir[3]
                rin -= sir[0]; gin -= sir[1]; bin -= sir[2]; ain -= sir[3]
                yi++
            }
            yw += w
        }

        for (x in 0 until w) {
            var rin = 0; var gin = 0; var bin = 0; var ain = 0
            var rout = 0; var gout = 0; var bout = 0; var aout = 0
            var rsum = 0; var gsum = 0; var bsum = 0; var asum = 0
            var yp = -radius * w
            for (i in -radius..radius) {
                yi = max(0, yp) + x
                val sir = stack[i + radius]
                sir[0] = red[yi]; sir[1] = green[yi]; sir[2] = blue[yi]; sir[3] = alpha[yi]
                val rbs = r1 - abs(i)
                rsum += red[yi] * rbs; gsum += green[yi] * rbs; bsum += blue[yi] * rbs; asum += alpha[yi] * rbs
                if (i > 0) {
                    rin += sir[0]; gin += sir[1]; bin += sir[2]; ain += sir[3]
                } else {
                    rout += sir[0]; gout += sir[1]; bout += sir[2]; aout += sir[3]
                }
                if (i < hm) yp += w
            }
            yi = x
            var stackPointer = radius
            for (y in 0 until h) {
                pixels[yi] = (table[asum] shl 24) or (table[rsum] shl 16) or (table[gsum] shl 8) or table[bsum]
                rsum -= rout; gsum -= gout; bsum -= bout; asum -= aout
                val stackStart = stackPointer - radius + div
                var sir = stack[stackStart % div]
                rout -= sir[0]; gout -= sir[1]; bout -= sir[2]; aout -= sir[3]
                if (x == 0) vmin[y] = min(y + r1, hm) * w
                val p = x + vmin[y]
                sir[0] = red[p]; sir[1] = green[p]; sir[2] = blue[p]; sir[3] = alpha[p]
                rin += sir[0]; gin += sir[1]; bin += sir[2]; ain += sir[3]
                rsum += rin; gsum += gin; bsum += bin; asum += ain
                stackPointer = (stackPointer + 1) % div
                sir = stack[stackPointer]
                rout += sir[0]; gout += sir[1]; bout += sir[2]; aout += sir[3]
                rin -= sir[0]; gin -= sir[1]; bin -= sir[2]; ain -= sir[3]
                yi += w
            }
        }
    }
}
