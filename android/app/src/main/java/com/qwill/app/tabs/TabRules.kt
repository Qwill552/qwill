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

object SearchCollapse {
    const val HIDE_AT_DP = 26f
    const val SHOW_AT_DP = 8f

    fun next(collapsed: Boolean, offsetDp: Float): Boolean = when {
        offsetDp > HIDE_AT_DP -> true
        offsetDp < SHOW_AT_DP -> false
        else -> collapsed
    }
}
