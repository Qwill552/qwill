package com.qwill.app.realtime

import com.qwill.app.net.ApiJson
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okhttp3.mockwebserver.MockResponse
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

class FakeSocketServer {
    val frames = CopyOnWriteArrayList<String>()
    val tokens = CopyOnWriteArrayList<String>()
    val connections = AtomicInteger()

    @Volatile
    var pingInterval = 25_000L

    @Volatile
    var pingTimeout = 20_000L

    @Volatile
    var maxPayload = 1_000_000L

    @Volatile
    var onConnect: (String) -> String? = { """40{"sid":"s${connections.get()}"}""" }

    @Volatile
    var current: WebSocket? = null
        private set

    fun response(): MockResponse = MockResponse().withWebSocketUpgrade(
        object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                connections.incrementAndGet()
                current = webSocket
                webSocket.send("""0{"sid":"e","upgrades":[],"pingInterval":$pingInterval,"pingTimeout":$pingTimeout,"maxPayload":$maxPayload}""")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                frames.add(text)
                if (!text.startsWith("40")) return
                val token = ApiJson.parseToJsonElement(text.substring(2)).jsonObject["token"]!!.jsonPrimitive.content
                tokens.add(token)
                onConnect(token)?.let { webSocket.send(it) }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, null)
            }
        },
    )

    fun send(text: String) {
        current!!.send(text)
    }

    fun events(name: String): List<String> = frames.filter { it.startsWith("42") && it.contains("[\"$name\"") }
}

fun eventually(timeoutMs: Long = 5_000, condition: () -> Boolean) {
    val deadline = System.currentTimeMillis() + timeoutMs
    while (!condition()) {
        check(System.currentTimeMillis() < deadline) { "условие не выполнилось за $timeoutMs мс" }
        Thread.sleep(20)
    }
}
