package com.qwill.app.chat

import com.qwill.app.model.MessageDto

enum class FeedSide { OLDER, NEWER }

data class FeedKeepRange(val keepFromId: Long, val keepToId: Long)

class FeedTrim(val list: List<MessageDto>, val trimmed: Boolean)

object FeedWindow {
    const val PAGE_SIZE = 50
    const val PREFETCH_ROWS = 100
    const val ACCUMULATOR_LIMIT = 1000
    const val RETRY_MS = 4000L
    const val TRIM_IDLE_MS = 150L

    fun merge(list: List<MessageDto>, page: List<MessageDto>, side: FeedSide): List<MessageDto> {
        val known = HashSet<Long>(list.size * 2)
        for (item in list) known.add(item.id)
        val fresh = page.filter { it.id !in known }
        if (fresh.isEmpty()) return list
        if (side == FeedSide.OLDER) return fresh + list
        val settled = list.filter { it.id > 0 }
        val pending = list.filter { it.id < 0 }
        return settled + fresh + pending
    }

    fun trim(list: List<MessageDto>, loaded: FeedSide, limit: Int, keep: FeedKeepRange?): FeedTrim {
        val excess = list.size - limit
        if (keep == null || excess <= 0) return FeedTrim(list, false)
        var cut = 0
        if (loaded == FeedSide.OLDER) {
            while (cut < excess) {
                val item = list.getOrNull(list.size - 1 - cut) ?: break
                if (item.id < 0 || item.id <= keep.keepToId) break
                cut++
            }
            return if (cut == 0) FeedTrim(list, false) else FeedTrim(list.subList(0, list.size - cut).toList(), true)
        }
        while (cut < excess) {
            val item = list.getOrNull(cut) ?: break
            if (item.id >= keep.keepFromId) break
            cut++
        }
        return if (cut == 0) FeedTrim(list, false) else FeedTrim(list.subList(cut, list.size).toList(), true)
    }

    fun keepRange(visibleIds: List<Long>): FeedKeepRange? {
        var from: Long? = null
        var to: Long? = null
        for (id in visibleIds) {
            if (id < 0) continue
            if (from == null || id < from) from = id
            if (to == null || id > to) to = id
        }
        return if (from == null || to == null) null else FeedKeepRange(from, to)
    }
}
