package com.qwill.app.chat.top

import android.content.Context
import com.qwill.app.net.ApiJson
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer

interface HiddenPinsStorage {
    fun read(userId: String): String?

    fun write(userId: String, value: String)

    fun clear()
}

class PreferencesHiddenPinsStorage(context: Context) : HiddenPinsStorage {
    private val preferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    override fun read(userId: String): String? = preferences.getString(userId, null)

    override fun write(userId: String, value: String) {
        preferences.edit().putString(userId, value).apply()
    }

    override fun clear() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val FILE = "hidden_pins"
    }
}

class HiddenPins(private val storage: HiddenPinsStorage, private val currentUserId: () -> String?) {
    private var loadedFor: String? = null
    private var hidden: MutableMap<String, Long> = HashMap()

    fun isHidden(chatId: String, messageId: Long): Boolean {
        val userId = currentUserId() ?: return false
        return pinsOf(userId)[chatId] == messageId
    }

    fun hide(chatId: String, messageId: Long) {
        val userId = currentUserId() ?: return
        val pins = pinsOf(userId)
        if (pins[chatId] == messageId) return
        pins[chatId] = messageId
        storage.write(userId, ApiJson.encodeToString(SERIALIZER, pins))
    }

    fun clear() {
        loadedFor = null
        hidden = HashMap()
        storage.clear()
    }

    private fun pinsOf(userId: String): MutableMap<String, Long> {
        if (loadedFor == userId) return hidden
        loadedFor = userId
        hidden = parse(storage.read(userId))
        return hidden
    }

    private fun parse(raw: String?): MutableMap<String, Long> {
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
        val SERIALIZER = MapSerializer(String.serializer(), Long.serializer())
    }
}
