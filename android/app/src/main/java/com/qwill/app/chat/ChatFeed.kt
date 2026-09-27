package com.qwill.app.chat

import com.qwill.app.core.IsoTime
import com.qwill.app.model.LocalAttachment
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageReactionDto

class ChatFeed(private val meId: () -> String?) {
    var messages: List<MessageDto> = emptyList()
        private set
    var hasMoreBefore = false
        private set
    var hasMoreAfter = false
        private set
    var epoch = 0
        private set
    var loaded = false
        private set
    var unreadAnchorId: Long? = null
    var unreadAtEntry = 0
    var returnToId: Long? = null
    val locals = HashMap<String, LocalAttachment>()
    val rowIds = RowIds()
    private val times = HashMap<String, Long>()

    val atTail: Boolean get() = !hasMoreAfter

    val isEmpty: Boolean get() = messages.isEmpty()

    fun timeOf(message: MessageDto): Long = times.getOrPut(message.createdAt) { IsoTime.parse(message.createdAt) ?: 0L }

    fun rows(): List<FeedRow> = FeedRows.build(messages, meId(), unreadAnchorId, unreadAtEntry, ::timeOf)

    fun replace(settled: List<MessageDto>, pending: List<MessageDto>, before: Boolean, after: Boolean) {
        epoch++
        loaded = true
        messages = settled.sortedBy { it.id } + if (after) emptyList() else pending
        hasMoreBefore = before
        hasMoreAfter = after
    }

    fun mergeOlder(page: List<MessageDto>, more: Boolean) {
        loaded = true
        messages = FeedWindow.merge(messages, page.sortedBy { it.id }, FeedSide.OLDER)
        hasMoreBefore = more
    }

    fun mergeNewer(page: List<MessageDto>, more: Boolean, pending: List<MessageDto> = emptyList()) {
        loaded = true
        var next = FeedWindow.merge(messages, page.sortedBy { it.id }, FeedSide.NEWER)
        if (!more && pending.isNotEmpty()) {
            val known = next.mapNotNullTo(HashSet()) { it.clientId }
            next = next + pending.filter { it.clientId !in known }
        }
        messages = next
        hasMoreAfter = more
    }

    fun mergeTail(page: List<MessageDto>, pending: List<MessageDto>, more: Boolean) {
        val settled = messages.filter { it.id > 0 }
        val byId = LinkedHashMap<Long, MessageDto>(settled.size + page.size)
        for (message in settled) byId[message.id] = message
        for (message in page) {
            val existing = byId[message.id]
            byId[message.id] = if (existing == message) existing else message
        }
        val merged = byId.values.sortedBy { it.id }
        val known = merged.mapNotNullTo(HashSet()) { it.clientId }
        val keptPending = (messages.filter { it.id < 0 } + pending).distinctBy { it.clientId }.filter { it.clientId !in known }
        if (settled.isEmpty()) hasMoreBefore = more
        loaded = true
        messages = merged + keptPending
        hasMoreAfter = false
    }

    fun add(list: List<MessageDto>): List<MessageDto> {
        if (hasMoreAfter) return emptyList()
        val known = messages.mapTo(HashSet()) { it.id }
        val knownClients = messages.mapNotNullTo(HashSet()) { it.clientId }
        val fresh = list.filter { it.id !in known && (it.clientId == null || it.clientId !in knownClients) }
        if (fresh.isEmpty()) return emptyList()
        messages = FeedWindow.merge(messages, fresh.sortedBy { it.id }, FeedSide.NEWER)
        return fresh
    }

    fun pending(message: MessageDto): Boolean {
        if (hasMoreAfter) return false
        if (messages.any { it.clientId != null && it.clientId == message.clientId }) return false
        messages = messages + message
        return true
    }

    fun sent(clientId: String, message: MessageDto): Boolean {
        val index = messages.indexOfFirst { it.clientId == clientId && it.id < 0 }
        locals.remove(clientId)
        if (index < 0) {
            return add(listOf(message)).isNotEmpty()
        }
        val rest = messages.toMutableList()
        rest.removeAt(index)
        if (rest.any { it.id == message.id }) {
            messages = rest
            return true
        }
        val settled = rest.filter { it.id > 0 }
        val pendingRest = rest.filter { it.id < 0 }
        messages = (settled + message).sortedBy { it.id } + pendingRest
        return true
    }

    fun discard(clientId: String): Boolean {
        locals.remove(clientId)
        val before = messages.size
        messages = messages.filter { !(it.id < 0 && it.clientId == clientId) }
        return messages.size != before
    }

    fun change(list: List<MessageDto>): Boolean {
        val byId = list.associateBy { it.id }
        var changed = false
        messages = messages.map { current ->
            val next = byId[current.id]
            if (next != null && next != current) {
                changed = true
                next
            } else {
                current
            }
        }
        return changed
    }

    fun remove(ids: Collection<Long>): Boolean {
        val set = ids.toHashSet()
        val before = messages.size
        messages = messages.filter { it.id !in set }
        if (returnToId in set) returnToId = null
        val anchor = unreadAnchorId
        if (anchor != null && anchor in set) {
            unreadAnchorId = messages.firstOrNull { it.id > anchor && it.sender?.id != meId() }?.id
        }
        return messages.size != before
    }

    fun reactions(messageId: Long, reactions: List<MessageReactionDto>): Boolean {
        var changed = false
        messages = messages.map {
            if (it.id == messageId && it.reactions != reactions) {
                changed = true
                it.copy(reactions = reactions)
            } else {
                it
            }
        }
        return changed
    }

    fun trim(loadedSide: FeedSide, keep: FeedKeepRange?): Boolean {
        val result = FeedWindow.trim(messages, loadedSide, FeedWindow.ACCUMULATOR_LIMIT, keep)
        if (!result.trimmed) return false
        val cutNewer = loadedSide == FeedSide.OLDER
        messages = result.list
        if (cutNewer) hasMoreAfter = true else hasMoreBefore = true
        return true
    }

    fun oldestId(): Long? = messages.firstOrNull { it.id > 0 }?.id

    fun newestId(): Long? = messages.lastOrNull { it.id > 0 }?.id

    fun lastMessage(): MessageDto? = messages.lastOrNull()

    fun contains(messageId: Long): Boolean = messages.any { it.id == messageId }

    fun firstOfDay(dayStartMs: Long): Pair<Int, MessageDto>? {
        for ((index, message) in messages.withIndex()) {
            if (message.id <= 0) continue
            if (DayLabel.startOfDay(timeOf(message)) == dayStartMs) return index to message
        }
        return null
    }
}
