package com.qwill.app.chats

import com.qwill.app.core.IsoTime
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToLong

object ChatRowTime {
    private val WEEKDAYS = arrayOf("вс", "пн", "вт", "ср", "чт", "пт", "сб")
    private val MONTHS = arrayOf("янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек.")
    private const val DAY_MS = 86_400_000.0
    private const val WEEK_DAYS = 7L

    fun format(iso: String, nowMs: Long = System.currentTimeMillis(), zone: TimeZone = TimeZone.getDefault()): String {
        val at = IsoTime.parse(iso) ?: return ""
        return formatMs(at, nowMs, zone)
    }

    fun formatMs(atMs: Long, nowMs: Long, zone: TimeZone): String {
        val moment = Calendar.getInstance(zone).apply { timeInMillis = atMs }
        val now = Calendar.getInstance(zone).apply { timeInMillis = nowMs }
        val diff = ((startOfDay(now) - startOfDay(moment)) / DAY_MS).roundToLong()
        return when {
            diff == 0L -> String.format(Locale.ROOT, "%02d:%02d", moment.get(Calendar.HOUR_OF_DAY), moment.get(Calendar.MINUTE))
            diff == 1L -> "вчера"
            diff in 2 until WEEK_DAYS -> WEEKDAYS[moment.get(Calendar.DAY_OF_WEEK) - 1]
            moment.get(Calendar.YEAR) == now.get(Calendar.YEAR) -> "${moment.get(Calendar.DAY_OF_MONTH)} ${MONTHS[moment.get(Calendar.MONTH)]}"
            else -> String.format(
                Locale.ROOT,
                "%02d.%02d.%02d",
                moment.get(Calendar.DAY_OF_MONTH),
                moment.get(Calendar.MONTH) + 1,
                moment.get(Calendar.YEAR) % 100,
            )
        }
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
