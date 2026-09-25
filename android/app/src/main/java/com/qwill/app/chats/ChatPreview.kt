package com.qwill.app.chats

import com.qwill.app.calls.CallText
import com.qwill.app.files.MediaTypes
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatType
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.QwillIcon

data class ChatPreviewText(
    val icon: QwillIcon?,
    val author: String,
    val text: String,
    val failedCall: Boolean,
    val own: Boolean,
)

object ChatPreview {
    const val ANNOUNCEMENT_PREVIEW_TEXT = "Что нового в Qwill"
    const val NO_MESSAGES = "Нет сообщений"

    private val WHITESPACE = Regex("[ \\t\\n\\r\\u000C]+")

    fun of(chat: ChatListItemDto, myUserId: String?): ChatPreviewText {
        val last = chat.lastMessage
        val own = last?.sender != null && myUserId != null && last.sender.id == myUserId
        val call = last?.call?.takeIf { last.deletedAt == null }
        val author = when {
            call != null -> ""
            own -> "Вы: "
            chat.type == ChatType.GROUP && last?.sender != null -> "${last.sender.displayName}: "
            else -> ""
        }
        return ChatPreviewText(
            icon = iconOf(last, own),
            author = author,
            text = collapse(textOf(last, own)),
            failedCall = call != null && CallText.isFailed(call),
            own = own,
        )
    }

    private fun iconOf(last: MessageDto?, own: Boolean): QwillIcon? {
        if (last == null) return null
        val call = last.call
        if (call != null && last.deletedAt == null) return CallText.symbol(call, own)
        if (last.attachment == null) return null
        return when {
            isVoice(last) -> QwillIcon.MIC
            isImage(last) -> QwillIcon.CAMERA
            isVideo(last) -> QwillIcon.IMAGE
            else -> QwillIcon.ATTACH
        }
    }

    private fun textOf(last: MessageDto?, own: Boolean): String {
        if (last == null) return NO_MESSAGES
        val call = last.call
        if (call != null) return CallText.preview(call, own)
        if (last.announcement != null) return ANNOUNCEMENT_PREVIEW_TEXT
        if (!last.content.isNullOrEmpty()) return last.content
        val attachment = last.attachment ?: return NO_MESSAGES
        return when {
            isVoice(last) -> "Голосовое сообщение"
            isImage(last) -> "Фото"
            isVideo(last) -> "Видео"
            else -> attachment.originalName.ifEmpty { "Файл" }
        }
    }

    private fun isVoice(message: MessageDto): Boolean {
        val attachment = message.attachment ?: return false
        return attachment.peaks != null || attachment.file.mimeType.startsWith("audio/")
    }

    private fun isImage(message: MessageDto): Boolean = message.attachment?.file?.mimeType?.startsWith("image/") == true

    private fun isVideo(message: MessageDto): Boolean {
        val mimeType = message.attachment?.file?.mimeType ?: return false
        return MediaTypes.isPlayableVideo(mimeType)
    }

    fun collapse(text: String): String = text.replace(WHITESPACE, " ").trim()
}
