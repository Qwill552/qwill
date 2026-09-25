package com.qwill.app.search

import org.junit.Assert.assertEquals
import org.junit.Test

class HighlightTest {
    private fun ranges(text: String, query: String): List<Pair<Int, Int>> = Highlight.ranges(text, query).map { it.start to it.end }

    @Test
    fun wordsAreLowercasedAndSplitByNonLetters() {
        assertEquals(listOf("анна", "ли"), Highlight.words("  Анна, ЛИ! "))
        assertEquals(listOf("ivan", "42"), Highlight.words("@ivan_42"))
    }

    @Test
    fun matchesOnlyAtWordStart() {
        assertEquals(listOf(0 to 3), ranges("Анна Ананасова", "анн"))
        assertEquals(emptyList<Pair<Int, Int>>(), ranges("Марианна", "анн"))
        assertEquals(listOf(5 to 8), ranges("Иван Ана", "ана"))
    }

    @Test
    fun yoIsTreatedAsYe() {
        assertEquals(listOf(0 to 2), ranges("Ёлка", "ел"))
        assertEquals(listOf(0 to 2), ranges("Елка", "ёл"))
    }

    @Test
    fun overlappingAndAdjacentRangesMerge() {
        assertEquals(listOf(0 to 4), ranges("Анна", "ан анна"))
        assertEquals(listOf(0 to 4, 5 to 9), ranges("Анна Анна", "анна"))
        assertEquals(listOf(0 to 2, 3 to 9), ranges("ab-cdefgh", "ab cdefgh"))
        assertEquals(listOf(0 to 6), ranges("Иванов", "ив иванов иван"))
    }

    @Test
    fun emptyQueryGivesNothing() {
        assertEquals(emptyList<Pair<Int, Int>>(), ranges("Анна", ""))
        assertEquals(emptyList<Pair<Int, Int>>(), ranges("Анна", " @ "))
        assertEquals(emptyList<Pair<Int, Int>>(), ranges("", "анна"))
    }

    @Test
    fun needleDropsLeadingAt() {
        assertEquals("ivan", Highlight.needleOf("  @ivan "))
        assertEquals("иван", Highlight.needleOf("иван"))
        assertEquals("", Highlight.needleOf("@"))
    }
}
