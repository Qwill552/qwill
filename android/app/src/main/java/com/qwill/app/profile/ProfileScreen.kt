package com.qwill.app.profile

import android.content.Context
import android.view.View
import android.widget.FrameLayout
import com.qwill.app.ui.stack.Screen

class ProfileScreen : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    override fun createView(context: Context): View = FrameLayout(context)
}
