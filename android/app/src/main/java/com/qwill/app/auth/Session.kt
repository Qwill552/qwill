package com.qwill.app.auth

import com.qwill.app.core.TaskQueue
import com.qwill.app.model.AuthResponse
import com.qwill.app.model.PublicUser
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiRequest
import com.qwill.app.net.ApiResult
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.HttpTransport
import com.qwill.app.net.NetworkError
import com.qwill.app.net.RequestHandle
import java.io.IOException

class Session(
    private val transport: HttpTransport,
    private val store: SessionStore,
    private val queue: TaskQueue,
    private val main: TaskQueue,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private sealed class RefreshOutcome {
        object Refreshed : RefreshOutcome()

        class Failed(val error: ApiException) : RefreshOutcome()
    }

    var state: SessionState
        private set

    private val stateListeners = ArrayList<SessionStateListener>()
    private val clearedListeners = ArrayList<SessionClearedListener>()

    private var current: SessionState
    private var refreshToken: String? = null
    private var accessToken: String? = null
    private var accessExpiresAt = 0L
    private var user: PublicUser? = null
    private var needsRefresh = false
    private var refreshing = false
    private val refreshWaiters = ArrayList<(RefreshOutcome) -> Unit>()
    private var retryDelayMs = 0L
    private val retryTask = Runnable { refreshInBackground() }

    init {
        val stored = store.read()
        refreshToken = stored?.refreshToken
        user = stored?.user
        if (stored?.accessToken != null && stored.accessExpiresAt > clock()) {
            accessToken = stored.accessToken
            accessExpiresAt = stored.accessExpiresAt
        }
        current = when {
            stored == null -> SessionState.Anonymous
            stored.user != null -> SessionState.Authenticated(stored.user, confirmed = false)
            else -> SessionState.Restoring
        }
        state = current
    }

    fun start() {
        queue.post { refreshInBackground() }
    }

    fun addStateListener(listener: SessionStateListener) {
        stateListeners.add(listener)
    }

    fun removeStateListener(listener: SessionStateListener) {
        stateListeners.remove(listener)
    }

    fun addClearedListener(listener: SessionClearedListener) {
        clearedListeners.add(listener)
    }

    fun removeClearedListener(listener: SessionClearedListener) {
        clearedListeners.remove(listener)
    }

    fun onNetworkAvailable() {
        queue.post {
            retryDelayMs = 0
            refreshIfUnsettled()
        }
    }

    fun onForeground() {
        queue.post { refreshIfUnsettled() }
    }

    internal fun <T> execute(request: ApiRequest<T>, handle: RequestHandle, done: (ApiResult<T>) -> Unit) {
        if (handle.cancelled) return
        if (request.authRetry && refreshToken != null && accessExpired()) {
            awaitRefresh { send(request, handle, retried = false, done) }
            return
        }
        send(request, handle, retried = false, done)
    }

    internal fun liveAccessToken(rejected: String?, done: (LiveToken) -> Unit) {
        queue.post {
            val token = accessToken
            val stale = token == null || token == rejected || accessExpired()
            when {
                refreshToken == null -> done(LiveToken.Failed(sessionGone()))
                !stale && token != null -> done(LiveToken.Ready(token, refreshed = false))
                else -> awaitRefresh { outcome ->
                    val fresh = accessToken
                    when {
                        outcome is RefreshOutcome.Failed -> done(LiveToken.Failed(outcome.error))
                        fresh == null -> done(LiveToken.Failed(sessionGone()))
                        else -> done(LiveToken.Ready(fresh, refreshed = true))
                    }
                }
            }
        }
    }

    internal fun reportIpBanned() {
        queue.post {
            if (refreshToken == null) return@post
            needsRefresh = true
            if (current !is SessionState.IpBanned) publish(SessionState.IpBanned(user))
        }
    }

    internal fun signIn(auth: AuthResponse): ApiResult<PublicUser> {
        val next = auth.refreshToken ?: return ApiResult.Failure(ApiError.unreadable(200))
        establish(auth, next)
        return ApiResult.Success(auth.user)
    }

    internal fun signOutLocally(): String? {
        val token = refreshToken ?: return null
        wipe(SessionState.Anonymous)
        return token
    }

    private fun accessExpired(): Boolean {
        if (accessToken == null) return true
        return accessExpiresAt > 0 && accessExpiresAt <= clock() + EXPIRY_MARGIN_MS
    }

    private fun <T> send(request: ApiRequest<T>, handle: RequestHandle, retried: Boolean, done: (ApiResult<T>) -> Unit) {
        if (handle.cancelled) return
        val tokenUsed = accessToken
        val call = transport.execute(request, tokenUsed, refreshToken) { result ->
            queue.post { onResponse(request, handle, retried, tokenUsed, result, done) }
        }
        handle.attach(call)
    }

    private fun <T> onResponse(
        request: ApiRequest<T>,
        handle: RequestHandle,
        retried: Boolean,
        tokenUsed: String?,
        result: ApiResult<T>,
        done: (ApiResult<T>) -> Unit,
    ) {
        if (handle.cancelled) return
        val error = (result as? ApiResult.Failure)?.error as? ApiError
        if (error != null && refreshToken != null) {
            if (error.status == HTTP_UNAUTHORIZED && request.authRetry && !retried) {
                if (accessToken != null && accessToken != tokenUsed) {
                    send(request, handle, retried = true, done)
                    return
                }
                awaitRefresh { outcome ->
                    when (outcome) {
                        is RefreshOutcome.Refreshed -> send(request, handle, retried = true, done)
                        is RefreshOutcome.Failed -> if (!handle.cancelled) done(ApiResult.Failure(outcome.error))
                    }
                }
                return
            }
            applySessionError(error)
        }
        if (result is ApiResult.Success) refreshIfUnsettled()
        done(result)
    }

    private fun applySessionError(error: ApiError) {
        if (error.status != HTTP_FORBIDDEN) return
        when (error.code) {
            ErrorCode.IP_BANNED -> if (current !is SessionState.IpBanned) publish(SessionState.IpBanned(user))
            ErrorCode.USER_BANNED -> wipe(SessionState.Banned(error.message ?: ""))
        }
    }

    private fun refreshIfUnsettled() {
        if (refreshToken == null || refreshing) return
        val settled = (current as? SessionState.Authenticated)?.confirmed == true && !needsRefresh
        if (settled) return
        startRefresh()
    }

    private fun refreshInBackground() {
        if (refreshToken == null || refreshing) return
        startRefresh()
    }

    private fun awaitRefresh(waiter: (RefreshOutcome) -> Unit) {
        refreshWaiters.add(waiter)
        if (!refreshing) startRefresh()
    }

    private fun startRefresh() {
        val token = refreshToken
        if (token == null) {
            finishRefresh(RefreshOutcome.Failed(sessionGone()))
            return
        }
        refreshing = true
        queue.cancel(retryTask)
        transport.execute(AuthRequests.refresh(token), null, token) { result ->
            queue.post { onRefreshResult(token, result) }
        }
    }

    private fun onRefreshResult(tokenSent: String, result: ApiResult<AuthResponse>) {
        refreshing = false
        if (refreshToken != tokenSent) {
            finishRefresh(if (refreshToken != null && accessToken != null) RefreshOutcome.Refreshed else RefreshOutcome.Failed(sessionGone()))
            return
        }
        when (result) {
            is ApiResult.Success -> {
                val next = result.value.refreshToken
                if (next == null) {
                    retryLater()
                    finishRefresh(RefreshOutcome.Failed(ApiError.unreadable(200)))
                    return
                }
                establish(result.value, next)
                finishRefresh(RefreshOutcome.Refreshed)
            }
            is ApiResult.Failure -> {
                applyRefreshFailure(result.error)
                finishRefresh(RefreshOutcome.Failed(result.error))
            }
        }
    }

    private fun applyRefreshFailure(error: ApiException) {
        if (error is NetworkError) {
            retryLater()
            return
        }
        val apiError = error as? ApiError
        when {
            apiError == null -> retryLater()
            apiError.status == HTTP_UNAUTHORIZED -> wipe(SessionState.Anonymous)
            apiError.status == HTTP_FORBIDDEN && apiError.code == ErrorCode.IP_BANNED -> {
                needsRefresh = true
                publish(SessionState.IpBanned(user))
            }
            apiError.status == HTTP_FORBIDDEN && apiError.code == ErrorCode.USER_BANNED ->
                wipe(SessionState.Banned(apiError.message ?: ""))
            else -> retryLater()
        }
    }

    private fun retryLater() {
        needsRefresh = true
        retryDelayMs = if (retryDelayMs == 0L) RETRY_FIRST_MS else minOf(retryDelayMs * 2, RETRY_MAX_MS)
        queue.postDelayed(retryTask, retryDelayMs)
    }

    private fun finishRefresh(outcome: RefreshOutcome) {
        if (refreshWaiters.isEmpty()) return
        val waiters = ArrayList(refreshWaiters)
        refreshWaiters.clear()
        for (waiter in waiters) waiter(outcome)
    }

    private fun establish(auth: AuthResponse, nextRefreshToken: String) {
        val expiresAt = Jwt.expiresAtMs(auth.accessToken)
        persist(StoredSession(nextRefreshToken, auth.accessToken, expiresAt, auth.user))
        refreshToken = nextRefreshToken
        accessToken = auth.accessToken
        accessExpiresAt = expiresAt
        user = auth.user
        needsRefresh = false
        retryDelayMs = 0
        queue.cancel(retryTask)
        publish(SessionState.Authenticated(auth.user, confirmed = true))
    }

    private fun persist(session: StoredSession): Boolean = try {
        store.write(session)
        true
    } catch (e: IOException) {
        false
    }

    private fun wipe(next: SessionState) {
        val hadSession = refreshToken != null
        refreshToken = null
        accessToken = null
        accessExpiresAt = 0
        user = null
        needsRefresh = false
        retryDelayMs = 0
        queue.cancel(retryTask)
        store.clear()
        publish(next)
        if (hadSession) main.post { for (listener in ArrayList(clearedListeners)) listener.onSessionCleared() }
    }

    private fun publish(next: SessionState) {
        current = next
        main.post {
            state = next
            for (listener in ArrayList(stateListeners)) listener.onSessionStateChanged(next)
        }
    }

    private fun sessionGone(): ApiError = ApiError(HTTP_UNAUTHORIZED, ErrorCode.UNAUTHORIZED, SESSION_GONE_MESSAGE)

    private companion object {
        const val HTTP_UNAUTHORIZED = 401
        const val HTTP_FORBIDDEN = 403
        const val EXPIRY_MARGIN_MS = 5_000L
        const val RETRY_FIRST_MS = 2_000L
        const val RETRY_MAX_MS = 60_000L
        const val SESSION_GONE_MESSAGE = "Нет активной сессии"
    }
}
