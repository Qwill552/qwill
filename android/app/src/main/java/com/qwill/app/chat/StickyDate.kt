package com.qwill.app.chat

data class StickyPlace(val topIndex: Int, val dayIndex: Int, val offset: Float)

object StickyDate {
    const val HIDE_MS = 1000L

    fun compute(
        tops: FloatArray,
        count: Int,
        isDay: (Int) -> Boolean,
        clip: Float,
        dividerHeight: Float,
        dayAbove: Boolean = false,
    ): StickyPlace? {
        if (count == 0) return null
        val topIndex = indexAt(tops, count, clip)
        var dayIndex = topIndex
        while (dayIndex > 0 && !isDay(dayIndex)) dayIndex--
        if (!isDay(dayIndex) || tops[dayIndex] > clip) {
            if (!dayAbove || isDay(dayIndex) || tops[0] > clip) return null
            dayIndex = -1
        }
        var offset = 0f
        for (next in topIndex + 1 until count) {
            if (!isDay(next)) continue
            val gap = tops[next] - clip
            if (gap < dividerHeight) offset = gap - dividerHeight
            break
        }
        return StickyPlace(topIndex, dayIndex, offset)
    }

    private fun indexAt(tops: FloatArray, count: Int, offset: Float): Int {
        var low = 0
        var high = count - 1
        while (low < high) {
            val mid = (low + high + 1) ushr 1
            if (tops[mid] <= offset) low = mid else high = mid - 1
        }
        return low
    }
}
