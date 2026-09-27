package com.qwill.app.chat

import com.qwill.app.model.MessageDto
import java.util.TimeZone

sealed class FeedRow {
    abstract val key: String

    class Day(val dayStartMs: Long, val firstMessageId: Long, occurrence: Int) : FeedRow() {
        override val key: String = if (occurrence == 0) "day:$dayStartMs" else "day:$dayStartMs#$occurrence"
    }

    class Unread(val count: Int) : FeedRow() {
        override val key: String get() = KEY

        companion object {
            const val KEY = "unread"
        }
    }

    class Message(
        val message: MessageDto,
        val own: Boolean,
        val sameAuthorAsPrev: Boolean,
        val sameAuthorAsNext: Boolean,
        val createdAtMs: Long,
        val dayStartMs: Long,
    ) : FeedRow() {
        override val key: String = keyOf(message)
    }

    companion object {
        fun keyOf(message: MessageDto): String = message.clientId?.let { "c:$it" } ?: "m:${message.id}"
    }
}

class RowIds {
    private val ids = HashMap<String, Long>()
    private var next = 1L

    fun idOf(key: String): Long = ids.getOrPut(key) { next++ }

    fun alias(from: String, to: String) {
        val existing = ids[from] ?: return
        ids[to] = existing
    }
}

object FeedRows {
    const val GROUP_WINDOW_MS = 5 * 60 * 1000L

    fun build(
        messages: List<MessageDto>,
        meId: String?,
        unreadAnchorId: Long?,
        unreadCount: Int,
        timeOf: (MessageDto) -> Long,
        zone: TimeZone = TimeZone.getDefault(),
    ): List<FeedRow> {
        val rows = ArrayList<FeedRow>(messages.size + 8)
        val seenDays = HashMap<Long, Int>()
        val times = LongArray(messages.size) { timeOf(messages[it]) }
        val days = LongArray(messages.size)
        var cachedDayFrom = Long.MAX_VALUE
        var cachedDayTo = Long.MIN_VALUE
        var cachedDay = 0L
        for (index in messages.indices) {
            val at = times[index]
            if (at < cachedDayFrom || at >= cachedDayTo) {
                cachedDay = DayLabel.startOfDay(at, zone)
                cachedDayFrom = cachedDay
                cachedDayTo = DayLabel.startOfDay(cachedDay + DAY_PROBE_MS, zone)
            }
            days[index] = cachedDay
        }
        for (index in messages.indices) {
            val message = messages[index]
            val previous = messages.getOrNull(index - 1)
            val next = messages.getOrNull(index + 1)
            if (previous == null || days[index - 1] != days[index]) {
                val occurrence = seenDays[days[index]] ?: 0
                seenDays[days[index]] = occurrence + 1
                rows.add(FeedRow.Day(days[index], message.id, occurrence))
            }
            if (unreadAnchorId != null && message.id == unreadAnchorId) rows.add(FeedRow.Unread(unreadCount))
            val sameAsPrev = previous != null &&
                previous.sender?.id == message.sender?.id &&
                days[index - 1] == days[index] &&
                times[index] - times[index - 1] < GROUP_WINDOW_MS
            val sameAsNext = next != null &&
                next.sender?.id == message.sender?.id &&
                days[index + 1] == days[index] &&
                times[index + 1] - times[index] < GROUP_WINDOW_MS
            val own = meId != null && message.sender?.id == meId
            rows.add(FeedRow.Message(message, own, sameAsPrev, sameAsNext, times[index], days[index]))
        }
        return rows
    }

    private const val DAY_PROBE_MS = 26 * 60 * 60 * 1000L
}
