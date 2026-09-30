package com.qwill.app.chat.composer

import com.qwill.app.chat.TextLinks
import com.qwill.app.model.ChatType
import com.qwill.app.model.MessageDto

data class MentionQueryMatch(val start: Int, val end: Int, val query: String)

object MentionQuery {
    const val MAX_QUERY = 64

    fun find(text: CharSequence, selectionStart: Int, selectionEnd: Int): MentionQueryMatch? {
        if (selectionStart != selectionEnd || selectionStart < 0 || selectionStart > text.length) return null
        val cursor = selectionStart
        var at = cursor - 1
        while (at >= 0 && cursor - at <= MAX_QUERY + 1) {
            val char = text[at]
            if (char == '\n') return null
            if (char == '@') {
                if (at > 0 && text[at - 1] != ' ' && text[at - 1] != '\n') return null
                val query = text.subSequence(at + 1, cursor).toString()
                if (query.isNotEmpty() && (query.first().isWhitespace() || query.last().isWhitespace())) return null
                return MentionQueryMatch(at, cursor, query)
            }
            at--
        }
        return null
    }

    fun insertion(username: String): String = "@$username "
}

object MentionRules {
    fun mentionsMe(message: MessageDto, chatType: ChatType, myId: String?, myUsername: String?, repliedSenderId: String?): Boolean {
        if (chatType != ChatType.GROUP || myId == null) return false
        if (message.sender?.id == myId || message.deletedAt != null) return false
        if (repliedSenderId == myId) return true
        val username = myUsername?.lowercase() ?: return false
        return TextLinks.mentions(message.content).any { it.username == username }
    }
}
