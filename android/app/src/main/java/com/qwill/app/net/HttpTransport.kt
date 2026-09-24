package com.qwill.app.net

import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException

class HttpTransport(
    private val client: OkHttpClient,
    private val origin: String,
    private val userAgent: String,
) {
    fun <T> execute(
        request: ApiRequest<T>,
        accessToken: String?,
        refreshToken: String?,
        onDone: (ApiResult<T>) -> Unit,
    ): Call {
        val builder = Request.Builder()
            .url(origin + request.path)
            .header(USER_AGENT, userAgent)
        if (accessToken != null) builder.header(AUTHORIZATION, "Bearer $accessToken")
        if (request.bodySession) builder.header(SessionMode.HEADER, SessionMode.BODY)
        builder.method(request.method, request.body(refreshToken)?.toRequestBody(JSON))

        val call = client.newCall(builder.build())
        call.enqueue(
            object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (call.isCanceled()) return
                    onDone(ApiResult.Failure(NetworkError(e)))
                }

                override fun onResponse(call: Call, response: Response) {
                    val result = response.use { read(request, it) }
                    if (call.isCanceled()) return
                    onDone(result)
                }
            },
        )
        return call
    }

    private fun <T> read(request: ApiRequest<T>, response: Response): ApiResult<T> {
        val text = try {
            response.body?.string().orEmpty()
        } catch (e: IOException) {
            return ApiResult.Failure(NetworkError(e))
        }
        if (response.isSuccessful) {
            return try {
                ApiResult.Success(request.parse(text))
            } catch (e: IllegalArgumentException) {
                ApiResult.Failure(ApiError.unreadable(response.code))
            }
        }
        return ApiResult.Failure(readError(response.code, text))
    }

    private fun readError(status: Int, text: String): ApiError {
        val payload = try {
            ApiJson.decodeFromString(ApiErrorBody.serializer(), text).error
        } catch (e: IllegalArgumentException) {
            return ApiError.unreadable(status)
        }
        return ApiError(status, payload.code, payload.message, payload.fields, payload.requestId)
    }

    private companion object {
        const val USER_AGENT = "User-Agent"
        const val AUTHORIZATION = "Authorization"
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
