package com.qwill.app.files

import com.qwill.app.database.MediaRow
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile

data class FileRequest(
    val fileId: String,
    val size: Long,
    val mimeType: String?,
    val chatId: String?,
    val kind: MediaKind,
    val tier: MediaTier,
) {
    val ranged: Boolean get() = kind == MediaKind.VIDEO
}

class PartialFile internal constructor(
    val request: FileRequest,
    val temp: File,
    ranges: List<ByteRange>,
    total: Long,
) {
    private val lock = Object()
    private var raf: RandomAccessFile? = null
    private var persistedBytes = 0L
    internal var users = 0

    var ranges: List<ByteRange> = ranges
        private set

    var total: Long = total
        private set

    @Volatile
    var finalFile: File? = null
        internal set

    val fileId: String get() = request.fileId

    val complete: Boolean get() = synchronized(lock) { ByteRanges.isComplete(ranges, total) }

    fun setTotal(value: Long) {
        synchronized(lock) { if (value > 0) total = value }
    }

    fun write(position: Long, data: ByteArray, length: Int) {
        synchronized(lock) {
            if (finalFile != null) return
            val file = open()
            file.seek(position)
            file.write(data, 0, length)
            ranges = ByteRanges.merge(ranges, ByteRange(position, position + length - 1))
            lock.notifyAll()
        }
    }

    fun read(position: Long, buffer: ByteArray, offset: Int, length: Int): Int {
        synchronized(lock) {
            val available = ByteRanges.coveredFrom(ranges, position)
            if (available <= 0) return -1
            val count = minOf(available, length.toLong()).toInt()
            val file = open()
            file.seek(position)
            file.readFully(buffer, offset, count)
            return count
        }
    }

    fun coveredFrom(position: Long): Long = synchronized(lock) { ByteRanges.coveredFrom(ranges, position) }

    fun firstGap(from: Long): Long? = synchronized(lock) {
        if (total <= 0) {
            if (ranges.isEmpty() || ranges.first().start > from) from else ranges.first().end + 1
        } else {
            ByteRanges.firstGap(ranges, from, total)
        }
    }

    fun missingIn(window: ByteRange): ByteRange? = synchronized(lock) { ByteRanges.missingIn(ranges, window) }

    fun covered(): Long = synchronized(lock) { ByteRanges.coveredBytes(ranges) }

    fun awaitChange(timeoutMs: Long) {
        synchronized(lock) {
            try {
                lock.wait(timeoutMs)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
    }

    fun wake() {
        synchronized(lock) { lock.notifyAll() }
    }

    fun reset() {
        synchronized(lock) {
            closeFile()
            temp.delete()
            ranges = emptyList()
            persistedBytes = 0
        }
    }

    internal fun <T> locked(block: () -> T): T = synchronized(lock) { block() }

    internal fun sync() {
        synchronized(lock) { raf?.fd?.sync() }
    }

    internal fun closeFile() {
        synchronized(lock) {
            try {
                raf?.close()
            } catch (ignored: IOException) {
            }
            raf = null
        }
    }

    internal fun unpersistedBytes(): Long = synchronized(lock) { ByteRanges.coveredBytes(ranges) - persistedBytes }

    internal fun markPersisted() {
        synchronized(lock) { persistedBytes = ByteRanges.coveredBytes(ranges) }
    }

    private fun open(): RandomAccessFile {
        raf?.let { return it }
        finalFile?.let { return RandomAccessFile(it, "r").also { opened -> raf = opened } }
        temp.parentFile?.mkdirs()
        return RandomAccessFile(temp, "rw").also { raf = it }
    }
}

class PartialFiles(
    private val dirs: MediaDirs,
    private val index: MediaIndex,
    private val clock: () -> Long,
) {
    private val open = HashMap<String, PartialFile>()

    fun acquire(request: FileRequest): PartialFile {
        synchronized(open) {
            open[request.fileId]?.let {
                it.users++
                return it
            }
        }
        val created = load(request)
        synchronized(open) {
            val raced = open[request.fileId]
            if (raced != null) {
                raced.users++
                return raced
            }
            created.users = 1
            open[request.fileId] = created
            return created
        }
    }

    fun release(partial: PartialFile) {
        val last = synchronized(open) {
            partial.users--
            if (partial.users > 0) return
            open.remove(partial.fileId)
            true
        }
        if (last) {
            if (partial.finalFile == null && partial.request.ranged) persistRanges(partial, force = true)
            partial.closeFile()
        }
    }

    fun isOpen(fileId: String): Boolean = synchronized(open) { open.containsKey(fileId) }

    fun openCount(): Int = synchronized(open) { open.size }

    fun persistRanges(partial: PartialFile, force: Boolean) {
        if (!partial.request.ranged || partial.finalFile != null) return
        if (!force && partial.unpersistedBytes() < PERSIST_STEP_BYTES) return
        val ranges = partial.ranges
        if (ranges.isEmpty()) return
        partial.markPersisted()
        val row = rowFor(partial.request, partial.temp, ByteRanges.coveredBytes(ranges), partial.total, complete = false)
        index.post { it.writeMediaRanges(row, ranges, partial.request.mimeType) }
    }

    fun finalize(partial: PartialFile): File? {
        return partial.locked { finishLocked(partial) }
    }

    private fun finishLocked(partial: PartialFile): File? {
        partial.finalFile?.let { return it }
        val expected = partial.request.size.takeIf { it > 0 } ?: partial.total
        partial.sync()
        partial.closeFile()
        if (expected > 0 && partial.temp.length() != expected) {
            partial.reset()
            index.post { it.deleteMedia(listOf(partial.fileId)) }
            return null
        }
        val target = dirs.finalFile(partial.fileId, partial.request.mimeType)
        target.parentFile?.mkdirs()
        if (!partial.temp.renameTo(target)) {
            try {
                partial.temp.copyTo(target, overwrite = true)
                partial.temp.delete()
            } catch (e: IOException) {
                return null
            }
        }
        val row = rowFor(partial.request, target, target.length(), target.length(), complete = true)
        index.await(Unit) { it.putMedia(row) }
        partial.finalFile = target
        partial.wake()
        return target
    }

    fun rowFor(request: FileRequest, file: File, size: Long, total: Long, complete: Boolean): MediaRow = MediaRow(
        fileId = request.fileId,
        chatId = request.chatId,
        kind = request.kind,
        tier = request.tier,
        size = size,
        totalSize = total,
        complete = complete,
        lastUsedAt = clock(),
        path = file.path,
    )

    private fun load(request: FileRequest): PartialFile {
        val temp = dirs.tempFile(request.fileId)
        if (!request.ranged) {
            val length = if (temp.exists()) temp.length() else 0L
            val ranges = if (length > 0) listOf(ByteRange(0, length - 1)) else emptyList()
            return PartialFile(request, temp, ranges, request.size)
        }
        val stored = index.await(null) { it.readMediaRanges(request.fileId) }
        if (stored == null || !temp.exists()) {
            if (stored != null) index.post { it.deleteMedia(listOf(request.fileId)) }
            temp.delete()
            return PartialFile(request, temp, emptyList(), request.size)
        }
        return PartialFile(request, temp, stored.ranges, if (stored.totalSize > 0) stored.totalSize else request.size).also { it.markPersisted() }
    }

    private companion object {
        const val PERSIST_STEP_BYTES = 512L * 1024
    }
}
