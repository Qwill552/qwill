package com.qwill.app.search

import android.content.Context
import com.qwill.app.core.TaskQueue
import com.qwill.app.model.AvatarColor
import com.qwill.app.model.ChatType
import com.qwill.app.net.ApiJson
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer

@Serializable
enum class RecentKind {
    @SerialName("user") USER,
    @SerialName("chat") CHAT,
}

@Serializable
data class RecentSearchEntry(
    val chatId: String? = null,
    val kind: RecentKind = RecentKind.CHAT,
    val title: String = "",
    val username: String? = null,
    val avatarUrl: String? = null,
    val avatarColor: AvatarColor? = null,
    val type: ChatType = ChatType.PRIVATE,
    val isService: Boolean = false,
)

interface RecentSearchStorage {
    fun read(userId: String): String?

    fun write(userId: String, value: String)

    fun clear()
}

class PreferencesRecentStorage(context: Context) : RecentSearchStorage {
    private val preferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun read(userId: String): String? = preferences.getString(userId, null)

    override fun write(userId: String, value: String) {
        preferences.edit().putString(userId, value).apply()
    }

    override fun clear() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val FILE = "recent_search"
    }
}

fun interface RecentSearchesListener {
    fun onRecentSearchesChanged()
}

class RecentSearches(
    private val storage: RecentSearchStorage,
    private val io: TaskQueue,
    private val main: TaskQueue,
    private val currentUserId: () -> String?,
) {
    private val listeners = ArrayList<RecentSearchesListener>()
    private val pending = ArrayList<(List<RecentSearchEntry>) -> List<RecentSearchEntry>>()
    private var loadedFor: String? = null
    private var loadingFor: String? = null
    private var generation = 0

    var entries: List<RecentSearchEntry> = emptyList()
        private set

    fun addListener(listener: RecentSearchesListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: RecentSearchesListener) {
        listeners.remove(listener)
    }

    fun ensureLoaded() {
        val userId = currentUserId() ?: return
        if (userId == loadedFor || userId == loadingFor) return
        loadingFor = userId
        loadedFor = null
        entries = emptyList()
        pending.clear()
        val started = generation
        io.post {
            val parsed = parse(storage.read(userId))
            main.post {
                if (started != generation || loadingFor != userId) return@post
                loadingFor = null
                loadedFor = userId
                var next = parsed
                for (operation in pending) next = operation(next)
                val changed = pending.isNotEmpty()
                pending.clear()
                entries = next
                if (changed) persist(userId, next)
                notifyListeners()
            }
        }
    }

    fun remember(entry: RecentSearchEntry) {
        change { remember(it, entry) }
    }

    fun forget(key: String) {
        change { forget(it, key) }
    }

    fun clear() {
        generation++
        loadedFor = null
        loadingFor = null
        pending.clear()
        entries = emptyList()
        io.post { storage.clear() }
        notifyListeners()
    }

    private fun change(operation: (List<RecentSearchEntry>) -> List<RecentSearchEntry>) {
        val userId = currentUserId() ?: return
        ensureLoaded()
        if (loadingFor == userId) {
            pending.add(operation)
            entries = operation(entries)
            notifyListeners()
            return
        }
        val next = operation(entries)
        if (next == entries) return
        entries = next
        persist(userId, next)
        notifyListeners()
    }

    private fun persist(userId: String, value: List<RecentSearchEntry>) {
        val encoded = ApiJson.encodeToString(LIST, value)
        io.post { storage.write(userId, encoded) }
    }

    private fun notifyListeners() {
        for (listener in ArrayList(listeners)) listener.onRecentSearchesChanged()
    }

    companion object {
        const val LIMIT = 20

        private val LIST = ListSerializer(RecentSearchEntry.serializer())

        fun keyOf(entry: RecentSearchEntry): String =
            if (entry.kind == RecentKind.USER) "user:${entry.username.orEmpty()}" else "chat:${entry.chatId.orEmpty()}"

        fun remember(entries: List<RecentSearchEntry>, entry: RecentSearchEntry): List<RecentSearchEntry> {
            val key = keyOf(entry)
            return (listOf(entry) + entries.filter { keyOf(it) != key }).take(LIMIT)
        }

        fun forget(entries: List<RecentSearchEntry>, key: String): List<RecentSearchEntry> = entries.filter { keyOf(it) != key }

        fun parse(raw: String?): List<RecentSearchEntry> {
            if (raw.isNullOrEmpty()) return emptyList()
            return try {
                ApiJson.decodeFromString(LIST, raw).take(LIMIT)
            } catch (e: IllegalArgumentException) {
                emptyList()
            }
        }
    }
}
