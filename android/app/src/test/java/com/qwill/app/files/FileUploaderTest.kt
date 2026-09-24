package com.qwill.app.files

import com.qwill.app.net.ApiError
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import java.io.File
import java.nio.file.Files

class FileUploaderTest {
    private lateinit var server: MockWebServer
    private lateinit var uploader: FileUploader
    private val delays = ArrayList<Long>()
    private val source: File = Files.createTempFile("upload", ".bin").toFile().apply { writeBytes(bytes(10)) }
    private val sha = "a".repeat(64)
    private val fileJson = """{"id":"srv","mimeType":"application/pdf","size":10,"url":"/api/files/srv"}"""

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val http = FileHttp(OkHttpClient(), server.url("/").toString().trimEnd('/'), "test", FakeTokens()) {}
        uploader = FileUploader(http) { ms, _ -> delays.add(ms) }
    }

    @After
    fun tearDown() {
        server.shutdown()
        source.delete()
    }

    private fun upload() = uploader.upload(source, "application/pdf", "doc.pdf", FileUploader.PURPOSE_MESSAGE, sha, CallSlot())

    private fun pending(received: Int) =
        MockResponse().setResponseCode(201).setBody("""{"status":"pending","sessionId":"s1","receivedBytes":$received,"chunkSize":4}""")

    private fun chunk(received: Int, done: Boolean = false) =
        MockResponse().setBody(if (done) """{"receivedBytes":$received,"done":true,"file":$fileJson}""" else """{"receivedBytes":$received,"done":false}""")

    @Test
    fun existingFileNeedsNoChunks() {
        server.enqueue(MockResponse().setBody("""{"status":"exists","file":$fileJson}"""))
        assertEquals("srv", upload().file.id)
        assertEquals(1, server.requestCount)
        val init = server.takeRequest()
        assertTrue(init.body.readUtf8().contains(sha))
    }

    @Test
    fun resumesFromServerOffsetInOrder() {
        server.enqueue(pending(3))
        server.enqueue(chunk(7))
        server.enqueue(chunk(10, done = true))
        assertEquals("srv", upload().file.id)
        server.takeRequest()
        val first = server.takeRequest()
        assertEquals("PATCH", first.method)
        assertEquals("3", first.getHeader(FileUploader.UPLOAD_OFFSET_HEADER))
        assertEquals(4L, first.bodySize)
        assertEquals("7", server.takeRequest().getHeader(FileUploader.UPLOAD_OFFSET_HEADER))
    }

    @Test
    fun conflictContinuesFromServerValue() {
        server.enqueue(pending(0))
        server.enqueue(MockResponse().setResponseCode(409).setBody("""{"error":{"code":"UPLOAD_OFFSET_MISMATCH","message":"x"},"receivedBytes":8}"""))
        server.enqueue(chunk(10, done = true))
        upload()
        server.takeRequest()
        assertEquals("0", server.takeRequest().getHeader(FileUploader.UPLOAD_OFFSET_HEADER))
        assertEquals("8", server.takeRequest().getHeader(FileUploader.UPLOAD_OFFSET_HEADER))
    }

    @Test
    fun stuckOffsetFailsAfterFourTimes() {
        server.enqueue(pending(0))
        repeat(4) { server.enqueue(MockResponse().setResponseCode(409).setBody("""{"receivedBytes":0}""")) }
        try {
            upload()
            fail("должна быть ошибка")
        } catch (e: ApiError) {
            assertTrue(e.message!!.contains("синхронизировать"))
        }
        assertEquals(5, server.requestCount)
    }

    @Test
    fun rateLimitWaitsWithDoubling() {
        repeat(3) { server.enqueue(MockResponse().setResponseCode(429).setBody("""{"error":{"code":"RATE_LIMITED","message":"x"}}""")) }
        server.enqueue(MockResponse().setBody("""{"status":"exists","file":$fileJson}"""))
        upload()
        assertEquals(listOf(1_500L, 3_000L, 6_000L), delays)
    }

    @Test
    fun lostSessionStartsOver() {
        server.enqueue(pending(0))
        server.enqueue(MockResponse().setResponseCode(404).setBody("""{"error":{"code":"UPLOAD_SESSION_NOT_FOUND","message":"x"}}"""))
        server.enqueue(MockResponse().setBody("""{"status":"exists","file":$fileJson}"""))
        assertEquals("srv", upload().file.id)
        assertEquals("POST", server.takeRequest().method)
        assertEquals("PATCH", server.takeRequest().method)
        assertEquals("POST", server.takeRequest().method)
    }
}
