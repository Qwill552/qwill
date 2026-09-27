package com.qwill.app.chat

sealed class ChatPosition {
    object Tail : ChatPosition()

    data class At(val messageId: Long, val offsetPx: Int) : ChatPosition()
}

object ChatPositions {
    private val positions = HashMap<String, ChatPosition>()

    fun remember(chatId: String, position: ChatPosition) {
        positions[chatId] = position
    }

    fun recall(chatId: String): ChatPosition? = positions[chatId]

    fun forget(chatId: String) {
        positions.remove(chatId)
    }

    fun clear() {
        positions.clear()
    }
}
