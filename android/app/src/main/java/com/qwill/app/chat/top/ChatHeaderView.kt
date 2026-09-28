package com.qwill.app.chat.top

import android.content.Context
import android.view.View
import com.qwill.app.ui.QwillIcon

class ChatHeaderView(context: Context) : ChromeRowLayout(context, ChromeRowLayout.GAP) {
    val back = ChromeCircleButton(context, QwillIcon.BACK, "Назад к чатам")
    val capsule = ChatCapsuleView(context)
    val call = ChromeCircleButton(context, QwillIcon.PHONE, "Позвонить")
    val more = ChromeCircleButton(context, QwillIcon.MORE, "Ещё")

    init {
        setParts(back, capsule, listOf(call, more))
    }

    fun setMode(available: Boolean, service: Boolean) {
        capsule.visibility = if (available) View.VISIBLE else View.GONE
        more.visibility = if (available) View.VISIBLE else View.GONE
        call.visibility = if (available && !service) View.VISIBLE else View.GONE
    }

    fun refresh() {
        capsule.refresh()
        for (view in listOf(back, call, more)) view.invalidate()
    }
}
