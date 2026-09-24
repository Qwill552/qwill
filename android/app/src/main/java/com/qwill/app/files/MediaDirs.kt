package com.qwill.app.files

import com.qwill.app.core.TaskQueue
import com.qwill.app.database.MessagesStorage
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MediaDirs(cacheRoot: File, filesRoot: File) {
    val media = File(cacheRoot, "media")
    val temp = File(media, ".temp")
    val outbox = File(filesRoot, "outbox")

    fun finalFile(fileId: String, mimeType: String?): File {
        val extension = mimeType?.let { MediaTypes.extensionForMime(it) }.orEmpty()
        return File(media, if (extension.isEmpty()) safeName(fileId) else "${safeName(fileId)}.$extension")
    }

    fun tempFile(fileId: String): File = File(temp, "${safeName(fileId)}.temp")

    fun outboxDir(clientId: String): File = File(outbox, safeName(clientId))

    fun ensure() {
        temp.mkdirs()
        outbox.mkdirs()
    }

    fun wipeMedia() {
        media.deleteRecursively()
        temp.mkdirs()
    }

    fun wipeOutbox() {
        outbox.deleteRecursively()
        outbox.mkdirs()
    }

    private fun safeName(value: String): String = value.filter { it.isLetterOrDigit() || it == '-' || it == '_' }.ifEmpty { "_" }
}

class MediaIndex(private val storage: MessagesStorage, private val queue: TaskQueue) {
    fun post(block: (MessagesStorage) -> Unit) {
        queue.post { block(storage) }
    }

    fun <T> await(fallback: T, block: (MessagesStorage) -> T): T {
        val latch = CountDownLatch(1)
        var result = fallback
        queue.post {
            try {
                result = block(storage)
            } finally {
                latch.countDown()
            }
        }
        return if (latch.await(WAIT_S, TimeUnit.SECONDS)) result else fallback
    }

    private companion object {
        const val WAIT_S = 30L
    }
}
