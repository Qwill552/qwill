package com.qwill.app.realtime

import com.qwill.app.auth.Awaiting
import com.qwill.app.auth.ExecutorQueue
import com.qwill.app.auth.LiveToken
import com.qwill.app.auth.RecordingStore
import com.qwill.app.auth.Session
import com.qwill.app.auth.SessionState
import com.qwill.app.auth.StoredSession
import com.qwill.app.auth.authJson
import com.qwill.app.auth.futureJwt
import com.qwill.app.auth.userJson
import com.qwill.app.model.PublicUser
import com.qwill.app.model.UserTypingEvent
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ApiResult
import com.qwill.app.net.HttpTransport
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import com.qwill.app.net.RequestGuid
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

class SocketConnectionTest {
    private lateinit var server: MockWebServer
    private lateinit var fake: FakeSocketServer
    private lateinit var socketQueue: ExecutorQueue
    private lateinit var sessionQueue: ExecutorQueue
    private lateinit var mainQueue: ExecutorQueue
    private lateinit var socket: SocketConnection
    private val states = CopyOnWriteArrayList<ConnectionState>()
    private val connectedEvents = CopyOnWriteArrayList<Boolean>()
    private val refreshCalls = AtomicInteger()
    private val ipBans = AtomicInteger()
    private val guid = RequestGuid.next()
    private val user = ApiJson.decodeFromString(PublicUser.serializer(), userJson())
    private val signedIn = SessionState.Authenticated(user, confirmed = true)

    @Volatile
    private var refreshResponse: () -> MockResponse = { MockResponse().setResponseCode(500) }

    @Before
    fun setUp() {
        fake = FakeSocketServer()
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val path = request.path.orEmpty()
                if (path.startsWith("/socket.io/")) return fake.response()
                if (path == "/api/auth/refresh") {
                    refreshCalls.incrementAndGet()
                    return refreshResponse()
                }
                return MockResponse().setResponseCode(404)
            }
        }
        server.start()
        socketQueue = ExecutorQueue()
        sessionQueue = ExecutorQueue()
        mainQueue = ExecutorQueue()
    }

    @After
    fun tearDown() {
        socketQueue.shutdown()
        sessionQueue.shutdown()
        mainQueue.shutdown()
        server.shutdown()
    }

    private fun origin(): String = server.url("").toString().trimEnd('/')

    private fun fixedToken(token: String = "t1"): (String?, (LiveToken) -> Unit) -> Unit = { _, done -> done(LiveToken.Ready(token, refreshed = false)) }

    private fun open(
        timings: SocketTimings = SocketTimings(dropRetryMs = 100, backoffFirstMs = 5_000),
        tokens: (String?, (LiveToken) -> Unit) -> Unit = fixedToken(),
        start: Boolean = true,
    ): SocketConnection {
        socket = SocketConnection(
            OkHttpClient(),
            origin(),
            "Qwill/test",
            tokens,
            { ipBans.incrementAndGet() },
            socketQueue,
            mainQueue,
            timings,
            log = {},
        )
        socket.addStateListener { states.add(it) }
        socket.addConnectedListener { connectedEvents.add(it) }
        if (start) socket.start(signedIn, networkAvailable = true)
        return socket
    }

    private fun lastState(): ConnectionState? = states.lastOrNull()

    private fun awaitConnected() {
        eventually { lastState() == ConnectionState.Connected }
    }

    private fun payload(vararg pairs: Pair<String, String>): JsonObject = JsonObject(pairs.associate { it.first to JsonPrimitive(it.second) })

    private fun ackId(frame: String): Long = frame.substring(2).takeWhile { it.isDigit() }.toLong()

    @Test
    fun connectsWithTokenAndReportsVisibilityAfterEachLogin() {
        open()
        awaitConnected()
        assertEquals(listOf("t1"), fake.tokens)
        eventually { fake.events("visibility:change").isNotEmpty() }
        assertTrue(fake.events("visibility:change").first().contains("\"visible\":false"))

        socket.onForeground()
        eventually { fake.events("visibility:change").any { it.contains("\"visible\":true") } }
        assertEquals(listOf(false), connectedEvents)
    }

    @Test
    fun answersServerPing() {
        open()
        awaitConnected()
        fake.send("2")
        eventually { fake.frames.contains("3") }
    }

    @Test
    fun unknownPacketAndEventDoNotBreakConnection() {
        open()
        val received = CopyOnWriteArrayList<UserTypingEvent>()
        socket.subscribe(SocketEvent.USER_TYPING, UserTypingEvent.serializer(), guid) { received.add(it) }
        awaitConnected()

        fake.send("9garbage")
        fake.send("""42["some:future",{"x":1}]""")
        fake.send("""42["user:typing",{"broken":true}]""")
        fake.send("""42["user:typing",{"chatId":"c","userId":"u2","displayName":"Б","isTyping":true}]""")

        eventually { received.size == 1 }
        assertEquals("u2", received[0].userId)
        Thread.sleep(200)
        assertEquals(1, fake.connections.get())
        assertEquals(ConnectionState.Connected, lastState())
    }

    @Test
    fun silentServerIsDroppedAndReconnected() {
        fake.pingInterval = 150
        fake.pingTimeout = 150
        open()
        awaitConnected()
        eventually { fake.connections.get() >= 2 }
        eventually { connectedEvents.size >= 2 }
        assertEquals(true, connectedEvents[1])
    }

    @Test
    fun unauthorizedRefreshesOnceAndRetriesWithNewToken() {
        val oldAccess = futureJwt("-old")
        val newAccess = futureJwt("-new")
        refreshResponse = { MockResponse().setResponseCode(200).setBody(authJson(newAccess, "r1")) }
        fake.onConnect = { token -> if (token == newAccess) """40{"sid":"ok"}""" else """44{"message":"unauthorized"}""" }
        val session = session(StoredSession("r0", oldAccess, System.currentTimeMillis() + 3_600_000, user))
        open(tokens = session::liveAccessToken)

        awaitConnected()
        assertEquals(listOf(oldAccess, newAccess), fake.tokens)
        assertEquals(1, refreshCalls.get())
    }

    @Test
    fun repeatedUnauthorizedAfterFreshTokenBacksOff() {
        val oldAccess = futureJwt("-old")
        refreshResponse = { MockResponse().setResponseCode(200).setBody(authJson(futureJwt("-new${refreshCalls.get()}"), "r${refreshCalls.get()}")) }
        fake.onConnect = { """44{"message":"unauthorized"}""" }
        val session = session(StoredSession("r0", oldAccess, System.currentTimeMillis() + 3_600_000, user))
        open(tokens = session::liveAccessToken)

        eventually { fake.tokens.size == 2 }
        Thread.sleep(1_000)
        assertEquals(2, fake.tokens.size)
        assertEquals(1, refreshCalls.get())
        assertEquals(ConnectionState.Connecting, lastState())
    }

    @Test
    fun ipBannedStopsAttempts() {
        fake.onConnect = { """44{"message":"ip_banned"}""" }
        open()
        eventually { ipBans.get() == 1 }
        eventually { lastState() == ConnectionState.Off }
        Thread.sleep(500)
        assertEquals(1, fake.connections.get())
        assertEquals(1, ipBans.get())
    }

    @Test
    fun deferredActionsGoOutInOrderAfterLoginInstantOnesNever() {
        open(start = false)
        socket.emit(SocketEvent.TYPING_START, payload("chatId" to "c"))
        socket.emitDeferred(SocketEvent.MESSAGE_REACT, payload("n" to "1"))
        socket.emitDeferred(SocketEvent.CHAT_PIN, payload("n" to "2"))
        socket.emitDeferred(SocketEvent.MESSAGE_REACT, payload("n" to "3"))
        socket.start(signedIn, networkAvailable = true)
        awaitConnected()

        eventually { fake.frames.count { it.contains("\"n\":") } == 3 }
        val order = fake.frames.filter { it.contains("\"n\":") }.map { it.substringAfter("\"n\":\"").take(1) }
        assertEquals(listOf("1", "2", "3"), order)
        Thread.sleep(200)
        assertTrue(fake.events(SocketEvent.TYPING_START).isEmpty())
    }

    @Test
    fun requestFailsOnceWhenConnectionDropsBeforeAck() {
        open()
        awaitConnected()
        val calls = AtomicInteger()
        val result = Awaiting<JsonObject>()
        socket.request(SocketEvent.MESSAGE_SEND, payload("chatId" to "c"), { it }, guid) {
            calls.incrementAndGet()
            result.onResult(it)
        }
        eventually { fake.events(SocketEvent.MESSAGE_SEND).isNotEmpty() }
        fake.current!!.close(1001, "gone")

        val failure = result.await() as ApiResult.Failure
        assertTrue(failure.error is NetworkError)
        Thread.sleep(300)
        assertEquals(1, calls.get())
    }

    @Test
    fun requestWithoutAnswerTimesOut() {
        open(SocketTimings(dropRetryMs = 100, ackTimeoutMs = 300))
        awaitConnected()
        val result = Awaiting<JsonObject>()
        socket.request(SocketEvent.MESSAGE_SEND, payload("chatId" to "c"), { it }, guid, result)
        val failure = result.await() as ApiResult.Failure
        assertTrue(failure.error is NoResponseError)
    }

    @Test
    fun requestWithoutConnectionFailsImmediately() {
        open(start = false)
        val result = Awaiting<JsonObject>()
        socket.request(SocketEvent.MESSAGE_SEND, payload("chatId" to "c"), { it }, guid, result)
        assertTrue((result.await(2) as ApiResult.Failure).error is NetworkError)
    }

    @Test
    fun ackDeliversSuccessAndServerError() {
        open()
        awaitConnected()
        val ok = Awaiting<String>()
        socket.request(SocketEvent.MESSAGE_EDIT, payload("chatId" to "c"), { it["extra"]!!.jsonPrimitive.content }, guid, ok)
        eventually { fake.events(SocketEvent.MESSAGE_EDIT).size == 1 }
        fake.send("""43${ackId(fake.events(SocketEvent.MESSAGE_EDIT)[0])}[{"ok":true,"extra":"x"}]""")
        assertEquals("x", (ok.await() as ApiResult.Success).value)

        val refused = Awaiting<JsonObject>()
        socket.request(SocketEvent.MESSAGE_DELETE, payload("chatId" to "c"), { it }, guid, refused)
        eventually { fake.events(SocketEvent.MESSAGE_DELETE).size == 1 }
        fake.send("""43${ackId(fake.events(SocketEvent.MESSAGE_DELETE)[0])}[{"ok":false,"error":{"code":"BLOCKED","message":"Нельзя"}}]""")
        val error = (refused.await() as ApiResult.Failure).error as ApiError
        assertEquals(0, error.status)
        assertEquals("BLOCKED", error.code)
        assertEquals("Нельзя", error.message)
    }

    @Test
    fun cancelledOwnerGetsNoCallback() {
        open()
        awaitConnected()
        val calls = AtomicInteger()
        socket.request(SocketEvent.MESSAGE_SEND, payload("chatId" to "c"), { it }, guid) { calls.incrementAndGet() }
        eventually { fake.events(SocketEvent.MESSAGE_SEND).isNotEmpty() }
        socket.cancelRequestsForGuid(guid)
        fake.send("""43${ackId(fake.events(SocketEvent.MESSAGE_SEND)[0])}[{"ok":true}]""")
        Thread.sleep(300)
        assertEquals(0, calls.get())
    }

    @Test
    fun sleepsAfterBackgroundDelay() {
        open(SocketTimings(dropRetryMs = 100, sleepDelayMs = 300))
        socket.onForeground()
        awaitConnected()
        socket.onBackground()
        eventually { lastState() == ConnectionState.Sleeping }
        eventually { fake.frames.contains(SocketPackets.DISCONNECT) }
        Thread.sleep(300)
        assertEquals(1, fake.connections.get())

        socket.onForeground()
        eventually { fake.connections.get() == 2 && lastState() == ConnectionState.Connected }
        eventually { fake.events("visibility:change").last().contains("\"visible\":true") }
    }

    @Test
    fun returnBeforeDelayKeepsConnection() {
        open(SocketTimings(dropRetryMs = 100, sleepDelayMs = 300))
        socket.onForeground()
        awaitConnected()
        socket.onBackground()
        Thread.sleep(100)
        socket.onForeground()
        Thread.sleep(500)
        assertEquals(ConnectionState.Connected, lastState())
        assertEquals(1, fake.connections.get())
        assertFalse(states.contains(ConnectionState.Sleeping))
    }

    @Test
    fun pendingAckAndHoldPostponeSleep() {
        open(SocketTimings(dropRetryMs = 100, sleepDelayMs = 200))
        socket.onForeground()
        awaitConnected()

        val result = Awaiting<JsonObject>()
        socket.request(SocketEvent.MESSAGE_SEND, payload("chatId" to "c"), { it }, guid, result)
        eventually { fake.events(SocketEvent.MESSAGE_SEND).isNotEmpty() }
        socket.onBackground()
        Thread.sleep(500)
        assertEquals(ConnectionState.Connected, lastState())
        fake.send("""43${ackId(fake.events(SocketEvent.MESSAGE_SEND)[0])}[{"ok":true}]""")
        result.await()
        eventually { lastState() == ConnectionState.Sleeping }

        socket.onForeground()
        awaitConnected()
        val hold = socket.hold()
        socket.onBackground()
        Thread.sleep(500)
        assertEquals(ConnectionState.Connected, lastState())
        hold.release()
        eventually { lastState() == ConnectionState.Sleeping }
    }

    @Test
    fun loginInBackgroundReportsInvisible() {
        open()
        socket.onForeground()
        awaitConnected()
        socket.onBackground()
        eventually { fake.events("visibility:change").lastOrNull()?.contains("\"visible\":false") == true }
        socket.debugDrop()
        eventually { fake.connections.get() == 2 && fake.tokens.size == 2 }
        eventually { fake.events("visibility:change").size == 3 }
        assertTrue(fake.events("visibility:change").last().contains("\"visible\":false"))
        assertEquals(listOf(false, true), connectedEvents)
    }

    @Test
    fun networkLossWaitsAndReturnConnects() {
        open()
        awaitConnected()
        socket.onNetworkLost()
        eventually { lastState() == ConnectionState.WaitingForNetwork }
        Thread.sleep(300)
        assertEquals(1, fake.connections.get())
        socket.onNetworkAvailable()
        eventually { fake.connections.get() == 2 && lastState() == ConnectionState.Connected }
    }

    @Test
    fun sessionClearedClosesAndForgetsQueue() {
        open()
        awaitConnected()
        val result = Awaiting<JsonObject>()
        socket.request(SocketEvent.MESSAGE_SEND, payload("chatId" to "c"), { it }, guid, result)
        eventually { fake.events(SocketEvent.MESSAGE_SEND).isNotEmpty() }

        socket.onSessionState(SessionState.Anonymous)
        socket.onSessionCleared()
        assertTrue((result.await() as ApiResult.Failure).error is NetworkError)
        eventually { lastState() == ConnectionState.Off }

        socket.emitDeferred(SocketEvent.MESSAGE_REACT, payload("n" to "stale"))
        socket.onSessionCleared()
        socket.onSessionState(signedIn)
        eventually { fake.connections.get() == 2 && lastState() == ConnectionState.Connected }
        Thread.sleep(200)
        assertTrue(fake.frames.none { it.contains("stale") })
        assertEquals(false, connectedEvents.last())
    }

    @Test
    fun typingSenderRepeatsWhileTypingAndStops() {
        open()
        awaitConnected()
        val sender = TypingSender(socket, "c", mainQueue, repeatMs = 300, idleMs = 250)
        repeat(10) {
            mainQueue.post { sender.onTextChanged("текст $it") }
            Thread.sleep(100)
        }
        eventually { fake.events(SocketEvent.TYPING_STOP).size == 1 }
        val starts = fake.events(SocketEvent.TYPING_START).size
        assertTrue("повторов $starts", starts in 3..5)
        Thread.sleep(500)
        assertEquals(starts, fake.events(SocketEvent.TYPING_START).size)
    }

    private fun session(stored: StoredSession): Session {
        val transport = HttpTransport(OkHttpClient(), origin(), "Qwill/test")
        return Session(transport, RecordingStore(stored), sessionQueue, mainQueue)
    }
}
