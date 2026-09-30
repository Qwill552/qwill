package com.qwill.app.chat.composer

import com.qwill.app.model.MessageActionAck
import com.qwill.app.model.MessageEditPayload
import com.qwill.app.model.UnreadMentionsResponse
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import com.qwill.app.realtime.SocketEvent
import com.qwill.app.realtime.SocketPacket
import com.qwill.app.realtime.SocketPackets
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class DevComposerTest {
    private val origin = "https://dev.qwill.mooo.com"

    private fun client(): OkHttpClient {
        val trust = File("src/main/res/raw/isrg_root_x1.pem").inputStream().use { ExtraRootTrust.systemPlus(it) }
        return HttpClients.create(trust)
    }

    private fun login(http: OkHttpClient): String {
        val username = System.getenv("QWILL_DEV_USERNAME")
        val password = System.getenv("QWILL_DEV_PASSWORD")
        assumeTrue("нет QWILL_DEV_USERNAME/QWILL_DEV_PASSWORD", !username.isNullOrEmpty() && !password.isNullOrEmpty())
        val body = """{"username":"$username","password":"$password"}""".toRequestBody("application/json".toMediaType())
        val request = Request.Builder().url("$origin/api/auth/login").header("X-Qwill-Session", "body").post(body).build()
        return http.newCall(request).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.parseToJsonElement(response.body!!.string()).jsonObject["accessToken"]!!.jsonPrimitive.content
        }
    }

    private fun getJson(http: OkHttpClient, token: String, path: String): String {
        val request = Request.Builder().url("$origin$path").header("Authorization", "Bearer $token").build()
        return http.newCall(request).execute().use { response ->
            assertEquals(200, response.code)
            response.body!!.string()
        }
    }

    @Test
    fun chatsCarryMentionCountAndMentionListAnswers() {
        val http = client()
        val token = login(http)
        val chats = ApiJson.parseToJsonElement(getJson(http, token, "/api/chats")).jsonObject["chats"]!!.jsonArray
        assumeTrue("у тестового аккаунта нет чатов", chats.isNotEmpty())
        val first = chats.first().jsonObject
        assertTrue(first.containsKey("unreadMentionsCount"))
        val chatId = first["id"]!!.jsonPrimitive.content
        val mentions = ApiJson.decodeFromString(UnreadMentionsResponse.serializer(), getJson(http, token, "/api/chats/$chatId/mentions"))
        assertEquals(mentions.messageIds.sorted(), mentions.messageIds)
        assertTrue(mentions.messageIds.size <= 100)
    }

    @Test
    fun editOfForeignMessageIsRefusedThroughAck() {
        val http = client()
        val token = login(http)
        val chats = ApiJson.parseToJsonElement(getJson(http, token, "/api/chats")).jsonObject["chats"]!!.jsonArray
        assumeTrue("у тестового аккаунта нет чатов", chats.isNotEmpty())
        val chatId = chats.first().jsonObject["id"]!!.jsonPrimitive.content
        val ack = AtomicReference<JsonObject?>()
        val done = CountDownLatch(1)
        val payload = ApiJson.encodeToJsonElement(MessageEditPayload.serializer(), MessageEditPayload(chatId, FOREIGN_ID, "проверка"))
        val request = Request.Builder().url("$origin/socket.io/?EIO=4&transport=websocket").build()
        val socket = http.newWebSocket(
            request,
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) {
                    when (val packet = SocketPackets.parse(text)) {
                        is SocketPacket.Open -> webSocket.send(SocketPackets.connect(token))
                        is SocketPacket.Connected -> webSocket.send(SocketPackets.event(SocketEvent.MESSAGE_EDIT, payload, ACK_ID))
                        is SocketPacket.Ack -> if (packet.id == ACK_ID) {
                            ack.set(packet.args.firstOrNull() as? JsonObject)
                            done.countDown()
                        }
                        is SocketPacket.Ping -> webSocket.send("3")
                        else -> Unit
                    }
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    done.countDown()
                }
            },
        )
        assertTrue("ответа нет за 15 с", done.await(15, TimeUnit.SECONDS))
        socket.close(1000, null)
        val body = ack.get()
        assertNotNull(body)
        val parsed = ApiJson.decodeFromJsonElement(MessageActionAck.serializer(), body!!)
        assertFalse(parsed.ok)
        assertNotNull(parsed.error)
    }

    private companion object {
        const val ACK_ID = 7L
        const val FOREIGN_ID = 2_000_000_000L
    }
}
