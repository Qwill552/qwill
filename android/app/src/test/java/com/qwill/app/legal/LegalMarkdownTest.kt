package com.qwill.app.legal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class LegalMarkdownTest {
    private fun counts(blocks: List<LegalBlock>): Triple<Int, Int, Int> {
        var headings = 0
        var tables = 0
        var rules = 0
        for (block in blocks) {
            when (block) {
                is LegalBlock.Heading -> headings++
                is LegalBlock.Table -> tables++
                is LegalBlock.Rule -> rules++
                else -> Unit
            }
        }
        return Triple(headings, tables, rules)
    }

    @Test
    fun termsDocumentCounts() {
        val text = File("../../legal/terms-1.1.md").readText()
        val blocks = LegalMarkdown.parse(text)
        val (headings, tables, rules) = counts(blocks)
        assertEquals(16, headings)
        assertEquals(0, tables)
        assertEquals(15, rules)
        assertTrue(blocks.none { it is LegalBlock.BulletList })
    }

    @Test
    fun privacyDocumentCounts() {
        val text = File("../../legal/privacy-1.1.md").readText()
        val blocks = LegalMarkdown.parse(text)
        val (headings, tables, rules) = counts(blocks)
        assertEquals(20, headings)
        assertEquals(4, tables)
        assertEquals(13, rules)
    }

    @Test
    fun boldInsideTableCell() {
        val text = File("../../legal/privacy-1.1.md").readText()
        val blocks = LegalMarkdown.parse(text)
        val table = blocks.filterIsInstance<LegalBlock.Table>()[1]
        val firstCellOfFirstDataRow = table.rows[0][0]
        assertTrue(firstCellOfFirstDataRow.any { it is LegalInline.Bold && it.text == "IP-адрес" })
    }

    @Test
    fun ruleIsOwnLine() {
        val blocks = LegalMarkdown.parse("# Заголовок\n\n---\n\nАбзац текста.")
        assertEquals(3, blocks.size)
        assertTrue(blocks[0] is LegalBlock.Heading)
        assertTrue(blocks[1] is LegalBlock.Rule)
        assertTrue(blocks[2] is LegalBlock.Paragraph)
    }

    @Test
    fun headingRequiresSingleLineBlock() {
        val blocks = LegalMarkdown.parse("# Заголовок\nвторая строка того же блока")
        assertEquals(1, blocks.size)
        assertTrue(blocks[0] is LegalBlock.Paragraph)
    }

    @Test
    fun multiLineParagraphJoinedWithSpace() {
        val blocks = LegalMarkdown.parse("Первая строка.\nВторая строка.")
        val paragraph = blocks[0] as LegalBlock.Paragraph
        val text = paragraph.inline.joinToString("") { (it as LegalInline.Text).text }
        assertEquals("Первая строка. Вторая строка.", text)
    }
}
