package com.qwill.app.files

import com.qwill.app.core.TaskQueue
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.Executor

enum class FilePriority { LOW, NORMAL, HIGH, STREAM }

enum class FileSource { MEMORY, DISK, NETWORK }

interface FileLoadListener {
    fun onReady(file: File, source: FileSource)

    fun onProgress(loaded: Long, total: Long) {}

    fun onResumed(fromByte: Long) {}

    fun onFailed(error: ApiException) {}
}

class FileSubscription internal constructor(val fileId: String, val guid: Int, internal val listener: FileLoadListener) {
    @Volatile
    var active = true
        internal set
}

data class FileLoaderTimings(
    val smallSlots: Int = 5,
    val largeSlots: Int = 2,
    val largeThresholdBytes: Long = 20L * 1024 * 1024,
    val progressIntervalMs: Long = 100,
    val retryFirstMs: Long = 2_000,
    val retryMaxMs: Long = 60_000,
)

class FileLoader(
    private val http: FileHttp,
    private val partials: PartialFiles,
    private val index: MediaIndex,
    private val queue: TaskQueue,
    private val main: TaskQueue,
    private val workers: Executor,
    private val clock: () -> Long = System::currentTimeMillis,
    private val timings: FileLoaderTimings = FileLoaderTimings(),
    private val onBytesWritten: (Long) -> Unit = {},
) {
    private enum class State { CHECKING, WAITING, RUNNING, RETRY_WAIT }

    private sealed class Outcome {
        class Done(val file: File) : Outcome()

        class Retry(val error: ApiException) : Outcome()

        class Refused(val error: ApiException) : Outcome()

        object Cancelled : Outcome()
    }

    private inner class Operation(val request: FileRequest, var priority: FilePriority, var manual: Boolean, val seq: Long) {
        val subs = ArrayList<FileSubscription>()
        var state = State.CHECKING
        var slot = CallSlot()
        var retryDelayMs = 0L
        var lastProgressAt = 0L
        val large: Boolean get() = request.size > timings.largeThresholdBytes
        val retryTask = Runnable { onRetryDue(this) }
    }

    private val ops = HashMap<String, Operation>()
    private val cancelledGuids = HashSet<Int>()
    private val progress = HashMap<String, Pair<Long, Long>>()
    private var seq = 0L

    fun load(request: FileRequest, priority: FilePriority, guid: Int, listener: FileLoadListener, manual: Boolean = false): FileSubscription {
        val sub = FileSubscription(request.fileId, guid, listener)
        queue.post { attach(sub, request, priority, manual) }
        return sub
    }

    fun cancel(sub: FileSubscription) {
        sub.active = false
        queue.post { detach(sub) }
    }

    fun cancelManual(fileId: String) {
        queue.post {
            val op = ops[fileId] ?: return@post
            for (sub in op.subs) sub.active = false
            op.subs.clear()
            op.manual = false
            cancelOperation(op)
        }
    }

    fun cancelRequestsForGuid(guid: Int) {
        synchronized(cancelledGuids) { cancelledGuids.add(guid) }
        queue.post {
            for (op in ArrayList(ops.values)) {
                val gone = op.subs.filter { it.guid == guid }
                for (sub in gone) {
                    sub.active = false
                    detach(sub)
                }
            }
        }
    }

    fun onNetworkAvailable() {
        queue.post {
            for (op in ops.values) {
                if (op.state != State.RETRY_WAIT) continue
                queue.cancel(op.retryTask)
                op.retryDelayMs = 0
                op.state = State.WAITING
            }
            schedule()
        }
    }

    fun clear() {
        queue.post {
            for (op in ArrayList(ops.values)) {
                for (sub in op.subs) sub.active = false
                op.subs.clear()
                op.manual = false
                cancelOperation(op)
            }
            ops.clear()
            synchronized(progress) { progress.clear() }
        }
    }

    fun progressOf(fileId: String): Pair<Long, Long>? = synchronized(progress) { progress[fileId] }

    fun activeCount(): Int = synchronized(progress) { progress.size }

    fun fetchRange(partial: PartialFile, range: ByteRange, slot: CallSlot) {
        val response = http.execute(pathOf(partial.request), slot) { it.header(RANGE, "bytes=${range.start}-${range.end}") }
        response.use {
            when (it.code) {
                FileHttp.HTTP_PARTIAL -> {
                    ByteRanges.parseContentRangeTotal(it.header(CONTENT_RANGE))?.let { total -> partial.setTotal(total) }
                    val start = ByteRanges.parseContentRangeStart(it.header(CONTENT_RANGE)) ?: range.start
                    copy(body(it), partial, start, slot, null, stopAtCovered = false, limit = range.end)
                }
                HTTP_OK -> {
                    if (it.body?.contentLength()?.takeIf { length -> length > 0 } != null) partial.setTotal(it.body!!.contentLength())
                    val source = body(it)
                    skipFully(source, range.start)
                    copy(source, partial, range.start, slot, null, stopAtCovered = false, limit = range.end)
                }
                else -> throw http.readError(it)
            }
        }
        onBytesWritten(range.length)
    }

    private fun attach(sub: FileSubscription, request: FileRequest, priority: FilePriority, manual: Boolean) {
        if (!sub.active && !manual) return
        val existing = ops[request.fileId]
        if (existing != null) {
            if (sub.active) existing.subs.add(sub)
            if (priority > existing.priority) existing.priority = priority
            existing.manual = existing.manual || manual
            if (existing.state == State.WAITING) schedule()
            return
        }
        val op = Operation(request, priority, manual, seq++)
        if (sub.active) op.subs.add(sub)
        ops[request.fileId] = op
        val now = clock()
        index.post { storage ->
            val row = storage.readMedia(request.fileId)
            val file = row?.takeIf { it.complete }?.let { File(it.path) }
            val ready = file?.takeIf { it.exists() }
            if (row != null && row.complete && ready == null) storage.deleteMedia(listOf(request.fileId))
            if (ready != null && MediaRetention.shouldTouch(row.lastUsedAt, now)) storage.touchMedia(request.fileId, now)
            queue.post { onChecked(op, ready) }
        }
    }

    private fun onChecked(op: Operation, ready: File?) {
        if (ops[op.request.fileId] !== op) return
        if (ready != null) {
            ops.remove(op.request.fileId)
            deliverReady(op, ready, FileSource.DISK)
            return
        }
        op.state = State.WAITING
        schedule()
    }

    private fun detach(sub: FileSubscription) {
        val op = ops[sub.fileId] ?: return
        op.subs.remove(sub)
        if (op.subs.isEmpty() && !op.manual) cancelOperation(op)
    }

    private fun cancelOperation(op: Operation) {
        if (ops[op.request.fileId] === op) ops.remove(op.request.fileId)
        when (op.state) {
            State.RUNNING -> op.slot.cancel()
            State.RETRY_WAIT -> queue.cancel(op.retryTask)
            else -> {}
        }
        synchronized(progress) { progress.remove(op.request.fileId) }
        schedule()
    }

    private fun schedule() {
        startWaiting(large = false, limit = timings.smallSlots)
        startWaiting(large = true, limit = timings.largeSlots)
    }

    private fun startWaiting(large: Boolean, limit: Int) {
        var running = ops.values.count { it.state == State.RUNNING && it.large == large }
        while (running < limit) {
            val next = ops.values
                .filter { it.state == State.WAITING && it.large == large }
                .minWithOrNull(compareBy<Operation>({ -it.priority.ordinal }, { it.seq })) ?: return
            start(next)
            running++
        }
    }

    private fun start(op: Operation) {
        op.state = State.RUNNING
        val slot = CallSlot()
        op.slot = slot
        workers.execute {
            val outcome = transfer(op, slot)
            queue.post { onFinished(op, outcome) }
        }
    }

    private fun onFinished(op: Operation, outcome: Outcome) {
        val current = ops[op.request.fileId] === op
        when (outcome) {
            is Outcome.Done -> {
                if (current) ops.remove(op.request.fileId)
                synchronized(progress) { progress.remove(op.request.fileId) }
                deliverReady(op, outcome.file, FileSource.NETWORK)
            }
            is Outcome.Refused -> {
                if (current) ops.remove(op.request.fileId)
                synchronized(progress) { progress.remove(op.request.fileId) }
                deliverFailed(op, outcome.error)
            }
            is Outcome.Retry -> if (current) {
                op.state = State.RETRY_WAIT
                op.retryDelayMs = if (op.retryDelayMs == 0L) timings.retryFirstMs else minOf(op.retryDelayMs * 2, timings.retryMaxMs)
                queue.postDelayed(op.retryTask, op.retryDelayMs)
            }
            Outcome.Cancelled -> {}
        }
        schedule()
    }

    private fun onRetryDue(op: Operation) {
        if (ops[op.request.fileId] !== op || op.state != State.RETRY_WAIT) return
        op.state = State.WAITING
        schedule()
    }

    private fun transfer(op: Operation, slot: CallSlot): Outcome {
        val partial = try {
            partials.acquire(op.request)
        } catch (e: RuntimeException) {
            return Outcome.Refused(ApiError(0, ErrorCode.INTERNAL, e.message ?: DISK_ERROR))
        }
        try {
            partial.finalFile?.let { return Outcome.Done(it) }
            var reported = false
            var unsatisfiable = 0
            while (true) {
                if (slot.cancelled) return Outcome.Cancelled
                if (partial.complete) {
                    val file = partials.finalize(partial) ?: return Outcome.Refused(ApiError(0, ErrorCode.INTERNAL, BROKEN_TRANSFER))
                    return Outcome.Done(file)
                }
                val gap = partial.firstGap(0) ?: 0L
                if (!reported) {
                    reported = true
                    deliverResumed(op, gap)
                }
                val response = http.execute(pathOf(op.request), slot) { if (gap > 0) it.header(RANGE, "bytes=$gap-") }
                response.use {
                    when (it.code) {
                        HTTP_OK -> {
                            if (gap > 0) partial.reset()
                            val length = it.body?.contentLength() ?: -1L
                            partial.setTotal(if (length > 0) length else op.request.size)
                            copy(body(it), partial, 0, slot, op, stopAtCovered = false, limit = null)
                        }
                        FileHttp.HTTP_PARTIAL -> {
                            ByteRanges.parseContentRangeTotal(it.header(CONTENT_RANGE))?.let { total -> partial.setTotal(total) }
                            val start = ByteRanges.parseContentRangeStart(it.header(CONTENT_RANGE)) ?: gap
                            copy(body(it), partial, start, slot, op, stopAtCovered = true, limit = null)
                        }
                        FileHttp.HTTP_RANGE_NOT_SATISFIABLE -> {
                            ByteRanges.parseContentRangeTotal(it.header(CONTENT_RANGE))?.let { total -> partial.setTotal(total) }
                            if (!partial.complete) {
                                if (++unsatisfiable > 1) return Outcome.Refused(ApiError(it.code, ErrorCode.INTERNAL, BROKEN_TRANSFER))
                                partial.reset()
                            }
                        }
                        else -> {
                            val error = http.readError(it)
                            return if (FileHttp.isFinalRefusal(error)) Outcome.Refused(error) else Outcome.Retry(error)
                        }
                    }
                }
                if (partial.total <= 0 && partial.covered() > 0) partial.setTotal(partial.covered())
            }
        } catch (e: CancelledTransfer) {
            return Outcome.Cancelled
        } catch (e: DiskError) {
            return Outcome.Refused(ApiError(0, ErrorCode.INTERNAL, e.message ?: DISK_ERROR))
        } catch (e: ApiException) {
            if (slot.cancelled) return Outcome.Cancelled
            return if (FileHttp.isFinalRefusal(e)) Outcome.Refused(e) else Outcome.Retry(e)
        } catch (e: IOException) {
            if (slot.cancelled) return Outcome.Cancelled
            return Outcome.Retry(NetworkError(e))
        } finally {
            partials.persistRanges(partial, force = true)
            partials.release(partial)
        }
    }

    private fun copy(
        source: InputStream,
        partial: PartialFile,
        start: Long,
        slot: CallSlot,
        op: Operation?,
        stopAtCovered: Boolean,
        limit: Long?,
    ) {
        val buffer = ByteArray(BUFFER_BYTES)
        var position = start
        var written = 0L
        while (true) {
            if (slot.cancelled) throw CancelledTransfer()
            if (limit != null && position > limit) break
            if (stopAtCovered && partial.coveredFrom(position) > 0) break
            val wanted = if (limit != null) minOf(BUFFER_BYTES.toLong(), limit - position + 1).toInt() else BUFFER_BYTES
            val read = try {
                source.read(buffer, 0, wanted)
            } catch (e: IOException) {
                if (slot.cancelled) throw CancelledTransfer()
                throw NetworkError(e)
            }
            if (read < 0) break
            try {
                partial.write(position, buffer, read)
            } catch (e: IOException) {
                throw DiskError(e.message)
            }
            position += read
            written += read
            if (written >= WRITE_REPORT_BYTES) {
                onBytesWritten(written)
                written = 0
            }
            partials.persistRanges(partial, force = false)
            if (op != null) reportProgress(op, partial)
        }
        if (written > 0) onBytesWritten(written)
    }

    private fun reportProgress(op: Operation, partial: PartialFile) {
        val now = clock()
        if (now - op.lastProgressAt < timings.progressIntervalMs) return
        op.lastProgressAt = now
        val loaded = partial.covered()
        val total = partial.total
        synchronized(progress) { progress[op.request.fileId] = loaded to total }
        queue.post {
            val subs = ArrayList(op.subs)
            main.post { for (sub in subs) if (alive(sub)) sub.listener.onProgress(loaded, total) }
        }
    }

    private fun deliverResumed(op: Operation, fromByte: Long) {
        queue.post {
            val subs = ArrayList(op.subs)
            main.post { for (sub in subs) if (alive(sub)) sub.listener.onResumed(fromByte) }
        }
    }

    private fun deliverReady(op: Operation, file: File, source: FileSource) {
        val subs = ArrayList(op.subs)
        op.subs.clear()
        main.post {
            for (sub in subs) {
                if (!alive(sub)) continue
                sub.active = false
                sub.listener.onReady(file, source)
            }
        }
    }

    private fun deliverFailed(op: Operation, error: ApiException) {
        val subs = ArrayList(op.subs)
        op.subs.clear()
        main.post {
            for (sub in subs) {
                if (!alive(sub)) continue
                sub.active = false
                sub.listener.onFailed(error)
            }
        }
    }

    private fun alive(sub: FileSubscription): Boolean =
        sub.active && synchronized(cancelledGuids) { sub.guid == 0 || sub.guid !in cancelledGuids }

    private fun body(response: Response): InputStream = response.body?.byteStream() ?: throw NetworkError()

    private fun skipFully(source: InputStream, count: Long) {
        var left = count
        while (left > 0) {
            val skipped = source.skip(left)
            if (skipped <= 0) {
                if (source.read() < 0) throw NetworkError()
                left--
            } else {
                left -= skipped
            }
        }
    }

    private class DiskError(message: String?) : IOException(message)

    companion object {
        const val HTTP_OK = 200
        const val RANGE = "Range"
        const val CONTENT_RANGE = "Content-Range"
        private const val BUFFER_BYTES = 64 * 1024
        private const val WRITE_REPORT_BYTES = 1024L * 1024
        private const val BROKEN_TRANSFER = "Файл пришёл повреждённым"
        private const val DISK_ERROR = "Не удалось сохранить файл"

        fun pathOf(request: FileRequest): String = "/api/files/${java.net.URLEncoder.encode(request.fileId, "UTF-8")}"
    }
}
