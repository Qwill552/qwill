package com.qwill.app.chat.cells

import com.qwill.app.emoji.EmojiEntry
import com.qwill.app.emoji.EmojiMatcher
import kotlin.math.max
import kotlin.math.min

class BubbleScale(val base: Float) {
    val text: Float get() = base
    val line: Float get() = base * LINE_HEIGHT
    val author: Float get() = base * AUTHOR
    val caption: Float get() = base * CAPTION
    val meta: Float get() = base * META
    val meta2: Float get() = base * SUBTITLE
    val emojiInline: Float get() = base * LINE_HEIGHT
    val emojiOnly: Float get() = base * EMOJI_ONLY

    fun lineOf(size: Float): Float = size * LINE_HEIGHT

    companion object {
        const val REFERENCE = 15f
        const val LINE_HEIGHT = 1.34f
        const val AUTHOR = 12.5f / REFERENCE
        const val CAPTION = 0.82f
        const val META = 0.82f
        const val SUBTITLE = 0.93f
        const val EMOJI_ONLY = 3.2f
    }
}

data class MetaFit(val inline: Boolean, val contentWidth: Float, val extraLine: Boolean)

data class ChipFlow(val xs: FloatArray, val ys: FloatArray, val width: Float, val height: Float, val lines: Int)

data class ReactionRowFit(val contentWidth: Float, val flow: ChipFlow, val chipsHeight: Float)

object BubbleGeometry {
    const val MAX_WIDTH_FRACTION = 0.76f
    const val PAD_TOP = 8f
    const val PAD_X = 12f
    const val PAD_BOTTOM = 7f
    const val BORDER = 1f
    const val RADIUS = 20f
    const val RADIUS_TAIL = 7f
    const val META_GAP = 12f
    const val ROW_MIN = 44f
    const val ROW_GAP = 4f
    const val AVATAR = 36f
    const val CHIP_H = 26f
    const val CHIP_PAD_X = 8f
    const val CHIP_GAP = 4f
    const val CHIP_TOP = 4f
    const val CHIP_EMOJI = 16f
    const val CHIP_INNER_GAP = 3f
    const val REACTION_META_GAP = 12f
    const val EMOJI_ONLY_MAX = 3
    const val EMOJI_ONLY_GAP = 4f

    fun maxBubbleWidth(rowWidth: Float): Float = rowWidth * MAX_WIDTH_FRACTION

    fun maxContentWidth(rowWidth: Float, density: Float): Float =
        max(0f, maxBubbleWidth(rowWidth) - (PAD_X + BORDER) * 2 * density)

    fun placeMeta(lastLineWidth: Float, widestLine: Float, metaWidth: Float, maxContentWidth: Float, gap: Float): MetaFit {
        val pad = metaWidth + gap
        if (lastLineWidth + pad <= maxContentWidth) return MetaFit(true, min(maxContentWidth, max(widestLine, lastLineWidth + pad)), false)
        return MetaFit(false, min(maxContentWidth, max(widestLine, pad)), true)
    }

    fun flowChips(widths: FloatArray, available: Float, gap: Float, chipHeight: Float): ChipFlow {
        val xs = FloatArray(widths.size)
        val ys = FloatArray(widths.size)
        if (widths.isEmpty()) return ChipFlow(xs, ys, 0f, 0f, 0)
        var x = 0f
        var y = 0f
        var lines = 1
        var widest = 0f
        for (index in widths.indices) {
            val width = widths[index]
            if (x > 0f && x + width > available) {
                x = 0f
                y += chipHeight + gap
                lines++
            }
            xs[index] = x
            ys[index] = y
            x += width
            widest = max(widest, x)
            x += gap
        }
        return ChipFlow(xs, ys, widest, y + chipHeight, lines)
    }

    fun singleLineWidth(widths: FloatArray, gap: Float): Float {
        if (widths.isEmpty()) return 0f
        return widths.sum() + gap * (widths.size - 1)
    }

    fun reactionRow(
        chipWidths: FloatArray,
        otherContentWidth: Float,
        metaWidth: Float,
        maxContentWidth: Float,
        chipGap: Float,
        chipHeight: Float,
        metaGap: Float,
        chipTop: Float,
    ): ReactionRowFit {
        val oneLine = singleLineWidth(chipWidths, chipGap)
        val trailing = if (metaWidth > 0f) metaGap + metaWidth else 0f
        val contentWidth = min(maxContentWidth, max(otherContentWidth, oneLine + trailing))
        val flow = flowChips(chipWidths, max(0f, contentWidth - trailing), chipGap, chipHeight)
        return ReactionRowFit(contentWidth, flow, chipTop + flow.height)
    }

    fun emojiOnly(text: String?, matcher: EmojiMatcher?): List<EmojiEntry>? {
        if (text.isNullOrEmpty() || matcher == null) return null
        val matches = matcher.find(text)
        if (matches.isEmpty() || matches.size > EMOJI_ONLY_MAX) return null
        val rest = StringBuilder()
        var cursor = 0
        for (match in matches) {
            rest.append(text, cursor, match.start)
            cursor = match.end
        }
        rest.append(text, cursor, text.length)
        if (rest.isNotBlank()) return null
        return matches.map { it.entry }
    }

    fun rowHeight(bubbleHeight: Float, density: Float): Float = max(ROW_MIN * density, bubbleHeight) + ROW_GAP * density

    fun bubbleTop(bubbleHeight: Float, density: Float): Float = max(0f, (ROW_MIN * density - bubbleHeight) / 2f)
}
