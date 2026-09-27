package com.qwill.app.chat

import com.qwill.app.core.TaskQueue
import com.qwill.app.model.MessageDto

class ReadTracker(
    private val main: TaskQueue,
    private val clock: () -> Long,
    private val send: (Long) -> Unit,
) {
    private var sent = 0L
    private var pending = 0L
    private var lastSentAt = Long.MIN_VALUE
    private var scheduled = false
    private val flushTask = Runnable {
        scheduled = false
        flush()
    }

    val cursor: Long get() = maxOf(sent, pending)

    fun know(serverCursor: Long?) {
        val value = serverCursor ?: return
        if (value > sent) sent = value
        if (pending <= sent) pending = 0L
    }

    fun seen(messageId: Long): Boolean {
        if (messageId <= 0 || messageId <= cursor) return false
        pending = messageId
        val wait = if (lastSentAt == Long.MIN_VALUE) 0L else lastSentAt + MIN_INTERVAL_MS - clock()
        if (wait <= 0) {
            flush()
        } else if (!scheduled) {
            scheduled = true
            main.postDelayed(flushTask, wait)
        }
        return true
    }

    fun flush() {
        if (scheduled) {
            scheduled = false
            main.cancel(flushTask)
        }
        if (pending <= sent) return
        sent = pending
        pending = 0L
        lastSentAt = clock()
        send(sent)
    }

    fun stop() {
        flush()
    }

    companion object {
        const val MIN_INTERVAL_MS = 500L

        fun unreadBetween(messages: List<MessageDto>, meId: String?, fromExclusive: Long, toInclusive: Long): Int {
            var count = 0
            for (message in messages) {
                if (message.id <= fromExclusive || message.id > toInclusive) continue
                if (message.sender?.id == meId) continue
                count++
            }
            return count
        }
    }
}
