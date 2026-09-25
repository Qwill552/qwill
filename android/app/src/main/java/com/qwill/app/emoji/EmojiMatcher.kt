package com.qwill.app.emoji

import kotlinx.serialization.Serializable

@Serializable
data class EmojiEntry(val e: String, val x: Int, val y: Int)

@Serializable
data class EmojiIndexFile(
    val cell: Int,
    val cols: Int,
    val rows: Int,
    val emoji: List<EmojiEntry>,
)

data class EmojiMatch(val start: Int, val end: Int, val entry: EmojiEntry)

class EmojiMatcher(entries: List<EmojiEntry>) {
    private val byText = HashMap<String, EmojiEntry>(entries.size * 2)
    private val starts = HashSet<Int>()
    private val maxLength: Int

    init {
        for (entry in entries) byText[entry.e] = entry
        for (entry in entries) {
            val bare = entry.e.replace(VARIATION_SELECTOR, "")
            if (bare != entry.e && allowsBareForm(bare) && bare !in byText) byText[bare] = entry
        }
        for (key in byText.keys) starts.add(key.codePointAt(0))
        maxLength = byText.keys.maxOfOrNull { it.length } ?: 0
    }

    val size: Int get() = byText.size

    fun find(text: CharSequence): List<EmojiMatch> {
        val result = ArrayList<EmojiMatch>()
        var index = 0
        val length = text.length
        while (index < length) {
            val match = longestAt(text, index)
            if (match == null) {
                index += Character.charCount(Character.codePointAt(text, index))
                continue
            }
            val sequenceEnd = sequenceEnd(text, match.end)
            if (sequenceEnd == match.end) {
                result.add(match)
                index = match.end
            } else {
                index = sequenceEnd
            }
        }
        return result
    }

    private fun longestAt(text: CharSequence, start: Int): EmojiMatch? {
        if (Character.codePointAt(text, start) !in starts) return null
        val limit = minOf(text.length - start, maxLength)
        var length = limit
        while (length > 0) {
            val end = start + length
            if (end < text.length && Character.isLowSurrogate(text[end]) && Character.isHighSurrogate(text[end - 1])) {
                length--
                continue
            }
            val entry = byText[text.subSequence(start, end).toString()]
            if (entry != null) return EmojiMatch(start, end, entry)
            length--
        }
        return null
    }

    private fun sequenceEnd(text: CharSequence, from: Int): Int {
        var index = from
        while (index < text.length) {
            val codePoint = Character.codePointAt(text, index)
            val width = Character.charCount(codePoint)
            when {
                codePoint == VARIATION_SELECTOR_CODE || codePoint == KEYCAP || isSkinTone(codePoint) || isTag(codePoint) -> index += width
                codePoint == ZWJ && index + 1 < text.length -> {
                    val next = Character.codePointAt(text, index + 1)
                    index += 1 + Character.charCount(next)
                }
                else -> return index
            }
        }
        return index
    }

    companion object {
        const val VARIATION_SELECTOR = "️"
        private const val VARIATION_SELECTOR_CODE = 0xFE0F
        private const val KEYCAP = 0x20E3
        private const val ZWJ = 0x200D
        private const val BARE_FORM_FROM = 0x2600

        private fun isSkinTone(codePoint: Int): Boolean = codePoint in 0x1F3FB..0x1F3FF

        private fun isTag(codePoint: Int): Boolean = codePoint in 0xE0020..0xE007F

        private fun allowsBareForm(bare: String): Boolean {
            if (bare.isEmpty()) return false
            val first = bare.codePointAt(0)
            val single = Character.charCount(first) == bare.length
            return !single || first >= BARE_FORM_FROM
        }
    }
}
