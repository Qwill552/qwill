package com.qwill.app.chat.calendar

import com.qwill.app.model.ChatCalendarDay
import com.qwill.app.model.ChatCalendarResponse

enum class CalendarStatus { LOADING, READY, ERROR }

fun interface CalendarLoader {
    fun load(from: String, to: String, done: (ChatCalendarResponse?) -> Unit)
}

class ChatCalendarData(private val loader: CalendarLoader, private val onChange: () -> Unit) {
    val days = HashMap<String, ChatCalendarDay>()
    var minDate: String? = null
        private set
    var maxDate: String? = null
        private set
    var status = CalendarStatus.LOADING
        private set

    private val requested = HashSet<Int>()
    private val settled = HashSet<Int>()
    private var pending = 0

    fun isSettled(month: Int): Boolean = month in settled

    fun ensure(first: Int, last: Int) {
        val missing = (first..last).filter { it !in requested }
        if (missing.isEmpty()) return
        val tail = missing.last()
        val head = maxOf(missing.first(), tail - MAX_MONTHS)
        for (month in missing) if (month >= head) requested.add(month)
        pending++
        status = CalendarStatus.LOADING
        loader.load(CalendarMonths.firstDay(head), CalendarMonths.lastDay(tail)) { response ->
            pending--
            if (response != null) {
                for (day in response.days) days[day.date] = day
                minDate = response.minDate
                maxDate = response.maxDate
                for (month in head..tail) settled.add(month)
            } else {
                for (month in head..tail) if (month !in settled) requested.remove(month)
            }
            if (pending == 0) status = if (response != null) CalendarStatus.READY else CalendarStatus.ERROR
            onChange()
        }
    }

    companion object {
        const val MAX_MONTHS = 24
    }
}
