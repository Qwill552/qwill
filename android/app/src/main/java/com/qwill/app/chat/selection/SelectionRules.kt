package com.qwill.app.chat.selection

import com.qwill.app.model.GroupMemberDTO
import com.qwill.app.model.GroupRole
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageType

object SelectionRules {
    const val LIMIT = 50

    fun selectable(message: MessageDto): Boolean = message.id > 0 && message.deletedAt == null

    fun isGroupAdmin(group: Boolean, members: List<GroupMemberDTO>?, myId: String?): Boolean {
        if (!group || myId == null) return false
        val role = members?.firstOrNull { it.userId == myId }?.role ?: return false
        return role == GroupRole.OWNER || role == GroupRole.ADMIN
    }

    fun canDelete(selected: List<MessageDto>, myId: String?, groupAdmin: Boolean): Boolean =
        selected.isNotEmpty() && selected.all { selectable(it) && (groupAdmin || (myId != null && it.sender?.id == myId)) }

    fun toggle(selected: List<Long>, id: Long, limit: Int = LIMIT): List<Long> = when {
        id in selected -> selected - id
        selected.size >= limit -> selected
        else -> selected + id
    }

    fun rangeBetween(ordered: List<Long>, from: Long, to: Long): List<Long> {
        val start = ordered.indexOf(from)
        val end = ordered.indexOf(to)
        if (start < 0) return emptyList()
        if (end < 0) return listOf(from)
        return if (start <= end) ordered.subList(start, end + 1).toList() else ordered.subList(end, start + 1).asReversed().toList()
    }

    fun dragSelect(base: List<Long>, range: List<Long>, adding: Boolean, limit: Int = LIMIT): List<Long> {
        if (!adding) {
            val drop = range.toHashSet()
            return base.filter { it !in drop }
        }
        val result = ArrayList(base)
        val known = base.toHashSet()
        for (id in range) {
            if (result.size >= limit) break
            if (known.add(id)) result.add(id)
        }
        return result
    }

    fun copyText(selected: List<MessageDto>): String {
        val withText = selected.filter { !it.content.isNullOrEmpty() }.sortedBy { it.id }
        val named = withText.size > 1
        val builder = StringBuilder()
        var previousAuthor: String? = null
        for (message in withText) {
            if (builder.isNotEmpty()) builder.append("\n\n")
            val author = message.sender?.id
            if (named && author != previousAuthor) builder.append(message.sender?.displayName.orEmpty()).append(":\n")
            builder.append(message.content)
            previousAuthor = author
        }
        return builder.toString()
    }
}

class MessageSelection {
    var active = false
        private set

    var ids: List<Long> = emptyList()
        private set

    val count: Int get() = ids.size

    operator fun contains(id: Long): Boolean = id in ids

    fun start(id: Long) {
        active = true
        ids = listOf(id)
    }

    fun set(next: List<Long>) {
        ids = next
        if (next.isEmpty()) active = false
    }

    fun removeAll(gone: Collection<Long>): Boolean {
        val drop = gone.toHashSet()
        val next = ids.filter { it !in drop }
        if (next.size == ids.size) return false
        set(next)
        return true
    }

    fun clear() {
        active = false
        ids = emptyList()
    }
}

object EditRules {
    fun canEdit(message: MessageDto, myId: String?): Boolean =
        myId != null &&
            message.sender?.id == myId &&
            message.id > 0 &&
            message.deletedAt == null &&
            message.type == MessageType.TEXT &&
            message.attachment == null &&
            message.forwardedFrom == null
}

object ReplyRules {
    fun canReply(message: MessageDto, chatWritable: Boolean): Boolean =
        chatWritable &&
            message.id > 0 &&
            message.deletedAt == null &&
            message.type != MessageType.ANNOUNCEMENT &&
            message.announcement == null
}
