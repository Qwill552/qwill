package com.qwill.app.consent

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class CssFiltersTest {
    private fun assertColor(expected: Int, actual: Int) {
        for (shift in intArrayOf(16, 8, 0)) {
            val e = expected shr shift and 0xFF
            val a = actual shr shift and 0xFF
            assertTrue("channel $shift: expected $e, got $a", abs(e - a) <= 2)
        }
    }

    @Test
    fun nightCloudFilterMatchesChromium() {
        val matrix = CssFilters.chain(*CssFilters.posterCloudNight.toTypedArray())
        assertColor(0xFFB5AFCA.toInt(), matrix.apply(0xFFFFFFFF.toInt()))
        assertColor(0xFF708277.toInt(), matrix.apply(0xFFB3AED6.toInt()))
        assertColor(0xFF687B6E.toInt(), matrix.apply(0xFFA8A3CC.toInt()))
        assertColor(0xFF556958.toInt(), matrix.apply(0xFF8E89B4.toInt()))
    }

    @Test
    fun nightSmokeFilterMatchesChromium() {
        val matrix = CssFilters.posterSmokeNight
        assertColor(0xFF626262.toInt(), matrix.apply(0xFFFFFFFF.toInt()))
        assertColor(0xFF282828.toInt(), matrix.apply(0xFF808080.toInt()))
        assertColor(0xFF454545.toInt(), matrix.apply(0xFFC0C0C0.toInt()))
        assertColor(0xFF0A0A0A.toInt(), matrix.apply(0xFF404040.toInt()))
    }

    @Test
    fun gooContrastBurnsCloudColorToWhiteBeforeTheNightFilter() {
        assertColor(0xFFFFFFFF.toInt(), CssFilters.applyEach(0xFFFFFFFF.toInt(), listOf(CssFilters.posterGooContrast)))
        val night = CssFilters.applyEach(0xFFB3AED6.toInt(), listOf(CssFilters.posterGooContrast) + CssFilters.posterCloudNight)
        assertColor(0xFFB5AFCA.toInt(), night)
    }

    @Test
    fun contrastKeepsAlpha() {
        assertEquals(0x80, CssFilters.posterGooContrast.apply(0x80FFFFFF.toInt()) ushr 24)
    }
}
