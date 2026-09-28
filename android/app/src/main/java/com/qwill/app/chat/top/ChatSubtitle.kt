package com.qwill.app.chat.top

import com.qwill.app.core.plural
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.realtime.LastSeen
import com.qwill.app.realtime.PresenceInfo
import com.qwill.app.realtime.Typist
import com.qwill.app.ui.TitleKind
import java.util.TimeZone

enum class SubtitleTone { DEFAULT, ONLINE, ACCENT }

data class Subtitle(
    val text: String,
    val tone: SubtitleTone = SubtitleTone.DEFAULT,
    val typing: Boolean = false,
    val dots: Boolean = false,
)

class SubtitleInput(
    val connection: TitleKind,
    val service: Boolean,
    val group: Boolean,
    val members: List<ChatMemberSummary>?,
    val myId: String?,
    val typists: List<Typist>,
    val otherMember: ChatMemberSummary?,
    val presence: (String) -> PresenceInfo?,
)

object ChatSubtitle {
    const val TYPING = "печатает…"
    const val TYPING_MANY = "печатают…"

    fun of(input: SubtitleInput, nowMs: Long = System.currentTimeMillis(), zone: TimeZone = TimeZone.getDefault()): Subtitle? {
        if (input.connection != TitleKind.BRAND) return Subtitle(input.connection.text, dots = input.connection.animatedDots)
        if (input.service) return null
        val typists = input.typists.filter { it.userId != input.myId }
        if (typists.isNotEmpty()) {
            val text = if (input.group) groupTyping(typists) else TYPING
            return Subtitle(text, SubtitleTone.ACCENT, typing = true)
        }
        if (input.group) return groupStatus(input)
        val other = input.otherMember ?: return null
        val info = input.presence(other.id) ?: PresenceInfo(false, other.lastSeenAt)
        val text = LastSeen.describe(info, nowMs, zone)
        if (text.isEmpty()) return null
        return Subtitle(text, if (info.online) SubtitleTone.ONLINE else SubtitleTone.DEFAULT)
    }

    fun groupTyping(typists: List<Typist>): String {
        val names = typists.map { firstName(it.displayName) }
        return when (names.size) {
            1 -> "${names[0]} $TYPING"
            2 -> "${names[0]}, ${names[1]} $TYPING_MANY"
            else -> "${names[0]}, ${names[1]} и ещё ${names.size - 2} $TYPING_MANY"
        }
    }

    fun membersText(count: Int): String = "$count ${plural(count, "участник", "участника", "участников")}"

    private fun groupStatus(input: SubtitleInput): Subtitle? {
        val members = input.members ?: return null
        val online = 1 + members.count { it.id != input.myId && input.presence(it.id)?.online == true }
        val base = membersText(members.size)
        return Subtitle(if (online > 1) "$base, $online в сети" else base)
    }

    private fun firstName(displayName: String): String {
        val trimmed = displayName.trim()
        val cut = trimmed.indexOfFirst { it.isWhitespace() }
        return if (cut > 0) trimmed.substring(0, cut) else trimmed
    }
}
