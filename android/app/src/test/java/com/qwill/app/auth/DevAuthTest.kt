package com.qwill.app.auth

import com.qwill.app.net.ApiJson
import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import com.qwill.app.model.LegalDocumentDto
import com.qwill.app.model.LegalVersionsDto
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File

class DevAuthTest {
    private val origin = "https://dev.qwill.mooo.com"

    private fun client(): OkHttpClient {
        val trust = File("src/main/res/raw/isrg_root_x1.pem").inputStream().use { ExtraRootTrust.systemPlus(it) }
        return HttpClients.create(trust)
    }

    @Test
    fun wrongPasswordReturnsServerMessage() {
        val username = System.getenv("QWILL_DEV_USERNAME")
        val password = System.getenv("QWILL_DEV_PASSWORD")
        assumeTrue("нет QWILL_DEV_USERNAME/QWILL_DEV_PASSWORD", !username.isNullOrEmpty() && !password.isNullOrEmpty())
        val body = """{"username":"$username","password":"${password}wrong"}""".toRequestBody("application/json".toMediaType())
        val request = Request.Builder()
            .url("$origin/api/auth/login")
            .header("X-Qwill-Session", "body")
            .post(body)
            .build()
        client().newCall(request).execute().use { response ->
            assertEquals(401, response.code)
            val text = response.body!!.string()
            assertTrue(text.contains("Неверное имя пользователя или пароль"))
        }
    }

    @Test
    fun legalCurrentAndDocumentParse() {
        val current = client().newCall(Request.Builder().url("$origin/api/legal/current").build()).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(LegalVersionsDto.serializer(), response.body!!.string())
        }
        val document = client().newCall(Request.Builder().url("$origin/api/legal/terms/${current.termsVersion}").build()).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(LegalDocumentDto.serializer(), response.body!!.string())
        }
        assertEquals("terms", document.doc)
        assertEquals(current.termsVersion, document.version)
        assertTrue(document.content.isNotEmpty())
    }
}
