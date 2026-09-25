package com.qwill.app.chat

import android.content.Context
import android.view.View
import com.qwill.app.QwillApplication
import com.qwill.app.ui.AmbientBlobsView
import com.qwill.app.ui.stack.Screen

class ChatScreen(val chatId: String) : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    private lateinit var blobs: AmbientBlobsView

    override fun createView(context: Context): View {
        blobs = AmbientBlobsView(context)
        return blobs
    }

    override fun onShown() {
        QwillApplication.messages.setLiveChat(chatId)
    }

    override fun onHidden() {
        if (QwillApplication.messages.liveChatId == chatId) QwillApplication.messages.setLiveChat(null)
    }

    override fun onThemeChanged() {
        blobs.onThemeChanged()
    }
}
