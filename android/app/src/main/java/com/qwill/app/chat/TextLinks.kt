package com.qwill.app.chat

enum class SpanKind { TEXT, LINK, MENTION }

data class TextSpan(val kind: SpanKind, val value: String, val href: String?)

data class LinkRange(val start: Int, val end: Int, val href: String, val mention: Boolean = false)

data class MentionRange(val start: Int, val end: Int, val username: String)

object TextLinks {
    private val SCHEMES = arrayOf("https://", "http://")
    private val TRAILING = setOf('.', ',', '!', '?', ';', '»')

    const val USERNAME_MIN = 3
    const val USERNAME_MAX = 32
    private val LEADING = setOf('(', '[', '«', '"', '\'', ',', ';', ':', '!', '?')

    fun split(content: String?): List<TextSpan> {
        if (content.isNullOrEmpty()) return listOf(TextSpan(SpanKind.TEXT, content.orEmpty(), null))
        val result = ArrayList<TextSpan>()
        var offset = 0
        for (span in linkSpans(content)) {
            if (span.kind == SpanKind.TEXT) splitMentions(content, offset, span.value, result) else result.add(span)
            offset += span.value.length
        }
        return result
    }

    fun mentions(content: String?): List<MentionRange> {
        val result = ArrayList<MentionRange>()
        var offset = 0
        for (span in split(content)) {
            if (span.kind == SpanKind.MENTION) result.add(MentionRange(offset, offset + span.value.length, span.href.orEmpty()))
            offset += span.value.length
        }
        return result
    }

    private fun splitMentions(content: String, offset: Int, value: String, out: MutableList<TextSpan>) {
        var cursor = 0
        var index = value.indexOf('@')
        while (index >= 0) {
            val end = mentionEnd(content, offset + index, offset + value.length)
            if (end > 0) {
                if (index > cursor) out.add(TextSpan(SpanKind.TEXT, value.substring(cursor, index), null))
                val local = end - offset
                val raw = value.substring(index, local)
                out.add(TextSpan(SpanKind.MENTION, raw, raw.substring(1).lowercase()))
                cursor = local
                index = value.indexOf('@', cursor)
            } else {
                index = value.indexOf('@', index + 1)
            }
        }
        if (cursor < value.length || out.isEmpty()) out.add(TextSpan(SpanKind.TEXT, value.substring(cursor), null))
    }

    private fun mentionEnd(content: String, at: Int, limit: Int): Int {
        if (at > 0) {
            val before = content[at - 1]
            if (!isJsWhitespace(before) && before !in LEADING) return -1
        }
        var end = at + 1
        while (end < limit && isUsernameChar(content[end])) end++
        val length = end - at - 1
        if (length < USERNAME_MIN || length > USERNAME_MAX) return -1
        if (end < content.length && isUsernameChar(content[end])) return -1
        return end
    }

    private fun isUsernameChar(char: Char): Boolean = char in 'a'..'z' || char in 'A'..'Z' || char in '0'..'9' || char == '_'

    private fun linkSpans(content: String): List<TextSpan> {
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
            when (span.kind) {
                SpanKind.LINK -> result.add(LinkRange(offset, offset + span.value.length, span.href.orEmpty()))
                SpanKind.MENTION -> result.add(LinkRange(offset, offset + span.value.length, span.href.orEmpty(), mention = true))
                SpanKind.TEXT -> Unit
            }
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
