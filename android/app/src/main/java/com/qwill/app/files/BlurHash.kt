package com.qwill.app.files

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.pow

object BlurHash {
    const val SIDE = 32
    private const val CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~"

    fun decodeRgba(hash: String?, width: Int = SIDE, height: Int = SIDE): ByteArray? {
        if (!MediaTypes.isBlurhash(hash)) return null
        val value = hash!!
        val sizeFlag = decode83(value, 0, 1) ?: return null
        val numY = sizeFlag / 9 + 1
        val numX = sizeFlag % 9 + 1
        if (value.length != 4 + 2 * numX * numY) return null
        val quantisedMaximum = decode83(value, 1, 2) ?: return null
        val maximum = (quantisedMaximum + 1) / 166.0
        val colors = Array(numX * numY) { DoubleArray(3) }
        for (index in colors.indices) {
            colors[index] = if (index == 0) {
                decodeDc(decode83(value, 2, 6) ?: return null)
            } else {
                decodeAc(decode83(value, 4 + index * 2, 6 + index * 2) ?: return null, maximum)
            }
        }
        val pixels = ByteArray(width * height * 4)
        val cosX = Array(numX) { i -> DoubleArray(width) { x -> cos(PI * x * i / width) } }
        val cosY = Array(numY) { j -> DoubleArray(height) { y -> cos(PI * y * j / height) } }
        for (y in 0 until height) {
            for (x in 0 until width) {
                var r = 0.0
                var g = 0.0
                var b = 0.0
                for (j in 0 until numY) {
                    for (i in 0 until numX) {
                        val basis = cosX[i][x] * cosY[j][y]
                        val color = colors[i + j * numX]
                        r += color[0] * basis
                        g += color[1] * basis
                        b += color[2] * basis
                    }
                }
                val offset = (y * width + x) * 4
                pixels[offset] = linearToSrgb(r).toByte()
                pixels[offset + 1] = linearToSrgb(g).toByte()
                pixels[offset + 2] = linearToSrgb(b).toByte()
                pixels[offset + 3] = 255.toByte()
            }
        }
        return pixels
    }

    fun rgbaToArgb(rgba: ByteArray): IntArray = IntArray(rgba.size / 4) { index ->
        val offset = index * 4
        val r = rgba[offset].toInt() and 0xFF
        val g = rgba[offset + 1].toInt() and 0xFF
        val b = rgba[offset + 2].toInt() and 0xFF
        (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    }

    private fun decode83(value: String, from: Int, to: Int): Int? {
        var result = 0
        for (index in from until to) {
            val digit = CHARACTERS.indexOf(value[index])
            if (digit < 0) return null
            result = result * 83 + digit
        }
        return result
    }

    private fun decodeDc(value: Int): DoubleArray =
        doubleArrayOf(srgbToLinear(value shr 16), srgbToLinear((value shr 8) and 255), srgbToLinear(value and 255))

    private fun decodeAc(value: Int, maximum: Double): DoubleArray {
        val quantR = floor(value / (19.0 * 19.0)).toInt()
        val quantG = floor(value / 19.0).toInt() % 19
        val quantB = value % 19
        return doubleArrayOf(
            signPow((quantR - 9) / 9.0, 2.0) * maximum,
            signPow((quantG - 9) / 9.0, 2.0) * maximum,
            signPow((quantB - 9) / 9.0, 2.0) * maximum,
        )
    }

    private fun srgbToLinear(value: Int): Double {
        val v = value / 255.0
        return if (v <= 0.04045) v / 12.92 else ((v + 0.055) / 1.055).pow(2.4)
    }

    private fun linearToSrgb(value: Double): Int {
        val v = value.coerceIn(0.0, 1.0)
        return if (v <= 0.0031308) {
            (v * 12.92 * 255 + 0.5).toInt()
        } else {
            ((1.055 * v.pow(1 / 2.4) - 0.055) * 255 + 0.5).toInt()
        }
    }

    private fun signPow(value: Double, exponent: Double): Double =
        (if (value < 0) -1.0 else 1.0) * abs(value).pow(exponent)
}
