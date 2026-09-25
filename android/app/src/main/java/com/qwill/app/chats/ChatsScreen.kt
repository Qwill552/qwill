package com.qwill.app.chats

import android.content.Context
import android.view.View
import com.qwill.app.ui.AmbientBlobsView
import com.qwill.app.ui.stack.Screen

class ChatsScreen : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    private lateinit var blobs: AmbientBlobsView

    override fun createView(context: Context): View {
        blobs = AmbientBlobsView(context)
        return blobs
    }

    override fun onThemeChanged() {
        blobs.onThemeChanged()
    }
}
