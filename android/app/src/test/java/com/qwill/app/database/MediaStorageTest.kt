package com.qwill.app.database

import com.qwill.app.files.ByteRange
import com.qwill.app.files.MediaDirs
import com.qwill.app.files.MediaKind
import com.qwill.app.files.MediaTier
import com.qwill.app.model.LocalAttachment
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class MediaStorageTest {
    private fun row(id: String, complete: Boolean = true) =
        MediaRow(id, "c1", MediaKind.PHOTO, MediaTier.THUMB, 10, 10, complete, 5, "/tmp/$id")

    private fun createVersionOne(file: File) {
        JdbcSqlDatabase(file).use { db ->
            db.execute("CREATE TABLE chats(id TEXT PRIMARY KEY, updated_at TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL)")
            db.execute("CREATE INDEX chats_updated_at ON chats(updated_at)")
            db.execute("CREATE TABLE chat_details(id TEXT PRIMARY KEY, data TEXT NOT NULL)")
            db.execute(
                "CREATE TABLE messages(chat_id TEXT NOT NULL, id INTEGER NOT NULL, send_state INTEGER NOT NULL DEFAULT 0, " +
                    "client_id TEXT, created_at INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, data TEXT NOT NULL, " +
                    "PRIMARY KEY(chat_id, id))",
            )
            db.execute("CREATE UNIQUE INDEX messages_unsent_client ON messages(client_id) WHERE send_state = 1")
            db.execute("CREATE INDEX messages_unsent_created ON messages(created_at) WHERE send_state = 1")
            db.execute("CREATE TABLE message_ranges(chat_id TEXT NOT NULL, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, PRIMARY KEY(chat_id, from_id)) WITHOUT ROWID")
            db.execute("CREATE TABLE sync_cursors(chat_id TEXT PRIMARY KEY, max_id INTEGER NOT NULL, max_updated_at TEXT) WITHOUT ROWID")
            val text = message(-5_000, content = "неотправленный текст", sender = ME, clientId = "k1")
            db.execute(
                "INSERT INTO messages(chat_id, id, send_state, client_id, created_at, attempts, data) VALUES (?, ?, 1, ?, 5000, 0, ?)",
                "c1",
                -5_000L,
                "k1",
                com.qwill.app.net.ApiJson.encodeToString(com.qwill.app.model.MessageDto.serializer(), text),
            )
            db.execute("PRAGMA user_version = 1")
        }
    }

    @Test
    fun migrationOneToTwoKeepsUnsentText() {
        val file = tempDatabase()
        createVersionOne(file)
        val storage = openStorage(file)
        val unsent = storage.readUnsent()
        assertEquals(listOf("k1"), unsent.map { it.message.clientId })
        assertNull(unsent.first().local)
        storage.putMedia(row("f1"))
        assertEquals("f1", storage.readMedia("f1")?.fileId)
        storage.close()
        assertEquals(2L, JdbcSqlDatabase(file).use { it.queryLong("PRAGMA user_version") })
    }

    @Test
    fun rangesLiveUntilFileCompletes() {
        val storage = openStorage()
        storage.writeMediaRanges(row("v1", complete = false), listOf(ByteRange(0, 9), ByteRange(20, 29)), "video/mp4")
        assertEquals(2, storage.readMediaRanges("v1")?.ranges?.size)
        assertFalse(storage.readMedia("v1")!!.complete)
        storage.putMedia(row("v1"))
        assertNull(storage.readMediaRanges("v1"))
        assertTrue(storage.readMedia("v1")!!.complete)
    }

    @Test
    fun recreatedDatabaseWipesMediaAndKeepsQueuedAttachment() {
        val root = Files.createTempDirectory("qwill-media").toFile()
        val dirs = MediaDirs(File(root, "cache"), File(root, "files")).also { it.ensure() }
        File(dirs.media, "old.jpg").writeText("x")
        File(dirs.outboxDir("k2"), "source").apply { parentFile!!.mkdirs() }.writeText("y")
        val file = tempDatabase()
        openStorage(file).apply {
            putMedia(row("old"))
            insertUnsent(
                message(-6_000, content = "подпись", sender = ME, clientId = "k2"),
                6_000,
                LocalAttachment("source", "doc.pdf", "application/pdf", 1, sha256 = "b".repeat(64)),
            )
            close()
        }
        JdbcSqlDatabase(file).use { it.execute("PRAGMA user_version = 99") }

        val storage = MessagesStorage(file, JdbcSqlDatabase.OPENER) {}
        storage.onRecreated = { dirs.wipeMedia() }
        storage.open()

        assertNull(storage.readMedia("old"))
        assertFalse(File(dirs.media, "old.jpg").exists())
        assertTrue(File(dirs.outboxDir("k2"), "source").exists())
        val local = storage.readUnsent().single().local
        assertEquals("b".repeat(64), local?.sha256)
        root.deleteRecursively()
    }

    @Test
    fun removingChatReportsQueuedAttachments() {
        val storage = openStorage()
        storage.insertUnsent(message(-7_000, sender = ME, clientId = "k3"), 7_000, LocalAttachment("source", "a.jpg", "image/jpeg", 1))
        storage.insertUnsent(message(-7_001, sender = ME, clientId = "k4"), 7_001)
        assertEquals(listOf("k3"), storage.removeChat("c1"))
        assertTrue(storage.readUnsent().isEmpty())
    }
}
