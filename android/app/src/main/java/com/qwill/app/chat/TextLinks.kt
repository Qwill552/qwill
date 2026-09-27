package com.qwill.app.chat

enum class SpanKind { TEXT, LINK }

data class TextSpan(val kind: SpanKind, val value: String, val href: String?)

data class LinkRange(val start: Int, val end: Int, val href: String)

object TextLinks {
    private val SCHEMES = arrayOf("https://", "http://")
    private val TRAILING = setOf('.', ',', '!', '?', ';', '»')

    fun split(content: String?): List<TextSpan> {
        if (content.isNullOrEmpty()) return listOf(TextSpan(SpanKind.TEXT, content.orEmpty(), null))
        val spans = ArrayList<TextSpan>()
        var cursor = 0
        var from = 0
        while (true) {
            val start = nextScheme(content, from)
            if (start < 0) break
            var end = start
            while (end < content.length && !isJsWhitespace(content[end])) end++
            val trimmed = trimTrailing(content.substring(start, end))
            from = end
            if (trimmed.isEmpty() || hostOf(trimmed).isEmpty()) continue
            if (start > cursor) spans.add(TextSpan(SpanKind.TEXT, content.substring(cursor, start), null))
            spans.add(TextSpan(SpanKind.LINK, trimmed, trimmed))
            cursor = start + trimmed.length
        }
        if (cursor < content.length) spans.add(TextSpan(SpanKind.TEXT, content.substring(cursor), null))
        if (spans.isEmpty()) spans.add(TextSpan(SpanKind.TEXT, content, null))
        return spans
    }

    fun ranges(content: String?): List<LinkRange> {
        val result = ArrayList<LinkRange>()
        var offset = 0
        for (span in split(content)) {
            if (span.kind == SpanKind.LINK) result.add(LinkRange(offset, offset + span.value.length, span.href.orEmpty()))
            offset += span.value.length
        }
        return result
    }

    private fun nextScheme(text: String, from: Int): Int {
        var best = -1
        for (scheme in SCHEMES) {
            val found = text.indexOf(scheme, from)
            if (found >= 0 && (best < 0 || found < best)) best = found
        }
        return best
    }

    private fun trimTrailing(url: String): String {
        var end = url.length
        while (end > 0) {
            val char = url[end - 1]
            if (char == ')') {
                val slice = url.substring(0, end)
                if (slice.count { it == ')' } <= slice.count { it == '(' }) break
                end--
                continue
            }
            if (char == ']') {
                val slice = url.substring(0, end)
                if (slice.count { it == ']' } <= slice.count { it == '[' }) break
                end--
                continue
            }
            if (char in TRAILING) {
                end--
                continue
            }
            break
        }
        return url.substring(0, end)
    }

    private fun hostOf(url: String): String {
        val afterScheme = url.substring(url.indexOf("://") + 3)
        val stop = afterScheme.indexOfFirst { it == '/' || it == '?' || it == '#' }
        return if (stop == -1) afterScheme else afterScheme.substring(0, stop)
    }

    private fun isJsWhitespace(char: Char): Boolean = when (char) {
        ' ', '\t', '\n', '\r', '\u000B', '\u000C', '\u00A0', '\u1680', '\u2028', '\u2029', '\u202F', '\u205F', '\u3000', '\uFEFF' -> true
        else -> char in '\u2000'..'\u200A'
    }
}
