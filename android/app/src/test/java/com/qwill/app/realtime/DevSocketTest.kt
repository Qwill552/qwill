package com.qwill.app.realtime

import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class DevSocketTest {
    @Test
    fun devServerAcceptsDirectWebSocketWithoutPolling() {
        val trust = File("src/main/res/raw/isrg_root_x1.pem").inputStream().use { ExtraRootTrust.systemPlus(it) }
        val client = HttpClients.create(trust)
        val packets = CopyOnWriteArrayList<SocketPacket>()
        val done = CountDownLatch(1)
        val request = Request.Builder().url("https://dev.qwill.mooo.com/socket.io/?EIO=4&transport=websocket").build()

        val socket = client.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    val packet = SocketPackets.parse(text)
                    packets.add(packet)
                    if (packet is SocketPacket.Open) webSocket.send(SocketPackets.connect("not-a-token"))
                    if (packet is SocketPacket.ConnectError) done.countDown()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    done.countDown()
                }
            },
        )
        assertTrue("ответа нет за 15 с", done.await(15, TimeUnit.SECONDS))
        socket.cancel()

        val open = packets.first() as SocketPacket.Open
        assertEquals(10_000L, open.pingInterval)
        assertEquals(5_000L, open.pingTimeout)
        assertEquals(SocketPacket.ConnectError("unauthorized"), packets.last())
    }
}
