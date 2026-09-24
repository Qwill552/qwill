package com.qwill.app.files

import com.qwill.app.database.MediaRow
import com.qwill.app.database.chat
import com.qwill.app.database.openStorage
import com.qwill.app.model.ChatType
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class MediaCleanerTest {
    private val root: File = Files.createTempDirectory("qwill-clean").toFile()
    private val dirs = MediaDirs(File(root, "cache"), File(root, "files")).also { it.ensure() }
    private val storage = openStorage()
    private val now = 100 * DAY_MS
    private val busy = HashSet<String>()
    private val cleaner = MediaCleaner(dirs, { it in busy }, { now })

    @After
    fun tearDown() {
        root.deleteRecursively()
    }

    private fun put(id: String, chatId: String?, kind: MediaKind, tier: MediaTier, size: Int, usedDaysAgo: Int, complete: Boolean = true): File {
        val file = if (complete) File(dirs.media, "$id.bin") else dirs.tempFile(id)
        file.writeBytes(ByteArray(size))
        storage.putMedia(MediaRow(id, chatId, kind, tier, size.toLong(), size.toLong(), complete, now - usedDaysAgo * DAY_MS, file.path))
        return file
    }

    @Test
    fun expiredGoesFirstAndAvatarsAreForever() {
        storage.replaceChats(listOf(chat("p"), chat("g").copy(type = ChatType.GROUP)))
        val groupOld = put("g-old", "g", MediaKind.PHOTO, MediaTier.THUMB, 10, 40)
        val privateOld = put("p-old", "p", MediaKind.PHOTO, MediaTier.THUMB, 10, 400)
        val avatar = put("av", null, MediaKind.AVATAR, MediaTier.AVATAR, 10, 400)
        val report = cleaner.run(storage, RetentionSettings.DEFAULT)
        assertEquals(listOf("g-old"), report.expired.map { it.fileId })
        assertFalse(groupOld.exists())
        assertTrue(privateOld.exists())
        assertTrue(avatar.exists())
    }

    @Test
    fun budgetEvictsWholeVideoButNotOpenOne() {
        val partial = put("v-open", "p", MediaKind.VIDEO, MediaTier.FULL, 50, 5, complete = false)
        val video = put("v-old", "p", MediaKind.VIDEO, MediaTier.FULL, 50, 9)
        put("thumb", "p", MediaKind.PHOTO, MediaTier.THUMB, 10, 1)
        busy.add("v-open")
        val report = cleaner.run(storage, RetentionSettings.DEFAULT.copy(budgetBytes = 60))
        assertEquals(listOf("v-old"), report.overBudget.map { it.fileId })
        assertFalse(video.exists())
        assertTrue(partial.exists())
    }

    @Test
    fun usageGroupsByChatAndKind() {
        put("a", "p", MediaKind.PHOTO, MediaTier.THUMB, 10, 1)
        put("b", "p", MediaKind.VIDEO, MediaTier.FULL, 30, 1)
        put("c", null, MediaKind.AVATAR, MediaTier.AVATAR, 5, 1)
        val usage = cleaner.usage(storage)
        assertEquals(45L, usage.total)
        assertEquals(40L, usage.byChat.single().size)
        assertEquals(5L, usage.cellSize(null, MediaKind.AVATAR))
        assertEquals(35L, usage.selectionBytes(setOf(StorageCell("p", MediaKind.VIDEO), StorageCell(null, MediaKind.AVATAR))))
        assertEquals(30L, cleaner.clear(storage, setOf(StorageCell("p", MediaKind.VIDEO))))
        assertEquals(15L, cleaner.usage(storage).total)
    }

    @Test
    fun wipingDirectoriesLeavesThemEmptyButPresent() {
        File(dirs.media, "x.jpg").writeText("x")
        File(dirs.outboxDir("k1"), "source").apply { parentFile!!.mkdirs() }.writeText("y")
        dirs.wipeMedia()
        dirs.wipeOutbox()
        assertTrue(dirs.temp.isDirectory)
        assertEquals(listOf(".temp"), dirs.media.list()!!.toList())
        assertTrue(dirs.outbox.list()!!.isEmpty())
    }
}
