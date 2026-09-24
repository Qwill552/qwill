package com.qwill.app.files

import com.qwill.app.net.ApiException
import java.io.Closeable
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.concurrent.Executor

class VideoStream internal constructor(
    private val loader: FileLoader,
    private val partials: PartialFiles,
    private val index: MediaIndex,
    private val request: FileRequest,
    private val executor: Executor,
    private val clock: () -> Long,
) : Closeable {
    @Volatile
    var lastSource: FileSource = FileSource.DISK
        private set

    @Volatile
    private var closed = false

    @Volatile
    private var failure: ApiException? = null

    private var partial: PartialFile? = null
    private var ready: RandomAccessFile? = null
    private var window: ByteRange? = null
    private var slot: CallSlot? = null
    private var fetching = false

    fun open() {
        val now = clock()
        val done = index.await(null) { storage ->
            val row = storage.readMedia(request.fileId)?.takeIf { it.complete }
            val file = row?.let { File(it.path) }?.takeIf { it.exists() }
            if (row != null && file != null && MediaRetention.shouldTouch(row.lastUsedAt, now)) storage.touchMedia(request.fileId, now)
            file
        }
        if (done != null) {
            ready = RandomAccessFile(done, "r")
            return
        }
        partial = partials.acquire(request)
    }

    fun length(): Long {
        ready?.let { return it.length() }
        val current = partial ?: return request.size
        return if (current.total > 0) current.total else request.size
    }

    fun rangesCount(): Int = partial?.ranges?.size ?: if (ready != null) 1 else 0

    fun read(position: Long, buffer: ByteArray, offset: Int, length: Int): Int {
        if (closed || length <= 0) return -1
        val total = length()
        if (total > 0 && position >= total) return -1
        ready?.let { file ->
            lastSource = FileSource.DISK
            return readFinal(file, position, buffer, offset, length)
        }
        val current = partial ?: return -1
        var fetched = false
        while (!closed) {
            current.finalFile?.let { finished ->
                val file = RandomAccessFile(finished, "r").also { ready = it }
                lastSource = if (fetched) FileSource.NETWORK else FileSource.DISK
                return readFinal(file, position, buffer, offset, length)
            }
            val count = current.read(position, buffer, offset, length)
            if (count > 0) {
                lastSource = if (fetched) FileSource.NETWORK else FileSource.DISK
                return count
            }
            failure?.let { throw IOException(it.message, it) }
            fetched = true
            ensureFetch(current, position)
            current.awaitChange(WAIT_STEP_MS)
        }
        return -1
    }

    override fun close() {
        closed = true
        slot?.cancel()
        partial?.wake()
        try {
            ready?.close()
        } catch (ignored: IOException) {
        }
        ready = null
        val current = partial ?: return
        partial = null
        executor.execute { partials.release(current) }
    }

    private fun readFinal(file: RandomAccessFile, position: Long, buffer: ByteArray, offset: Int, length: Int): Int {
        synchronized(file) {
            file.seek(position)
            return file.read(buffer, offset, length)
        }
    }

    private fun ensureFetch(current: PartialFile, position: Long) {
        synchronized(this) {
            val active = window
            if (fetching && active != null && position >= active.start && position <= active.end) return
            val total = if (current.total > 0) current.total else request.size
            val next = ByteRanges.window(position, if (total > 0) total else position + ByteRanges.VIDEO_WINDOW_BYTES)
            window = next
            if (fetching) return
            fetching = true
        }
        executor.execute { fetchLoop(current) }
    }

    private fun fetchLoop(current: PartialFile) {
        var delay = RETRY_FIRST_MS
        try {
            while (!closed) {
                val missing = synchronized(this) {
                    val target = window
                    val gap = target?.let { current.missingIn(it) }
                    if (gap == null) fetching = false
                    gap
                } ?: return
                val nextSlot = CallSlot().also { slot = it }
                try {
                    loader.fetchRange(current, missing, nextSlot)
                    partials.persistRanges(current, force = true)
                    delay = RETRY_FIRST_MS
                    if (current.complete) partials.finalize(current)
                } catch (e: CancelledTransfer) {
                    break
                } catch (e: ApiException) {
                    if (FileHttp.isFinalRefusal(e)) {
                        failure = e
                        current.wake()
                        break
                    }
                    sleep(delay)
                    delay = minOf(delay * 2, RETRY_MAX_MS)
                } catch (e: IOException) {
                    sleep(delay)
                    delay = minOf(delay * 2, RETRY_MAX_MS)
                }
            }
        } finally {
            synchronized(this) { fetching = false }
            current.wake()
        }
    }

    private fun sleep(ms: Long) {
        val until = clock() + ms
        while (!closed && clock() < until) {
            try {
                Thread.sleep(minOf(WAIT_STEP_MS, until - clock()).coerceAtLeast(1))
            } catch (e: InterruptedException) {
                return
            }
        }
    }

    private companion object {
        const val WAIT_STEP_MS = 250L
        const val RETRY_FIRST_MS = 1_000L
        const val RETRY_MAX_MS = 15_000L
    }
}
