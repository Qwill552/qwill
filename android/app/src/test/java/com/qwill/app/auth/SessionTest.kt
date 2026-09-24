package com.qwill.app.auth

import com.qwill.app.model.AvatarColor
import com.qwill.app.model.PublicUser
import com.qwill.app.model.UserRole
import com.qwill.app.net.ApiClient
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ApiResult
import com.qwill.app.net.HttpTransport
import com.qwill.app.net.NetworkError
import com.qwill.app.net.RequestGuid
import com.qwill.app.net.SessionMode
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class SessionTest {
    private lateinit var server: MockWebServer
    private lateinit var sessionQueue: ExecutorQueue
    private lateinit var mainQueue: ExecutorQueue
    private lateinit var store: RecordingStore
    private lateinit var session: Session
    private lateinit var api: ApiClient
    private val refreshCalls = AtomicInteger()
    private val profileCalls = AtomicInteger()
    private val clearedEvents = AtomicInteger()
    private val guid = RequestGuid.next()

    private val oldAccess = futureJwt("-old")
    private val newAccess = futureJwt("-new")
    private val storedUser = ApiJson.decodeFromString(PublicUser.serializer(), userJson())

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        sessionQueue = ExecutorQueue()
        mainQueue = ExecutorQueue()
    }

    @After
    fun tearDown() {
        sessionQueue.shutdown()
        mainQueue.shutdown()
        server.shutdown()
    }

    private fun open(stored: StoredSession?, dispatcher: (RecordedRequest) -> MockResponse) {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                if (request.path == "/api/auth/refresh") refreshCalls.incrementAndGet()
                if (request.path == "/api/users/me") profileCalls.incrementAndGet()
                return dispatcher(request)
            }
        }
        store = RecordingStore(stored)
        val transport = HttpTransport(OkHttpClient(), server.url("").toString().trimEnd('/'), "Qwill/test (Android 5.0; test) native")
        session = Session(transport, store, sessionQueue, mainQueue)
        session.addClearedListener { clearedEvents.incrementAndGet() }
        api = ApiClient(transport, session, sessionQueue, mainQueue)
    }

    private fun liveSession(): StoredSession = StoredSession("r0", oldAccess, System.currentTimeMillis() + 3_600_000, storedUser)

    private fun expiredSession(): StoredSession = StoredSession("r0", oldAccess, System.currentTimeMillis() - 1_000, storedUser)

    private fun json(code: Int, body: String): MockResponse =
        MockResponse().setResponseCode(code).setHeader("Content-Type", "application/json").setBody(body)

    private fun expired(): MockResponse = json(401, errorJson("TOKEN_EXPIRED", "Токен истёк"))

    private fun requestProfile(): Awaiting<PublicUser> = Awaiting<PublicUser>().also { api.send(Requests.me(), guid, it) }

    private fun settle() {
        sessionQueue.drain()
        mainQueue.drain()
    }

    @Test
    fun parallel401GiveOneRefresh() {
        open(liveSession()) { request ->
            when (request.path) {
                "/api/auth/refresh" -> {
                    Thread.sleep(300)
                    json(200, authJson(newAccess, "r1"))
                }
                "/api/users/me" ->
                    if (request.getHeader("Authorization") == "Bearer $newAccess") json(200, userJson()) else expired()
                else -> json(404, "{}")
            }
        }

        val calls = List(10) { requestProfile() }
        val results = calls.map { it.await() }

        assertTrue(results.all { it is ApiResult.Success })
        assertEquals(1, refreshCalls.get())
    }

    @Test
    fun requestRetriesOnceAndSecond401GoesToCaller() {
        open(liveSession()) { request ->
            when (request.path) {
                "/api/auth/refresh" -> json(200, authJson(newAccess, "r1"))
                else -> expired()
            }
        }

        val result = requestProfile().await()

        assertEquals(401, ((result as ApiResult.Failure).error as ApiError).status)
        assertEquals(2, profileCalls.get())
        assertEquals(1, refreshCalls.get())
    }

    @Test
    fun transientRefreshFailuresKeepSession() {
        val failures = listOf(
            MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST),
            json(500, errorJson("INTERNAL", "Внутренняя ошибка")),
            json(502, "<html>Bad Gateway</html>"),
            json(403, errorJson("FORBIDDEN", "Проверка запроса не пройдена")),
            json(429, errorJson("RATE_LIMITED", "Слишком много запросов")),
        )
        for (failure in failures) {
            refreshCalls.set(0)
            open(expiredSession()) { request ->
                if (request.path == "/api/auth/refresh") failure else json(200, userJson())
            }

            requestProfile().await()
            settle()

            assertEquals(1, refreshCalls.get())
            assertEquals("r0", store.current?.refreshToken)
            assertEquals(0, store.clears)
            assertEquals(0, clearedEvents.get())
            assertEquals(SessionState.Authenticated(storedUser, confirmed = false), session.state)
            sessionQueue.shutdown()
            sessionQueue = ExecutorQueue()
        }
    }

    @Test
    fun networkErrorOnRefreshReachesCallerAsNetworkError() {
        open(expiredSession()) { MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST) }

        val result = requestProfile().await()

        assertTrue((result as ApiResult.Failure).error is NetworkError)
    }

    @Test
    fun unauthorizedRefreshSignsOutOnce() {
        open(liveSession()) { request ->
            when (request.path) {
                "/api/auth/refresh" -> {
                    Thread.sleep(200)
                    json(401, errorJson("TOKEN_INVALID", "Сессия недействительна"))
                }
                else -> expired()
            }
        }

        val calls = List(5) { requestProfile() }
        calls.forEach { it.await() }
        settle()

        assertEquals(SessionState.Anonymous, session.state)
        assertNull(store.current)
        assertEquals(1, clearedEvents.get())
        assertEquals(1, refreshCalls.get())
    }

    @Test
    fun ipBanKeepsTokens() {
        open(expiredSession()) { json(403, errorJson("IP_BANNED", "Доступ с этого адреса закрыт")) }

        val result = requestProfile().await()
        settle()

        assertEquals("IP_BANNED", ((result as ApiResult.Failure).error as ApiError).code)
        assertEquals(SessionState.IpBanned(storedUser), session.state)
        assertEquals("r0", store.current?.refreshToken)
        assertEquals(0, clearedEvents.get())
    }

    @Test
    fun userBanWipesTokens() {
        open(expiredSession()) { json(403, errorJson("USER_BANNED", "Аккаунт заблокирован. Причина: спам")) }

        requestProfile().await()
        settle()

        assertEquals(SessionState.Banned("Аккаунт заблокирован. Причина: спам"), session.state)
        assertNull(store.current)
        assertEquals(1, clearedEvents.get())
    }

    @Test
    fun newRefreshTokenIsStoredBeforeRetry() {
        val storedAtRetry = CopyOnWriteArrayList<String?>()
        open(liveSession()) { request ->
            when {
                request.path == "/api/auth/refresh" -> json(200, authJson(newAccess, "r1"))
                request.getHeader("Authorization") == "Bearer $newAccess" -> {
                    storedAtRetry.add(store.current?.refreshToken)
                    json(200, userJson())
                }
                else -> expired()
            }
        }

        val result = requestProfile().await()

        assertTrue(result is ApiResult.Success)
        assertEquals(listOf("r1"), storedAtRetry)
    }

    @Test
    fun refreshSendsTokenInBodyWithSessionHeader() {
        open(expiredSession()) { request ->
            if (request.path == "/api/auth/refresh") json(200, authJson(newAccess, "r1")) else json(200, userJson())
        }

        requestProfile().await()

        val refresh = server.takeRequest(5, TimeUnit.SECONDS)!!
        assertEquals("/api/auth/refresh", refresh.path)
        assertEquals(SessionMode.BODY, refresh.getHeader(SessionMode.HEADER))
        assertEquals("""{"refreshToken":"r0"}""", refresh.body.readUtf8())
        assertNull(refresh.getHeader("Cookie"))
    }

    @Test
    fun toleratesUnknownFieldsAndUnknownErrorCodes() {
        open(liveSession()) { request ->
            when (request.path) {
                "/api/users/me" -> json(
                    200,
                    userJson(""","futureField":{"nested":[1,2]}""").replace("\"violet\"", "\"magenta\"").replace("\"role\":\"user\"", "\"role\":\"owner\""),
                )
                else -> json(409, """{"error":{"code":"SOMETHING_NEW","message":"Новая ошибка","hint":"x"},"extra":true}""")
            }
        }

        val profile = (requestProfile().await() as ApiResult.Success).value
        assertEquals(AvatarColor.BLUE, profile.avatarColor)
        assertEquals(UserRole.USER, profile.role)

        val health = Awaiting<Any>().also { api.send(Requests.health(), guid, it) }.await()
        val error = (health as ApiResult.Failure).error as ApiError
        assertEquals("SOMETHING_NEW", error.code)
        assertEquals("Новая ошибка", error.message)
    }

    @Test
    fun logoutWipesLocallyWithoutServer() {
        open(liveSession()) { MockResponse().setSocketPolicy(SocketPolicy.NO_RESPONSE) }

        api.logout()
        settle()

        assertEquals(SessionState.Anonymous, session.state)
        assertNull(store.current)
        assertEquals(1, clearedEvents.get())
    }

    @Test
    fun loginStoresSessionAndHidesTokens() {
        open(null) { request ->
            if (request.path == "/api/auth/login") json(200, authJson(newAccess, "r1")) else json(404, "{}")
        }

        val login = Awaiting<PublicUser>()
        api.login(com.qwill.app.model.LoginInput("anna", "password123"), guid, login)
        val result = login.await()
        settle()

        assertEquals("anna", (result as ApiResult.Success).value.username)
        assertEquals("r1", store.current?.refreshToken)
        assertEquals(SessionState.Authenticated(storedUser, confirmed = true), session.state)
        val recorded = server.takeRequest(5, TimeUnit.SECONDS)!!
        assertEquals(SessionMode.BODY, recorded.getHeader(SessionMode.HEADER))
    }

    @Test
    fun cancelledRequestIsNotDelivered() {
        open(liveSession()) {
            Thread.sleep(300)
            json(200, userJson())
        }

        val call = Awaiting<PublicUser>()
        api.send(Requests.me(), guid, call)
        api.cancelRequestsForGuid(guid)
        Thread.sleep(600)
        settle()

        assertTrue(runCatching { call.await(timeoutSeconds = 1) }.isFailure)
    }
}
