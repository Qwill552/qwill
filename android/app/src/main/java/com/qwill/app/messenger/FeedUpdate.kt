package com.qwill.app.messenger

import com.qwill.app.model.ChatDto
import com.qwill.app.model.LocalAttachment
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageReactionDto
import com.qwill.app.net.ApiException
import java.io.File

sealed class FeedUpdate(val chatId: String) {
    class Added(chatId: String, val messages: List<MessageDto>) : FeedUpdate(chatId)

    class Changed(chatId: String, val messages: List<MessageDto>) : FeedUpdate(chatId)

    class Removed(chatId: String, val ids: List<Long>) : FeedUpdate(chatId)

    class ReactionsChanged(chatId: String, val messageId: Long, val reactions: List<MessageReactionDto>) : FeedUpdate(chatId)

    class Replaced(chatId: String, val messages: List<MessageDto>, val hasMoreBefore: Boolean) : FeedUpdate(chatId)

    class Pending(chatId: String, val message: MessageDto) : FeedUpdate(chatId)

    class Sent(chatId: String, val clientId: String, val message: MessageDto) : FeedUpdate(chatId)

    class Failed(chatId: String, val clientId: String, val reason: String?) : FeedUpdate(chatId)

    class LocalAttachmentChanged(chatId: String, val clientId: String, val local: LocalAttachment, val dir: File) : FeedUpdate(chatId)

    class UploadProgress(chatId: String, val clientId: String, val share: Float) : FeedUpdate(chatId)

    class Discarded(chatId: String, val clientId: String) : FeedUpdate(chatId)

    class DetailsChanged(chatId: String, val details: ChatDto) : FeedUpdate(chatId)

    class ChatGone(chatId: String, val kicked: Boolean) : FeedUpdate(chatId)
}

fun interface FeedListener {
    fun onFeedUpdate(update: FeedUpdate)
}

fun interface ChatsListener {
    fun onChatsChanged()
}

enum class HistorySource { DISK, NETWORK }

class HistoryPage(
    val chatId: String,
    val messages: List<MessageDto>,
    val pending: List<MessageDto>,
    val hasMoreBefore: Boolean,
    val hasMoreAfter: Boolean,
    val source: HistorySource,
    val offline: Boolean = false,
    val pendingLocal: Map<String, LocalAttachment> = emptyMap(),
)

interface HistoryCallback {
    fun onHistory(page: HistoryPage)

    fun onHistoryFailed(error: ApiException) {}

    fun onDetails(chat: ChatDto, source: HistorySource) {}
}

interface SendCallback {
    fun onQueued(message: MessageDto) {}

    fun onNotSaved(error: Exception) {}
}

data class MessagesTimings(
    val pageSize: Int = 50,
    val syncPageLimit: Int = 5,
    val totalLimit: Int = 20_000,
    val preloadLimit: Int = 10,
    val preloadIntervalMs: Long = 400,
    val cleanupIntervalMs: Long = 2 * 60 * 60 * 1000L,
    val retryBaseMs: Long = 1_000,
    val retryMaxMs: Long = 60_000,
    val retryLimit: Int = 12,
)
