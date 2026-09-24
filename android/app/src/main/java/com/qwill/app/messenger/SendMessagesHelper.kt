package com.qwill.app.messenger

import com.qwill.app.core.TaskQueue
import com.qwill.app.database.MessagesStorage
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageReplyPreviewDto
import com.qwill.app.model.MessageSendPayload
import com.qwill.app.model.MessageType
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiResult
import com.qwill.app.net.ErrorCode
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

class SendMessagesHelper internal constructor(
    private val storage: MessagesStorage,
    private val storageQueue: TaskQueue,
    private val main: TaskQueue,
    private val transport: MessagesTransport,
    private val holdSocket: () -> () -> Unit,
    private val timings: MessagesTimings,
    private val clock: () -> Long,
    private val guid: Int,
    private val host: Host,
) {
    interface Host {
        val epoch: Int

        fun notify(update: FeedUpdate)

        fun onMessageSent(clientId: String, message: MessageDto)

        fun reloadChat(chatId: String)
    }

    private val inFlight = HashSet<String>()
    private var release: (() -> Unit)? = null
    private var retryAttempt = 0
    private var retryScheduled = false
    private var lastLocalTime = 0L
    private val retryTask = Runnable {
        retryScheduled = false
        drain {}
    }

    val isSending: Boolean get() = inFlight.isNotEmpty()

    fun sendText(chatId: String, text: String, sender: ChatMemberSummary?, replyTo: MessageDto?, callback: SendCallback?) {
        val createdAt = nextLocalTime()
        val message = MessageDto(
            id = -createdAt,
            chatId = chatId,
            clientId = UUID.randomUUID().toString(),
            sender = sender,
            type = MessageType.TEXT,
            content = text,
            replyToId = replyTo?.id,
            replyTo = replyTo?.let { replyPreview(it) },
            createdAt = isoTime(createdAt),
        )
        val epoch = host.epoch
        storageQueue.post {
            val error = try {
                storage.insertUnsent(message, createdAt)
                null
            } catch (e: Exception) {
                e
            }
            main.post {
                if (epoch != host.epoch) return@post
                if (error != null) {
                    callback?.onNotSaved(error)
                    return@post
                }
                host.notify(FeedUpdate.Pending(chatId, message))
                callback?.onQueued(message)
                send(message)
            }
        }
    }

    fun drain(done: () -> Unit) {
        val epoch = host.epoch
        storageQueue.post {
            val rows = storage.readUnsent()
            val due = rows.filter { it.message.clientId != null }
            for (row in due) storage.bumpAttempts(row.message.clientId!!)
            main.post {
                if (epoch != host.epoch) return@post
                for (row in due) send(row.message)
                done()
            }
        }
    }

    fun resetRetry() {
        main.cancel(retryTask)
        retryScheduled = false
        retryAttempt = 0
    }

    fun clear() {
        resetRetry()
        inFlight.clear()
        updateHold()
    }

    private fun send(message: MessageDto) {
        val clientId = message.clientId ?: return
        if (!inFlight.add(clientId)) return
        updateHold()
        val epoch = host.epoch
        val payload = MessageSendPayload(message.chatId, clientId, message.content, message.replyToId)
        transport.sendMessage(payload, guid) { result ->
            if (epoch != host.epoch) return@sendMessage
            inFlight.remove(clientId)
            updateHold()
            when (result) {
                is ApiResult.Success -> onAccepted(clientId, result.value)
                is ApiResult.Failure -> onRejected(message.chatId, clientId, result.error)
            }
        }
    }

    private fun onAccepted(clientId: String, message: MessageDto) {
        resetRetry()
        val epoch = host.epoch
        storageQueue.post {
            storage.confirmUnsent(clientId, message)
            main.post { if (epoch == host.epoch) host.onMessageSent(clientId, message) }
        }
    }

    private fun onRejected(chatId: String, clientId: String, error: Exception) {
        if (error !is ApiError) return
        when (error.code) {
            ErrorCode.RATE_LIMITED -> scheduleRetry()
            ErrorCode.BLOCKED -> {
                drop(chatId, clientId, null)
                host.reloadChat(chatId)
            }
            else -> drop(chatId, clientId, error.message)
        }
    }

    private fun drop(chatId: String, clientId: String, reason: String?) {
        val epoch = host.epoch
        storageQueue.post {
            storage.removeUnsent(clientId)
            main.post { if (epoch == host.epoch) host.notify(FeedUpdate.Failed(chatId, clientId, reason)) }
        }
    }

    private fun scheduleRetry() {
        if (retryScheduled || retryAttempt >= timings.retryLimit) return
        retryAttempt++
        retryScheduled = true
        main.postDelayed(retryTask, retryDelayMs(retryAttempt))
    }

    private fun retryDelayMs(attempt: Int): Long {
        val shift = (attempt - 1).coerceIn(0, MAX_SHIFT)
        return minOf(timings.retryBaseMs shl shift, timings.retryMaxMs)
    }

    private fun updateHold() {
        if (inFlight.isEmpty()) {
            release?.invoke()
            release = null
        } else if (release == null) {
            release = holdSocket()
        }
    }

    private fun nextLocalTime(): Long {
        val now = clock()
        lastLocalTime = if (now > lastLocalTime) now else lastLocalTime + 1
        return lastLocalTime
    }

    private fun replyPreview(target: MessageDto): MessageReplyPreviewDto = MessageReplyPreviewDto(
        id = target.id,
        senderName = target.sender?.displayName ?: DELETED_ACCOUNT,
        content = if (target.deletedAt != null) null else target.content,
        hasAttachment = target.deletedAt == null && target.attachment != null,
        deletedAt = target.deletedAt,
    )

    private fun isoTime(ms: Long): String = SimpleDateFormat(ISO_PATTERN, Locale.ROOT)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }
        .format(Date(ms))

    private companion object {
        const val ISO_PATTERN = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        const val DELETED_ACCOUNT = "Удалённый аккаунт"
        const val MAX_SHIFT = 30
    }
}
