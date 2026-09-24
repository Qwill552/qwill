package com.qwill.app.realtime

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SocketPacketTest {
    @Test
    fun parsesEngineOpen() {
        val packet = SocketPackets.parse("""0{"sid":"a","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}""")
        assertEquals(SocketPacket.Open(25_000, 20_000, 1_000_000), packet)
    }

    @Test
    fun parsesPingPongCloseNoop() {
        assertEquals(SocketPacket.Ping, SocketPackets.parse("2"))
        assertEquals(SocketPacket.Pong, SocketPackets.parse("3"))
        assertEquals(SocketPacket.Close, SocketPackets.parse("1"))
        assertEquals(SocketPacket.Noop, SocketPackets.parse("6"))
    }

    @Test
    fun parsesConnectAcceptedRejectedAndServerDisconnect() {
        assertEquals(SocketPacket.Connected("xyz"), SocketPackets.parse("""40{"sid":"xyz"}"""))
        assertEquals(SocketPacket.ConnectError("unauthorized"), SocketPackets.parse("""44{"message":"unauthorized"}"""))
        assertEquals(SocketPacket.ConnectError("ip_banned"), SocketPackets.parse("""44{"message":"ip_banned"}"""))
        assertEquals(SocketPacket.Disconnected, SocketPackets.parse("41"))
    }

    @Test
    fun parsesEventWithAndWithoutAckId() {
        val plain = SocketPackets.parse("""42["user:typing",{"chatId":"c","userId":"u","displayName":"А","isTyping":true}]""") as SocketPacket.Event
        assertEquals("user:typing", plain.name)
        assertNull(plain.ackId)
        assertEquals("c", (plain.body as JsonObject)["chatId"]!!.jsonPrimitive.content)

        val withId = SocketPackets.parse("""4217["call:invite",{}]""") as SocketPacket.Event
        assertEquals(17L, withId.ackId)
        assertEquals("call:invite", withId.name)
    }

    @Test
    fun parsesAck() {
        val ack = SocketPackets.parse("""435[{"ok":true}]""") as SocketPacket.Ack
        assertEquals(5L, ack.id)
        assertEquals(1, ack.args.size)
    }

    @Test
    fun acceptsExplicitDefaultNamespace() {
        assertEquals(SocketPacket.Connected("s"), SocketPackets.parse("""40/,{"sid":"s"}"""))
    }

    @Test
    fun unknownPacketsDoNotThrow() {
        assertTrue(SocketPackets.parse("") is SocketPacket.Unknown)
        assertTrue(SocketPackets.parse("9hello") is SocketPacket.Unknown)
        assertTrue(SocketPackets.parse("47") is SocketPacket.Unknown)
        assertTrue(SocketPackets.parse("""42{"not":"array"}""") is SocketPacket.Unknown)
        assertTrue(SocketPackets.parse("42[broken") is SocketPacket.Unknown)
        assertTrue(SocketPackets.parse("""40/admin,{"sid":"s"}""") is SocketPacket.Unknown)
        assertTrue(SocketPackets.parse("43[{}]") is SocketPacket.Unknown)
    }

    @Test
    fun buildsFrames() {
        assertEquals("""40{"token":"abc"}""", SocketPackets.connect("abc"))
        assertEquals("""42["typing:start",{"chatId":"c"}]""", SocketPackets.event("typing:start", JsonObject(mapOf("chatId" to JsonPrimitive("c")))))
        assertEquals("""423["message:send",{"chatId":"c"}]""", SocketPackets.event("message:send", JsonObject(mapOf("chatId" to JsonPrimitive("c"))), 3))
        assertEquals("3", SocketPackets.PONG)
        assertEquals("41", SocketPackets.DISCONNECT)
    }
}
