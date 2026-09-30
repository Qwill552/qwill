package com.qwill.app.chat

import com.qwill.app.chat.calendar.CalendarFilter
import com.qwill.app.model.ChatCalendarResponse
import com.qwill.app.model.ChatSearchResponse
import com.qwill.app.model.MessageAtDateResponse
import com.qwill.app.net.ApiRequest
import java.net.URLEncoder

object ChatRequests {
    fun messageAtDate(chatId: String, date: String, tz: String): ApiRequest<MessageAtDateResponse> = ApiRequest.get(
        "/api/chats/${encode(chatId)}/messages/at-date?date=${encode(date)}&tz=${encode(tz)}",
        MessageAtDateResponse.serializer(),
    )

    fun search(chatId: String, q: String, before: Long?, fromUserId: String?): ApiRequest<ChatSearchResponse> =
        ApiRequest.get(searchPath(chatId, q, before, fromUserId), ChatSearchResponse.serializer())

    fun calendar(chatId: String, from: String, to: String, filter: CalendarFilter, tz: String): ApiRequest<ChatCalendarResponse> =
        ApiRequest.get(calendarPath(chatId, from, to, filter, tz), ChatCalendarResponse.serializer())

    fun searchPath(chatId: String, q: String, before: Long?, fromUserId: String?): String {
        val query = StringBuilder("q=").append(encode(q))
        if (before != null) query.append("&before=").append(before)
        if (!fromUserId.isNullOrEmpty()) query.append("&fromUserId=").append(encode(fromUserId))
        return "/api/chats/${encode(chatId)}/messages/search?$query"
    }

    fun calendarPath(chatId: String, from: String, to: String, filter: CalendarFilter, tz: String): String =
        "/api/chats/${encode(chatId)}/calendar?tz=${encode(tz)}&from=${encode(from)}&to=${encode(to)}&filter=${filter.wire}"

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
