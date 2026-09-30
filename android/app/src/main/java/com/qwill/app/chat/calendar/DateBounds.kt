package com.qwill.app.chat.calendar

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.Locale

data class DateParts(val year: Int, val month: Int, val day: Int) {
    val key: String get() = String.format(Locale.ROOT, "%04d-%02d-%02d", year, month + 1, day)

    companion object {
        fun of(calendar: Calendar): DateParts =
            DateParts(calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH))

        fun ofKey(key: String): DateParts =
            DateParts(key.substring(0, 4).toInt(), key.substring(5, 7).toInt() - 1, key.substring(8, 10).toInt())
    }
}

class ResolvedDate(val parts: DateParts, val years: IntRange, val months: IntRange, val days: IntRange)

object DateBounds {
    fun daysInMonth(year: Int, month: Int): Int = GregorianCalendar(year, month, 1).getActualMaximum(Calendar.DAY_OF_MONTH)

    fun resolve(wanted: DateParts, min: DateParts, max: DateParts): ResolvedDate {
        val floor = if (min.key <= max.key) min else max
        val years = floor.year..max.year
        val year = wanted.year.coerceIn(years.first, years.last)
        val months = (if (year == floor.year) floor.month else 0)..(if (year == max.year) max.month else 11)
        val month = wanted.month.coerceIn(months.first, months.last)
        val total = daysInMonth(year, month)
        val days = (if (year == floor.year && month == floor.month) floor.day else 1)..
            (if (year == max.year && month == max.month) minOf(max.day, total) else total)
        val day = wanted.day.coerceIn(days.first, days.last)
        return ResolvedDate(DateParts(year, month, day), years, months, days)
    }
}
