package com.qwill.app.chat

import com.qwill.app.chat.wallpaper.BlendModes
import com.qwill.app.chat.wallpaper.GradientSpec
import com.qwill.app.chat.wallpaper.PathOp
import com.qwill.app.chat.wallpaper.PatternBlend
import com.qwill.app.chat.wallpaper.PatternSvg
import com.qwill.app.chat.wallpaper.RadialLayer
import com.qwill.app.chat.wallpaper.SvgPathParser
import com.qwill.app.chat.wallpaper.WallpaperPainter
import com.qwill.app.chat.wallpaper.Wallpapers
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.math.abs

class SvgPathParserTest {
    private fun end(op: PathOp): Pair<Float, Float> = when (op) {
        is PathOp.MoveTo -> op.x to op.y
        is PathOp.LineTo -> op.x to op.y
        is PathOp.CubicTo -> op.x to op.y
        is PathOp.QuadTo -> op.x to op.y
        PathOp.Close -> Float.NaN to Float.NaN
    }

    private fun near(expected: Pair<Float, Float>, actual: Pair<Float, Float>) {
        assertEquals(expected.first, actual.first, 0.001f)
        assertEquals(expected.second, actual.second, 0.001f)
    }

    @Test
    fun relativeCommandsAccumulate() {
        val ops = SvgPathParser.parse("m10 20l5 5h10v-3c1 1 2 2 3 3z")
        assertEquals(PathOp.MoveTo(10f, 20f), ops[0])
        assertEquals(PathOp.LineTo(15f, 25f), ops[1])
        assertEquals(PathOp.LineTo(25f, 25f), ops[2])
        assertEquals(PathOp.LineTo(25f, 22f), ops[3])
        assertEquals(PathOp.CubicTo(26f, 23f, 27f, 24f, 28f, 25f), ops[4])
        assertEquals(PathOp.Close, ops[5])
    }

    @Test
    fun implicitRepeatsAndGluedNumbers() {
        val ops = SvgPathParser.parse("m1.5.5 2-1-3.25.75M0 0 1 1")
        assertEquals(PathOp.MoveTo(1.5f, 0.5f), ops[0])
        assertEquals(PathOp.LineTo(3.5f, -0.5f), ops[1])
        assertEquals(PathOp.LineTo(0.25f, 0.25f), ops[2])
        assertEquals(PathOp.MoveTo(0f, 0f), ops[3])
        assertEquals(PathOp.LineTo(1f, 1f), ops[4])
    }

    @Test
    fun compressedArcFlags() {
        val glued = SvgPathParser.parse("M10 10a1.5 1.5 0 011.5 1.5")
        val spaced = SvgPathParser.parse("M10 10a1.5 1.5 0 0 1 1.5 1.5")
        assertEquals(spaced, glued)
        near(11.5f to 11.5f, end(glued.last()))
        assertTrue(glued.drop(1).all { it is PathOp.CubicTo })
    }

    @Test
    fun halfCircleArcEndsOnTarget() {
        val ops = SvgPathParser.parse("M0 0A5 5 0 0 1 10 0")
        near(10f to 0f, end(ops.last()))
        val middle = ops[1] as PathOp.CubicTo
        near(5f to -5f, middle.x to middle.y)
    }

    @Test
    fun everyPatternInRepositoryParses() {
        val dir = File("../../client/public/wallpaper/patterns")
        val files = dir.listFiles { file -> file.name.endsWith(".svg") }!!.sortedBy { it.name }
        assertEquals(Wallpapers.PATTERNS.size, files.size)
        assertEquals(Wallpapers.PATTERNS.toSet(), files.map { it.nameWithoutExtension }.toSet())
        for (file in files) {
            val data = PatternSvg.parse(file.readText(Charsets.UTF_8))
            assertEquals(file.name, 375f, data.width)
            assertEquals(file.name, 812f, data.height)
            assertTrue(file.name, data.shapes.isNotEmpty())
            assertTrue(file.name, data.shapes.all { it.ops.isNotEmpty() })
        }
    }

    @Test
    fun patternStyleIsInheritedAndOverridden() {
        val svg = """<svg viewBox="0 0 375 812" fill="none"><path stroke="#000" stroke-width="1.33" stroke-linecap="round" d="M0 0h1"/><path fill="#000" fill-rule="evenodd" d="M0 0h1v1z"/><path stroke="#000" stroke-dasharray="2 3 4" d="M0 0h9"/></svg>"""
        val shapes = PatternSvg.parse(svg).shapes
        assertTrue(shapes[0].stroke && !shapes[0].fill && shapes[0].roundCap)
        assertEquals(1.33f, shapes[0].strokeWidth)
        assertTrue(shapes[1].fill && shapes[1].evenOdd && !shapes[1].stroke)
        assertEquals(listOf(2f, 3f, 4f, 2f, 3f, 4f), shapes[2].dash!!.toList())
    }
}

class WallpaperMathTest {
    @Test
    fun blendFormulas() {
        assertEquals(0.25f, BlendModes.multiply(0.5f, 0.5f), 0.0001f)
        assertEquals(0.5f, BlendModes.softLight(0.5f, 0.5f), 0.0001f)
        assertEquals(0.25f, BlendModes.softLight(0.5f, 0f), 0.0001f)
        assertEquals(kotlin.math.sqrt(0.5f), BlendModes.softLight(0.5f, 1f), 0.0001f)
        val d = ((16f * 0.2f - 12f) * 0.2f + 4f) * 0.2f
        assertEquals(0.2f + (d - 0.2f), BlendModes.softLight(0.2f, 1f), 0.0001f)
    }

    @Test
    fun composeAppliesCoverageAndInkAlpha() {
        val white = 0xFFFFFFFF.toInt()
        val ink = (0x2E shl 24) or (60 shl 16) or (70 shl 8) or 120
        assertEquals(white, BlendModes.compose(PatternBlend.MULTIPLY, white, ink, 0f))
        val full = BlendModes.compose(PatternBlend.MULTIPLY, white, ink, 1f)
        val alpha = 0x2E / 255f
        val expectedRed = Math.round(((1 - alpha) + alpha * 60 / 255f) * 255)
        assertEquals(expectedRed, (full shr 16) and 0xFF)
    }

    @Test
    fun radialLayerFadesToBase() {
        val spec = GradientSpec(0xFF000000.toInt(), listOf(RadialLayer(1f, 1f, 0f, 0f, 0xFFFFFFFF.toInt(), 0x00FFFFFF)))
        val pixels = WallpaperPainter.gradient(10, 10, spec)
        val corner = pixels[0] and 0xFF
        val far = pixels[99] and 0xFF
        assertTrue(corner > 200)
        assertEquals(0, far)
    }

    @Test
    fun patternIsTiledByStride() {
        val pixels = IntArray(4 * 2) { 0xFFFFFFFF.toInt() }
        val mask = byteArrayOf(0xFF.toByte(), 0, 99, 99)
        WallpaperPainter.applyPattern(pixels, 4, 2, mask, 2, 1, 4, 0xFF000000.toInt(), PatternBlend.MULTIPLY)
        assertEquals(0xFF000000.toInt(), pixels[0])
        assertEquals(0xFFFFFFFF.toInt(), pixels[1])
        assertEquals(0xFF000000.toInt(), pixels[2])
        assertEquals(0xFF000000.toInt(), pixels[6])
        assertTrue(abs((pixels[7] and 0xFF) - 255) == 0)
    }

    @Test
    fun unknownChoiceFallsBackToDefault() {
        assertEquals("cats", Wallpapers.DEFAULT_PATTERN)
        assertEquals("default", Wallpapers.DEFAULT_GRADIENT)
        assertTrue(Wallpapers.gradient("nope", dark = true) === Wallpapers.gradient(Wallpapers.DEFAULT_GRADIENT, dark = true))
    }
}
