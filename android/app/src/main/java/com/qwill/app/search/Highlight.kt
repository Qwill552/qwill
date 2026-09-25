package com.qwill.app.search

import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextPaint
import android.text.style.ForegroundColorSpan
import android.text.style.MetricAffectingSpan

data class HighlightRange(val start: Int, val end: Int)

object Highlight {
    private val SEPARATOR = Regex("[^\\p{L}\\p{N}]+")
    private val WORD_CHAR = Regex("[\\p{L}\\p{N}]")

    fun words(query: String): List<String> = normalize(query).split(SEPARATOR).filter { it.isNotEmpty() }

    fun ranges(text: String, query: String): List<HighlightRange> {
        val words = words(query)
        if (words.isEmpty() || text.isEmpty()) return emptyList()
        val haystack = normalize(text)
        val found = ArrayList<HighlightRange>()
        for (word in words) {
            var at = haystack.indexOf(word)
            while (at != -1) {
                val before = if (at == 0) null else text.getOrNull(at - 1)
                if (before == null || !WORD_CHAR.matches(before.toString())) found.add(HighlightRange(at, at + word.length))
                at = haystack.indexOf(word, at + 1)
            }
        }
        return merge(found)
    }

    fun needleOf(query: String): String {
        val trimmed = query.trim()
        return (if (trimmed.startsWith("@")) trimmed.substring(1) else trimmed).trim()
    }

    fun apply(text: CharSequence, query: String, color: Int, typeface: Typeface): CharSequence {
        val ranges = ranges(text.toString(), query)
        if (ranges.isEmpty()) return text
        val builder = SpannableStringBuilder(text)
        for (range in ranges) {
            val end = range.end.coerceAtMost(builder.length)
            if (range.start >= end) continue
            builder.setSpan(ForegroundColorSpan(color), range.start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            builder.setSpan(TypefaceSpanCompat(typeface), range.start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        return builder
    }

    private fun normalize(value: String): String = value.lowercase().replace('ё', 'е')

    private fun merge(ranges: List<HighlightRange>): List<HighlightRange> {
        if (ranges.size < 2) return ranges
        val sorted = ranges.sortedWith(compareBy<HighlightRange>({ it.start }, { it.end }))
        val merged = ArrayList<HighlightRange>()
        var last = sorted.first()
        for (range in sorted.drop(1)) {
            last = if (range.start <= last.end) {
                HighlightRange(last.start, maxOf(last.end, range.end))
            } else {
                merged.add(last)
                range
            }
        }
        merged.add(last)
        return merged
    }

    private class TypefaceSpanCompat(private val typeface: Typeface) : MetricAffectingSpan() {
        override fun updateDrawState(paint: TextPaint) {
            paint.typeface = typeface
        }

        override fun updateMeasureState(paint: TextPaint) {
            paint.typeface = typeface
        }
    }
}
