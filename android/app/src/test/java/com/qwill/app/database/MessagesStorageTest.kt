package com.qwill.app.database

import com.qwill.app.model.MessageReactionDto
import com.qwill.app.model.MessagesSyncResponse
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MessagesStorageTest {
    private fun pending(chatId: String, createdAt: Long, clientId: String) =
        message(-createdAt, chatId, content = "неотправленное $clientId", sender = ME, clientId = clientId)

    private fun version(file: java.io.File): Long =
        JdbcSqlDatabase(file).use { it.queryLong("PRAGMA user_version") ?: -1 }

    @Test
    fun createsSchemaFromScratch() {
        val file = tempDatabase()
        val storage = openStorage(file)
        assertTrue(storage.isOpen)
        assertEquals(StorageStats(0, 0, 0, 0, storage.stats().fileBytes), storage.stats())
        storage.close()
        assertEquals(MessagesStorage.VERSION.toLong(), version(file))
    }

    @Test
    fun migratesEmptyFileOfVersionZero() {
        val file = tempDatabase()
        file.createNewFile()
        val storage = openStorage(file)
        storage.putChat(chat("c1"))
        assertEquals(listOf("c1"), storage.readChats().map { it.id })
        storage.close()
        assertEquals(MessagesStorage.VERSION.toLong(), version(file))
    }

    @Test
    fun newerVersionIsRecreatedButUnsentSurvives() {
        val file = tempDatabase()
        openStorage(file).apply {
            putChat(chat("c1"))
            putMessages(listOf(message(1)))
            insertUnsent(pending("c1", 5_000, "k1"), 5_000)
            close()
        }
        JdbcSqlDatabase(file).use { it.execute("PRAGMA user_version = 99") }

        val log = ArrayList<String>()
        val storage = openStorage(file, log)

        assertEquals(MessagesStorage.VERSION.toLong(), storage.let { it.close(); version(file) })
        val reopened = openStorage(file)
        assertTrue(reopened.readChats().isEmpty())
        assertTrue(reopened.readTail("c1", 50).isEmpty())
        assertEquals(listOf("k1"), reopened.readUnsent().map { it.message.clientId })
        assertTrue(log.any { it.contains("новее") })
    }

    @Test
    fun corruptFileIsRecreated() {
        val file = tempDatabase()
        file.writeBytes(ByteArray(8192) { 7 })
        val storage = openStorage(file)
        assertTrue(storage.isOpen)
        storage.putChat(chat("c1"))
        assertEquals(1, storage.readChats().size)
    }

    @Test
    fun brokenTableDoesNotBreakOtherOperations() {
        val file = tempDatabase()
        val storage = openStorage(file)
        storage.insertUnsent(pending("c1", 7_000, "k7"), 7_000)
        storage.putMessages(listOf(message(1)))
        storage.close()
        JdbcSqlDatabase(file).use { it.execute("DROP TABLE chats") }
        val broken = openStorage(file)
        broken.putChat(chat("c1"))
        assertTrue(broken.readChats().isEmpty())
        assertEquals(listOf("k7"), broken.readUnsent().map { it.message.clientId })
    }

    @Test
    fun messagesRejectNonPositiveIdsAndDeleted() {
        val storage = openStorage()
        storage.putMessages(listOf(message(0), message(-5), message(3, deleted = true), message(4)))
        assertEquals(listOf(4L), storage.readTail("c1", 50).map { it.id })
    }

    @Test
    fun rangesMergeLikeWeb() {
        val storage = openStorage()
        storage.addRange("c1", 10, 20)
        storage.addRange("c1", 21, 30)
        assertEquals(listOf(MessageRange(10, 30)), storage.readRanges("c1"))

        storage.addRange("c1", 25, 40)
        assertEquals(listOf(MessageRange(10, 40)), storage.readRanges("c1"))

        storage.addRange("c1", 12, 15)
        assertEquals(listOf(MessageRange(10, 40)), storage.readRanges("c1"))

        storage.addRange("c1", 50, 60)
        assertEquals(listOf(MessageRange(10, 40), MessageRange(50, 60)), storage.readRanges("c1"))

        storage.addRange("c1", 41, 49)
        assertEquals(listOf(MessageRange(10, 60)), storage.readRanges("c1"))

        storage.addRange("c1", 1, 100)
        assertEquals(listOf(MessageRange(1, 100)), storage.readRanges("c1"))

        storage.addRange("c2", 5, 4)
        assertTrue(storage.readRanges("c2").isEmpty())
    }

    @Test
    fun pageFromDiskOnlyInsideRange() {
        val storage = openStorage()
        storage.putMessages((1L..100L).map { message(it) })
        storage.addRange("c1", 40, 69)

        val older = storage.readPage("c1", PageSide.OLDER, 70, 10)
        assertEquals((60L..69L).toList(), older.map { it.id })

        val deeper = storage.readPage("c1", PageSide.OLDER, 45, 10)
        assertEquals((40L..44L).toList(), deeper.map { it.id })

        assertTrue(storage.readPage("c1", PageSide.OLDER, 40, 10).isEmpty())
        assertTrue(storage.readPage("c1", PageSide.OLDER, 90, 10).isEmpty())

        val newer = storage.readPage("c1", PageSide.NEWER, 39, 10)
        assertEquals((40L..49L).toList(), newer.map { it.id })
        assertTrue(storage.readPage("c1", PageSide.NEWER, 69, 10).isEmpty())
    }

    @Test
    fun syncAppliesCreatedChangedDeletedAndMovesCursor() {
        val storage = openStorage()
        storage.applyTail("c1", listOf(message(1), message(2), message(3)))
        val cursor = storage.readCursor("c1")!!
        assertEquals(SyncCursor(3, time(3)), cursor)

        val response = MessagesSyncResponse(
            created = listOf(message(4), message(5, deleted = true)),
            changed = listOf(message(1, content = "правка"), message(2, deleted = true), message(999, content = "чужое")),
            maxId = 5,
            maxUpdatedAt = time(50),
            hasMore = false,
        )
        val next = storage.applySync("c1", response, cursor)

        assertEquals(SyncCursor(5, time(50)), next)
        assertEquals(next, storage.readCursor("c1"))
        assertEquals(listOf(1L, 3L, 4L), storage.readTail("c1", 50).map { it.id })
        assertEquals("правка", storage.readMessage("c1", 1)!!.content)
        assertNull(storage.readMessage("c1", 999))

        val empty = storage.applySync("c1", MessagesSyncResponse(), next)
        assertEquals(next, empty)
    }

    @Test
    fun tailOfEmptyChatGivesZeroCursor() {
        val storage = openStorage()
        assertEquals(SyncCursor(0, null), storage.applyTail("c1", emptyList()))
    }

    @Test
    fun unsentLivesInMessagesAndIsConfirmedByClientId() {
        val storage = openStorage()
        storage.insertUnsent(pending("c1", 2_000, "b"), 2_000)
        storage.insertUnsent(pending("c1", 1_000, "a"), 1_000)
        storage.insertUnsent(pending("c2", 3_000, "c"), 3_000)

        assertEquals(listOf("a", "b", "c"), storage.readUnsent().map { it.message.clientId })
        assertEquals(listOf("a", "b"), storage.readUnsent("c1").map { it.message.clientId })
        assertTrue(storage.readTail("c1", 50).isEmpty())
        assertFalse(storage.hasHistory("c1"))

        assertEquals(1, storage.bumpAttempts("a"))
        assertEquals(2, storage.bumpAttempts("a"))

        assertTrue(storage.confirmUnsent("a", message(10, clientId = "a")))
        assertFalse(storage.confirmUnsent("a", message(10, clientId = "a")))
        assertEquals(listOf(10L), storage.readTail("c1", 50).map { it.id })
        assertEquals(listOf("b", "c"), storage.readUnsent().map { it.message.clientId })

        assertTrue(storage.removeUnsent("b"))
        storage.removeChat("c2")
        assertTrue(storage.readUnsent().isEmpty())
    }

    @Test
    fun unsentWriteFailureReachesCaller() {
        val storage = openStorage()
        storage.insertUnsent(pending("c1", 1_000, "a"), 1_000)
        val failed = runCatching { storage.insertUnsent(pending("c1", 1_000, "a"), 1_000) }
        assertTrue(failed.exceptionOrNull() is SqlException)
        storage.close()
        assertTrue(runCatching { storage.insertUnsent(pending("c1", 2_000, "b"), 2_000) }.exceptionOrNull() is SqlException)
    }

    @Test
    fun reactionsAndDetailsAreUpdatedInPlace() {
        val storage = openStorage()
        storage.putMessages(listOf(message(1)))
        val reactions = listOf(MessageReactionDto("👍", listOf(ME)))
        assertEquals(reactions, storage.updateReactions("c1", 1, reactions)!!.reactions)
        assertEquals(reactions, storage.readMessage("c1", 1)!!.reactions)
        assertNull(storage.updateReactions("c1", 2, reactions))

        storage.putDetails(details("c1"))
        val updated = storage.updateDetails("c1") { it.copy(pinnedMessage = message(1)) }
        assertEquals(1L, updated!!.pinnedMessage!!.id)
        assertEquals(1L, storage.readDetails("c1")!!.pinnedMessage!!.id)
        assertNull(storage.updateDetails("missing") { it })
    }

    @Test
    fun textKeepsEmojiAndCyrillic() {
        val storage = openStorage()
        storage.putMessages(listOf(message(1, content = "Привет 👋🏽 мир 🇷🇺")))
        assertEquals("Привет 👋🏽 мир 🇷🇺", storage.readMessage("c1", 1)!!.content)
    }

    @Test
    fun pruneKeepsFiftyInStaleChatsAndAllInActiveAndTrimsRanges() {
        val storage = openStorage()
        storage.replaceChats(listOf(chat("old", time(1)), chat("active", time(2)), chat("fresh", time(3))))
        storage.putMessages((1L..10_000L).map { message(it, "old") })
        storage.putMessages((1L..6_000L).map { message(it, "active") })
        storage.putMessages((1L..4_001L).map { message(it, "fresh") })
        storage.addRange("old", 1, 5_000)
        storage.addRange("old", 9_000, 9_990)
        storage.addRange("old", 9_992, 10_000)
        storage.insertUnsent(pending("old", 1, "k"), 1)

        val dropped = storage.prune("active", 20_000, 50)

        assertEquals(9_950, dropped)
        assertEquals(50, storage.readTail("old", 100_000).size)
        assertEquals(9_951L, storage.readTail("old", 100_000).first().id)
        assertEquals(6_000, storage.readTail("active", 100_000).size)
        assertEquals(4_001, storage.readTail("fresh", 100_000).size)
        assertEquals(listOf(MessageRange(9_951, 9_990), MessageRange(9_992, 10_000)), storage.readRanges("old"))
        assertEquals(1, storage.readUnsent("old").size)

        assertEquals(0, storage.prune("active", 20_000, 50))
    }

    @Test
    fun selectsVictimsLikeWeb() {
        val counts = listOf(
            ChatMessageCount("a", time(3), 100),
            ChatMessageCount("b", time(1), 100),
            ChatMessageCount("c", time(2), 30),
        )
        assertTrue(selectHistoryPruneVictims(counts, 230, null, 300, 50).isEmpty())
        assertEquals(listOf("b"), selectHistoryPruneVictims(counts, 230, null, 200, 50).map { it.chatId })
        assertEquals(listOf("b", "a"), selectHistoryPruneVictims(counts, 230, null, 150, 50).map { it.chatId })
        assertEquals(listOf("a"), selectHistoryPruneVictims(counts, 230, "b", 200, 50).map { it.chatId })
    }

    @Test
    fun wipeRemovesFileAndReopensEmpty() {
        val file = tempDatabase()
        val storage = openStorage(file)
        storage.putChat(chat("c1"))
        storage.wipe()
        assertFalse(storage.isOpen)
        assertFalse(file.exists())
        assertTrue(storage.readChats().isEmpty())
        storage.open()
        assertTrue(storage.readChats().isEmpty())
    }
}
