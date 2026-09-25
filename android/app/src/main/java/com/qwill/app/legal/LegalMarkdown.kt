package com.qwill.app.legal

sealed class LegalInline {
    class Text(val text: String) : LegalInline()
    class Bold(val text: String) : LegalInline()
}

sealed class LegalBlock {
    class Heading(val level: Int, val inline: List<LegalInline>) : LegalBlock()
    class Paragraph(val inline: List<LegalInline>) : LegalBlock()
    object Rule : LegalBlock()
    class BulletList(val items: List<List<LegalInline>>) : LegalBlock()
    class Table(val header: List<List<LegalInline>>, val rows: List<List<List<LegalInline>>>) : LegalBlock()
}

object LegalMarkdown {
    private val boldPattern = Regex("\\*\\*(.+?)\\*\\*")
    private val headingPattern = Regex("^(#{1,3})\\s+(.+)$")

    fun parse(source: String): List<LegalBlock> {
        val blocks = source.replace("\r\n", "\n").split(Regex("\n{2,}"))
        val result = ArrayList<LegalBlock>()
        for (block in blocks) {
            val lines = block.split("\n").map { it }.filter { it.trim().isNotEmpty() }
            if (lines.isEmpty()) continue

            if (lines.size == 1 && lines[0].trim() == "---") {
                result.add(LegalBlock.Rule)
                continue
            }

            val heading = headingPattern.find(lines[0])
            if (heading != null && lines.size == 1) {
                val level = heading.groupValues[1].length
                result.add(LegalBlock.Heading(level, inline(heading.groupValues[2])))
                continue
            }

            if (lines.all { it.trim().startsWith("|") }) {
                result.add(parseTable(lines))
                continue
            }

            if (lines.all { it.trim().startsWith("- ") }) {
                result.add(LegalBlock.BulletList(lines.map { inline(it.trim().substring(2)) }))
                continue
            }

            val joined = lines.joinToString(" ") { it.trim() }
            result.add(LegalBlock.Paragraph(inline(joined)))
        }
        return result
    }

    private fun parseTable(lines: List<String>): LegalBlock.Table {
        fun cells(row: String): List<String> {
            var trimmed = row.trim()
            if (trimmed.startsWith("|")) trimmed = trimmed.substring(1)
            if (trimmed.endsWith("|")) trimmed = trimmed.substring(0, trimmed.length - 1)
            return trimmed.split("|").map { it.trim() }
        }
        val headerRow = lines.getOrNull(0) ?: return LegalBlock.Table(emptyList(), emptyList())
        val bodyRows = lines.drop(2)
        val header = cells(headerRow).map { inline(it) }
        val rows = bodyRows.map { row -> cells(row).map { inline(it) } }
        return LegalBlock.Table(header, rows)
    }

    private fun inline(text: String): List<LegalInline> {
        val parts = ArrayList<LegalInline>()
        var lastEnd = 0
        for (match in boldPattern.findAll(text)) {
            if (match.range.first > lastEnd) parts.add(LegalInline.Text(text.substring(lastEnd, match.range.first)))
            parts.add(LegalInline.Bold(match.groupValues[1]))
            lastEnd = match.range.last + 1
        }
        if (lastEnd < text.length) parts.add(LegalInline.Text(text.substring(lastEnd)))
        if (parts.isEmpty()) parts.add(LegalInline.Text(""))
        return parts
    }
}
