package com.qwill.app.consent

import com.qwill.app.model.PendingConsentDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.sqrt

class PosterMathTest {
    private val density = 2.625f

    private fun narrow(widthDp: Float, heightDp: Float = 915f) = PosterMetrics.compute(widthDp * density, heightDp * density, density)

    @Test
    fun narrowScreensUse880UnitsAndLargerArt() {
        for (widthDp in listOf(360f, 412f, 430f)) {
            val m = narrow(widthDp)
            assertFalse(m.wide)
            assertEquals(widthDp * density / 880f, m.u, 1e-4f)
            assertEquals(m.u * 1.6f, m.artU, 1e-4f)
            assertEquals(1.333f, m.toggleScale, 1e-6f)
            assertEquals(widthDp * density, m.posterWidth, 1e-3f)
        }
    }

    @Test
    fun wideScreensFitTheCanvasIntoTheWindow() {
        val m900 = PosterMetrics.compute(900f * density, 600f * density, density)
        assertTrue(m900.wide)
        assertEquals((900f - 48f - 24f) * density / 1080f, m900.u, 1e-4f)
        assertEquals(m900.u, m900.artU, 1e-6f)
        assertEquals(1f, m900.toggleScale, 1e-6f)
        val m1280 = PosterMetrics.compute(1280f * density, 800f * density, density)
        assertEquals(density, m1280.u, 1e-4f)
        assertEquals(1080f * density, m1280.posterWidth, 1e-2f)
    }

    @Test
    fun landscapePhoneWindowFitsBetweenInsets() {
        val widthPx = 2856f
        val cutout = 150f
        val hairline = 3f
        val m = PosterMetrics.compute(widthPx, 1280f, density, cutout + 4f * hairline)
        assertTrue(m.wide)
        val window = m.posterWidth + 2f * 12f * density + 4f * hairline
        val margins = 2f * 24f * density + cutout
        assertTrue("window $window + margins $margins > screen $widthPx", window + margins <= widthPx + 0.5f)
    }

    @Test
    fun thresholdIsExactly900Dp() {
        assertTrue(PosterMetrics.compute(900f * density, 700f * density, density).wide)
        assertFalse(PosterMetrics.compute(899.9f * density, 700f * density, density).wide)
    }

    @Test
    fun heroIsNeverShorterThanTheScreenOnNarrow() {
        for (heightDp in listOf(640f, 915f, 1200f)) {
            val m = narrow(412f, heightDp)
            assertTrue(m.heroMinHeight >= heightDp * density - 1e-3f)
            assertTrue(m.heroMinHeight >= 1106f * m.u - 1e-3f)
        }
    }

    @Test
    fun heroIsExactly1106UnitsOnWide() {
        val m = PosterMetrics.compute(1280f * density, 2000f * density, density)
        assertEquals(1106f * m.u, m.heroMinHeight, 1e-3f)
        assertEquals(1920f * m.u, m.posterMinHeight, 1e-3f)
    }

    @Test
    fun decorFollowsHeroSharesAndEdges() {
        val m = narrow(412f)
        val hero = 2000f
        val lock = m.lock(hero)
        assertEquals(hero * 0.68f, lock.top, 1e-2f)
        assertEquals(-78f * m.artU, lock.left, 1e-3f)
        assertEquals(m.posterWidth, m.scroll(hero).right, 1e-2f)
        val cloud = m.cloud(hero)
        assertEquals(m.posterWidth + 130f * m.artU, cloud.right, 1e-2f)
        assertEquals(hero * -0.02712f, cloud.top, 1e-2f)
        assertEquals(hero + 110f * m.artU, m.smoke(4, hero).bottom, 1e-2f)
        val wide = PosterMetrics.compute(1280f * density, 800f * density, density)
        assertEquals(hero * 0.83906f, wide.star(6, hero).top, 1e-2f)
        assertEquals(hero * 0.61f, m.star(6, hero).top, 1e-2f)
        assertEquals(hero * 0.53526f, wide.lock(hero).top, 1e-2f)
    }

    @Test
    fun ledeHasThreeVariantsVerbatim() {
        val tail = "Чтобы продолжить пользоваться Qwill, ознакомьтесь с новой версией и примите её заново."
        assertEquals(
            "Пользовательское соглашение и Политика обработки персональных данных обновились. $tail",
            PosterText.ledeFor(PendingConsentDto(terms = true, privacy = true)),
        )
        assertEquals(
            "Политика обработки персональных данных обновилась. $tail",
            PosterText.ledeFor(PendingConsentDto(terms = false, privacy = true)),
        )
        assertEquals(
            "Пользовательское соглашение обновилось. $tail",
            PosterText.ledeFor(PendingConsentDto(terms = true, privacy = false)),
        )
    }

    @Test
    fun linearGradientMatchesCssGeometry() {
        fun check(angle: Float, w: Float, h: Float, expected: FloatArray) {
            val line = CssGradient.linear(angle, w, h)
            assertEquals(expected[0], line.x0, 1e-2f)
            assertEquals(expected[1], line.y0, 1e-2f)
            assertEquals(expected[2], line.x1, 1e-2f)
            assertEquals(expected[3], line.y1, 1e-2f)
        }
        check(90f, 100f, 50f, floatArrayOf(0f, 25f, 100f, 25f))
        check(180f, 100f, 50f, floatArrayOf(50f, 0f, 50f, 50f))
        check(168f, 412f, 915f, floatArrayOf(104.054f, -22.117f, 307.946f, 937.117f))
        check(168f, 1080f, 1920f, floatArrayOf(321.424f, -68.321f, 758.576f, 1988.321f))
    }

    @Test
    fun radialFarthestCornerSizes() {
        val circle = CssGradient.circleFarthestCorner(56f, 26f, 0.5f, 0.5f)
        assertEquals(hypot(28f, 13f), circle.radiusX, 1e-3f)
        val ellipse = CssGradient.ellipseFarthestCorner(356f, 128f, 0.5f, 0.2f)
        assertEquals(178f * sqrt(2f), ellipse.radiusX, 1e-3f)
        assertEquals(102.4f * sqrt(2f), ellipse.radiusY, 1e-3f)
    }

    @Test
    fun mouthRadiiShrinkLikeCss() {
        val radii = PosterArt.scaledRadii(42f, 28f, 6f, 6f, 40f, 40f)
        assertEquals(6f * 0.525f, radii[0], 1e-4f)
        assertEquals(40f * 0.525f, radii[2], 1e-4f)
    }

    @Test
    fun blurBoxesApproximateTheSigma() {
        for (sigma in listOf(4f, 9f, 13f, 17f)) {
            val radii = GaussianBlur.boxRadii(sigma)
            val variance = radii.sumOf { r -> ((2 * r + 1) * (2 * r + 1) - 1) / 12.0 }
            assertEquals(sigma.toDouble(), sqrt(variance), sigma * 0.08)
        }
    }

    @Test
    fun blurKeepsColorOfAUniformShape() {
        val size = 40
        val pixels = IntArray(size * size) { index ->
            val x = index % size
            val y = index / size
            if (x in 10..29 && y in 10..29) 0xFFB5AFCA.toInt() else 0
        }
        GaussianBlur.blurArgb(pixels, size, size, 4f)
        val edge = pixels[20 * size + 9]
        assertTrue((edge ushr 24) in 40..215)
        assertNear(0xB5, edge shr 16 and 0xFF)
        assertNear(0xAF, edge shr 8 and 0xFF)
        assertNear(0xCA, edge and 0xFF)
    }

    private fun assertNear(expected: Int, actual: Int) {
        assertTrue("expected $expected ± 2, got $actual", abs(expected - actual) <= 2)
    }
}
