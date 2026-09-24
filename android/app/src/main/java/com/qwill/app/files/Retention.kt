package com.qwill.app.files

import com.qwill.app.model.ChatType

enum class RetentionPeriod(val key: String, val ms: Long) {
    THREE_DAYS("3d", 3 * DAY_MS),
    WEEK("1w", 7 * DAY_MS),
    MONTH("1m", 30 * DAY_MS),
    FOREVER("forever", Long.MAX_VALUE),
    ;

    companion object {
        fun of(key: String?): RetentionPeriod? = entries.firstOrNull { it.key == key }
    }
}

const val DAY_MS = 24L * 60 * 60 * 1000

data class RetentionSettings(
    val keepPrivate: RetentionPeriod,
    val keepGroups: RetentionPeriod,
    val exceptions: Map<String, RetentionPeriod>,
    val budgetBytes: Long?,
) {
    companion object {
        val DEFAULT = RetentionSettings(
            keepPrivate = RetentionPeriod.FOREVER,
            keepGroups = RetentionPeriod.MONTH,
            exceptions = emptyMap(),
            budgetBytes = null,
        )
    }
}

data class CachedMedia(
    val fileId: String,
    val chatId: String?,
    val kind: MediaKind,
    val tier: MediaTier,
    val size: Long,
    val lastUsedAt: Long,
    val complete: Boolean,
)

object MediaRetention {
    const val EVICTION_TARGET_RATIO = 0.75
    const val AVATAR_RESERVE_RATIO = 0.1
    const val ACCESS_THROTTLE_MS = DAY_MS

    fun resolver(settings: RetentionSettings, chatTypes: Map<String, ChatType>): (String?) -> Long = { chatId ->
        if (chatId == null) {
            Long.MAX_VALUE
        } else {
            val period = settings.exceptions[chatId]
                ?: if (chatTypes[chatId] == ChatType.GROUP) settings.keepGroups else settings.keepPrivate
            period.ms
        }
    }

    fun selectExpired(entries: List<CachedMedia>, now: Long, ttlOf: (String?) -> Long): List<CachedMedia> =
        entries.filter { entry ->
            val ttl = ttlOf(entry.chatId)
            ttl != Long.MAX_VALUE && now - entry.lastUsedAt > ttl
        }

    fun selectOverBudget(entries: List<CachedMedia>, budgetBytes: Long?): List<CachedMedia> {
        val budget = budgetBytes ?: return emptyList()
        var total = entries.sumOf { it.size }
        if (total <= budget) return emptyList()
        val target = budget * EVICTION_TARGET_RATIO
        val avatarReserve = budget * AVATAR_RESERVE_RATIO
        var avatarBytes = entries.filter { it.tier == MediaTier.AVATAR }.sumOf { it.size }
        val ordered = entries.sortedWith(compareBy<CachedMedia>({ it.tier.evictionOrder }, { it.lastUsedAt }))
        val victims = ArrayList<CachedMedia>()
        for (entry in ordered) {
            if (total <= target) break
            if (entry.tier == MediaTier.AVATAR) {
                if (avatarBytes - entry.size < avatarReserve) continue
                avatarBytes -= entry.size
            }
            victims.add(entry)
            total -= entry.size
        }
        return victims
    }

    fun shouldTouch(lastUsedAt: Long, now: Long): Boolean = now - lastUsedAt > ACCESS_THROTTLE_MS
}
