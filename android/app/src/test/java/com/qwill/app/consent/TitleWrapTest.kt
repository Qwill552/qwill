package com.qwill.app.consent

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class TitleWrapTest {
    private val fontClass = Class.forName("java.awt.Font")
    private val contextClass = Class.forName("java.awt.font.FontRenderContext")
    private val transformClass = Class.forName("java.awt.geom.AffineTransform")
    private val font: Any = fontClass.getMethod("createFont", Int::class.javaPrimitiveType, File::class.java)
        .invoke(null, fontClass.getField("TRUETYPE_FONT").getInt(null), File(fontsDir(), "golos_text_800.ttf"))
    private val context: Any = contextClass.getConstructor(transformClass, Boolean::class.javaPrimitiveType, Boolean::class.javaPrimitiveType)
        .newInstance(null, true, true)

    private fun fontsDir(): File =
        listOf(File("src/main/assets/fonts"), File("app/src/main/assets/fonts"), File("android/app/src/main/assets/fonts")).first { it.isDirectory }

    private fun width(text: String, size: Float): Float {
        val sized = fontClass.getMethod("deriveFont", Float::class.javaPrimitiveType).invoke(font, size)
        val bounds = fontClass.getMethod("getStringBounds", String::class.java, contextClass).invoke(sized, text, context)
        val advance = (bounds.javaClass.getMethod("getWidth").invoke(bounds) as Double).toFloat()
        return advance + text.length * (-0.04f * size)
    }

    @Test
    fun titleBreaksIntoExactlyTwoLinesOnPhones() {
        val density = 2.625f
        for (widthDp in listOf(320f, 360f, 412f, 430f)) {
            val m = PosterMetrics.compute(widthDp * density, 915f * density, density)
            val size = m.units(116f)
            val column = m.titleMaxWidth
            val first = width("Соглашение", size)
            val whole = width("Соглашение обновилось", size)
            assertTrue("«Соглашение» at $widthDp dp: $first > $column", first <= column)
            assertTrue("«обновилось» at $widthDp dp", width("обновилось", size) <= column)
            assertTrue("one line fits at $widthDp dp", whole > column)
            assertTrue("margin at $widthDp dp: ${first / column}", first / column in 0.85f..0.97f)
        }
    }
}
