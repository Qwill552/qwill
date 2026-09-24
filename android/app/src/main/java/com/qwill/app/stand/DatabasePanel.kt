package com.qwill.app.stand

import android.content.Context
import android.text.InputType
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.messenger.ChatsListener
import com.qwill.app.messenger.FeedListener
import com.qwill.app.messenger.FeedUpdate
import com.qwill.app.messenger.HistoryCallback
import com.qwill.app.messenger.HistoryPage
import com.qwill.app.messenger.HistorySource
import com.qwill.app.messenger.SendCallback
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiException
import com.qwill.app.realtime.ConnectionStateListener
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dpInt
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class DatabasePanel(context: Context, private val guid: Int) : StandPanel(context) {
    private val statsLine: TextView
    private val stateLine: TextView
    private val chatsList: LinearLayout
    private val journalView: TextView
    private val chatId: EditText
    private val text: EditText
    private val journal = ArrayDeque<String>()
    private val clockFormat = SimpleDateFormat("HH:mm:ss", Locale.ROOT)
    private val chatsListener = ChatsListener {
        showChats()
        showStats()
        showState()
    }
    private val stateListener = ConnectionStateListener { showState() }
    private val feedListener = FeedListener { onFeed(it) }
    private var oldestId: Long? = null

    init {
        view.addView(label("База", TextScale.SCREEN_TITLE, FontWeight.SEMIBOLD, secondary = false))
        statsLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = true)
        view.addView(statsLine, rowParams(Dimens.SPACE_1))
        stateLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = true)
        view.addView(stateLine, rowParams(Dimens.SPACE_1))

        view.addView(label("Чаты в базе", TextScale.CAPTION, FontWeight.MEDIUM, secondary = true), rowParams(Dimens.SPACE_3))
        chatsList = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        view.addView(chatsList, rowParams(Dimens.SPACE_1))

        chatId = field("chatId", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
        view.addView(chatId, fieldParams(Dimens.SPACE_3))
        view.addView(
            pair(
                button("Открыть чат", primary = true) { openChat() },
                button("Ещё старше", primary = false) { loadOlder() },
            ),
            fieldParams(Dimens.SPACE_2),
        )
        text = field("Текст сообщения", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES)
        view.addView(text, fieldParams(Dimens.SPACE_2))
        view.addView(
            pair(
                button("Отправить", primary = true) { send() },
                button("Стереть базу", primary = false) { wipe() },
            ),
            fieldParams(Dimens.SPACE_2),
        )

        view.addView(label("Журнал базы", TextScale.CAPTION, FontWeight.MEDIUM, secondary = true), rowParams(Dimens.SPACE_4))
        journalView = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = false)
        view.addView(journalView, rowParams(Dimens.SPACE_2))
    }

    override fun applyAppearance() {
        super.applyAppearance()
        showChats()
    }

    fun attach() {
        val messages = QwillApplication.messages
        messages.addChatsListener(chatsListener)
        messages.addFeedListener(feedListener)
        QwillApplication.socket.addStateListener(stateListener)
        showChats()
        showStats()
        showState()
    }

    fun detach() {
        val messages = QwillApplication.messages
        messages.removeChatsListener(chatsListener)
        messages.removeFeedListener(feedListener)
        QwillApplication.socket.removeStateListener(stateListener)
        currentChat()?.let { messages.closeChat(it) }
    }

    private fun openChat() {
        val id = currentChat() ?: return
        oldestId = null
        QwillApplication.messages.openChat(id, guid, history("Открыть чат"))
    }

    private fun loadOlder() {
        val id = currentChat() ?: return
        val edge = oldestId ?: return record("Ещё старше: сначала «Открыть чат»")
        QwillApplication.messages.loadOlder(id, edge, guid, history("Ещё старше"))
    }

    private fun send() {
        val id = currentChat() ?: return
        val value = text.text.toString().trim()
        if (value.isEmpty()) return
        text.setText("")
        QwillApplication.messages.sendText(
            id,
            value,
            callback = object : SendCallback {
                override fun onQueued(message: MessageDto) {
                    record("в очереди: ${message.clientId?.take(CLIENT_ID_CHARS)}")
                    showStats()
                }

                override fun onNotSaved(error: Exception) {
                    record("не сохранено: ${error.message}")
                }
            },
        )
    }

    private fun wipe() {
        oldestId = null
        QwillApplication.messages.wipeStorage()
        record("база стёрта")
        showStats()
    }

    private fun history(action: String): HistoryCallback = object : HistoryCallback {
        override fun onHistory(page: HistoryPage) {
            val source = if (page.source == HistorySource.DISK) "диск" else "сеть"
            val first = page.messages.firstOrNull()?.id
            if (first != null && (oldestId == null || first < oldestId!!)) oldestId = first
            val offline = if (page.offline) ", офлайн" else ""
            record("$action · $source: ${page.messages.size}, в очереди ${page.pending.size}$offline")
            showStats()
        }

        override fun onHistoryFailed(error: ApiException) {
            record("$action · ошибка: ${error.message}")
        }
    }

    private fun onFeed(update: FeedUpdate) {
        val line = when (update) {
            is FeedUpdate.Added -> "пришло ${update.messages.size}"
            is FeedUpdate.Changed -> "изменено ${update.messages.size}"
            is FeedUpdate.Removed -> "удалено ${update.ids.size}"
            is FeedUpdate.ReactionsChanged -> "реакции на ${update.messageId}"
            is FeedUpdate.Replaced -> "история подменена: ${update.messages.size}"
            is FeedUpdate.Pending -> "отправляется ${update.message.id}"
            is FeedUpdate.Sent -> "отправлено ${update.message.id}"
            is FeedUpdate.Failed -> "не отправлено" + (update.reason?.let { ": $it" } ?: "")
            is FeedUpdate.DetailsChanged -> "описание чата обновлено"
            is FeedUpdate.ChatGone -> if (update.kicked) "исключён из чата" else "чат удалён"
        }
        record("${update.chatId.take(CHAT_ID_CHARS)} $line")
        showStats()
    }

    private fun showChats() {
        chatsList.removeAllViews()
        val chats = QwillApplication.messages.chats
        if (chats.isEmpty()) {
            chatsList.addView(chatRow("пусто", Theme.palette.textSecondary))
            return
        }
        for (chat in chats) {
            val preview = chat.lastMessage?.content?.take(PREVIEW_CHARS).orEmpty()
            chatsList.addView(
                chatRow("${chat.title} · ${chat.unreadCount} · $preview", Theme.palette.textPrimary).apply {
                    isFocusable = true
                    setOnClickListener { chatId.setText(chat.id) }
                },
            )
        }
    }

    private fun chatRow(value: String, color: Int): TextView = TextView(context).apply {
        text = value
        typeface = Fonts.display(FontWeight.REGULAR)
        includeFontPadding = false
        maxLines = 1
        ellipsize = TextUtils.TruncateAt.END
        gravity = Gravity.CENTER_VERTICAL
        minHeight = context.dpInt(Dimens.TAP_MIN)
        setTextColor(color)
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.CAPTION))
    }

    private fun showStats() {
        QwillApplication.messages.stats { stats ->
            statsLine.text = "чатов ${stats.chats} · сообщений ${stats.messages} · диапазонов ${stats.ranges} · " +
                "в очереди ${stats.unsent} · файл ${stats.fileBytes / BYTES_IN_KB} КБ"
        }
    }

    private fun showState() {
        val messages = QwillApplication.messages
        val at = messages.lastCatchUpAt
        val catchUp = if (at == 0L) "догона ещё не было" else "догон ${clockFormat.format(Date(at))}, чатов ${messages.lastCatchUpChats}"
        stateLine.text = "${QwillApplication.socket.state.name} · $catchUp"
    }

    private fun currentChat(): String? = chatId.text.toString().trim().ifEmpty { null }

    private fun record(line: String) {
        journal.addFirst("${clockFormat.format(Date())} $line")
        while (journal.size > JOURNAL_SIZE) journal.removeLast()
        journalView.text = journal.joinToString("\n")
    }

    private companion object {
        const val JOURNAL_SIZE = 40
        const val PREVIEW_CHARS = 40
        const val CHAT_ID_CHARS = 8
        const val CLIENT_ID_CHARS = 8
        const val BYTES_IN_KB = 1024
    }
}
