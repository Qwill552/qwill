package com.qwill.app.chat

import com.qwill.app.ui.theme.FixedColors
import kotlin.math.abs

object AuthorTint {
    private val ORDER: List<Int> = listOf(
        FixedColors.tintViolet,
        FixedColors.tintBlue,
        FixedColors.tintOrange,
        FixedColors.tintGreen,
        FixedColors.tintTeal,
        FixedColors.tintPink,
        FixedColors.tintIndigo,
        FixedColors.tintRed,
    )

    fun hash(key: String): Int {
        var hash = 0
        for (char in key) hash = hash * 31 + char.code
        return hash
    }

    fun indexOf(key: String): Int = abs(hash(key)) % ORDER.size

    fun of(key: String): Int = ORDER[indexOf(key)]
}
