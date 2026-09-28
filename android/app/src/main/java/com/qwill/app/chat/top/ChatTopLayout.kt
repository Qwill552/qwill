package com.qwill.app.chat.top

object ChatTopLayout {
    const val HEADER = 56f
    const val GAP = 8f
    const val CALL_BANNER = 52f
    const val PINNED_BANNER = 48f
    const val SIDE = 12f
    const val FLOATING_DATE_GAP = 12f

    fun callTop(): Float = HEADER + GAP

    fun pinnedTop(callVisible: Boolean): Float = HEADER + GAP + if (callVisible) CALL_BANNER + GAP else 0f

    fun contentTop(callVisible: Boolean, pinnedVisible: Boolean): Float {
        var top = HEADER
        if (callVisible) top += GAP + CALL_BANNER
        if (pinnedVisible) top += GAP + PINNED_BANNER
        return top
    }
}
