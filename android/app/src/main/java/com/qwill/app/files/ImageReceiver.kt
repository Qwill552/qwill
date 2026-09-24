package com.qwill.app.files

import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.SystemClock
import android.view.View
import com.qwill.app.net.RequestGuid
import com.qwill.app.ui.theme.Motion

class ImageReceiver(private val view: View, private val loader: ImageLoader) {
    private var request: FileRequest? = null
    private var blurhash: String? = null
    private var widthPx = 0
    private var isSmall = false
    private var priority = FilePriority.HIGH
    private var guid = RequestGuid.NONE
    private var attached = false
    private var held = false
    private var handle: ImageHandle? = null
    private var image: Bitmap? = null
    private var blur: Bitmap? = null
    private var fadeStartedAt = 0L
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val shaderMatrix = Matrix()
    private val scratch = RectF()
    private val shaders = HashMap<Bitmap, BitmapShader>(2)

    val hasImage: Boolean get() = image != null

    val hasPlaceholder: Boolean get() = blur != null

    var lastSource: FileSource? = null
        private set

    fun setImage(
        next: FileRequest?,
        hash: String?,
        targetWidthPx: Int,
        small: Boolean = false,
        loadPriority: FilePriority = FilePriority.HIGH,
        ownerGuid: Int = RequestGuid.NONE,
    ) {
        val same = next?.fileId == request?.fileId && targetWidthPx == widthPx && hash == blurhash
        if (same) return
        release()
        request = next
        blurhash = hash
        widthPx = targetWidthPx
        isSmall = small
        priority = loadPriority
        guid = ownerGuid
        image = next?.let { loader.cached(it.fileId, targetWidthPx, small) }
        lastSource = if (image != null) FileSource.MEMORY else null
        blur = loader.cachedBlur(hash)
        fadeStartedAt = 0L
        if (attached) requestLoad()
        view.invalidate()
    }

    fun setHoldLoading(hold: Boolean) {
        if (held == hold) return
        held = hold
        if (!hold && attached) requestLoad()
    }

    fun onAttach() {
        attached = true
        requestLoad()
    }

    fun onDetach() {
        attached = false
        handle?.let { loader.cancel(it) }
        handle = null
    }

    fun draw(canvas: Canvas, rect: RectF, radius: Float) {
        val current = image
        val placeholder = blur
        val alpha = fadeAlpha()
        if (placeholder != null && (current == null || alpha < 255)) paintBitmap(canvas, placeholder, rect, radius, 255)
        if (current != null) paintBitmap(canvas, current, rect, radius, alpha)
        if (current != null && alpha < 255) view.postInvalidateOnAnimation()
    }

    private fun requestLoad() {
        val target = request ?: return
        if (image == null && handle == null && !held) {
            handle = loader.load(target, widthPx, isSmall, priority, guid) { bitmap, source ->
                handle = null
                if (request?.fileId != target.fileId) return@load
                image = bitmap
                lastSource = source
                fadeStartedAt = if (blur != null && Motion.duration(Motion.MEDIA_FADE) > 0) SystemClock.uptimeMillis() else 0L
                view.invalidate()
            }
        }
        if (blur == null && blurhash != null) {
            val wanted = blurhash
            loader.decodeBlur(wanted) { bitmap ->
                if (blurhash != wanted || bitmap == null) return@decodeBlur
                blur = bitmap
                view.invalidate()
            }
        }
    }

    private fun release() {
        handle?.let { loader.cancel(it) }
        handle = null
        image = null
        blur = null
        shaders.clear()
    }

    private fun fadeAlpha(): Int {
        if (fadeStartedAt == 0L) return 255
        val duration = Motion.duration(Motion.MEDIA_FADE)
        if (duration <= 0) return 255
        val progress = (SystemClock.uptimeMillis() - fadeStartedAt).toFloat() / duration
        if (progress >= 1f) {
            fadeStartedAt = 0L
            return 255
        }
        return (progress.coerceIn(0f, 1f) * 255).toInt()
    }

    private fun paintBitmap(canvas: Canvas, bitmap: Bitmap, rect: RectF, radius: Float, alpha: Int) {
        val scale = maxOf(rect.width() / bitmap.width, rect.height() / bitmap.height)
        val dx = rect.left + (rect.width() - bitmap.width * scale) / 2
        val dy = rect.top + (rect.height() - bitmap.height * scale) / 2
        shaderMatrix.setScale(scale, scale)
        shaderMatrix.postTranslate(dx, dy)
        val shader = shaders.getOrPut(bitmap) { BitmapShader(bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
        shader.setLocalMatrix(shaderMatrix)
        paint.shader = shader
        paint.alpha = alpha
        scratch.set(rect)
        if (radius > 0) canvas.drawRoundRect(scratch, radius, radius, paint) else canvas.drawRect(scratch, paint)
        paint.shader = null
    }
}
