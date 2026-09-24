package com.qwill.app.files

import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors

class VideoStreamTest {
    private lateinit var server: MockWebServer
    private lateinit var env: FilesEnv
    private val streams = Executors.newCachedThreadPool()
    private val ranges = CopyOnWriteArrayList<String>()
    private val content = bytes(3 * 1024 * 1024 + 1234)
    private val request = FileRequest("v1", content.size.toLong(), "video/mp4", "c1", MediaKind.VIDEO, MediaTier.FULL)

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = object : Dispatcher() {
            override fun dispatch(request: RecordedRequest): MockResponse {
                val range = request.getHeader("Range")!!
                ranges.add(range)
                val from = range.removePrefix("bytes=").substringBefore('-').toInt()
                val to = range.substringAfter('-').ifEmpty { "${content.size - 1}" }.toInt()
                return MockResponse()
                    .setResponseCode(206)
                    .setHeader("Content-Range", "bytes $from-$to/${content.size}")
                    .setBody(Buffer().write(content.copyOfRange(from, to + 1)))
            }
        }
        server.start()
        env = FilesEnv(server)
    }

    @After
    fun tearDown() {
        streams.shutdownNow()
        env.close()
        server.shutdown()
    }

    private fun open(): VideoStream = VideoStream(env.loader, env.partials, env.index, request, streams, System::currentTimeMillis).also { it.open() }

    private var firstSource: FileSource? = null

    private fun readAt(stream: VideoStream, position: Long, length: Int): ByteArray {
        val buffer = ByteArray(length)
        var read = 0
        firstSource = null
        while (read < length) {
            val count = stream.read(position + read, buffer, read, length - read)
            if (count <= 0) break
            if (firstSource == null) firstSource = stream.lastSource
            read += count
        }
        return buffer.copyOf(read)
    }

    @Test
    fun readFromMiddleAsksAlignedWindowThenDisk() {
        val stream = open()
        val position = 1_600_000L
        val chunk = ByteRanges.VIDEO_CHUNK_BYTES
        val data = readAt(stream, position, 64 * 1024)
        assertArrayEquals(content.copyOfRange(position.toInt(), position.toInt() + 64 * 1024), data)
        assertEquals(FileSource.NETWORK, firstSource)
        val start = position / chunk * chunk
        assertEquals("bytes=$start-${start + 2 * chunk - 1}", ranges.first())

        val before = ranges.size
        readAt(stream, position, 64 * 1024)
        assertEquals(FileSource.DISK, firstSource)
        assertEquals(before, ranges.size)
        stream.close()

        val reopened = open()
        readAt(reopened, position, 1024)
        assertEquals(FileSource.DISK, firstSource)
        assertEquals(before, ranges.size)
        reopened.close()
    }

    @Test
    fun allRangesBecomeOneFileAndOneRow() {
        val stream = open()
        val data = readAt(stream, 0, content.size)
        assertArrayEquals(content, data)
        assertTrue(waitUntil { env.index.await(null) { it.readMedia("v1") }?.complete == true })
        stream.close()
        val row = env.index.await(null) { it.readMedia("v1") }
        assertNotNull(row)
        assertTrue(File(row!!.path).exists())
        assertEquals(content.size.toLong(), File(row.path).length())
        assertNull(env.index.await(null) { it.readMediaRanges("v1") })
        assertTrue(!env.dirs.tempFile("v1").exists())
    }
}
