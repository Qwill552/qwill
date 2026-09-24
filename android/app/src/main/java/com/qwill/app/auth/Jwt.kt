package com.qwill.app.auth

import com.qwill.app.net.ApiJson
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

object Jwt {
    @OptIn(ExperimentalEncodingApi::class)
    private val base64Url = Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT_OPTIONAL)

    @OptIn(ExperimentalEncodingApi::class)
    fun expiresAtMs(token: String): Long {
        val payload = token.split('.').getOrNull(1) ?: return 0
        return try {
            val json = base64Url.decode(payload).toString(Charsets.UTF_8)
            val exp = ApiJson.parseToJsonElement(json).jsonObject["exp"]?.jsonPrimitive?.longOrNull ?: return 0
            exp * 1000
        } catch (e: IllegalArgumentException) {
            0
        }
    }
}
