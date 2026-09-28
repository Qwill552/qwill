package com.qwill.app.chat

import com.qwill.app.model.BlockStateDto
import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatListResponse
import com.qwill.app.model.ChatType
import com.qwill.app.model.GroupRole
import com.qwill.app.model.MembersResponse
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
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

class DevChatTopTest {
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

    private fun authed(token: String, path: String): Request.Builder = Request.Builder().url("$origin$path").header("Authorization", "Bearer $token")

    private fun credentials(): Triple<String, String, String> {
        val username = System.getenv("QWILL_DEV_USERNAME")
        val password = System.getenv("QWILL_DEV_PASSWORD")
        val peer = System.getenv("QWILL_DEV_PEER")
        assumeTrue(
            "нет QWILL_DEV_USERNAME/QWILL_DEV_PASSWORD/QWILL_DEV_PEER",
            !username.isNullOrEmpty() && !password.isNullOrEmpty() && !peer.isNullOrEmpty(),
        )
        return Triple(username!!, password!!, peer!!)
    }

    @Test
    fun groupMembersCarryRoles() {
        val (username, password, _) = credentials()
        val http = client()
        val token = login(http, username, password)
        val chats = http.newCall(authed(token, "/api/chats").build()).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(ChatListResponse.serializer(), response.body!!.string()).chats
        }
        val group = chats.firstOrNull { it.type == ChatType.GROUP }
        assumeTrue("у тестового аккаунта нет группы", group != null)
        val members = http.newCall(authed(token, "/api/chats/${group!!.id}/members").build()).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(MembersResponse.serializer(), response.body!!.string()).members
        }
        assertTrue(members.isNotEmpty())
        assertTrue(members.all { it.role != GroupRole.UNKNOWN })
        assertTrue(members.any { it.role == GroupRole.OWNER })
    }

    @Test
    fun blockRoundTrip() {
        val (username, password, peer) = credentials()
        val http = client()
        val token = login(http, username, password)
        val chat = http.newCall(authed(token, "/api/chats/private").post("""{"username":"$peer"}""".toRequestBody(json)).build()).execute().use { response ->
            assertTrue(response.code in 200..201)
            ApiJson.decodeFromString(ChatDto.serializer(), response.body!!.string())
        }
        val peerId = chat.otherMember!!.id
        val order = if (chat.iBlocked) listOf(false, true) else listOf(true, false)
        for (blocked in order) {
            val builder = authed(token, "/api/users/$peerId/block")
            val request = if (blocked) builder.post("{}".toRequestBody(json)).build() else builder.delete().build()
            val state = http.newCall(request).execute().use { response ->
                assertEquals(200, response.code)
                ApiJson.decodeFromString(BlockStateDto.serializer(), response.body!!.string())
            }
            assertEquals(blocked, state.iBlocked)
        }
    }
}
