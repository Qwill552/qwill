package com.qwill.app.realtime

import com.qwill.app.net.ApiJson
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

sealed class SocketPacket {
    data class Open(val pingInterval: Long, val pingTimeout: Long, val maxPayload: Long) : SocketPacket()

    object Close : SocketPacket()

    object Ping : SocketPacket()

    object Pong : SocketPacket()

    object Noop : SocketPacket()

    data class Connected(val sid: String) : SocketPacket()

    data class ConnectError(val message: String) : SocketPacket()

    object Disconnected : SocketPacket()

    data class Event(val name: String, val body: JsonElement?, val ackId: Long?) : SocketPacket()

    data class Ack(val id: Long, val args: JsonArray) : SocketPacket()

    data class Unknown(val raw: String) : SocketPacket()
}

object SocketPackets {
    const val PONG = "3"
    const val DISCONNECT = "41"

    private const val DEFAULT_NAMESPACE = "/"

    fun connect(token: String): String = "40" + buildJsonObject { put("token", token) }

    fun event(name: String, body: JsonElement?, ackId: Long? = null): String {
        val args = if (body == null) listOf(JsonPrimitive(name)) else listOf(JsonPrimitive(name), body)
        return "42" + (ackId?.toString() ?: "") + JsonArray(args)
    }

    fun parse(text: String): SocketPacket {
        if (text.isEmpty()) return SocketPacket.Unknown(text)
        return when (text[0]) {
            '0' -> parseOpen(text)
            '1' -> SocketPacket.Close
            '2' -> SocketPacket.Ping
            '3' -> SocketPacket.Pong
            '4' -> parseMessage(text)
            '6' -> SocketPacket.Noop
            else -> SocketPacket.Unknown(text)
        }
    }

    private fun parseOpen(text: String): SocketPacket {
        val body = parseJson(text.substring(1)) as? JsonObject ?: return SocketPacket.Unknown(text)
        val pingInterval = body.long("pingInterval") ?: return SocketPacket.Unknown(text)
        val pingTimeout = body.long("pingTimeout") ?: return SocketPacket.Unknown(text)
        return SocketPacket.Open(pingInterval, pingTimeout, body.long("maxPayload") ?: Long.MAX_VALUE)
    }

    private fun parseMessage(text: String): SocketPacket {
        if (text.length < 2) return SocketPacket.Unknown(text)
        val type = text[1]
        var index = 2
        if (index < text.length && text[index] == '/') {
            val comma = text.indexOf(',', index)
            if (comma < 0 || text.substring(index, comma) != DEFAULT_NAMESPACE) return SocketPacket.Unknown(text)
            index = comma + 1
        }
        val idStart = index
        while (index < text.length && text[index].isDigit()) index++
        val id = if (index > idStart) text.substring(idStart, index).toLongOrNull() else null
        val json = text.substring(index)
        val body = if (json.isEmpty()) null else parseJson(json) ?: return SocketPacket.Unknown(text)

        return when (type) {
            '0' -> (body as? JsonObject)?.string("sid")?.let { SocketPacket.Connected(it) } ?: SocketPacket.Unknown(text)
            '1' -> SocketPacket.Disconnected
            '2' -> parseEvent(body, id) ?: SocketPacket.Unknown(text)
            '3' -> if (id != null && body is JsonArray) SocketPacket.Ack(id, body) else SocketPacket.Unknown(text)
            '4' -> SocketPacket.ConnectError((body as? JsonObject)?.string("message").orEmpty())
            else -> SocketPacket.Unknown(text)
        }
    }

    private fun parseEvent(body: JsonElement?, id: Long?): SocketPacket.Event? {
        val args = body as? JsonArray ?: return null
        val name = (args.firstOrNull() as? JsonPrimitive)?.takeIf { it.isString }?.content ?: return null
        return SocketPacket.Event(name, args.getOrNull(1), id)
    }

    private fun parseJson(text: String): JsonElement? = try {
        ApiJson.parseToJsonElement(text)
    } catch (e: IllegalArgumentException) {
        null
    }

    private fun JsonObject.long(key: String): Long? = (get(key) as? JsonPrimitive)?.longOrNull

    private fun JsonObject.string(key: String): String? = (get(key) as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull
}
