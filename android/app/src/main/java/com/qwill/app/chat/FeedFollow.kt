package com.qwill.app.chat

data class FollowInput(
    val lastId: Long?,
    val prevLastId: Long?,
    val liveMessageId: Long,
    val isOwnLast: Boolean,
    val wasNewest: Boolean,
    val isAutoScrolling: Boolean,
    val distanceBefore: Float,
    val threshold: Float,
)

object FeedFollow {
    const val FOLLOW_DP = 50f
    const val BOTTOM_SNAP_DP = 8f
    const val STICK_DP = 120f
    const val JUMP_AFTER_SCREENS = 0.5f
    const val SCROLL_ANIMATE_SCREENS = 2f

    fun isTailArrival(lastId: Long?, liveMessageId: Long): Boolean {
        if (lastId == null) return false
        return lastId < 0 || lastId == liveMessageId
    }

    fun distanceBeforeGrowth(scrollHeight: Float, prevScrollHeight: Float, scrollTop: Float, clientHeight: Float, bottomReserve: Float): Float {
        val growth = maxOf(0f, scrollHeight - prevScrollHeight)
        return scrollHeight - scrollTop - clientHeight - bottomReserve - growth
    }

    fun shouldFollow(input: FollowInput): Boolean {
        if (input.lastId == null || input.lastId == input.prevLastId) return false
        if (!input.wasNewest) return false
        val arrival = isTailArrival(input.lastId, input.liveMessageId)
        if (arrival && (input.isOwnLast || input.isAutoScrolling)) return true
        return input.distanceBefore <= input.threshold
    }
}
