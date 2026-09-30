package com.qwill.app.chat.composer

import kotlin.math.max

object LongText {
    const val LIMIT = 4096
    const val SEARCH_BACK = 300
    private val SEPARATORS = listOf("\n\n", "\n", ". ", " ")

    fun split(text: String, limit: Int = LIMIT): List<String> {
        val parts = ArrayList<String>()
        var rest = text.trim()
        while (rest.length > limit) {
            val cut = boundary(rest, limit)
            val part = rest.substring(0, cut).trim()
            if (part.isNotEmpty()) parts.add(part)
            rest = rest.substring(cut).trim()
        }
        if (rest.isNotEmpty()) parts.add(rest)
        return parts
    }

    private fun boundary(text: String, limit: Int): Int {
        val from = max(0, limit - SEARCH_BACK)
        for (separator in SEPARATORS) {
            val found = text.lastIndexOf(separator, limit - separator.length)
            if (found >= from && found > 0) return found + separator.length
        }
        return if (Character.isHighSurrogate(text[limit - 1]) && Character.isLowSurrogate(text[limit])) limit - 1 else limit
    }
}
