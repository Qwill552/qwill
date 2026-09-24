package com.qwill.app.realtime

import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

object LastSeen {
    const val ONLINE = "в сети"

    private val MONTHS = arrayOf("янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек.")
    private const val ISO_PATTERN = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"

    fun describe(info: PresenceInfo, nowMs: Long = System.currentTimeMillis(), zone: TimeZone = TimeZone.getDefault()): String =
        if (info.online) ONLINE else format(info.lastSeenAt, nowMs, zone)

    fun format(iso: String, nowMs: Long = System.currentTimeMillis(), zone: TimeZone = TimeZone.getDefault()): String {
        val at = parse(iso) ?: return ""
        val moment = Calendar.getInstance(zone).apply { timeInMillis = at }
        val now = Calendar.getInstance(zone).apply { timeInMillis = nowMs }
        val time = "%02d:%02d".format(Locale.ROOT, moment.get(Calendar.HOUR_OF_DAY), moment.get(Calendar.MINUTE))
        val today = moment.get(Calendar.YEAR) == now.get(Calendar.YEAR) &&
            moment.get(Calendar.DAY_OF_YEAR) == now.get(Calendar.DAY_OF_YEAR)
        if (today) return "был(а) в $time"
        return "был(а) ${moment.get(Calendar.DAY_OF_MONTH)} ${MONTHS[moment.get(Calendar.MONTH)]} в $time"
    }

    private fun parse(iso: String): Long? = try {
        SimpleDateFormat(ISO_PATTERN, Locale.ROOT).apply { timeZone = TimeZone.getTimeZone("UTC") }.parse(iso)?.time
    } catch (e: ParseException) {
        null
    }
}
