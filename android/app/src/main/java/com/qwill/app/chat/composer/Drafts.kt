package com.qwill.app.chat.composer

import android.content.Context
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiJson
import kotlinx.serialization.SerializationException
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

@Serializable
data class ChatDraft(
    val text: String,
    val replyTo: MessageDto? = null,
    val date: Long = 0L,
) {
    val isEmpty: Boolean get() = text.isBlank() && replyTo == null
}

interface DraftsStorage {
    fun read(userId: String): String?

    fun write(userId: String, value: String)

    fun clear()
}

class PreferencesDraftsStorage(context: Context) : DraftsStorage {
    private val preferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun read(userId: String): String? = preferences.getString(userId, null)

    override fun write(userId: String, value: String) {
        preferences.edit().putString(userId, value).apply()
    }

    override fun clear() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val FILE = "drafts"
    }
}

fun interface DraftsListener {
    fun onDraftChanged(chatId: String)
}

class Drafts(
    private val storage: DraftsStorage,
    private val clock: () -> Long = System::currentTimeMillis,
    private val currentUserId: () -> String?,
) {
    private val listeners = ArrayList<DraftsListener>()
    private var loadedFor: String? = null
    private var drafts: MutableMap<String, ChatDraft> = HashMap()

    operator fun get(chatId: String): ChatDraft? {
        val userId = currentUserId() ?: return null
        return draftsOf(userId)[chatId]
    }

    fun all(): Map<String, ChatDraft> {
        val userId = currentUserId() ?: return emptyMap()
        return draftsOf(userId)
    }

    fun save(chatId: String, text: String, replyTo: MessageDto?): Boolean {
        val userId = currentUserId() ?: return false
        val map = draftsOf(userId)
        if (text.isBlank() && replyTo == null) return remove(chatId)
        val previous = map[chatId]
        if (previous != null && previous.text == text && previous.replyTo?.id == replyTo?.id) return false
        map[chatId] = ChatDraft(text, replyTo, clock())
        persist(userId, map)
        notify(chatId)
        return true
    }

    fun remove(chatId: String): Boolean {
        val userId = currentUserId() ?: return false
        val map = draftsOf(userId)
        if (map.remove(chatId) == null) return false
        persist(userId, map)
        notify(chatId)
        return true
    }

    fun clear() {
        val known = drafts.keys.toList()
        loadedFor = null
        drafts = HashMap()
        storage.clear()
        for (chatId in known) notify(chatId)
    }

    fun addListener(listener: DraftsListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: DraftsListener) {
        listeners.remove(listener)
    }

    private fun notify(chatId: String) {
        for (listener in ArrayList(listeners)) listener.onDraftChanged(chatId)
    }

    private fun persist(userId: String, map: Map<String, ChatDraft>) {
        storage.write(userId, ApiJson.encodeToString(SERIALIZER, map))
    }

    private fun draftsOf(userId: String): MutableMap<String, ChatDraft> {
        if (loadedFor == userId) return drafts
        loadedFor = userId
        drafts = parse(storage.read(userId))
        return drafts
    }

    private fun parse(raw: String?): MutableMap<String, ChatDraft> {
        if (raw.isNullOrEmpty()) return HashMap()
        return try {
            HashMap(ApiJson.decodeFromString(SERIALIZER, raw))
        } catch (e: SerializationException) {
            HashMap()
        } catch (e: IllegalArgumentException) {
            HashMap()
        }
    }

    private companion object {
        val SERIALIZER = MapSerializer(String.serializer(), ChatDraft.serializer())
    }
}
