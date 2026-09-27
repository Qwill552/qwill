package com.qwill.app.chat.wallpaper

import android.animation.ValueAnimator
import android.content.Context
import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.util.Log
import android.view.View
import com.qwill.app.QwillApplication
import com.qwill.app.core.DispatchQueue
import com.qwill.app.core.MainQueue
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import java.io.IOException
import java.nio.ByteBuffer
import kotlin.math.roundToInt

data class WallpaperKey(
    val width: Int,
    val height: Int,
    val density: Float,
    val dark: Boolean,
    val patternId: String,
    val gradientId: String,
)

object ChatWallpaper {
    private const val TAG = "QwillWallpaper"
    private val queue by lazy { DispatchQueue("wallpaperQueue") }
    private var cachedKey: WallpaperKey? = null
    private var cachedBitmap: Bitmap? = null
    private var buildingKey: WallpaperKey? = null
    private val waiters = ArrayList<(WallpaperKey, Bitmap?) -> Unit>()
    private var parsedId: String? = null
    private var parsed: PatternData? = null

    fun keyFor(context: Context, width: Int, height: Int): WallpaperKey {
        val preferences = QwillApplication.files.preferences
        return WallpaperKey(
            width = width,
            height = height,
            density = context.resources.displayMetrics.density,
            dark = Theme.isDark,
            patternId = Wallpapers.patternId(preferences),
            gradientId = Wallpapers.gradientId(preferences),
        )
    }

    fun cached(key: WallpaperKey): Bitmap? = if (cachedKey == key) cachedBitmap else null

    fun request(assets: AssetManager, key: WallpaperKey, ink: Int, callback: (WallpaperKey, Bitmap?) -> Unit) {
        cached(key)?.let {
            callback(key, it)
            return
        }
        waiters.add(callback)
        if (buildingKey == key) return
        buildingKey = key
        val blend = if (key.dark) PatternBlend.SOFT_LIGHT else PatternBlend.MULTIPLY
        queue.post {
            val bitmap = try {
                build(assets, key, ink, blend)
            } catch (e: OutOfMemoryError) {
                Log.w(TAG, "обоям не хватило памяти", e)
                null
            }
            MainQueue.post { finish(key, bitmap) }
        }
    }

    fun cancel(callback: (WallpaperKey, Bitmap?) -> Unit) {
        waiters.remove(callback)
    }

    private fun finish(key: WallpaperKey, bitmap: Bitmap?) {
        if (buildingKey == key) buildingKey = null
        if (bitmap != null) {
            cachedKey = key
            cachedBitmap = bitmap
        }
        val pending = ArrayList(waiters)
        waiters.clear()
        for (waiter in pending) waiter(key, bitmap)
    }

    private fun build(assets: AssetManager, key: WallpaperKey, ink: Int, blend: PatternBlend): Bitmap {
        val pixels = WallpaperPainter.gradient(key.width, key.height, Wallpapers.gradient(key.gradientId, key.dark))
        val pattern = pattern(assets, key.patternId)
        if (pattern != null) {
            val tileWidth = (Wallpapers.TILE_WIDTH * key.density).roundToInt().coerceAtLeast(1)
            val tileHeight = (Wallpapers.TILE_HEIGHT * key.density).roundToInt().coerceAtLeast(1)
            val mask = Bitmap.createBitmap(tileWidth, tileHeight, Bitmap.Config.ALPHA_8)
            drawPattern(Canvas(mask), pattern, tileWidth / pattern.width, tileHeight / pattern.height)
            val buffer = ByteBuffer.allocate(mask.rowBytes * tileHeight)
            mask.copyPixelsToBuffer(buffer)
            mask.recycle()
            WallpaperPainter.applyPattern(pixels, key.width, key.height, buffer.array(), tileWidth, tileHeight, mask.rowBytes, ink, blend)
        }
        return Bitmap.createBitmap(pixels, key.width, key.height, Bitmap.Config.ARGB_8888)
    }

    private fun pattern(assets: AssetManager, id: String): PatternData? {
        if (parsedId == id) return parsed
        val data = try {
            PatternSvg.parse(assets.open(Wallpapers.assetOf(id)).use { it.readBytes().toString(Charsets.UTF_8) })
        } catch (e: IOException) {
            Log.w(TAG, "узор $id не прочитался", e)
            null
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "узор $id не разобрался", e)
            null
        }
        parsedId = id
        parsed = data
        return data
    }

    private fun drawPattern(canvas: Canvas, pattern: PatternData, scaleX: Float, scaleY: Float) {
        canvas.scale(scaleX, scaleY)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFF000000.toInt() }
        val path = Path()
        for (shape in pattern.shapes) {
            path.reset()
            for (op in shape.ops) {
                when (op) {
                    is PathOp.MoveTo -> path.moveTo(op.x, op.y)
                    is PathOp.LineTo -> path.lineTo(op.x, op.y)
                    is PathOp.CubicTo -> path.cubicTo(op.x1, op.y1, op.x2, op.y2, op.x, op.y)
                    is PathOp.QuadTo -> path.quadTo(op.x1, op.y1, op.x, op.y)
                    PathOp.Close -> path.close()
                }
            }
            if (shape.fill) {
                path.fillType = if (shape.evenOdd) Path.FillType.EVEN_ODD else Path.FillType.WINDING
                paint.style = Paint.Style.FILL
                paint.pathEffect = null
                canvas.drawPath(path, paint)
            }
            if (shape.stroke) {
                paint.style = Paint.Style.STROKE
                paint.strokeWidth = shape.strokeWidth
                paint.strokeCap = if (shape.roundCap) Paint.Cap.ROUND else Paint.Cap.BUTT
                paint.strokeJoin = if (shape.roundJoin) Paint.Join.ROUND else Paint.Join.MITER
                paint.strokeMiter = shape.miterLimit
                paint.pathEffect = shape.dash?.let { DashPathEffect(it, 0f) }
                canvas.drawPath(path, paint)
            }
        }
    }
}

class ChatWallpaperView(context: Context) : View(context) {
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private var bitmap: Bitmap? = null
    private var previous: Bitmap? = null
    private var key: WallpaperKey? = null
    private var fade = 1f
    private var fadeAnimator: ValueAnimator? = null
    private val onReady: (WallpaperKey, Bitmap?) -> Unit = { ready, image ->
        if (ready == key && image != null) show(image)
    }

    fun refresh() {
        if (width <= 0 || height <= 0) return
        val next = ChatWallpaper.keyFor(context, width, height)
        if (next == key && bitmap != null) return
        key = next
        val ready = ChatWallpaper.cached(next)
        if (ready != null) {
            fadeAnimator?.cancel()
            bitmap = ready
            previous = null
            fade = 1f
            invalidate()
            return
        }
        ChatWallpaper.request(context.assets, next, Theme.palette.chatPatternInk, onReady)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        refresh()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        ChatWallpaper.cancel(onReady)
        fadeAnimator?.cancel()
        fade = 1f
        previous = null
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        key = null
        refresh()
    }

    private fun show(image: Bitmap) {
        previous = bitmap
        bitmap = image
        fadeAnimator?.cancel()
        val duration = Motion.duration(FADE_MS)
        if (duration <= 0 || !isAttachedToWindow) {
            fade = 1f
            previous = null
            invalidate()
            return
        }
        fade = 0f
        fadeAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            this.duration = duration
            addUpdateListener {
                fade = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onDraw(canvas: Canvas) {
        val current = bitmap
        val old = previous
        if (old != null && old.width == width && old.height == height) {
            paint.alpha = 255
            canvas.drawBitmap(old, 0f, 0f, paint)
        } else if (current == null || fade < 1f) {
            canvas.drawColor(Theme.palette.chatBg)
        }
        if (current != null && current.width == width && current.height == height) {
            paint.alpha = (fade * 255f).roundToInt()
            canvas.drawBitmap(current, 0f, 0f, paint)
        }
        if (fade >= 1f) previous = null
    }

    private companion object {
        const val FADE_MS = 160L
    }
}
