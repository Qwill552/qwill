package com.qwill.app.core

import java.text.ParseException
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object IsoTime {
    private const val PATTERN = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
    private const val PATTERN_NO_MILLIS = "yyyy-MM-dd'T'HH:mm:ss'Z'"

    fun parse(iso: String?): Long? {
        if (iso.isNullOrEmpty()) return null
        return parseWith(PATTERN, iso) ?: parseWith(PATTERN_NO_MILLIS, iso)
    }

    private fun parseWith(pattern: String, iso: String): Long? = try {
        SimpleDateFormat(pattern, Locale.ROOT).apply {
            timeZone = TimeZone.getTimeZone("UTC")
            isLenient = false
        }.parse(iso)?.time
    } catch (e: ParseException) {
        null
    }
}
