package com.qwill.app.realtime

import android.util.Log
import com.qwill.app.auth.LiveToken
import com.qwill.app.auth.SessionState
import com.qwill.app.core.TaskQueue
import com.qwill.app.model.SocketAck
import com.qwill.app.model.VisibilityPayload
import com.qwill.app.net.ApiCallback
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ApiResult
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import com.qwill.app.net.RequestGuid
import com.qwill.app.net.RequestHandle
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

data class SocketTimings(
    val dropRetryMs: Long = 1_000,
    val backoffFirstMs: Long = 2_000,
    val backoffMaxMs: Long = 60_000,
    val connectTimeoutMs: Long = 12_000,
    val ackTimeoutMs: Long = 20_000,
    val sleepDelayMs: Long = 10_000,
)

class SocketHold internal constructor(private val onRelease: () -> Unit) {
    private val released = AtomicBoolean(false)

    fun release() {
        if (released.compareAndSet(false, true)) onRelease()
    }
}

class SocketSubscription internal constructor(private val onRemove: (SocketSubscription) -> Unit) {
    @Volatile
    internal var active = true
        private set

    fun remove() {
        if (!active) return
        active = false
        onRemove(this)
    }
}

class SocketConnection(
    client: OkHttpClient,
    origin: String,
    private val userAgent: String,
    private val tokens: (rejected: String?, done: (LiveToken) -> Unit) -> Unit,
    private val onIpBanned: () -> Unit,
    private val queue: TaskQueue,
    private val main: TaskQueue,
    private val timings: SocketTimings = SocketTimings(),
    private val clock: () -> Long = System::currentTimeMillis,
    private val log: (String) -> Unit = { Log.w(TAG, it) },
) {
    private enum class Phase { IDLE, AUTHORIZING, OPENING, HANDSHAKE, CONNECTED }

    private class PendingAck(val timeout: Runnable, val done: (ApiResult<JsonObject>) -> Unit)

    private class Entry(val event: String?, val guid: Int, val subscription: SocketSubscription, val deliver: (String, JsonElement?) -> Unit)

    private val client = client.newBuilder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(0, TimeUnit.MILLISECONDS)
        .build()
    private val url = origin + PATH

    var state: ConnectionState = ConnectionState.Off
        private set

    var lastConnectedAt = 0L
        private set

    private val stateListeners = ArrayList<ConnectionStateListener>()
    private val connectedListeners = ArrayList<SocketConnectedListener>()
    private val entries = CopyOnWriteArrayList<Entry>()
    private val owners = HashMap<Int, MutableSet<RequestHandle>>()

    private var sessionActive = false
    private var ipBlocked = false
    private var networkUp = true
    private var foreground = false
    private var sleepDue = false
    private var asleep = false
    private var holds = 0
    private var updating = false

    private var phase = Phase.IDLE
    private var generation = 0
    private var webSocket: WebSocket? = null
    private var tokenInUse: String? = null
    private var tokenFresh = false
    private var rejectedToken: String? = null
    private var everConnected = false
    private var retryScheduled = false
    private var backoffMs = 0L
    private var maxPayload = Long.MAX_VALUE
    private var livenessLimitMs = 0L
    private var lastFrameAt = 0L
    private var nextAckId = 0L
    private var reported = ConnectionState.Off

    private val pendingAcks = LinkedHashMap<Long, PendingAck>()
    private val deferred = ArrayList<String>()

    private val retryTask = Runnable {
        retryScheduled = false
        evaluate()
    }
    private val connectTimeoutTask = Runnable {
        if (phase == Phase.OPENING || phase == Phase.HANDSHAKE) {
            log("вход не завершён за ${timings.connectTimeoutMs} мс")
            drop(timings.dropRetryMs)
        }
    }
    private val livenessTask = Runnable { checkLiveness() }
    private val sleepTask = Runnable {
        sleepDue = true
        trySleep()
    }

    fun start(initialSession: SessionState, networkAvailable: Boolean) {
        queue.post {
            sessionActive = initialSession is SessionState.Authenticated
            networkUp = networkAvailable
            queue.postDelayed(sleepTask, timings.sleepDelayMs)
            evaluate()
        }
    }

    fun addStateListener(listener: ConnectionStateListener) {
        stateListeners.add(listener)
    }

    fun removeStateListener(listener: ConnectionStateListener) {
        stateListeners.remove(listener)
    }

    fun addConnectedListener(listener: SocketConnectedListener) {
        connectedListeners.add(listener)
    }

    fun removeConnectedListener(listener: SocketConnectedListener) {
        connectedListeners.remove(listener)
    }

    fun onSessionState(session: SessionState) {
        queue.post {
            sessionActive = session is SessionState.Authenticated
            if (sessionActive) ipBlocked = false
            evaluate()
        }
    }

    fun onSessionCleared() {
        queue.post {
            deferred.clear()
            closeSocket(graceful = false)
            cancelRetry()
            everConnected = false
            rejectedToken = null
            tokenInUse = null
            backoffMs = 0
            evaluate()
        }
    }

    fun onNetworkAvailable() {
        queue.post {
            networkUp = true
            backoffMs = 0
            if (phase == Phase.IDLE) cancelRetry()
            evaluate()
        }
    }

    fun onNetworkLost() {
        queue.post {
            networkUp = false
            evaluate()
        }
    }

    fun onForeground() {
        queue.post {
            foreground = true
            queue.cancel(sleepTask)
            sleepDue = false
            asleep = false
            if (phase == Phase.CONNECTED) sendVisibility()
            if (phase == Phase.IDLE) cancelRetry()
            evaluate()
        }
    }

    fun onBackground() {
        queue.post {
            foreground = false
            if (phase == Phase.CONNECTED) sendVisibility()
            queue.cancel(sleepTask)
            queue.postDelayed(sleepTask, timings.sleepDelayMs)
        }
    }

    fun hold(): SocketHold {
        queue.post { holds++ }
        return SocketHold {
            queue.post {
                holds--
                trySleep()
            }
        }
    }

    fun setUpdating(value: Boolean) {
        queue.post {
            updating = value
            if (phase == Phase.CONNECTED) report(connectedState())
        }
    }

    fun emit(event: String, body: JsonElement) {
        queue.post {
            if (phase == Phase.CONNECTED) sendFrame(SocketPackets.event(event, body))
        }
    }

    fun emitDeferred(event: String, body: JsonElement) {
        queue.post {
            val frame = SocketPackets.event(event, body)
            if (phase == Phase.CONNECTED) sendFrame(frame) else deferred.add(frame)
        }
    }

    fun <T> request(
        event: String,
        body: JsonElement,
        parse: (JsonObject) -> T,
        guid: Int,
        callback: ApiCallback<T>,
    ): RequestHandle {
        val handle = RequestHandle(guid)
        synchronized(owners) { owners.getOrPut(guid) { HashSet() }.add(handle) }
        queue.post {
            sendWithAck(event, body, handle) { result ->
                val parsed: ApiResult<T> = when (result) {
                    is ApiResult.Success -> try {
                        ApiResult.Success(parse(result.value))
                    } catch (e: IllegalArgumentException) {
                        ApiResult.Failure(ApiError.unreadable(0))
                    }
                    is ApiResult.Failure -> result
                }
                main.post { deliver(handle, callback, parsed) }
            }
        }
        return handle
    }

    fun cancel(handle: RequestHandle) {
        synchronized(owners) { owners[handle.guid]?.remove(handle) }
        handle.cancel()
    }

    fun cancelRequestsForGuid(guid: Int) {
        val handles = synchronized(owners) { owners.remove(guid) }
        if (handles != null) for (handle in handles) handle.cancel()
        if (guid == RequestGuid.NONE) return
        for (entry in entries) if (entry.guid == guid) entry.subscription.remove()
    }

    fun <T> subscribe(
        event: String,
        deserializer: DeserializationStrategy<T>,
        guid: Int,
        listener: SocketEventListener<T>,
    ): SocketSubscription {
        val subscription = SocketSubscription(::unsubscribe)
        entries.add(
            Entry(event, guid, subscription) { name, body ->
                val value = decode(name, deserializer, body)
                if (value != null) main.post { if (subscription.active) listener.onSocketEvent(value) }
            },
        )
        return subscription
    }

    fun subscribeAll(guid: Int, listener: SocketRawListener): SocketSubscription {
        val subscription = SocketSubscription(::unsubscribe)
        entries.add(
            Entry(null, guid, subscription) { name, body ->
                main.post { if (subscription.active) listener.onSocketEvent(name, body) }
            },
        )
        return subscription
    }

    fun debugDrop() {
        queue.post {
            if (webSocket != null) drop(timings.dropRetryMs)
        }
    }

    private fun unsubscribe(subscription: SocketSubscription) {
        entries.removeAll { it.subscription === subscription }
    }

    private fun <T> decode(name: String, deserializer: DeserializationStrategy<T>, body: JsonElement?): T? = try {
        ApiJson.decodeFromJsonElement(deserializer, body ?: JsonNull)
    } catch (e: IllegalArgumentException) {
        log("тело $name не разобралось: ${e.message}")
        null
    }

    private fun <T> deliver(handle: RequestHandle, callback: ApiCallback<T>, result: ApiResult<T>) {
        synchronized(owners) {
            val set = owners[handle.guid] ?: return@synchronized
            set.remove(handle)
            if (set.isEmpty()) owners.remove(handle.guid)
        }
        if (handle.cancelled) return
        callback.onResult(result)
    }

    private fun evaluate() {
        val idle = when {
            !sessionActive || ipBlocked -> ConnectionState.Off
            !networkUp -> ConnectionState.WaitingForNetwork
            asleep -> ConnectionState.Sleeping
            else -> null
        }
        if (idle != null) {
            cancelRetry()
            closeSocket(graceful = idle != ConnectionState.WaitingForNetwork)
            report(idle)
            return
        }
        if (phase == Phase.IDLE && !retryScheduled) connect()
        report(if (phase == Phase.CONNECTED) connectedState() else ConnectionState.Connecting)
    }

    private fun connect() {
        phase = Phase.AUTHORIZING
        val attempt = ++generation
        tokens(rejectedToken) { result -> queue.post { onToken(attempt, result) } }
    }

    private fun onToken(attempt: Int, result: LiveToken) {
        if (attempt != generation || phase != Phase.AUTHORIZING) return
        when (result) {
            is LiveToken.Ready -> {
                tokenInUse = result.token
                tokenFresh = result.refreshed
                open(attempt)
            }
            is LiveToken.Failed -> {
                log("токен для сокета не получен: ${result.error.message}")
                phase = Phase.IDLE
                scheduleRetry(nextBackoff())
                evaluate()
            }
        }
    }

    private fun open(attempt: Int) {
        phase = Phase.OPENING
        val request = Request.Builder().url(url).header(USER_AGENT, userAgent).build()
        webSocket = client.newWebSocket(request, Listener(attempt))
        queue.postDelayed(connectTimeoutTask, timings.connectTimeoutMs)
    }

    private fun onFrame(text: String) {
        lastFrameAt = clock()
        when (val packet = SocketPackets.parse(text)) {
            is SocketPacket.Open -> onOpen(packet)
            SocketPacket.Ping -> sendFrame(SocketPackets.PONG)
            is SocketPacket.Connected -> onConnected()
            is SocketPacket.ConnectError -> onConnectError(packet.message)
            SocketPacket.Disconnected, SocketPacket.Close -> drop(timings.dropRetryMs)
            is SocketPacket.Event -> if (phase == Phase.CONNECTED) dispatch(packet)
            is SocketPacket.Ack -> onAck(packet)
            SocketPacket.Pong, SocketPacket.Noop -> Unit
            is SocketPacket.Unknown -> log("незнакомый кадр: ${packet.raw.take(LOG_FRAME_CHARS)}")
        }
    }

    private fun onOpen(packet: SocketPacket.Open) {
        if (phase != Phase.OPENING) return
        maxPayload = packet.maxPayload
        livenessLimitMs = packet.pingInterval + packet.pingTimeout
        queue.cancel(livenessTask)
        queue.postDelayed(livenessTask, livenessLimitMs)
        phase = Phase.HANDSHAKE
        sendFrame(SocketPackets.connect(tokenInUse.orEmpty()))
    }

    private fun onConnected() {
        if (phase != Phase.HANDSHAKE) return
        phase = Phase.CONNECTED
        queue.cancel(connectTimeoutTask)
        backoffMs = 0
        rejectedToken = null
        val afterDrop = everConnected
        everConnected = true
        val at = clock()
        sendVisibility()
        val queued = ArrayList(deferred)
        deferred.clear()
        for (frame in queued) sendFrame(frame)
        report(connectedState())
        main.post {
            lastConnectedAt = at
            for (listener in ArrayList(connectedListeners)) listener.onSocketConnected(afterDrop)
        }
    }

    private fun onConnectError(message: String) {
        if (phase != Phase.HANDSHAKE) return
        val token = tokenInUse
        val fresh = tokenFresh
        closeSocket(graceful = false)
        if (message == IP_BANNED) {
            log("вход отклонён: адрес закрыт")
            ipBlocked = true
            onIpBanned()
            evaluate()
            return
        }
        log("вход отклонён: $message")
        rejectedToken = token
        scheduleRetry(if (fresh) nextBackoff() else 0)
        evaluate()
    }

    private fun dispatch(event: SocketPacket.Event) {
        for (entry in entries) {
            if (entry.event == null || entry.event == event.name) entry.deliver(event.name, event.body)
        }
    }

    private fun sendWithAck(event: String, body: JsonElement, handle: RequestHandle, done: (ApiResult<JsonObject>) -> Unit) {
        if (handle.cancelled) return
        if (phase != Phase.CONNECTED) {
            done(ApiResult.Failure(NetworkError()))
            return
        }
        val id = nextAckId++
        val frame = SocketPackets.event(event, body, id)
        if (!fits(frame)) {
            done(ApiResult.Failure(ApiError(0, ErrorCode.VALIDATION_FAILED, TOO_LARGE_MESSAGE)))
            return
        }
        val timeout = Runnable {
            val pending = pendingAcks.remove(id) ?: return@Runnable
            pending.done(ApiResult.Failure(NoResponseError()))
            trySleep()
        }
        pendingAcks[id] = PendingAck(timeout, done)
        queue.postDelayed(timeout, timings.ackTimeoutMs)
        webSocket?.send(frame)
    }

    private fun onAck(packet: SocketPacket.Ack) {
        val pending = pendingAcks.remove(packet.id) ?: return
        queue.cancel(pending.timeout)
        val body = packet.args.firstOrNull() as? JsonObject
        pending.done(if (body == null) ApiResult.Failure(ApiError.unreadable(0)) else readAck(body))
        trySleep()
    }

    private fun readAck(body: JsonObject): ApiResult<JsonObject> {
        val ack = try {
            ApiJson.decodeFromJsonElement(SocketAck.serializer(), body)
        } catch (e: IllegalArgumentException) {
            return ApiResult.Failure(ApiError.unreadable(0))
        }
        if (ack.ok) return ApiResult.Success(body)
        val error = ack.error ?: return ApiResult.Failure(ApiError.unreadable(0))
        return ApiResult.Failure(ApiError(0, error.code, error.message))
    }

    private fun failAcks() {
        if (pendingAcks.isEmpty()) return
        val failed = ArrayList(pendingAcks.values)
        pendingAcks.clear()
        for (pending in failed) {
            queue.cancel(pending.timeout)
            pending.done(ApiResult.Failure(NetworkError()))
        }
    }

    private fun sendVisibility() {
        sendFrame(SocketPackets.event(SocketEvent.VISIBILITY_CHANGE, ApiJson.encodeToJsonElement(VisibilityPayload.serializer(), VisibilityPayload(foreground))))
    }

    private fun sendFrame(frame: String) {
        if (!fits(frame)) {
            log("кадр больше maxPayload, не отправлен")
            return
        }
        webSocket?.send(frame)
    }

    private fun fits(frame: String): Boolean {
        if (frame.length.toLong() * MAX_UTF8_BYTES <= maxPayload) return true
        return frame.toByteArray(Charsets.UTF_8).size <= maxPayload
    }

    private fun checkLiveness() {
        if (webSocket == null || livenessLimitMs <= 0) return
        val silent = clock() - lastFrameAt
        if (silent >= livenessLimitMs) {
            log("сервер молчит $silent мс, соединение считается мёртвым")
            drop(timings.dropRetryMs)
            return
        }
        queue.postDelayed(livenessTask, livenessLimitMs - silent)
    }

    private fun drop(retryMs: Long) {
        closeSocket(graceful = false)
        scheduleRetry(retryMs)
        evaluate()
        trySleep()
    }

    private fun connectedState(): ConnectionState = if (updating) ConnectionState.Updating else ConnectionState.Connected

    private fun trySleep() {
        if (!sleepDue || foreground || asleep || pendingAcks.isNotEmpty() || holds > 0) return
        asleep = true
        evaluate()
    }

    private fun closeSocket(graceful: Boolean) {
        val socket = webSocket
        val wasConnected = phase == Phase.CONNECTED
        generation++
        webSocket = null
        phase = Phase.IDLE
        livenessLimitMs = 0
        maxPayload = Long.MAX_VALUE
        queue.cancel(connectTimeoutTask)
        queue.cancel(livenessTask)
        failAcks()
        if (socket == null) return
        if (graceful && wasConnected) {
            socket.send(SocketPackets.DISCONNECT)
            socket.close(NORMAL_CLOSURE, null)
        } else {
            socket.cancel()
        }
    }

    private fun scheduleRetry(delayMs: Long) {
        queue.cancel(retryTask)
        retryScheduled = true
        queue.postDelayed(retryTask, delayMs)
    }

    private fun cancelRetry() {
        queue.cancel(retryTask)
        retryScheduled = false
    }

    private fun nextBackoff(): Long {
        backoffMs = if (backoffMs == 0L) timings.backoffFirstMs else minOf(backoffMs * 2, timings.backoffMaxMs)
        return backoffMs
    }

    private fun report(next: ConnectionState) {
        if (next == reported) return
        reported = next
        main.post {
            state = next
            for (listener in ArrayList(stateListeners)) listener.onConnectionStateChanged(next)
        }
    }

    private inner class Listener(private val attempt: Int) : WebSocketListener() {
        override fun onMessage(webSocket: WebSocket, text: String) {
            queue.post { if (attempt == generation) onFrame(text) }
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            queue.post { if (attempt == generation) drop(timings.dropRetryMs) }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            val refused = response != null
            queue.post {
                if (attempt != generation) return@post
                log(if (refused) "апгрейд отклонён: ${response?.code}" else "обрыв: ${t.javaClass.simpleName}")
                drop(if (refused) nextBackoff() else timings.dropRetryMs)
            }
        }
    }

    private companion object {
        const val TAG = "QwillSocket"
        const val PATH = "/socket.io/?EIO=4&transport=websocket"
        const val USER_AGENT = "User-Agent"
        const val IP_BANNED = "ip_banned"
        const val NORMAL_CLOSURE = 1000
        const val MAX_UTF8_BYTES = 3
        const val LOG_FRAME_CHARS = 120
        const val TOO_LARGE_MESSAGE = "Слишком большой запрос"
    }
}
