package com.qwill.app.auth

import com.qwill.app.core.TaskQueue
import com.qwill.app.net.ApiCallback
import com.qwill.app.net.ApiResult
import java.util.Base64
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Future
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit

class ExecutorQueue : TaskQueue {
    private val executor = ScheduledThreadPoolExecutor(1)
    private val pending = HashMap<Runnable, MutableList<Future<*>>>()

    override fun post(task: Runnable) {
        executor.execute(task)
    }

    override fun postDelayed(task: Runnable, delayMs: Long) {
        val future = executor.schedule(task, delayMs, TimeUnit.MILLISECONDS)
        synchronized(pending) { pending.getOrPut(task) { ArrayList() }.add(future) }
    }

    override fun cancel(task: Runnable) {
        val futures = synchronized(pending) { pending.remove(task) } ?: return
        for (future in futures) future.cancel(false)
    }

    fun drain() {
        val latch = CountDownLatch(1)
        executor.execute { latch.countDown() }
        latch.await(5, TimeUnit.SECONDS)
    }

    fun shutdown() {
        executor.shutdownNow()
    }
}

class RecordingStore(initial: StoredSession?) : SessionStore {
    @Volatile
    var current: StoredSession? = initial
        private set

    @Volatile
    var clears = 0
        private set

    override fun read(): StoredSession? = current

    override fun write(session: StoredSession) {
        current = session
    }

    override fun clear() {
        current = null
        clears++
    }
}

class Awaiting<T> : ApiCallback<T> {
    private val latch = CountDownLatch(1)

    @Volatile
    private var result: ApiResult<T>? = null

    override fun onResult(result: ApiResult<T>) {
        this.result = result
        latch.countDown()
    }

    fun await(timeoutSeconds: Long = 10): ApiResult<T> {
        check(latch.await(timeoutSeconds, TimeUnit.SECONDS)) { "ответ не пришёл за $timeoutSeconds с" }
        return result!!
    }
}

fun jwt(expiresAtSeconds: Long): String {
    val encoder = Base64.getUrlEncoder().withoutPadding()
    val header = encoder.encodeToString("""{"alg":"HS256","typ":"JWT"}""".toByteArray())
    val payload = encoder.encodeToString("""{"sub":"u1","exp":$expiresAtSeconds}""".toByteArray())
    return "$header.$payload.signature"
}

fun futureJwt(tag: String): String = jwt(System.currentTimeMillis() / 1000 + 3600) + tag

fun userJson(extra: String = ""): String =
    """{"id":"u1","username":"anna","displayName":"Анна","avatarUrl":null,"avatarColor":"violet",""" +
        """"theme":"dark","createdAt":"2026-01-01T00:00:00.000Z","lastSeenAt":"2026-01-01T00:00:00.000Z",""" +
        """"role":"user","cardDisabled":false,"pendingConsent":null$extra}"""

fun authJson(accessToken: String, refreshToken: String): String =
    """{"accessToken":"$accessToken","user":${userJson()},"csrfToken":"c","refreshToken":"$refreshToken"}"""

fun errorJson(code: String, message: String): String = """{"error":{"code":"$code","message":"$message"}}"""
