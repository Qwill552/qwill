package com.qwill.app.consent

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.view.View
import android.view.ViewGroup
import com.qwill.app.ui.theme.PosterColors
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class PosterLayout(context: Context) : ViewGroup(context) {
    val cloud = PosterBodyView(context)
    val lock = PosterBodyView(context)
    val scroll = PosterBodyView(context)
    val stars = List(PosterMetrics.STARS.size) { PosterBodyView(context) }
    val fog = ClipBox(context).apply {
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    val smokes = List(PosterMetrics.SMOKES.size) { PosterBodyView(context) }

    private val canvasPaint = Paint()
    private var canvasKey = ""

    var metrics: PosterMetrics? = null
        set(value) {
            field = value
            requestLayout()
        }
    var safeTop: Int = 0
        set(value) {
            if (field == value) return
            field = value
            requestLayout()
        }
    var safeBottom: Int = 0
        set(value) {
            if (field == value) return
            field = value
            requestLayout()
        }
    var colors: PosterColors? = null
        set(value) {
            field = value
            canvasKey = ""
            invalidate()
        }

    var content: View? = null
        set(value) {
            field?.let { removeView(it) }
            field = value
            value?.let { addView(it) }
        }
    var card: View? = null
        set(value) {
            field?.let { removeView(it) }
            field = value
            value?.let { addView(it) }
        }

    var heroHeight: Float = 0f
        private set

    init {
        setWillNotDraw(false)
        clipChildren = false
        addView(cloud)
        addView(lock)
        addView(scroll)
        for (star in stars) addView(star)
        for (smoke in smokes) fog.addView(smoke)
        addView(fog)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val m = metrics
        val width = MeasureSpec.getSize(widthMeasureSpec)
        if (m == null) {
            setMeasuredDimension(width, 0)
            return
        }
        val heroPad = m.units(PosterMetrics.HERO_PAD)
        val contentWidth = (width - 2f * heroPad).roundToInt().coerceAtLeast(0)
        val contentView = content
        var contentHeight = 0
        if (contentView != null) {
            contentView.measure(MeasureSpec.makeMeasureSpec(contentWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
            contentHeight = contentView.measuredHeight
        }
        val cardView = card
        val cardWidth = (width - 2f * m.units(CARD_MARGIN)).roundToInt().coerceAtLeast(0)
        var cardHeight = 0f
        if (cardView != null) {
            cardView.measure(MeasureSpec.makeMeasureSpec(cardWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
            cardHeight = max(m.units(CARD_MIN_H), cardView.measuredHeight.toFloat())
            cardView.measure(
                MeasureSpec.makeMeasureSpec(cardWidth, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(ceil(cardHeight).toInt(), MeasureSpec.EXACTLY),
            )
        }
        val cardBlock = cardHeight + m.units(CARD_MARGIN) + safeBottom
        val heroNeeded = heroPad + safeTop + contentHeight
        val hero = maxOf(m.heroMinHeight, heroNeeded.toFloat(), m.posterMinHeight - cardBlock)
        heroHeight = hero
        measureBodies(m, hero)
        fog.measure(exactly(width.toFloat()), exactly(hero))
        setMeasuredDimension(width, ceil(hero + cardBlock).toInt())
    }

    private fun measureBodies(m: PosterMetrics, hero: Float) {
        measureBody(cloud, m.cloud(hero))
        measureBody(lock, m.lock(hero))
        measureBody(scroll, m.scroll(hero))
        stars.forEachIndexed { index, view -> measureBody(view, m.star(index, hero)) }
        smokes.forEachIndexed { index, view -> measureBody(view, m.smoke(index, hero)) }
    }

    private fun measureBody(view: PosterBodyView, rect: PosterRect) {
        val bleed = view.bleed
        view.measure(exactly(rect.width + 2f * bleed), exactly(rect.height + 2f * bleed))
    }

    private fun exactly(size: Float): Int = MeasureSpec.makeMeasureSpec(ceil(size).toInt().coerceAtLeast(0), MeasureSpec.EXACTLY)

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val m = metrics ?: return
        val hero = heroHeight
        placeBody(cloud, m.cloud(hero))
        placeBody(lock, m.lock(hero))
        placeBody(scroll, m.scroll(hero))
        stars.forEachIndexed { index, view -> placeBody(view, m.star(index, hero)) }
        fog.layout(0, 0, fog.measuredWidth, fog.measuredHeight)
        smokes.forEachIndexed { index, view -> placeBody(view, m.smoke(index, hero)) }
        val heroPad = m.units(PosterMetrics.HERO_PAD)
        content?.let {
            val left = heroPad.roundToInt()
            val top = (heroPad + safeTop).roundToInt()
            it.layout(left, top, left + it.measuredWidth, top + it.measuredHeight)
        }
        card?.let {
            val left = m.units(CARD_MARGIN).roundToInt()
            val top = hero.roundToInt()
            it.layout(left, top, left + it.measuredWidth, top + it.measuredHeight)
        }
    }

    private fun placeBody(view: PosterBodyView, rect: PosterRect) {
        val bleed = view.bleed
        val left = (rect.left - bleed).roundToInt()
        val top = (rect.top - bleed).roundToInt()
        view.layout(left, top, left + view.measuredWidth, top + view.measuredHeight)
    }

    override fun onDraw(canvas: Canvas) {
        val palette = colors ?: return
        val key = "${width}x$height:${palette.isDark}"
        if (key != canvasKey) {
            canvasKey = key
            val line = CssGradient.linear(CANVAS_ANGLE, width.toFloat(), height.toFloat())
            canvasPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, palette.canvasStops, palette.canvasPositions, Shader.TileMode.CLAMP)
        }
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), canvasPaint)
    }

    class ClipBox(context: Context) : ViewGroup(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {}
    }

    companion object {
        const val CARD_MARGIN = 60f
        const val CARD_MIN_H = 754f
        const val CANVAS_ANGLE = 168f
    }
}
