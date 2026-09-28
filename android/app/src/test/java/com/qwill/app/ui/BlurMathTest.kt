package com.qwill.app.ui

import com.qwill.app.ui.glass.BlurMath
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BlurMathTest {
    @Test
    fun scaleKeepsLowResSigmaUnderSkiaThreshold() {
        assertEquals(8, BlurMath.scaleFor(24f, 8, 3f))
        assertEquals(16, BlurMath.scaleFor(25f, 8, 3f))
        assertEquals(32, BlurMath.scaleFor(70f, 8, 3f))
        assertEquals(32, BlurMath.scaleFor(81f, 8, 3f))
        assertEquals(64, BlurMath.scaleFor(100f, 8, 3f))
        for (sigma in listOf(10f, 40f, 70f, 93f, 200f)) assertTrue(sigma / BlurMath.scaleFor(sigma, 8, 3f) <= 3f)
    }

    @Test
    fun radiusAndSigmaFollowSkia() {
        assertEquals(69.78f, BlurMath.radiusToSigma(120f), 0.01f)
        assertEquals(120f, BlurMath.sigmaToRadius(BlurMath.radiusToSigma(120f)), 0.01f)
        assertEquals(BlurMath.sigmaToRadius(69.78f / 32f), BlurMath.downscaleRadius(120f, 32f), 0.01f)
        assertEquals(1f, BlurMath.downscaleRadius(4f, 32f), 0.0001f)
    }
}
