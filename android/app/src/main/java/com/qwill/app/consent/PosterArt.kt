package com.qwill.app.consent

import android.content.res.Resources
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Region
import android.graphics.Shader
import com.qwill.app.R
import com.qwill.app.ui.theme.PosterColors
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class BodyLayer(val bitmap: Bitmap, val left: Float, val top: Float, val width: Float, val height: Float)

class PosterBody(val layers: List<BodyLayer>, val bleed: Float)

class PosterArtSet(
    val cloud: PosterBody,
    val lock: PosterBody,
    val scroll: PosterBody,
    val stars: List<PosterBody>,
    val smoke: Bitmap?,
) {
    fun recycle() {
        val all = ArrayList<Bitmap>()
        for (body in listOf(cloud, lock, scroll) + stars) body.layers.mapTo(all) { it.bitmap }
        smoke?.let { all.add(it) }
        for (bitmap in all.distinct()) bitmap.recycle()
    }
}

object PosterArt {
    private const val BLUR_SCALE = 0.5f
    private const val GOO_BLUR = 13f
    private const val PUFF_BLUR = 9f
    private const val CLOUD_BLEED = 40f
    private const val SMOKE_SOURCE_WIDTH = 1654

    private val STAR_TINTS: List<(PosterColors) -> Int> = listOf(
        { it.pink }, { it.sky }, { it.lav }, { it.mint }, { it.hot }, { it.pink }, { it.sky }, { it.lav },
    )

    fun render(resources: Resources, metrics: PosterMetrics, colors: PosterColors): PosterArtSet {
        val artU = metrics.artU
        val stars = PosterMetrics.STARS.mapIndexed { index, spec -> star(artU * spec.size, colors.star, STAR_TINTS[index](colors)) }
        return PosterArtSet(
            cloud = cloud(artU, colors),
            lock = lock(artU, colors),
            scroll = scroll(artU, colors),
            stars = stars,
            smoke = smoke(resources, metrics.largestSmokeWidth()),
        )
    }

    fun gooColor(colors: PosterColors): Int {
        val steps = ArrayList<ColorMatrix5>()
        steps.add(CssFilters.posterGooContrast)
        if (colors.isDark) steps.addAll(CssFilters.posterCloudNight)
        return CssFilters.applyEach(colors.cloud1, steps)
    }

    private fun cloud(artU: Float, colors: PosterColors): PosterBody {
        val bleed = CLOUD_BLEED * artU
        val fullW = PosterMetrics.CLOUD_W * artU + 2f * bleed
        val fullH = PosterMetrics.CLOUD_H * artU + 2f * bleed
        val goo = blurredLayer(fullW, fullH, GOO_BLUR * artU) { canvas ->
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = gooColor(colors) }
            for (shape in GOO_SHAPES) canvas.drawOval(shape.rect(artU, bleed), paint)
        }
        val puff = blurredLayer(fullW, fullH, PUFF_BLUR * artU) { canvas ->
            for (spec in PUFFS) drawPuff(canvas, spec, artU, bleed, colors)
        }
        val face = bitmap(fullW, fullH) { canvas -> drawFace(canvas, artU, bleed, colors) }
        return PosterBody(
            listOf(
                BodyLayer(goo, 0f, 0f, fullW, fullH),
                BodyLayer(puff, 0f, 0f, fullW, fullH),
                BodyLayer(face, 0f, 0f, fullW, fullH),
            ),
            bleed,
        )
    }

    private fun blurredLayer(fullW: Float, fullH: Float, sigma: Float, draw: (Canvas) -> Unit): Bitmap {
        val width = max(1, ceil(fullW * BLUR_SCALE).toInt())
        val height = max(1, ceil(fullH * BLUR_SCALE).toInt())
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.scale(BLUR_SCALE, BLUR_SCALE)
        draw(canvas)
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        GaussianBlur.blurArgb(pixels, width, height, sigma * BLUR_SCALE)
        bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
        return bitmap
    }

    private fun bitmap(fullW: Float, fullH: Float, draw: (Canvas) -> Unit): Bitmap {
        val bitmap = Bitmap.createBitmap(max(1, ceil(fullW).toInt()), max(1, ceil(fullH).toInt()), Bitmap.Config.ARGB_8888)
        draw(Canvas(bitmap))
        return bitmap
    }

    private class Shape(val left: Float, val top: Float, val width: Float, val height: Float) {
        fun rect(artU: Float, bleed: Float): RectF = RectF(
            bleed + left * artU,
            bleed + top * artU,
            bleed + (left + width) * artU,
            bleed + (top + height) * artU,
        )
    }

    private val GOO_SHAPES = listOf(
        Shape(6f, 78f, 236f, 236f),
        Shape(256f, 84f, 214f, 214f),
        Shape(196f, 130f, 190f, 190f),
        Shape(112f, 0f, 278f, 278f),
        Shape(60f, 110f, 330f, 170f),
    )

    private class Puff(val shape: Shape, val atX: Float, val atY: Float, val middle: Float, val ellipse: Boolean = false, val opacity: Float = 1f)

    private val PUFFS = listOf(
        Puff(Shape(22f, 88f, 214f, 214f), 0.36f, 0.24f, 0.40f),
        Puff(Shape(264f, 94f, 194f, 194f), 0.34f, 0.22f, 0.38f),
        Puff(Shape(204f, 136f, 172f, 172f), 0.38f, 0.24f, 0.42f),
        Puff(Shape(124f, 12f, 254f, 254f), 0.34f, 0.18f, 0.36f),
        Puff(Shape(48f, 180f, 356f, 128f), 0.5f, 0.2f, 0f, ellipse = true, opacity = 0.8f),
    )

    private fun drawPuff(canvas: Canvas, puff: Puff, artU: Float, bleed: Float, colors: PosterColors) {
        val rect = puff.shape.rect(artU, bleed)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        val w = rect.width()
        val h = rect.height()
        canvas.save()
        canvas.translate(rect.left, rect.top)
        if (puff.ellipse) {
            val shape = CssGradient.ellipseFarthestCorner(w, h, puff.atX, puff.atY)
            val transparentEdge = colors.cloud3 and 0xFFFFFF
            paint.shader = RadialGradient(0f, 0f, shape.radiusX, intArrayOf(transparentEdge, colors.cloud3), floatArrayOf(0f, 1f), Shader.TileMode.CLAMP)
            paint.shader.setLocalMatrix(
                android.graphics.Matrix().apply {
                    setScale(1f, shape.radiusY / shape.radiusX)
                    postTranslate(shape.centerX, shape.centerY)
                },
            )
            paint.alpha = (puff.opacity * 255).roundToInt()
        } else {
            val shape = CssGradient.circleFarthestCorner(w, h, puff.atX, puff.atY)
            paint.shader = RadialGradient(
                shape.centerX,
                shape.centerY,
                shape.radiusX,
                intArrayOf(colors.cloud1, colors.cloud2, colors.cloud3),
                floatArrayOf(0f, puff.middle, 1f),
                Shader.TileMode.CLAMP,
            )
        }
        canvas.drawOval(RectF(0f, 0f, w, h), paint)
        canvas.restore()
    }

    private fun drawFace(canvas: Canvas, artU: Float, bleed: Float, colors: PosterColors) {
        canvas.save()
        canvas.translate(bleed, bleed)
        canvas.scale(artU, artU)
        drawBrow(canvas, 196f, 96f, -10f, colors.face)
        drawBrow(canvas, 284f, 92f, 10f, colors.face)
        drawEye(canvas, 204f, 134f, colors)
        drawEye(canvas, 288f, 132f, colors)
        drawMouth(canvas, colors.hot)
        drawCheek(canvas, 170f, 196f, colors.hot)
        drawCheek(canvas, 314f, 194f, colors.hot)
        canvas.restore()
    }

    private fun drawBrow(canvas: Canvas, left: Float, top: Float, rotation: Float, color: Int) {
        val width = 54f
        val height = 24f
        val border = 8f
        val ring = Path().apply {
            fillType = Path.FillType.EVEN_ODD
            addOval(RectF(0f, 0f, width, height), Path.Direction.CW)
            addOval(RectF(border, border, width - border, height - border), Path.Direction.CW)
        }
        val topSide = Path().apply {
            moveTo(0f, 0f)
            lineTo(width, 0f)
            lineTo(width / 2f, width / 2f)
            close()
        }
        canvas.save()
        canvas.translate(left, top)
        canvas.rotate(rotation, width / 2f, height / 2f)
        canvas.clipPath(topSide)
        canvas.drawPath(ring, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
        canvas.restore()
    }

    private fun drawEye(canvas: Canvas, left: Float, top: Float, colors: PosterColors) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.color = colors.face
        canvas.drawOval(RectF(left, top, left + 42f, top + 54f), paint)
        paint.color = colors.faceGlint
        canvas.drawOval(RectF(left + 7f, top + 8f, left + 22f, top + 23f), paint)
    }

    private fun drawMouth(canvas: Canvas, color: Int) {
        val rect = RectF(248f, 204f, 290f, 232f)
        val radii = scaledRadii(rect.width(), rect.height(), 6f, 6f, 40f, 40f)
        val path = Path().apply {
            addRoundRect(
                rect,
                floatArrayOf(radii[0], radii[0], radii[1], radii[1], radii[2], radii[2], radii[3], radii[3]),
                Path.Direction.CW,
            )
        }
        canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
    }

    fun scaledRadii(width: Float, height: Float, topLeft: Float, topRight: Float, bottomRight: Float, bottomLeft: Float): FloatArray {
        val factor = minOf(
            1f,
            width / (topLeft + topRight),
            width / (bottomLeft + bottomRight),
            min(height / (topLeft + bottomLeft), height / (topRight + bottomRight)),
        )
        return floatArrayOf(topLeft * factor, topRight * factor, bottomRight * factor, bottomLeft * factor)
    }

    private fun drawCheek(canvas: Canvas, left: Float, top: Float, color: Int) {
        val width = 56f
        val height = 26f
        val shape = CssGradient.circleFarthestCorner(width, height, 0.5f, 0.5f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = RadialGradient(
            left + shape.centerX,
            top + shape.centerY,
            shape.radiusX,
            intArrayOf(color, color and 0xFFFFFF, color and 0xFFFFFF),
            floatArrayOf(0f, 0.72f, 1f),
            Shader.TileMode.CLAMP,
        )
        paint.alpha = (0.7f * 255).roundToInt()
        canvas.drawOval(RectF(left, top, left + width, top + height), paint)
    }

    private fun lock(artU: Float, colors: PosterColors): PosterBody {
        val width = PosterMetrics.LOCK_W * artU
        val height = PosterMetrics.LOCK_H * artU
        val image = bitmap(width, height) { canvas ->
            canvas.scale(artU, artU)
            drawShackle(canvas, (PosterMetrics.LOCK_W - PosterMetrics.SHACKLE_W) / 2f, 0f, colors.lock1)
            val bodyTop = PosterMetrics.SHACKLE_H - PosterMetrics.SHACKLE_OVERLAP
            val body = RectF(0f, bodyTop, PosterMetrics.LOCK_W, bodyTop + PosterMetrics.LOCK_BODY_H)
            val line = CssGradient.linear(148f, body.width(), body.height(), body.left, body.top)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            paint.shader = LinearGradient(
                line.x0, line.y0, line.x1, line.y1,
                intArrayOf(colors.lock1, colors.lock2, colors.lock3),
                floatArrayOf(0f, 0.6f, 1f),
                Shader.TileMode.CLAMP,
            )
            canvas.drawRoundRect(body, 52f, 52f, paint)
            if (colors.glossTop ushr 24 != 0) {
                val gloss = RectF(18f, bodyTop + 12f, PosterMetrics.LOCK_W - 18f, bodyTop + 12f + 58f)
                val glossPaint = Paint(Paint.ANTI_ALIAS_FLAG)
                glossPaint.shader = LinearGradient(0f, gloss.top, 0f, gloss.bottom, colors.glossTop, colors.glossBottom, Shader.TileMode.CLAMP)
                canvas.drawRoundRect(gloss, 44f, 44f, glossPaint)
            }
            val hole = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colors.lockHole }
            val center = PosterMetrics.LOCK_W / 2f
            canvas.drawOval(RectF(center - 23f, bodyTop + 72f, center + 23f, bodyTop + 118f), hole)
            val stem = RectF(center - 13f, bodyTop + 108f, center + 13f, bodyTop + 152f)
            canvas.drawPath(
                Path().apply { addRoundRect(stem, floatArrayOf(0f, 0f, 0f, 0f, 10f, 10f, 10f, 10f), Path.Direction.CW) },
                hole,
            )
        }
        return PosterBody(listOf(BodyLayer(image, 0f, 0f, width, height)), 0f)
    }

    private fun drawShackle(canvas: Canvas, left: Float, top: Float, color: Int) {
        val width = PosterMetrics.SHACKLE_W
        val height = PosterMetrics.SHACKLE_H
        val border = 34f
        val ring = Path().apply {
            fillType = Path.FillType.EVEN_ODD
            addOval(RectF(0f, 0f, width, height), Path.Direction.CW)
            addOval(RectF(border, border, width - border, height - border), Path.Direction.CW)
        }
        val apexY = height - width / 2f
        val bottomSide = Path().apply {
            moveTo(0f, height)
            lineTo(width, height)
            lineTo(width / 2f, apexY)
            close()
        }
        canvas.save()
        canvas.translate(left, top)
        @Suppress("DEPRECATION")
        canvas.clipPath(bottomSide, Region.Op.DIFFERENCE)
        canvas.drawPath(ring, Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color })
        canvas.restore()
    }

    private fun scroll(artU: Float, colors: PosterColors): PosterBody {
        val width = PosterMetrics.SCROLL_W * artU
        val height = PosterMetrics.SCROLL_H * artU
        val image = bitmap(width, height) { canvas ->
            canvas.scale(artU, artU)
            val w = PosterMetrics.SCROLL_W
            val roll = PosterMetrics.SCROLL_ROLL_H
            drawRoll(canvas, 0f, w, roll, colors)
            val paperTop = roll
            val paper = RectF(14f, paperTop, w - 14f, paperTop + PosterMetrics.SCROLL_PAPER_H)
            val line = CssGradient.linear(158f, paper.width(), paper.height(), paper.left, paper.top)
            val paperPaint = Paint(Paint.ANTI_ALIAS_FLAG)
            paperPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, colors.paper, colors.sheet, Shader.TileMode.CLAMP)
            canvas.drawRect(paper, paperPaint)
            val contentLeft = paper.left + 26f
            val contentWidth = paper.width() - 52f
            val pill = Paint(Paint.ANTI_ALIAS_FLAG)
            pill.color = colors.hot
            val titleTop = paperTop + 28f
            canvas.drawRoundRect(RectF(contentLeft, titleTop, contentLeft + 108f, titleTop + 14f), 7f, 7f, pill)
            val lines = listOf(1f to colors.lav, 1f to colors.sky, 0.72f to colors.lav, 0.88f to colors.mint)
            var y = titleTop + 14f + 22f
            for ((share, color) in lines) {
                pill.color = color
                canvas.drawRoundRect(RectF(contentLeft, y, contentLeft + contentWidth * share, y + 12f), 6f, 6f, pill)
                y += 12f + 13f
            }
            drawRoll(canvas, paper.bottom, w, roll, colors)
        }
        return PosterBody(listOf(BodyLayer(image, 0f, 0f, width, height)), 0f)
    }

    private fun drawRoll(canvas: Canvas, top: Float, width: Float, height: Float, colors: PosterColors) {
        val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        paint.shader = LinearGradient(0f, top, 0f, top + height, colors.paper, colors.sheetRoll, Shader.TileMode.CLAMP)
        canvas.drawRoundRect(RectF(0f, top, width, top + height), height / 2f, height / 2f, paint)
    }

    private fun star(size: Float, from: Int, to: Int): PosterBody {
        val image = bitmap(size, size) { canvas ->
            val path = Path()
            STAR_POINTS.forEachIndexed { index, (x, y) ->
                if (index == 0) path.moveTo(x * size, y * size) else path.lineTo(x * size, y * size)
            }
            path.close()
            val line = CssGradient.linear(160f, size, size)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            paint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, from, to, Shader.TileMode.CLAMP)
            canvas.drawPath(path, paint)
        }
        return PosterBody(listOf(BodyLayer(image, 0f, 0f, size, size)), 0f)
    }

    private val STAR_POINTS = listOf(
        0.5f to 0f, 0.59f to 0.41f, 1f to 0.5f, 0.59f to 0.59f,
        0.5f to 1f, 0.41f to 0.59f, 0f to 0.5f, 0.41f to 0.41f,
    )

    private fun smoke(resources: Resources, largestWidth: Float): Bitmap? {
        val source = BitmapFactory.decodeResource(resources, R.drawable.poster_smoke, BitmapFactory.Options().apply { inScaled = false })
            ?: return null
        val target = largestWidth.roundToInt()
        if (target >= SMOKE_SOURCE_WIDTH || target >= source.width) return source
        val height = max(1, (source.height.toFloat() * target / source.width).roundToInt())
        val scaled = Bitmap.createScaledBitmap(source, max(1, target), height, true)
        if (scaled !== source) source.recycle()
        return scaled
    }
}
