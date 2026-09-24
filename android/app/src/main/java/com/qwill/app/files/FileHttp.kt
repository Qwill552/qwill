package com.qwill.app.files

import com.qwill.app.auth.LiveToken
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiErrorBody
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

fun interface AccessTokens {
    fun token(rejected: String?): LiveToken
}

class SessionAccessTokens(
    private val live: (rejected: String?, done: (LiveToken) -> Unit) -> Unit,
) : AccessTokens {
    override fun token(rejected: String?): LiveToken {
        val latch = CountDownLatch(1)
        var result: LiveToken? = null
        live(rejected) {
            result = it
            latch.countDown()
        }
        if (!latch.await(TOKEN_WAIT_S, TimeUnit.SECONDS)) return LiveToken.Failed(NetworkError())
        return result ?: LiveToken.Failed(NetworkError())
    }

    private companion object {
        const val TOKEN_WAIT_S = 60L
    }
}

class CallSlot {
    @Volatile
    var cancelled = false
        private set

    private var call: Call? = null

    fun attach(next: Call) {
        synchronized(this) {
            call = next
            if (cancelled) next.cancel()
        }
    }

    fun cancel() {
        synchronized(this) {
            cancelled = true
            call?.cancel()
        }
    }
}

class FileHttp(
    val client: OkHttpClient,
    private val origin: String,
    private val userAgent: String,
    private val tokens: AccessTokens,
    private val onIpBanned: () -> Unit,
) {
    fun execute(path: String, slot: CallSlot, configure: (Request.Builder) -> Unit): Response {
        var rejected: String? = null
        var retried = false
        while (true) {
            if (slot.cancelled) throw CancelledTransfer()
            val token = when (val live = tokens.token(rejected)) {
                is LiveToken.Ready -> live.token
                is LiveToken.Failed -> throw live.error
            }
            val builder = Request.Builder()
                .url(origin + path)
                .header(USER_AGENT, userAgent)
                .header(AUTHORIZATION, "Bearer $token")
            configure(builder)
            val call = client.newCall(builder.build())
            slot.attach(call)
            val response = try {
                call.execute()
            } catch (e: IOException) {
                if (slot.cancelled) throw CancelledTransfer()
                throw NetworkError(e)
            }
            if (response.code == HTTP_UNAUTHORIZED && !retried) {
                response.close()
                retried = true
                rejected = token
                continue
            }
            return response
        }
    }

    fun readError(response: Response): ApiError {
        val text = try {
            response.body?.string().orEmpty()
        } catch (e: IOException) {
            ""
        }
        val error = try {
            val payload = ApiJson.decodeFromString(ApiErrorBody.serializer(), text).error
            ApiError(response.code, payload.code, payload.message, payload.fields, payload.requestId)
        } catch (e: IllegalArgumentException) {
            ApiError.unreadable(response.code)
        }
        if (error.status == HTTP_FORBIDDEN && error.code == ErrorCode.IP_BANNED) onIpBanned()
        return error
    }

    companion object {
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_FORBIDDEN = 403
        const val HTTP_NOT_FOUND = 404
        const val HTTP_CONFLICT = 409
        const val HTTP_RANGE_NOT_SATISFIABLE = 416
        const val HTTP_TOO_MANY_REQUESTS = 429
        const val HTTP_PARTIAL = 206
        private const val USER_AGENT = "User-Agent"
        private const val AUTHORIZATION = "Authorization"

        fun isFinalRefusal(error: ApiException): Boolean {
            val api = error as? ApiError ?: return false
            if (api.status == HTTP_FORBIDDEN && api.code == ErrorCode.IP_BANNED) return false
            return api.status == HTTP_FORBIDDEN || api.status == HTTP_NOT_FOUND || api.status == HTTP_UNAUTHORIZED
        }
    }
}

class CancelledTransfer : IOException("отменено")
