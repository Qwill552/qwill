package com.qwill.app.search

import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatType
import com.qwill.app.model.SearchResultsDto
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
import java.net.URLEncoder

class DevSearchTest {
    private val origin = "https://dev.qwill.mooo.com"
    private val json = "application/json".toMediaType()

    private fun client(): OkHttpClient {
        val trust = File("src/main/res/raw/isrg_root_x1.pem").inputStream().use { ExtraRootTrust.systemPlus(it) }
        return HttpClients.create(trust)
    }

    private fun login(http: OkHttpClient, username: String, password: String): String {
        val body = "{\"username\":\"$username\",\"password\":\"$password\"}".toRequestBody(json)
        val request = Request.Builder().url("$origin/api/auth/login").header("X-Qwill-Session", "body").post(body).build()
        return http.newCall(request).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.parseToJsonElement(response.body!!.string()).jsonObject["accessToken"]!!.jsonPrimitive.content
        }
    }

    private fun authed(token: String, path: String): Request.Builder = Request.Builder().url("$origin$path").header("Authorization", "Bearer $token")

    @Test
    fun findsPeerByNicknameAndOpensPrivateChat() {
        val username = System.getenv("QWILL_DEV_USERNAME")
        val password = System.getenv("QWILL_DEV_PASSWORD")
        val peer = System.getenv("QWILL_DEV_PEER")
        assumeTrue(
            "нет QWILL_DEV_USERNAME/QWILL_DEV_PASSWORD/QWILL_DEV_PEER",
            !username.isNullOrEmpty() && !password.isNullOrEmpty() && !peer.isNullOrEmpty(),
        )
        val http = client()
        val token = login(http, username!!, password!!)
        val found = http.newCall(authed(token, SearchRequests.search("@$peer").path).build()).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(SearchResultsDto.serializer(), response.body!!.string())
        }
        assertTrue(found.users.any { it.username == peer } || found.chats.any { it.type == ChatType.PRIVATE })
        val encoded = URLEncoder.encode(peer, "UTF-8")
        assertTrue(SearchRequests.search("@$peer").path.endsWith("%40$encoded"))
        val chat = http.newCall(authed(token, "/api/chats/private").post("{\"username\":\"$peer\"}".toRequestBody(json)).build()).execute().use { response ->
            assertTrue(response.code in 200..201)
            ApiJson.decodeFromString(ChatDto.serializer(), response.body!!.string())
        }
        assertEquals(peer, chat.otherMember?.username)
    }
}
