package com.qwill.app.chat.calendar

import com.qwill.app.chat.DayLabel
import java.util.Calendar
import java.util.GregorianCalendar
import java.util.Locale

enum class CalendarFilter(val wire: String) {
    ALL("all"),
    MEDIA("media"),
}

object CalendarMonths {
    val MONTH_NAMES = listOf(
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
    )
    val WEEKDAYS = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
    const val WEEK = 7

    fun index(year: Int, monthIndex: Int): Int = year * 12 + monthIndex

    fun indexOfKey(dayKey: String): Int = index(dayKey.substring(0, 4).toInt(), dayKey.substring(5, 7).toInt() - 1)

    fun yearOf(index: Int): Int = index.floorDiv(12)

    fun monthOf(index: Int): Int = index.mod(12)

    fun dayCount(index: Int): Int = GregorianCalendar(yearOf(index), monthOf(index), 1).getActualMaximum(Calendar.DAY_OF_MONTH)

    fun leadingBlanks(index: Int): Int {
        val weekday = GregorianCalendar(yearOf(index), monthOf(index), 1).get(Calendar.DAY_OF_WEEK)
        return (weekday + 5) % WEEK
    }

    fun rows(index: Int): Int = (leadingBlanks(index) + dayCount(index) + WEEK - 1) / WEEK

    fun title(index: Int): String = "${MONTH_NAMES[monthOf(index)]} ${yearOf(index)}"

    fun dayKey(index: Int, day: Int): String = String.format(Locale.ROOT, "%04d-%02d-%02d", yearOf(index), monthOf(index) + 1, day)

    fun firstDay(index: Int): String = dayKey(index, 1)

    fun lastDay(index: Int): String = dayKey(index, dayCount(index))

    fun dayTitle(dayKey: String): String =
        DayLabel.longDate(dayKey.substring(0, 4).toInt(), dayKey.substring(5, 7).toInt() - 1, dayKey.substring(8, 10).toInt())
}
