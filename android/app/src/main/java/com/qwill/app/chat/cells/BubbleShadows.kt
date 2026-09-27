package com.qwill.app.chat.cells

import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Rect
import android.graphics.RectF
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

class BubbleShadow(
    val bitmap: Bitmap,
    val margin: Int,
    val corner: Int,
    val spread: Float,
    val offsetY: Float,
    val color: Int,
)

object BubbleShadows {
    private class Spec(val offsetY: Float, val blur: Float, val spread: Float, val color: Int)

    private val FOREIGN = Spec(6f, 16f, -11f, 0x57000000)
    private val OWN = Spec(12f, 26f, -16f, (0xF2 shl 24) or (90 shl 16) or (120 shl 8) or 255)
    private var density = 0f
    private var foreign: BubbleShadow? = null
    private var own: BubbleShadow? = null
    private val source = Rect()
    private val target = RectF()

    fun of(isOwn: Boolean, density: Float): BubbleShadow {
        if (density != this.density) {
            this.density = density
            foreign = null
            own = null
        }
        return if (isOwn) own ?: build(OWN, true, density).also { own = it } else foreign ?: build(FOREIGN, false, density).also { foreign = it }
    }

    private fun build(spec: Spec, isOwn: Boolean, density: Float): BubbleShadow {
        val sigma = spec.blur / 2f * density
        val margin = ceil(sigma * 3f).toInt() + 1
        val big = max(0f, BubbleGeometry.RADIUS + spec.spread) * density
        val corner = ceil(max(big, 1f)).toInt() + 1
        val side = corner * 2 + 1
        val size = side + margin * 2
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ALPHA_8)
        val radius = max(0.5f, (sigma - 0.5f) / 0.57735f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF000000.toInt()
            if (sigma > 0f) maskFilter = BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL)
        }
        val small = max(0f, BubbleGeometry.RADIUS_TAIL + spec.spread) * density
        val path = Path()
        val rect = RectF(margin.toFloat(), margin.toFloat(), (margin + side).toFloat(), (margin + side).toFloat())
        path.addRoundRect(rect, radii(isOwn, big, small), Path.Direction.CW)
        Canvas(bitmap).drawPath(path, paint)
        return BubbleShadow(bitmap, margin, corner, -spec.spread * density, spec.offsetY * density, spec.color)
    }

    fun radii(isOwn: Boolean, big: Float, small: Float): FloatArray =
        if (isOwn) floatArrayOf(big, big, big, big, small, small, big, big) else floatArrayOf(big, big, big, big, big, big, small, small)

    fun draw(canvas: Canvas, shadow: BubbleShadow, bubble: RectF, paint: Paint) {
        val left = bubble.left + shadow.spread
        val top = bubble.top + shadow.spread + shadow.offsetY
        val right = bubble.right - shadow.spread
        val bottom = bubble.bottom - shadow.spread + shadow.offsetY
        if (right <= left || bottom <= top) return
        paint.color = shadow.color
        val m = shadow.margin
        val size = shadow.bitmap.width
        val cornerX = min(shadow.corner.toFloat(), (right - left) / 2f)
        val cornerY = min(shadow.corner.toFloat(), (bottom - top) / 2f)
        val srcCornerX = cornerX.toInt()
        val srcCornerY = cornerY.toInt()
        val xs = floatArrayOf(left - m, left + cornerX, right - cornerX, right + m)
        val ys = floatArrayOf(top - m, top + cornerY, bottom - cornerY, bottom + m)
        val sx = intArrayOf(0, m + srcCornerX, size - m - srcCornerX, size)
        val sy = intArrayOf(0, m + srcCornerY, size - m - srcCornerY, size)
        val midX = size / 2
        val midY = size / 2
        for (row in 0 until 3) {
            for (column in 0 until 3) {
                val srcLeft = if (column == 1) midX else sx[column]
                val srcRight = if (column == 1) midX + 1 else sx[column + 1]
                val srcTop = if (row == 1) midY else sy[row]
                val srcBottom = if (row == 1) midY + 1 else sy[row + 1]
                target.set(xs[column], ys[row], xs[column + 1], ys[row + 1])
                if (target.width() <= 0f || target.height() <= 0f) continue
                source.set(srcLeft, srcTop, srcRight, srcBottom)
                canvas.drawBitmap(shadow.bitmap, source, target, paint)
            }
        }
    }
}
