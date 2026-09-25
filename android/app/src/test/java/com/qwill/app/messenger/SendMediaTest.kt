package com.qwill.app.messenger

import com.qwill.app.auth.SessionState
import com.qwill.app.database.JdbcSqlDatabase
import com.qwill.app.database.ME
import com.qwill.app.database.MessagesStorage
import com.qwill.app.database.message
import com.qwill.app.database.tempDatabase
import com.qwill.app.files.CallSlot
import com.qwill.app.files.MediaTier
import com.qwill.app.files.PreparedMedia
import com.qwill.app.files.UploadedFile
import com.qwill.app.model.FileDto
import com.qwill.app.model.LocalAttachment
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageType
import com.qwill.app.model.PublicUser
import com.qwill.app.net.ApiResult
import com.qwill.app.net.NetworkError
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.file.Files
import java.util.concurrent.Executor

class SendMediaTest {
    private class FakeBackend(private val root: File) : AttachmentBackend {
        val hashed = ArrayList<String>()
        val uploaded = ArrayList<String>()
        val adopted = ArrayList<Pair<String, MediaTier>>()
        val deleted = ArrayList<String>()
        var failUpload: (() -> Exception)? = null

        override fun outboxDir(clientId: String): File = File(root, clientId)

        override fun copyIn(input: AttachmentInput, target: File): Long {
            target.parentFile?.mkdirs()
            input.open().use { source -> target.outputStream().use { source.copyTo(it) } }
            return target.length()
        }

        override fun prepare(local: LocalAttachment, dir: File): PreparedMedia {
            if (!local.mimeType.startsWith("image/")) return PreparedMedia(null, null, null, null, null)
            val thumb = File(dir, "thumb.jpg").apply { writeText("thumb") }
            return PreparedMedia(3000, 4000, null, thumb, null)
        }

        override fun sha256(file: File, slot: CallSlot): String {
            hashed.add(file.name)
            return (if (file.name == "thumb.jpg") "c" else "a").repeat(64)
        }

        override fun upload(file: File, mimeType: String, originalName: String, sha256: String, slot: CallSlot, onProgress: (Long, Long) -> Unit): UploadedFile {
            failUpload?.let { throw it() }
            uploaded.add(file.name)
            onProgress(file.length(), file.length())
            return UploadedFile(FileDto("srv-${file.name}", mimeType, file.length()), sha256)
        }

        override fun adopt(fileId: String, file: File, mimeType: String, chatId: String, local: LocalAttachment, tier: MediaTier) {
            adopted.add(fileId to tier)
        }

        override fun deleteOutbox(clientId: String) {
            deleted.add(clientId)
            File(root, clientId).deleteRecursively()
        }
    }

    private val queue = ManualQueue()
    private val transport = FakeTransport()
    private val file = tempDatabase()
    private val root: File = Files.createTempDirectory("qwill-outbox").toFile()
    private val backend = FakeBackend(root)
    private val updates = ArrayList<FeedUpdate>()
    private val deferred = ArrayList<Runnable>()
    private val user = PublicUser(ME, "me", "Я")
    private lateinit var controller: MessagesController

    @After
    fun tearDown() {
        root.deleteRecursively()
    }

    private fun start(deferWorkers: Boolean = false): MessagesController {
        val workers = if (deferWorkers) Executor { deferred.add(it) } else Executor { it.run() }
        controller = MessagesController(
            storage = MessagesStorage(file, JdbcSqlDatabase.OPENER) {},
            storageQueue = queue,
            main = queue,
            transport = transport,
            me = { user },
            seedPresence = { },
            setUpdating = {},
            holdSocket = { {} },
            dataSaver = { false },
            clock = { queue.now + 1 },
            attachments = backend,
            prepareQueue = queue,
            uploadWorkers = workers,
            mediaTimings = MediaSendTimings(retryFirstMs = 100, retryMaxMs = 400),
        )
        controller.addFeedListener { updates.add(it) }
        controller.onSessionState(SessionState.Authenticated(user, confirmed = true))
        return controller
    }

    private fun seed(block: MessagesStorage.() -> Unit) {
        MessagesStorage(file, JdbcSqlDatabase.OPENER) {}.apply {
            open()
            block()
            close()
        }
    }

    private fun unsent(): List<com.qwill.app.database.UnsentMessage> {
        var rows: List<com.qwill.app.database.UnsentMessage> = emptyList()
        seed { rows = readUnsent() }
        return rows
    }

    private fun input(name: String, mime: String) = AttachmentInput(name, mime) { ByteArrayInputStream("содержимое $name".toByteArray()) }

    private fun accepted(payload: com.qwill.app.model.MessageSendPayload): MessageDto = MessageDto(
        id = 10,
        chatId = payload.chatId,
        clientId = payload.clientId,
        type = MessageType.MEDIA,
        createdAt = "2026-09-25T00:00:10.000Z",
    )

    @Test
    fun acceptedAttachmentMovesIntoCacheUnderServerIds() {
        start()
        transport.send = { ApiResult.Success(accepted(it)) }
        controller.sendMedia("c1", input("photo.jpg", "image/jpeg"), caption = "подпись")

        val payload = transport.sent.single()
        assertEquals("srv-source", payload.attachment?.fileId)
        assertEquals("srv-thumb.jpg", payload.attachment?.thumbnailFileId)
        assertEquals(3000, payload.attachment?.width)
        assertEquals("подпись", payload.content)
        assertEquals(listOf("srv-source" to MediaTier.FULL, "srv-thumb.jpg" to MediaTier.THUMB), backend.adopted)
        assertEquals(1, backend.deleted.size)
        assertTrue(unsent().isEmpty())
        assertTrue(updates.any { it is FeedUpdate.Sent })
        assertEquals(listOf("thumb.jpg", "source"), backend.uploaded)
    }

    @Test
    fun networkLossKeepsSendingAndRetriesByItself() {
        start()
        backend.failUpload = { NetworkError() }
        controller.sendMedia("c1", input("doc.pdf", "application/pdf"))
        val row = unsent().single()
        assertFalse(row.local!!.failed)
        assertEquals("a".repeat(64), row.local!!.sha256)
        assertTrue(queue.pendingDelays().contains(100L))

        backend.failUpload = null
        transport.send = { ApiResult.Success(accepted(it)) }
        queue.advance(100)
        assertTrue(unsent().isEmpty())
        assertEquals(listOf("source"), backend.hashed)
    }

    @Test
    fun socketEntryDuringUploadDoesNotStartSecond() {
        start(deferWorkers = true)
        controller.sendMedia("c1", input("doc.pdf", "application/pdf"))
        assertEquals(1, deferred.size)
        controller.onSocketConnected()
        assertEquals(1, deferred.size)
        assertEquals(0, unsent().single().attempts)
    }

    @Test
    fun ninthLaunchMarksNotSent() {
        seed {
            insertUnsent(message(-9_000, sender = ME, clientId = "k9"), 9_000, LocalAttachment("source", "doc.pdf", "application/pdf", 3))
            repeat(8) { bumpAttempts("k9") }
        }
        start()
        controller.onSocketConnected()
        val row = unsent().single()
        assertTrue(row.local!!.failed)
        assertTrue(backend.uploaded.isEmpty())
        assertTrue(updates.any { it is FeedUpdate.LocalAttachmentChanged && it.local.failed })

        transport.send = { ApiResult.Success(accepted(it)) }
        File(backend.outboxDir("k9"), "source").apply { parentFile!!.mkdirs() }.writeText("abc")
        controller.retryMessage("c1", "k9")
        assertTrue(unsent().isEmpty())
    }

    @Test
    fun restartDoesNotRehashSource() {
        seed {
            insertUnsent(
                message(-9_100, sender = ME, clientId = "k8"),
                9_100,
                LocalAttachment("source", "doc.pdf", "application/pdf", 3, sha256 = "d".repeat(64), prepared = true),
            )
        }
        File(backend.outboxDir("k8"), "source").apply { parentFile!!.mkdirs() }.writeText("abc")
        start()
        transport.send = { ApiResult.Success(accepted(it)) }
        controller.onSocketConnected()
        assertTrue(backend.hashed.isEmpty())
        assertEquals("d".repeat(64), transport.sent.single().attachment?.sha256)
    }

    @Test
    fun cancelRemovesRowAndCopy() {
        start(deferWorkers = true)
        controller.sendMedia("c1", input("doc.pdf", "application/pdf"))
        val clientId = unsent().single().message.clientId!!
        assertTrue(backend.outboxDir(clientId).exists())
        controller.cancelMessage("c1", clientId)
        deferred.forEach { it.run() }
        assertTrue(unsent().isEmpty())
        assertEquals(listOf(clientId), backend.deleted)
        assertFalse(backend.outboxDir(clientId).exists())
        assertTrue(updates.any { it is FeedUpdate.Discarded })
        assertTrue(transport.sent.isEmpty())
    }
}
