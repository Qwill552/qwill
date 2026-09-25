package com.qwill.app.emoji

import com.qwill.app.net.ApiJson
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

class EmojiMatchTest {
    private val index: EmojiIndexFile = ApiJson.decodeFromString(
        EmojiIndexFile.serializer(),
        File("../../client/public/emoji/index.json").readText(Charsets.UTF_8),
    )
    private val matcher = EmojiMatcher(index.emoji)

    private fun segments(text: String): List<Pair<Int, Int>> = matcher.find(text).map { it.start to it.end }

    @Test
    fun everyIndexEntryIsOneWholeMatch() {
        for (entry in index.emoji) {
            val found = matcher.find(entry.e)
            assertEquals(entry.e, 1, found.size)
            assertEquals(entry.e, 0 to entry.e.length, found[0].start to found[0].end)
            assertEquals(entry.e, entry, found[0].entry)
        }
    }

    @Test
    fun segmentsFollowWebMatchEmojis() {
        assertEquals(listOf(7 to 9), segments("Привет 😀!"))
        assertEquals(listOf(0 to 3), segments("1️⃣2"))
        assertEquals(listOf(3 to 5), segments("#1 ©️ © ®"))
        assertEquals(listOf(0 to 4, 4 to 8), segments("🇷🇺🇺🇸"))
        assertEquals(listOf(0 to 8), segments("👨‍👩‍👧 семья"))
        assertEquals(listOf(0 to 6), segments("🏳️‍🌈"))
        assertEquals(listOf(1 to 3, 4 to 6), segments("a😀b😃"))
        assertEquals(listOf(0 to 5), segments("👩‍💻"))
        assertEquals(listOf(0 to 5), segments("🙂‍↕️"))
        assertEquals(emptyList<Pair<Int, Int>>(), segments("обычный текст 123 # * ©"))
    }

    @Test
    fun unknownSequencesStaySystemGlyphs() {
        assertEquals(emptyList<Pair<Int, Int>>(), segments("👍🏽 ок"))
        assertEquals(listOf(5 to 7), segments("👍🏽 😀"))
    }

    @Test
    fun bareFormWithoutVariationSelectorMatchesOnce() {
        assertEquals(listOf(0 to 2, 5 to 6), segments("❤️ и ❤"))
        assertEquals(listOf(0 to 1, 2 to 4), segments("☺ ☺️"))
        assertEquals(listOf(0 to 2, 2 to 3), segments("✌️✌"))
        assertEquals(matcher.find("❤️")[0].entry, matcher.find("❤")[0].entry)
    }

    @Test
    fun sheetGeometryFitsIndex() {
        assertEquals(64, index.cell)
        for (entry in index.emoji) {
            assert(entry.x in 0 until index.cols) { entry.e }
            assert(entry.y in 0 until index.rows) { entry.e }
        }
    }
}
