package com.qwill.app.contacts

import com.qwill.app.chats.VisibleChats
import com.qwill.app.model.AvatarColor
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatType
import com.qwill.app.realtime.PresenceInfo
import java.text.Collator
import java.util.Locale

data class Contact(
    val chatId: String,
    val userId: String,
    val name: String,
    val avatarUrl: String?,
    val avatarColor: AvatarColor,
    val online: Boolean,
    val lastSeenAt: String,
    val letter: String,
)

class ContactsList(val contacts: List<Contact>, val hasContacts: Boolean)

object Contacts {
    private val collator: Collator = Collator.getInstance(Locale.forLanguageTag("ru"))

    fun build(chats: List<ChatListItemDto>, presence: (String) -> PresenceInfo?, query: String): ContactsList {
        val people = chats.filter { it.type == ChatType.PRIVATE && it.otherMember != null && !VisibleChats.isEmptyPrivate(it) }
        val needle = query.trim().lowercase()
        val sorted = people
            .map { chat ->
                val member = chat.otherMember!!
                val live = presence(member.id)
                Contact(
                    chatId = chat.id,
                    userId = member.id,
                    name = member.displayName,
                    avatarUrl = member.avatarUrl,
                    avatarColor = member.avatarColor,
                    online = live?.online ?: false,
                    lastSeenAt = live?.lastSeenAt ?: member.lastSeenAt,
                    letter = "",
                )
            }
            .filter { it.name.lowercase().contains(needle) }
            .sortedWith { a, b -> collator.compare(a.name, b.name) }
        var previous = ""
        val lettered = sorted.map { contact ->
            val letter = firstLetter(contact.name)
            val shown = if (letter == previous) "" else letter
            previous = letter
            contact.copy(letter = shown)
        }
        return ContactsList(lettered, people.isNotEmpty())
    }

    private fun firstLetter(name: String): String {
        if (name.isEmpty()) return ""
        val end = Character.charCount(name.codePointAt(0)).coerceAtMost(name.length)
        return name.substring(0, end).uppercase()
    }
}
