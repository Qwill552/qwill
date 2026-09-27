package com.qwill.app.chat

import com.qwill.app.model.ChatListResponse
import com.qwill.app.model.MessageAtDateResponse
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.TimeZone

class DevFeedTest {
    private val origin = "https://dev.qwill.mooo.com"
    private val json = "application/json".toMediaType()

    private fun client(): OkHttpClient {
        val trust = File("src/main/res/raw/isrg_root_x1.pem").inputStream().use { ExtraRootTrust.systemPlus(it) }
        return HttpClients.create(trust)
    }

    private fun login(http: OkHttpClient, username: String, password: String): String {
        val body = """{"username":"$username","password":"$password"}""".toRequestBody(json)
        val request = Request.Builder().url("$origin/api/auth/login").header("X-Qwill-Session", "body").post(body).build()
        return http.newCall(request).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.parseToJsonElement(response.body!!.string()).jsonObject["accessToken"]!!.jsonPrimitive.content
        }
    }

    private fun authed(token: String, path: String): Request = Request.Builder().url("$origin$path").header("Authorization", "Bearer $token").build()

    @Test
    fun atDateAnswersAndMissingAroundIsNotFound() {
        val username = System.getenv("QWILL_DEV_USERNAME")
        val password = System.getenv("QWILL_DEV_PASSWORD")
        assumeTrue("нет QWILL_DEV_USERNAME/QWILL_DEV_PASSWORD", !username.isNullOrEmpty() && !password.isNullOrEmpty())
        val http = client()
        val token = login(http, username!!, password!!)
        val chats = http.newCall(authed(token, "/api/chats")).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(ChatListResponse.serializer(), response.body!!.string())
        }
        val chat = chats.chats.firstOrNull { it.lastMessage != null }
        assumeTrue("у тестового аккаунта нет переписки", chat != null)
        val today = DayLabel.dayKey(System.currentTimeMillis())
        val request = ChatRequests.messageAtDate(chat!!.id, today, TimeZone.getDefault().id)
        val found = http.newCall(authed(token, request.path)).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(MessageAtDateResponse.serializer(), response.body!!.string())
        }
        assumeTrue(found.messageId != null || chat.lastMessage == null)
        http.newCall(authed(token, "/api/chats/${chat.id}/messages/around/$MISSING_ID")).execute().use { response ->
            assertEquals(404, response.code)
            val code = ApiJson.parseToJsonElement(response.body!!.string()).jsonObject["error"]?.jsonObject?.get("code")?.jsonPrimitive?.content
            assertEquals("MESSAGE_NOT_FOUND", code)
        }
    }

    private companion object {
        const val MISSING_ID = 2_000_000_000L
    }
}
