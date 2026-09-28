package com.qwill.app.tabs

enum class MainTab(val label: String) {
    CHATS("Сообщения"),
    CONTACTS("Контакты"),
    SETTINGS("Настройки"),
    PROFILE("Профиль"),
}

enum class TabTransition { FORWARD, BACK, NONE }

object TabRules {
    const val REACTIVATE_RESET_MS = 2_000L

    fun transition(from: MainTab, to: MainTab): TabTransition = when {
        to.ordinal > from.ordinal -> TabTransition.FORWARD
        to.ordinal < from.ordinal -> TabTransition.BACK
        else -> TabTransition.NONE
    }

    fun interceptsBack(selected: MainTab, pageIntercepts: Boolean): Boolean = pageIntercepts || selected != MainTab.CHATS

    fun backTarget(selected: MainTab, pageHandled: Boolean): MainTab? =
        if (!pageHandled && selected != MainTab.CHATS) MainTab.CHATS else null
}

object SearchShift {
    const val HIDDEN_ALPHA = 0.01f

    fun shift(firstTop: Int?, paddingTop: Int, itemCount: Int, slot: Int): Int = when {
        itemCount == 0 -> 0
        firstTop == null -> slot
        else -> (paddingTop - firstTop).coerceIn(0, slot)
    }

    fun alpha(shift: Int, slot: Int): Float = if (slot <= 0) 1f else 1f - shift.toFloat() / slot

    fun collapsed(shift: Int, slot: Int): Boolean = alpha(shift, slot) <= HIDDEN_ALPHA
}
