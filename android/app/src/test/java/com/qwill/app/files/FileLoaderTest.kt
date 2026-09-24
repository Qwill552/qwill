package com.qwill.app.files

import com.qwill.app.net.ApiError
import com.qwill.app.net.RequestGuid
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class FileLoaderTest {
    private lateinit var server: MockWebServer
    private lateinit var env: FilesEnv
    private val paths = CopyOnWriteArrayList<String>()
    private val gate = CountDownLatch(1)

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        gate.countDown()
        env.close()
        server.shutdown()
    }

    private fun start(timings: FileLoaderTimings = FileLoaderTimings(retryFirstMs = 20, retryMaxMs = 40)) {
        env = FilesEnv(server, timings)
    }

    private fun request(id: String, size: Long, kind: MediaKind = MediaKind.PHOTO) =
        FileRequest(id, size, "image/jpeg", "c1", kind, MediaTier.FULL)

    private fun gatedServer(body: (String) -> ByteArray) {
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val id = request.path!!.substringAfterLast('/')
                paths.add(id)
                gate.await(10, TimeUnit.SECONDS)
                return MockResponse().setBody(Buffer().write(body(id)))
            }
        }
    }

    @Test
    fun twoRequestsOfOneFileShareOneTransfer() {
        start()
        val content = bytes(1000)
        gatedServer { content }
        val first = RecordingListener()
        val second = RecordingListener()
        env.loader.load(request("f1", 1000), FilePriority.HIGH, RequestGuid.NONE, first)
        env.loader.load(request("f1", 1000), FilePriority.NORMAL, RequestGuid.NONE, second)
        assertTrue(waitUntil { paths.size == 1 })
        gate.countDown()
        assertTrue(first.await())
        assertTrue(second.await())
        assertEquals(1, server.requestCount)
        assertArrayEquals(content, first.file!!.readBytes())
        assertEquals(FileSource.NETWORK, first.source)

        val again = RecordingListener()
        env.loader.load(request("f1", 1000), FilePriority.HIGH, RequestGuid.NONE, again)
        assertTrue(again.await())
        assertEquals(FileSource.DISK, again.source)
        assertEquals(1, server.requestCount)
    }

    @Test
    fun sixthSmallWaitsAndLargeDoesNot() {
        start()
        gatedServer { bytes(10) }
        for (index in 1..6) env.loader.load(request("s$index", 10), FilePriority.NORMAL, RequestGuid.NONE, RecordingListener())
        assertTrue(waitUntil { paths.size == 5 })
        Thread.sleep(200)
        assertEquals(5, paths.size)
        env.loader.load(request("big", 21L * 1024 * 1024, MediaKind.FILE), FilePriority.LOW, RequestGuid.NONE, RecordingListener())
        assertTrue(waitUntil { paths.contains("big") })
        assertFalse(paths.contains("s6"))
    }

    @Test
    fun streamOvertakesWaitingNormal() {
        start(FileLoaderTimings(smallSlots = 1, retryFirstMs = 20))
        val order = CopyOnWriteArrayList<String>()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val id = request.path!!.substringAfterLast('/')
                order.add(id)
                if (id == "first") gate.await(10, TimeUnit.SECONDS)
                return MockResponse().setBody(Buffer().write(bytes(10)))
            }
        }
        val last = RecordingListener()
        env.loader.load(request("first", 10), FilePriority.NORMAL, RequestGuid.NONE, RecordingListener())
        assertTrue(waitUntil { order.size == 1 })
        env.loader.load(request("normal", 10), FilePriority.NORMAL, RequestGuid.NONE, last)
        env.loader.load(request("stream", 10), FilePriority.STREAM, RequestGuid.NONE, RecordingListener())
        env.fileQueue.drain()
        env.storageQueue.drain()
        env.fileQueue.drain()
        gate.countDown()
        assertTrue(last.await())
        assertEquals(listOf("first", "stream", "normal"), order)
    }

    @Test
    fun lastSubscriberLeavingCancelsButManualStays() {
        start(FileLoaderTimings(smallSlots = 1, retryFirstMs = 20))
        gatedServer { bytes(10) }
        env.loader.load(request("first", 10), FilePriority.NORMAL, RequestGuid.NONE, RecordingListener())
        assertTrue(waitUntil { paths.size == 1 })
        val dropped = RecordingListener()
        val droppedSub = env.loader.load(request("dropped", 10), FilePriority.NORMAL, RequestGuid.NONE, dropped)
        val manual = RecordingListener()
        val manualSub = env.loader.load(request("manual", 10), FilePriority.NORMAL, RequestGuid.NONE, manual, manual = true)
        env.loader.cancel(droppedSub)
        env.loader.cancel(manualSub)
        env.fileQueue.drain()
        gate.countDown()
        assertTrue(waitUntil { paths.contains("manual") })
        Thread.sleep(200)
        assertFalse(paths.contains("dropped"))
        assertNull(dropped.file)
        assertNull(manual.file)
    }

    @Test
    fun brokenTransferResumesWithRange() {
        start()
        val content = bytes(200_000)
        val ranges = CopyOnWriteArrayList<String?>()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val range = request.getHeader("Range")
                ranges.add(range)
                if (range == null) {
                    return MockResponse().setBody(Buffer().write(content)).setSocketPolicy(SocketPolicy.DISCONNECT_DURING_RESPONSE_BODY)
                }
                val from = range.removePrefix("bytes=").substringBefore('-').toInt()
                return MockResponse()
                    .setResponseCode(206)
                    .setHeader("Content-Range", "bytes $from-${content.size - 1}/${content.size}")
                    .setBody(Buffer().write(content.copyOfRange(from, content.size)))
            }
        }
        val listener = RecordingListener()
        env.loader.load(request("f", content.size.toLong(), MediaKind.FILE), FilePriority.HIGH, RequestGuid.NONE, listener)
        assertTrue(listener.await())
        assertArrayEquals(content, listener.file!!.readBytes())
        assertEquals(2, ranges.size)
        assertNull(ranges[0])
        val resumed = ranges[1]!!.removePrefix("bytes=").substringBefore('-').toLong()
        assertTrue("докачка с середины, а не с нуля: $resumed", resumed > 0)
        assertTrue(listener.resumedFrom.contains(0L))
    }

    @Test
    fun fullAnswerToRangeRewritesFromZero() {
        start()
        val content = bytes(5_000)
        env.dirs.tempFile("f").writeBytes(bytes(1_000, seed = 99))
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                paths.add(request.getHeader("Range") ?: "-")
                return MockResponse().setBody(Buffer().write(content))
            }
        }
        val listener = RecordingListener()
        env.loader.load(request("f", 5_000, MediaKind.FILE), FilePriority.HIGH, RequestGuid.NONE, listener)
        assertTrue(listener.await())
        assertEquals(listOf("bytes=1000-"), paths)
        assertArrayEquals(content, listener.file!!.readBytes())
    }

    @Test
    fun wrongSizeIsRefused() {
        start()
        server.enqueue(MockResponse().setBody(Buffer().write(bytes(500))))
        val listener = RecordingListener()
        env.loader.load(request("f", 1_000), FilePriority.HIGH, RequestGuid.NONE, listener)
        assertTrue(listener.await())
        assertNull(listener.file)
        assertNotNull(listener.error)
        assertFalse(env.dirs.finalFile("f", "image/jpeg").exists())
    }

    @Test
    fun unauthorizedRefreshesOnceAndRetries() {
        start()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse =
                if (request.getHeader("Authorization") == "Bearer t1") MockResponse().setResponseCode(401) else MockResponse().setBody("ok")
        }
        val listener = RecordingListener()
        env.loader.load(request("f", 2), FilePriority.HIGH, RequestGuid.NONE, listener)
        assertTrue(listener.await())
        assertNotNull(listener.file)
        assertEquals(listOf<String?>("t1"), env.tokens.rejected.toList())
        assertEquals(2, server.requestCount)
    }

    @Test
    fun forbiddenAndMissingAreFinal() {
        start()
        for (code in listOf(403, 404)) {
            server.enqueue(MockResponse().setResponseCode(code).setBody("""{"error":{"code":"FILE_NOT_FOUND","message":"Файл не найден"}}"""))
        }
        val forbidden = RecordingListener()
        env.loader.load(request("a", 2), FilePriority.HIGH, RequestGuid.NONE, forbidden)
        assertTrue(forbidden.await())
        val missing = RecordingListener()
        env.loader.load(request("b", 2), FilePriority.HIGH, RequestGuid.NONE, missing)
        assertTrue(missing.await())
        assertEquals(403, (forbidden.error as ApiError).status)
        assertEquals(404, (missing.error as ApiError).status)
        Thread.sleep(100)
        assertEquals(2, server.requestCount)
    }

    @Test
    fun cancelledSubscriberGetsNoAnswer() {
        start()
        gatedServer { bytes(10) }
        val listener = RecordingListener()
        val sub = env.loader.load(request("f", 10), FilePriority.HIGH, 42, listener)
        assertTrue(waitUntil { paths.size == 1 })
        env.loader.cancelRequestsForGuid(42)
        env.loader.cancel(sub)
        gate.countDown()
        assertFalse(listener.await(1))
    }
}
