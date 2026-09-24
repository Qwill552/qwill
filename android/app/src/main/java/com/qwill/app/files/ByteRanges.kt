package com.qwill.app.files

data class ByteRange(val start: Long, val end: Long) {
    val length: Long get() = end - start + 1
}

object ByteRanges {
    const val VIDEO_CHUNK_BYTES = 512L * 1024
    const val VIDEO_WINDOW_BYTES = 2 * VIDEO_CHUNK_BYTES

    fun merge(ranges: List<ByteRange>, added: ByteRange): List<ByteRange> {
        if (added.end < added.start) return ranges
        var start = added.start
        var end = added.end
        val result = ArrayList<ByteRange>()
        for (range in ranges) {
            if (range.end + 1 < start || range.start > end + 1) {
                result.add(range)
            } else {
                start = minOf(start, range.start)
                end = maxOf(end, range.end)
            }
        }
        result.add(ByteRange(start, end))
        result.sortBy { it.start }
        return result
    }

    fun covers(ranges: List<ByteRange>, start: Long, end: Long): Boolean =
        ranges.any { it.start <= start && it.end >= end }

    fun coveredFrom(ranges: List<ByteRange>, position: Long): Long {
        val range = ranges.firstOrNull { it.start <= position && it.end >= position } ?: return 0
        return range.end - position + 1
    }

    fun firstGap(ranges: List<ByteRange>, from: Long, total: Long): Long? {
        var position = from
        for (range in ranges.sortedBy { it.start }) {
            if (range.end < position) continue
            if (range.start > position) return if (position < total) position else null
            position = range.end + 1
        }
        return if (position < total) position else null
    }

    fun gapEnd(ranges: List<ByteRange>, gapStart: Long, total: Long): Long {
        val next = ranges.filter { it.start > gapStart }.minOfOrNull { it.start } ?: return total - 1
        return next - 1
    }

    fun coveredBytes(ranges: List<ByteRange>): Long = ranges.sumOf { it.length }

    fun isComplete(ranges: List<ByteRange>, total: Long): Boolean = total > 0 && covers(ranges, 0, total - 1)

    fun window(position: Long, total: Long, chunk: Long = VIDEO_CHUNK_BYTES, maxBytes: Long = VIDEO_WINDOW_BYTES): ByteRange {
        val start = position / chunk * chunk
        val end = minOf(start + maxBytes - 1, total - 1)
        return ByteRange(start, end)
    }

    fun missingIn(ranges: List<ByteRange>, window: ByteRange): ByteRange? {
        val gap = firstGap(ranges, window.start, window.end + 1) ?: return null
        return ByteRange(gap, minOf(window.end, gapEnd(ranges, gap, window.end + 1)))
    }

    fun parseContentRangeTotal(header: String?): Long? {
        val value = header?.trim() ?: return null
        val slash = value.lastIndexOf('/')
        if (slash < 0) return null
        return value.substring(slash + 1).toLongOrNull()?.takeIf { it > 0 }
    }

    fun parseContentRangeStart(header: String?): Long? {
        val value = header?.trim() ?: return null
        val match = Regex("^bytes (\\d+)-(\\d+)/").find(value) ?: return null
        return match.groupValues[1].toLongOrNull()
    }
}
