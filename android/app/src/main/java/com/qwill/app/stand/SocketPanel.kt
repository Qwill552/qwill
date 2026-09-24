package com.qwill.app.stand

import android.content.Context
import android.text.InputType
import android.widget.EditText
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.core.MainQueue
import com.qwill.app.realtime.ConnectionStateListener
import com.qwill.app.realtime.PresenceListener
import com.qwill.app.realtime.SocketConnectedListener
import com.qwill.app.realtime.SocketSubscription
import com.qwill.app.realtime.TypingSender
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.TextScale
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class SocketPanel(context: Context, private val guid: Int) : StandPanel(context) {
    private val stateLine: TextView
    private val onlineLine: TextView
    private val typingLine: TextView
    private val journalView: TextView
    private val chatId: EditText
    private val journal = ArrayDeque<String>()
    private val clockFormat = SimpleDateFormat("HH:mm:ss", Locale.ROOT)
    private val stateListener = ConnectionStateListener { showState() }
    private val connectedListener = SocketConnectedListener { showState() }
    private val presenceListener = PresenceListener { showOnline() }
    private var events: SocketSubscription? = null
    private var sender: TypingSender? = null
    private var typingTicks = 0
    private val typingTick: Runnable = object : Runnable {
        override fun run() {
            val current = sender ?: return
            if (typingTicks >= TYPING_HOLD_TICKS) {
                current.onLeave()
                sender = null
                typingLine.text = "«Печатаю» остановлено"
                return
            }
            typingTicks++
            current.onTextChanged("печатаю $typingTicks")
            typingLine.text = "«Печатаю» · ${TYPING_HOLD_TICKS - typingTicks + 1} с"
            MainQueue.postDelayed(this, TYPING_TICK_MS)
        }
    }

    init {
        view.addView(label("Сокет", TextScale.SCREEN_TITLE, FontWeight.SEMIBOLD, secondary = false))
        stateLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = true)
        view.addView(stateLine, rowParams(Dimens.SPACE_1))
        onlineLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = true)
        view.addView(onlineLine, rowParams(Dimens.SPACE_1))

        view.addView(button("Разорвать соединение", primary = false) { QwillApplication.socket.debugDrop() }, fieldParams(Dimens.SPACE_3))

        chatId = field("chatId", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
        view.addView(chatId, fieldParams(Dimens.SPACE_2))
        view.addView(button("Печатаю", primary = true) { startTyping() }, fieldParams(Dimens.SPACE_2))
        typingLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = true)
        view.addView(typingLine, rowParams(Dimens.SPACE_2))

        view.addView(label("Журнал событий", TextScale.CAPTION, FontWeight.MEDIUM, secondary = true), rowParams(Dimens.SPACE_4))
        journalView = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = false)
        view.addView(journalView, rowParams(Dimens.SPACE_2))
    }

    fun attach() {
        val socket = QwillApplication.socket
        socket.addStateListener(stateListener)
        socket.addConnectedListener(connectedListener)
        QwillApplication.presence.addListener(presenceListener)
        events = socket.subscribeAll(guid) { name, body -> record(name, body?.toString().orEmpty()) }
        showState()
        showOnline()
    }

    fun detach() {
        val socket = QwillApplication.socket
        socket.removeStateListener(stateListener)
        socket.removeConnectedListener(connectedListener)
        QwillApplication.presence.removeListener(presenceListener)
        events?.remove()
        events = null
        MainQueue.cancel(typingTick)
        sender?.onLeave()
        sender = null
    }

    private fun startTyping() {
        val id = chatId.text.toString().trim()
        if (id.isEmpty()) return
        MainQueue.cancel(typingTick)
        sender?.onLeave()
        sender = TypingSender(QwillApplication.socket, id, MainQueue)
        typingTicks = 0
        typingTick.run()
    }

    private fun record(name: String, body: String) {
        journal.addFirst("${clockFormat.format(Date())} $name ${body.take(BODY_CHARS)}")
        while (journal.size > JOURNAL_SIZE) journal.removeLast()
        journalView.text = journal.joinToString("\n")
    }

    private fun showState() {
        val socket = QwillApplication.socket
        val last = socket.lastConnectedAt
        val since = if (last == 0L) "входа ещё не было" else "последний вход ${clockFormat.format(Date(last))}"
        stateLine.text = "${socket.state.name} · $since"
    }

    private fun showOnline() {
        onlineLine.text = "В сети: ${QwillApplication.presence.onlineCount}"
    }

    private companion object {
        const val JOURNAL_SIZE = 50
        const val BODY_CHARS = 120
        const val TYPING_TICK_MS = 1_000L
        const val TYPING_HOLD_TICKS = 15
    }
}
