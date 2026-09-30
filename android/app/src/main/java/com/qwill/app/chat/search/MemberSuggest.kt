package com.qwill.app.chat.search

import com.qwill.app.model.GroupMemberDTO

object MemberSuggest {
    private val SEPARATOR = Regex("[^\\p{L}\\p{N}]+")

    fun filter(members: List<GroupMemberDTO>?, query: String, recentAuthorIds: List<String>, myId: String?): List<GroupMemberDTO> {
        if (members == null) return emptyList()
        val needle = normalize(query.trim().removePrefix("@").trim())
        val matching = members.filter { it.userId != myId && matches(it, needle) }
        if (matching.isEmpty()) return matching
        val byId = matching.associateBy { it.userId }
        val ordered = ArrayList<GroupMemberDTO>(matching.size)
        val taken = HashSet<String>()
        for (id in recentAuthorIds) {
            val member = byId[id] ?: continue
            if (taken.add(id)) ordered.add(member)
        }
        for (member in matching) if (taken.add(member.userId)) ordered.add(member)
        return ordered
    }

    fun firstName(member: GroupMemberDTO): String {
        val first = member.displayName.trim().split(Regex("\\s+")).firstOrNull().orEmpty().ifEmpty { member.username }
        return if (first.length > NAME_LIMIT) first.substring(0, NAME_LIMIT) else first
    }

    private fun matches(member: GroupMemberDTO, needle: String): Boolean {
        if (needle.isEmpty()) return true
        if (normalize(member.username).startsWith(needle)) return true
        val name = normalize(member.displayName)
        if (name.startsWith(needle)) return true
        return name.split(SEPARATOR).any { it.isNotEmpty() && it.startsWith(needle) }
    }

    private fun normalize(value: String): String = value.lowercase().replace('ё', 'е')

    private const val NAME_LIMIT = 10
}
