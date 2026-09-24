package com.qwill.app.files

import com.qwill.app.database.MediaRow
import com.qwill.app.database.MessagesStorage
import java.io.File

data class ChatStorageEntry(val chatId: String, val size: Long, val byKind: Map<MediaKind, Long>)

data class StorageUsage(val total: Long, val byKind: Map<MediaKind, Long>, val byChat: List<ChatStorageEntry>) {
    fun cellSize(chatId: String?, kind: MediaKind): Long {
        if (chatId != null) return byChat.firstOrNull { it.chatId == chatId }?.byKind?.get(kind) ?: 0L
        val inChats = byChat.sumOf { it.byKind[kind] ?: 0L }
        return maxOf(0L, (byKind[kind] ?: 0L) - inChats)
    }

    fun selectionBytes(selection: Set<StorageCell>): Long = selection.sumOf { cellSize(it.chatId, it.kind) }

    fun kindCells(kind: MediaKind): List<StorageCell> {
        val cells = byChat.filter { (it.byKind[kind] ?: 0L) > 0 }.map { StorageCell(it.chatId, kind) }.toMutableList()
        if (cellSize(null, kind) > 0) cells.add(StorageCell(null, kind))
        return cells
    }

    fun chatCells(chatId: String): List<StorageCell> =
        byChat.firstOrNull { it.chatId == chatId }?.byKind?.keys?.map { StorageCell(chatId, it) }.orEmpty()

    companion object {
        val EMPTY = StorageUsage(0, emptyMap(), emptyList())

        fun of(rows: List<MediaRow>): StorageUsage {
            val byKind = HashMap<MediaKind, Long>()
            val byChat = HashMap<String, HashMap<MediaKind, Long>>()
            var total = 0L
            for (row in rows) {
                total += row.size
                byKind[row.kind] = (byKind[row.kind] ?: 0L) + row.size
                val chatId = row.chatId ?: continue
                val kinds = byChat.getOrPut(chatId) { HashMap() }
                kinds[row.kind] = (kinds[row.kind] ?: 0L) + row.size
            }
            val chats = byChat.map { (chatId, kinds) -> ChatStorageEntry(chatId, kinds.values.sum(), kinds) }
                .sortedByDescending { it.size }
            return StorageUsage(total, byKind, chats)
        }
    }
}

data class StorageCell(val chatId: String?, val kind: MediaKind)

class CleanupReport(val expired: List<MediaRow>, val overBudget: List<MediaRow>, val missing: Int, val strayFiles: Int) {
    val removedBytes: Long get() = expired.sumOf { it.size } + overBudget.sumOf { it.size }
}

class MediaCleaner(
    private val dirs: MediaDirs,
    private val isBusy: (String) -> Boolean,
    private val clock: () -> Long,
) {
    fun run(storage: MessagesStorage, settings: RetentionSettings): CleanupReport {
        val all = storage.readAllMedia()
        val present = all.filter { File(it.path).exists() }
        val missing = all.filter { !File(it.path).exists() && !isBusy(it.fileId) }
        storage.deleteMedia(missing.map { it.fileId })
        val now = clock()
        val ttlOf = MediaRetention.resolver(settings, storage.readChatTypes())
        val candidates = present.filter { !isBusy(it.fileId) }
        val byId = candidates.associateBy { it.fileId }
        val expired = MediaRetention.selectExpired(candidates.map { it.asCached() }, now, ttlOf).mapNotNull { byId[it.fileId] }
        val expiredIds = expired.map { it.fileId }.toSet()
        val remaining = present.filter { it.fileId !in expiredIds }
        val overBudget = MediaRetention.selectOverBudget(remaining.map { it.asCached() }, settings.budgetBytes)
            .mapNotNull { byId[it.fileId] }
        drop(storage, expired + overBudget)
        val stray = removeStrayFiles(storage.readAllMedia().map { File(it.path).canonicalPath }.toSet(), now)
        return CleanupReport(expired, overBudget, missing.size, stray)
    }

    fun usage(storage: MessagesStorage): StorageUsage = StorageUsage.of(storage.readAllMedia().filter { File(it.path).exists() })

    fun clear(storage: MessagesStorage, selection: Set<StorageCell>): Long {
        val victims = storage.readAllMedia().filter { row -> StorageCell(row.chatId, row.kind) in selection && !isBusy(row.fileId) }
        drop(storage, victims)
        return victims.sumOf { it.size }
    }

    fun clearAll(storage: MessagesStorage): Long {
        val victims = storage.readAllMedia().filter { !isBusy(it.fileId) }
        drop(storage, victims)
        return victims.sumOf { it.size }
    }

    private fun drop(storage: MessagesStorage, rows: List<MediaRow>) {
        if (rows.isEmpty()) return
        storage.deleteMedia(rows.map { it.fileId })
        for (row in rows) File(row.path).delete()
    }

    private fun removeStrayFiles(indexed: Set<String>, now: Long): Int {
        var removed = 0
        val candidates = (dirs.media.listFiles().orEmpty().toList() + dirs.temp.listFiles().orEmpty().toList()).filter { it.isFile }
        for (file in candidates) {
            if (file.canonicalPath in indexed) continue
            if (now - file.lastModified() < STRAY_AGE_MS) continue
            if (isBusy(file.nameWithoutExtension)) continue
            if (file.delete()) removed++
        }
        return removed
    }

    private companion object {
        const val STRAY_AGE_MS = DAY_MS
    }
}
