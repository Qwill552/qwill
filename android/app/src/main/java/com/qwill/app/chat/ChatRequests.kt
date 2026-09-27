package com.qwill.app.chat

import com.qwill.app.model.MessageAtDateResponse
import com.qwill.app.net.ApiRequest
import java.net.URLEncoder

object ChatRequests {
    fun messageAtDate(chatId: String, date: String, tz: String): ApiRequest<MessageAtDateResponse> = ApiRequest.get(
        "/api/chats/${encode(chatId)}/messages/at-date?date=${encode(date)}&tz=${encode(tz)}",
        MessageAtDateResponse.serializer(),
    )

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")
}
