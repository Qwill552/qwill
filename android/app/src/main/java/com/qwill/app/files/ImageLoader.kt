package com.qwill.app.files

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.util.LruCache
import com.qwill.app.core.TaskQueue
import com.qwill.app.net.ApiException
import java.io.File
import java.io.IOException

fun interface ImageListener {
    fun onImage(bitmap: Bitmap, source: FileSource)
}

class ImageHandle internal constructor(val key: String) {
    @Volatile
    var active = true
        internal set

    internal var file: FileSubscription? = null
}

class ImageLoader(
    private val files: FileLoader,
    private val imageQueue: TaskQueue,
    private val main: TaskQueue,
    memoryClassMb: Int,
) {
    private val totalBytes = memoryBudget(memoryClassMb)
    private val general = bitmapCache((totalBytes * GENERAL_SHARE).toInt())
    private val small = bitmapCache((totalBytes * (1 - GENERAL_SHARE)).toInt())
    private val blurs = LruCache<String, Bitmap>(BLURHASH_CACHE_LIMIT)

    val memoryBytes: Int get() = general.size() + small.size()

    val memoryBudgetBytes: Int get() = totalBytes

    fun cached(fileId: String, widthPx: Int, isSmall: Boolean): Bitmap? = cacheFor(isSmall).get(keyOf(fileId, widthPx))

    fun cachedBlur(hash: String?): Bitmap? = hash?.let { blurs.get(it) }

    fun decodeBlur(hash: String?, done: (Bitmap?) -> Unit) {
        if (hash == null || !MediaTypes.isBlurhash(hash)) {
            done(null)
            return
        }
        blurs.get(hash)?.let {
            done(it)
            return
        }
        imageQueue.post {
            val pixels = BlurHash.decodeRgba(hash)
            val bitmap = pixels?.let {
                Bitmap.createBitmap(BlurHash.rgbaToArgb(it), BlurHash.SIDE, BlurHash.SIDE, Bitmap.Config.ARGB_8888)
            }
            if (bitmap != null) blurs.put(hash, bitmap)
            main.post { done(bitmap) }
        }
    }

    fun load(
        request: FileRequest,
        widthPx: Int,
        isSmall: Boolean,
        priority: FilePriority,
        guid: Int,
        listener: ImageListener,
    ): ImageHandle {
        val key = keyOf(request.fileId, widthPx)
        val handle = ImageHandle(key)
        cacheFor(isSmall).get(key)?.let {
            handle.active = false
            listener.onImage(it, FileSource.MEMORY)
            return handle
        }
        handle.file = files.load(
            request,
            priority,
            guid,
            object : FileLoadListener {
                override fun onReady(file: File, source: FileSource) {
                    if (!handle.active) return
                    imageQueue.post {
                        val bitmap = cacheFor(isSmall).get(key) ?: decode(file, widthPx)?.also { cacheFor(isSmall).put(key, it) }
                        main.post {
                            if (!handle.active || bitmap == null) return@post
                            handle.active = false
                            listener.onImage(bitmap, source)
                        }
                    }
                }

                override fun onFailed(error: ApiException) {
                    handle.active = false
                }
            },
        )
        return handle
    }

    fun cancel(handle: ImageHandle) {
        handle.active = false
        handle.file?.let { files.cancel(it) }
    }

    fun clear() {
        general.evictAll()
        small.evictAll()
        blurs.evictAll()
    }

    private fun cacheFor(isSmall: Boolean): LruCache<String, Bitmap> = if (isSmall) small else general

    private fun keyOf(fileId: String, widthPx: Int): String = "$fileId@$widthPx"

    companion object {
        private const val GENERAL_SHARE = 0.8
        private const val BLURHASH_CACHE_LIMIT = 150
        private const val MB = 1024 * 1024

        fun memoryBudget(memoryClassMb: Int): Int {
            val share = memoryClassMb.toLong() * MB / 7
            val cap = if (memoryClassMb >= 192) 30L * MB else 15L * MB
            return minOf(cap, share).toInt()
        }

        fun decode(file: File, targetWidth: Int): Bitmap? {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.path, bounds)
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
            val orientation = readOrientation(file)
            val source = PixelSize(bounds.outWidth, bounds.outHeight)
            val shown = ImageMath.oriented(source, orientation)
            val sample = ImageMath.sampleSizeForWidth(shown, targetWidth)
            val options = BitmapFactory.Options().apply { inSampleSize = sample }
            val decoded = try {
                BitmapFactory.decodeFile(file.path, options)
            } catch (e: OutOfMemoryError) {
                null
            } ?: return null
            return transform(decoded, orientation, targetWidth)
        }

        fun readOrientation(file: File): Int = try {
            ExifInterface(file.path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        } catch (e: IOException) {
            ExifInterface.ORIENTATION_NORMAL
        } catch (e: RuntimeException) {
            ExifInterface.ORIENTATION_NORMAL
        }

        fun transform(bitmap: Bitmap, orientation: Int, targetWidth: Int): Bitmap {
            val exif = ImageMath.exifTransform(orientation)
            val shownWidth = if (exif.swapsSides) bitmap.height else bitmap.width
            val scale = if (targetWidth in 1 until shownWidth) targetWidth.toFloat() / shownWidth else 1f
            if (exif.rotationDegrees == 0 && !exif.mirrored && scale == 1f) return bitmap
            val matrix = Matrix()
            if (scale != 1f) matrix.postScale(scale, scale)
            if (exif.mirrored) matrix.postScale(-1f, 1f)
            if (exif.rotationDegrees != 0) matrix.postRotate(exif.rotationDegrees.toFloat())
            val result = try {
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            } catch (e: OutOfMemoryError) {
                return bitmap
            }
            if (result !== bitmap) bitmap.recycle()
            return result
        }

        private fun bitmapCache(maxBytes: Int): LruCache<String, Bitmap> = object : LruCache<String, Bitmap>(maxOf(1, maxBytes)) {
            override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount
        }
    }
}
