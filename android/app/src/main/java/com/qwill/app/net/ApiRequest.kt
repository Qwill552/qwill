package com.qwill.app.net

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerializationStrategy

class ApiRequest<out T>(
    val method: String,
    val path: String,
    val parse: (String) -> T,
    val body: (refreshToken: String?) -> String? = { null },
    val bodySession: Boolean = false,
    val authRetry: Boolean = true,
) {
    companion object {
        fun <T> get(path: String, response: DeserializationStrategy<T>): ApiRequest<T> =
            ApiRequest("GET", path, parser(response))

        fun <B, T> post(
            path: String,
            request: SerializationStrategy<B>,
            payload: B,
            response: DeserializationStrategy<T>,
        ): ApiRequest<T> = ApiRequest("POST", path, parser(response), body = { ApiJson.encodeToString(request, payload) })

        fun <T> parser(response: DeserializationStrategy<T>): (String) -> T = { ApiJson.decodeFromString(response, it) }

        val NO_CONTENT: (String) -> Unit = {}
    }
}

object SessionMode {
    const val HEADER = "X-Qwill-Session"
    const val BODY = "body"
}
