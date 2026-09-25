package com.qwill.app.consent

import kotlin.math.max
import kotlin.math.min

class PosterRect(val left: Float, val top: Float, val width: Float, val height: Float) {
    val right: Float get() = left + width
    val bottom: Float get() = top + height
    val centerX: Float get() = left + width / 2f
    val centerY: Float get() = top + height / 2f
}

class PosterMetrics(
    val wide: Boolean,
    val u: Float,
    val artU: Float,
    val toggleScale: Float,
    val density: Float,
    val screenWidth: Float,
    val screenHeight: Float,
) {
    val posterWidth: Float = if (wide) CANVAS_UNITS * u else screenWidth

    val posterMinHeight: Float = if (wide) POSTER_UNITS * u else max(POSTER_UNITS * u, screenHeight)

    val heroMinHeight: Float = if (wide) HERO_UNITS * u else max(HERO_UNITS * u, screenHeight)

    val titleTopMargin: Float = if (wide) WIDE_TITLE_TOP * u else screenHeight * NARROW_TITLE_TOP_SHARE

    val titleMaxWidth: Float = if (wide) WIDE_TITLE_MAX * u else posterWidth - 2f * HERO_PAD * u

    fun units(value: Float): Float = value * u

    fun art(value: Float): Float = value * artU

    fun dp(value: Float): Float = value * density

    fun floor(units: Float, floorDp: Float): Float = max(units * u, floorDp * density)

    fun cloud(heroHeight: Float): PosterRect =
        PosterRect(posterWidth + art(130f) - art(CLOUD_W), heroHeight * CLOUD_TOP_SHARE, art(CLOUD_W), art(CLOUD_H))

    fun lock(heroHeight: Float): PosterRect =
        PosterRect(-art(78f), heroHeight * (if (wide) 0.53526f else 0.68f), art(LOCK_W), art(LOCK_H))

    fun scroll(heroHeight: Float): PosterRect {
        val right = if (wide) art(24f) else 0f
        return PosterRect(posterWidth - right - art(SCROLL_W), heroHeight * (if (wide) 0.50633f else 0.5f), art(SCROLL_W), art(SCROLL_H))
    }

    fun star(index: Int, heroHeight: Float): PosterRect {
        val spec = STARS[index]
        val size = art(spec.size)
        val share = if (wide && spec.wideTopShare != null) spec.wideTopShare else spec.topShare
        val left = if (spec.fromRight) posterWidth - art(spec.edge) - size else art(spec.edge)
        return PosterRect(left, heroHeight * share, size, size)
    }

    fun smoke(index: Int, heroHeight: Float): PosterRect {
        val spec = SMOKES[index]
        val width = art(spec.width)
        val height = art(spec.height)
        val left = if (spec.fromRight) posterWidth - art(spec.edge) - width else art(spec.edge)
        val top = if (spec.bottomUnits != null) heroHeight - art(spec.bottomUnits) - height else heroHeight * spec.topShare
        return PosterRect(left, top, width, height)
    }

    fun largestSmokeWidth(): Float = SMOKES.maxOf { art(it.width) }

    class StarSpec(
        val edge: Float,
        val fromRight: Boolean,
        val topShare: Float,
        val size: Float,
        val periodMs: Long,
        val wideTopShare: Float? = null,
    )

    class SmokeSpec(
        val edge: Float,
        val fromRight: Boolean,
        val topShare: Float,
        val width: Float,
        val height: Float,
        val opacity: Float,
        val periodMs: Long,
        val kind: SmokeKind,
        val bottomUnits: Float? = null,
    )

    enum class SmokeKind { A, B, C }

    companion object {
        const val WIDE_MIN_DP = 900f
        const val NARROW_CANVAS_UNITS = 880f
        const val CANVAS_UNITS = 1080f
        const val POSTER_UNITS = 1920f
        const val HERO_UNITS = 1106f
        const val HERO_PAD = 76f
        const val WIDE_GUTTER_DP = 24f
        const val NARROW_ART_SCALE = 1.6f
        const val NARROW_TOGGLE_SCALE = 1.333f
        const val NARROW_TITLE_TOP_SHARE = 0.13f
        const val WIDE_TITLE_TOP = 132f
        const val WIDE_TITLE_MAX = 700f

        const val CLOUD_W = 470f
        const val CLOUD_H = 320f
        const val CLOUD_TOP_SHARE = -0.02712f
        const val LOCK_W = 292f
        const val SHACKLE_W = 150f
        const val SHACKLE_H = 146f
        const val SHACKLE_OVERLAP = 14f
        const val LOCK_BODY_H = 208f
        const val LOCK_H = SHACKLE_H - SHACKLE_OVERLAP + LOCK_BODY_H
        const val SCROLL_W = 250f
        const val SCROLL_ROLL_H = 30f
        const val SCROLL_PAPER_H = 28f + 14f + 22f + 4f * 12f + 3f * 13f + 28f
        const val SCROLL_H = 2f * SCROLL_ROLL_H + SCROLL_PAPER_H

        val STARS: List<StarSpec> = listOf(
            StarSpec(40f, false, 0.15913f, 78f, 5_000),
            StarSpec(512f, false, 0.05967f, 50f, 7_000),
            StarSpec(300f, true, 0.37975f, 60f, 6_000),
            StarSpec(300f, false, 0.72875f, 44f, 8_000),
            StarSpec(118f, true, 0.32369f, 36f, 9_000),
            StarSpec(664f, false, 0.53888f, 66f, 5_500),
            StarSpec(26f, false, 0.61f, 52f, 7_500, wideTopShare = 0.83906f),
            StarSpec(388f, true, 0.54f, 40f, 6_500, wideTopShare = 0.81374f),
        )

        val SMOKES: List<SmokeSpec> = listOf(
            SmokeSpec(-190f, false, 0.01808f, 840f, 321f, 0.72f, 30_000, SmokeKind.A),
            SmokeSpec(-280f, true, 0.17179f, 780f, 298f, 0.4f, 38_000, SmokeKind.B),
            SmokeSpec(-270f, false, 0.5425f, 920f, 352f, 0.78f, 34_000, SmokeKind.C),
            SmokeSpec(-210f, true, 0.45208f, 800f, 306f, 0.6f, 42_000, SmokeKind.B),
            SmokeSpec(-70f, false, 0f, 1240f, 474f, 0.66f, 46_000, SmokeKind.A, bottomUnits = -110f),
        )

        fun compute(widthPx: Float, heightPx: Float, density: Float): PosterMetrics {
            val wide = widthPx / density >= WIDE_MIN_DP
            if (!wide) {
                val u = widthPx / NARROW_CANVAS_UNITS
                return PosterMetrics(false, u, u * NARROW_ART_SCALE, NARROW_TOGGLE_SCALE, density, widthPx, heightPx)
            }
            val canvas = min(CANVAS_UNITS * density, widthPx - 2f * WIDE_GUTTER_DP * density)
            val u = canvas / CANVAS_UNITS
            return PosterMetrics(true, u, u, 1f, density, widthPx, heightPx)
        }
    }
}
