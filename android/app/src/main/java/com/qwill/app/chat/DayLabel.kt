package com.qwill.app.chat

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToLong

object DayLabel {
    private val WEEKDAYS = arrayOf("Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота")
    private val MONTHS = arrayOf(
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    )
    private const val DAY_MS = 86_400_000.0
    private const val WEEK_DAYS = 7L

    fun format(atMs: Long, nowMs: Long = System.currentTimeMillis(), zone: TimeZone = TimeZone.getDefault()): String {
        val moment = Calendar.getInstance(zone).apply { timeInMillis = atMs }
        val now = Calendar.getInstance(zone).apply { timeInMillis = nowMs }
        val diff = ((startOfDay(now) - startOfDay(moment)) / DAY_MS).roundToLong()
        val day = moment.get(Calendar.DAY_OF_MONTH)
        val month = MONTHS[moment.get(Calendar.MONTH)]
        return when {
            diff == 0L -> "Сегодня"
            diff == 1L -> "Вчера"
            diff in 2 until WEEK_DAYS -> WEEKDAYS[moment.get(Calendar.DAY_OF_WEEK) - 1]
            moment.get(Calendar.YEAR) == now.get(Calendar.YEAR) -> "$day $month"
            else -> "$day $month ${moment.get(Calendar.YEAR)} г."
        }
    }

    fun startOfDay(atMs: Long, zone: TimeZone = TimeZone.getDefault()): Long =
        startOfDay(Calendar.getInstance(zone).apply { timeInMillis = atMs })

    fun dayKey(atMs: Long, zone: TimeZone = TimeZone.getDefault()): String {
        val moment = Calendar.getInstance(zone).apply { timeInMillis = atMs }
        return String.format(
            Locale.ROOT,
            "%04d-%02d-%02d",
            moment.get(Calendar.YEAR),
            moment.get(Calendar.MONTH) + 1,
            moment.get(Calendar.DAY_OF_MONTH),
        )
    }

    fun hourMinute(atMs: Long, zone: TimeZone = TimeZone.getDefault()): String {
        val moment = Calendar.getInstance(zone).apply { timeInMillis = atMs }
        return String.format(Locale.ROOT, "%02d:%02d", moment.get(Calendar.HOUR_OF_DAY), moment.get(Calendar.MINUTE))
    }

    private fun startOfDay(calendar: Calendar): Long {
        val copy = calendar.clone() as Calendar
        copy.set(Calendar.HOUR_OF_DAY, 0)
        copy.set(Calendar.MINUTE, 0)
        copy.set(Calendar.SECOND, 0)
        copy.set(Calendar.MILLISECOND, 0)
        return copy.timeInMillis
    }
}
