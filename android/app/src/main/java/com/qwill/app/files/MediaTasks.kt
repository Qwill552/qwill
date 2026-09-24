package com.qwill.app.files

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.MediaMetadataRetriever
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest

class PreparedMedia(
    val width: Int?,
    val height: Int?,
    val durationMs: Int?,
    val thumb: File?,
    val preview: File?,
)

object MediaTasks {
    const val HASH_CHUNK_BYTES = 8 * 1024 * 1024
    const val THUMB_NAME = "thumb.jpg"
    const val PREVIEW_NAME = "preview.jpg"

    fun sha256(file: File, cancelled: () -> Boolean = { false }): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val buffer = ByteArray(HASH_CHUNK_BYTES)
        FileInputStream(file).use { input ->
            while (true) {
                if (cancelled()) throw CancelledTransfer()
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    fun preparePhoto(source: File, outDir: File): PreparedMedia {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(source.path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return PreparedMedia(null, null, null, null, null)
        val orientation = ImageLoader.readOrientation(source)
        val shown = ImageMath.oriented(PixelSize(bounds.outWidth, bounds.outHeight), orientation)
        val thumbSize = ImageMath.fit(shown, ImageMath.THUMBNAIL_MAX_DIMENSION)
        val options = BitmapFactory.Options().apply { inSampleSize = ImageMath.sampleSize(shown, thumbSize) }
        val decoded = BitmapFactory.decodeFile(source.path, options) ?: return PreparedMedia(shown.width, shown.height, null, null, null)
        val upright = ImageLoader.transform(decoded, orientation, 0)
        return writeAssets(upright, shown, null, outDir)
    }

    fun prepareVideo(source: File, outDir: File): PreparedMedia {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(source.path)
            val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
            val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
            val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
            val shown = ImageMath.videoSize(width, height, rotation)
            val duration = durationMs.toInt().takeIf { it > 0 }
            val frame = retriever.getFrameAtTime(durationMs * 1000 / 2, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                ?: return PreparedMedia(shown.width.takeIf { it > 0 }, shown.height.takeIf { it > 0 }, duration, null, null)
            val upright = uprightFrame(frame, shown, rotation)
            val size = if (shown.width > 0 && shown.height > 0) shown else PixelSize(upright.width, upright.height)
            return writeAssets(upright, size, duration, outDir)
        } catch (e: RuntimeException) {
            return PreparedMedia(null, null, null, null, null)
        } finally {
            try {
                retriever.release()
            } catch (ignored: Exception) {
            }
        }
    }

    fun compressAvatar(source: File, target: File): PixelSize? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(source.path, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val orientation = ImageLoader.readOrientation(source)
        val shown = ImageMath.oriented(PixelSize(bounds.outWidth, bounds.outHeight), orientation)
        val size = ImageMath.fit(shown, ImageMath.AVATAR_MAX_DIMENSION)
        val options = BitmapFactory.Options().apply { inSampleSize = ImageMath.sampleSize(shown, size) }
        val decoded = BitmapFactory.decodeFile(source.path, options) ?: return null
        val scaled = downscale(ImageLoader.transform(decoded, orientation, 0), size)
        writeJpeg(scaled, target, ImageMath.AVATAR_JPEG_QUALITY)
        return size
    }

    private fun writeAssets(upright: Bitmap, shown: PixelSize, durationMs: Int?, outDir: File): PreparedMedia {
        outDir.mkdirs()
        val thumbSize = ImageMath.fit(PixelSize(upright.width, upright.height), ImageMath.THUMBNAIL_MAX_DIMENSION)
        val thumbBitmap = downscale(upright, thumbSize)
        val thumb = File(outDir, THUMB_NAME)
        writeJpeg(thumbBitmap, thumb, ImageMath.THUMBNAIL_JPEG_QUALITY)
        var preview: File? = null
        if (ImageMath.needsPreview(shown)) {
            val previewBitmap = downscale(thumbBitmap, ImageMath.fit(thumbSize, ImageMath.PREVIEW_MAX_DIMENSION))
            preview = File(outDir, PREVIEW_NAME)
            writeJpeg(previewBitmap, preview, ImageMath.PREVIEW_JPEG_QUALITY)
        }
        return PreparedMedia(shown.width, shown.height, durationMs, thumb, preview)
    }

    private fun uprightFrame(frame: Bitmap, shown: PixelSize, rotation: Int): Bitmap {
        val normalized = ((rotation % 360) + 360) % 360
        if (normalized == 0 || shown.width <= 0 || shown.height <= 0) return frame
        val framePortrait = frame.height > frame.width
        val shownPortrait = shown.height > shown.width
        if (framePortrait == shownPortrait) return frame
        val matrix = Matrix().apply { postRotate(normalized.toFloat()) }
        return Bitmap.createBitmap(frame, 0, 0, frame.width, frame.height, matrix, true)
    }

    private fun downscale(bitmap: Bitmap, target: PixelSize): Bitmap {
        if (bitmap.width <= target.width && bitmap.height <= target.height) return bitmap
        var current = bitmap
        for (step in ImageMath.halvingSteps(PixelSize(bitmap.width, bitmap.height), target)) {
            current = Bitmap.createScaledBitmap(current, step.width, step.height, true)
        }
        return current
    }

    private fun writeJpeg(bitmap: Bitmap, target: File, quality: Int) {
        val temp = File(target.path + ".part")
        FileOutputStream(temp).use { out ->
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) throw IOException("не удалось сжать картинку")
            out.fd.sync()
        }
        if (!temp.renameTo(target)) throw IOException("не удалось сохранить картинку")
    }
}
