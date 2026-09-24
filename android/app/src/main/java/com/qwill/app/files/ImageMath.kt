package com.qwill.app.files

import kotlin.math.roundToInt

data class PixelSize(val width: Int, val height: Int) {
    val longSide: Int get() = maxOf(width, height)
}

class ExifTransform(val rotationDegrees: Int, val mirrored: Boolean) {
    val swapsSides: Boolean get() = rotationDegrees == 90 || rotationDegrees == 270
}

object ImageMath {
    const val THUMBNAIL_MAX_DIMENSION = 1280
    const val THUMBNAIL_JPEG_QUALITY = 85
    const val PREVIEW_MAX_DIMENSION = 512
    const val PREVIEW_JPEG_QUALITY = 70
    const val AVATAR_MAX_DIMENSION = 1024
    const val AVATAR_JPEG_QUALITY = 90

    fun fit(size: PixelSize, maxSide: Int): PixelSize {
        if (size.longSide <= maxSide || size.longSide <= 0) return size
        val scale = maxSide.toDouble() / size.longSide
        return PixelSize(maxOf(1, (size.width * scale).roundToInt()), maxOf(1, (size.height * scale).roundToInt()))
    }

    fun needsPreview(size: PixelSize): Boolean = size.longSide > PREVIEW_MAX_DIMENSION

    fun sampleSize(source: PixelSize, target: PixelSize): Int {
        if (target.width <= 0 || target.height <= 0) return 1
        var sample = 1
        while (source.width / (sample * 2) >= target.width && source.height / (sample * 2) >= target.height) sample *= 2
        return sample
    }

    fun sampleSizeForWidth(source: PixelSize, targetWidth: Int): Int {
        if (targetWidth <= 0) return 1
        var sample = 1
        while (source.width / (sample * 2) >= targetWidth) sample *= 2
        return sample
    }

    fun halvingSteps(from: PixelSize, to: PixelSize): List<PixelSize> {
        val steps = ArrayList<PixelSize>()
        var width = from.width
        var height = from.height
        while (width / 2 >= to.width && height / 2 >= to.height && width / 2 > 0 && height / 2 > 0) {
            width /= 2
            height /= 2
            if (width == to.width && height == to.height) break
            steps.add(PixelSize(width, height))
        }
        steps.add(to)
        return steps
    }

    fun exifTransform(orientation: Int): ExifTransform = when (orientation) {
        2 -> ExifTransform(0, mirrored = true)
        3 -> ExifTransform(180, mirrored = false)
        4 -> ExifTransform(180, mirrored = true)
        5 -> ExifTransform(90, mirrored = true)
        6 -> ExifTransform(90, mirrored = false)
        7 -> ExifTransform(270, mirrored = true)
        8 -> ExifTransform(270, mirrored = false)
        else -> ExifTransform(0, mirrored = false)
    }

    fun oriented(size: PixelSize, orientation: Int): PixelSize =
        if (exifTransform(orientation).swapsSides) PixelSize(size.height, size.width) else size

    fun videoSize(width: Int, height: Int, rotationDegrees: Int): PixelSize {
        val normalized = ((rotationDegrees % 360) + 360) % 360
        return if (normalized == 90 || normalized == 270) PixelSize(height, width) else PixelSize(width, height)
    }

    fun decodeTarget(source: PixelSize, orientation: Int, targetWidth: Int): PixelSize {
        val shown = oriented(source, orientation)
        if (targetWidth <= 0 || shown.width <= targetWidth) return shown
        val height = maxOf(1, (shown.height.toLong() * targetWidth / shown.width).toInt())
        return PixelSize(targetWidth, height)
    }
}
