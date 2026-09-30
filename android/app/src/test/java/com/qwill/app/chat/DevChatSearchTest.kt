package com.qwill.app.chat

import com.qwill.app.chat.calendar.CalendarFilter
import com.qwill.app.chat.calendar.DateParts
import com.qwill.app.model.ChatCalendarResponse
import com.qwill.app.model.ChatListResponse
import com.qwill.app.model.ChatSearchResponse
import com.qwill.app.model.MessageAtDateResponse
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.util.Calendar
import java.util.GregorianCalendar

class DevChatSearchTest {
    private val origin = "https://dev.qwill.mooo.com"
    private val zone = "Europe/Moscow"

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

    private fun <T> get(http: OkHttpClient, token: String, path: String, serializer: DeserializationStrategy<T>): T {
        val request = Request.Builder().url("$origin$path").header("Authorization", "Bearer $token").build()
        return http.newCall(request).execute().use { response ->
            assertEquals(200, response.code)
            ApiJson.decodeFromString(serializer, response.body!!.string())
        }
    }

    @Test
    fun searchCalendarAndDateJump() {
        val http = client()
        val token = login(http)
        val chats = get(http, token, "/api/chats", ChatListResponse.serializer()).chats
        val chat = chats.firstOrNull { it.lastMessage != null }
        assumeTrue("у тестового аккаунта нет переписки", chat != null)
        val chatId = chat!!.id

        val all = get(http, token, ChatRequests.searchPath(chatId, "", null, null), ChatSearchResponse.serializer())
        assertTrue(all.total >= all.messages.size)
        assertTrue(all.messages.size <= PAGE)
        assertTrue(all.total > 0)
        assertEquals(all.messages.sortedByDescending { it.id }.map { it.id }, all.messages.map { it.id })

        val today = DateParts.of(Calendar.getInstance()).key
        val calendar = get(http, token, ChatRequests.calendarPath(chatId, today, today, CalendarFilter.ALL, zone), ChatCalendarResponse.serializer())
        val minDate = calendar.minDate
        assertNotNull(minDate)

        val firstDay = get(http, token, ChatRequests.calendarPath(chatId, minDate!!, minDate, CalendarFilter.ALL, zone), ChatCalendarResponse.serializer())
        val first = firstDay.days.firstOrNull { it.date == minDate }
        assertNotNull(first)

        val start = DateParts.ofKey(minDate)
        val before = GregorianCalendar(start.year, start.month, start.day).apply { add(Calendar.DAY_OF_MONTH, -1) }
        val dayBefore = DateParts.of(before).key
        val atDate = get(http, token, ChatRequests.messageAtDate(chatId, dayBefore, zone).path, MessageAtDateResponse.serializer())
        assertEquals(first!!.firstMessageId, atDate.messageId)
    }

    private companion object {
        const val PAGE = 30
    }
}
