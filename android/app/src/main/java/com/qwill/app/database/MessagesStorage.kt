package com.qwill.app.database

import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageReactionDto
import com.qwill.app.model.MessagesSyncResponse
import com.qwill.app.net.ApiJson
import java.io.File

data class SyncCursor(val maxId: Long, val maxUpdatedAt: String?)

data class MessageRange(val fromId: Long, val toId: Long)

data class UnsentMessage(val message: MessageDto, val createdAtMs: Long, val attempts: Int)

enum class PageSide { OLDER, NEWER }

data class StorageStats(
    val chats: Int,
    val messages: Int,
    val ranges: Int,
    val unsent: Int,
    val fileBytes: Long,
)

data class ChatMessageCount(val chatId: String, val updatedAt: String, val count: Int)

data class HistoryPruneVictim(val chatId: String, val keep: Int)

class MessagesStorage(
    private val file: File,
    private val opener: SqlOpener,
    private val log: (String) -> Unit,
) {
    private class UnsentRow(val chatId: String, val id: Long, val clientId: String, val createdAt: Long, val attempts: Long, val data: String)

    private var db: SqlDatabase? = null

    val isOpen: Boolean get() = db != null

    fun open() {
        if (db != null) return
        db = try {
            openAndMigrate()
        } catch (e: Exception) {
            log("база не открылась: ${e.message}, пересоздаётся")
            recreate()
        }
    }

    fun close() {
        val current = db ?: return
        db = null
        try {
            current.close()
        } catch (e: Exception) {
            log("база не закрылась: ${e.message}")
        }
    }

    fun wipe() {
        close()
        deleteFiles()
    }

    fun readChats(): List<ChatListItemDto> = guard(emptyList()) { db ->
        db.query("SELECT data FROM chats ORDER BY updated_at DESC") { it.string(0) }
            .mapNotNull { decodeChat(it) }
    }

    fun replaceChats(chats: List<ChatListItemDto>) {
        guard(Unit) { db ->
            db.transaction {
                db.execute("DELETE FROM chats")
                for (chat in chats) insertChat(db, chat)
            }
        }
    }

    fun putChat(chat: ChatListItemDto) {
        guard(Unit) { db -> insertChat(db, chat) }
    }

    fun removeChatRow(chatId: String) {
        guard(Unit) { db -> db.execute("DELETE FROM chats WHERE id = ?", chatId) }
    }

    fun removeChat(chatId: String) {
        guard(Unit) { db ->
            db.transaction {
                db.execute("DELETE FROM chats WHERE id = ?", chatId)
                db.execute("DELETE FROM chat_details WHERE id = ?", chatId)
                db.execute("DELETE FROM messages WHERE chat_id = ?", chatId)
                db.execute("DELETE FROM message_ranges WHERE chat_id = ?", chatId)
                db.execute("DELETE FROM sync_cursors WHERE chat_id = ?", chatId)
            }
        }
    }

    fun readDetails(chatId: String): ChatDto? = guard(null) { db ->
        db.query("SELECT data FROM chat_details WHERE id = ?", chatId) { it.string(0) }
            .firstOrNull()
            ?.let { decode(it) { text -> ApiJson.decodeFromString(ChatDto.serializer(), text) } }
    }

    fun putDetails(chat: ChatDto) {
        guard(Unit) { db -> insertDetails(db, chat) }
    }

    fun updateDetails(chatId: String, transform: (ChatDto) -> ChatDto): ChatDto? = guard(null) { db ->
        val current = db.query("SELECT data FROM chat_details WHERE id = ?", chatId) { it.string(0) }
            .firstOrNull()
            ?.let { decode(it) { text -> ApiJson.decodeFromString(ChatDto.serializer(), text) } }
            ?: return@guard null
        val next = transform(current)
        insertDetails(db, next)
        next
    }

    fun putMessages(messages: List<MessageDto>) {
        val persistable = messages.filter { isPersistable(it) }
        if (persistable.isEmpty()) return
        guard(Unit) { db -> db.transaction { for (message in persistable) insertMessage(db, message) } }
    }

    fun updateMessages(messages: List<MessageDto>) {
        val persistable = messages.filter { isPersistable(it) }
        if (persistable.isEmpty()) return
        guard(Unit) { db -> db.transaction { for (message in persistable) replaceExisting(db, message) } }
    }

    fun readMessage(chatId: String, messageId: Long): MessageDto? = guard(null) { db ->
        db.query("SELECT data FROM messages WHERE chat_id = ? AND id = ?", chatId, messageId) { it.string(0) }
            .firstOrNull()
            ?.let { decodeMessage(it) }
    }

    fun updateReactions(chatId: String, messageId: Long, reactions: List<MessageReactionDto>): MessageDto? = guard(null) { db ->
        val current = db.query("SELECT data FROM messages WHERE chat_id = ? AND id = ? AND send_state = ?", chatId, messageId, SENT) { it.string(0) }
            .firstOrNull()
            ?.let { decodeMessage(it) }
            ?: return@guard null
        val next = current.copy(reactions = reactions)
        replaceExisting(db, next)
        next
    }

    fun deleteMessages(chatId: String, ids: Collection<Long>) {
        if (ids.isEmpty()) return
        guard(Unit) { db ->
            db.transaction { for (id in ids) db.execute("DELETE FROM messages WHERE chat_id = ? AND id = ? AND send_state = ?", chatId, id, SENT) }
        }
    }

    fun newestBefore(chatId: String, messageId: Long): MessageDto? = guard(null) { db ->
        db.query(
            "SELECT data FROM messages WHERE chat_id = ? AND send_state = ? AND id < ? ORDER BY id DESC LIMIT 1",
            chatId,
            SENT,
            messageId,
        ) { it.string(0) }.firstOrNull()?.let { decodeMessage(it) }
    }

    fun readTail(chatId: String, limit: Int): List<MessageDto> = guard(emptyList()) { db ->
        db.query(
            "SELECT data FROM messages WHERE chat_id = ? AND send_state = ? ORDER BY id DESC LIMIT ?",
            chatId,
            SENT,
            limit,
        ) { it.string(0) }.mapNotNull { decodeMessage(it) }.asReversed()
    }

    fun hasHistory(chatId: String): Boolean = guard(false) { db ->
        db.queryLong("SELECT EXISTS(SELECT 1 FROM messages WHERE chat_id = ? AND send_state = ?)", chatId, SENT) == 1L
    }

    fun readRanges(chatId: String): List<MessageRange> = guard(emptyList()) { db ->
        db.query("SELECT from_id, to_id FROM message_ranges WHERE chat_id = ? ORDER BY from_id", chatId) {
            MessageRange(it.long(0), it.long(1))
        }
    }

    fun addRange(chatId: String, fromId: Long, toId: Long) {
        if (fromId > toId) return
        guard(Unit) { db -> db.transaction { mergeRange(db, chatId, fromId, toId) } }
    }

    fun readPage(chatId: String, side: PageSide, edgeId: Long, limit: Int): List<MessageDto> = guard(emptyList()) { db ->
        val target = if (side == PageSide.OLDER) edgeId - 1 else edgeId + 1
        val range = db.query(
            "SELECT from_id, to_id FROM message_ranges WHERE chat_id = ? AND from_id <= ? AND to_id >= ?",
            chatId,
            target,
            target,
        ) { MessageRange(it.long(0), it.long(1)) }.firstOrNull() ?: return@guard emptyList()
        if (side == PageSide.OLDER) {
            db.query(
                "SELECT data FROM messages WHERE chat_id = ? AND send_state = ? AND id BETWEEN ? AND ? ORDER BY id DESC LIMIT ?",
                chatId,
                SENT,
                range.fromId,
                target,
                limit,
            ) { it.string(0) }.mapNotNull { decodeMessage(it) }.asReversed()
        } else {
            db.query(
                "SELECT data FROM messages WHERE chat_id = ? AND send_state = ? AND id BETWEEN ? AND ? ORDER BY id ASC LIMIT ?",
                chatId,
                SENT,
                target,
                range.toId,
                limit,
            ) { it.string(0) }.mapNotNull { decodeMessage(it) }
        }
    }

    fun readCursor(chatId: String): SyncCursor? = guard(null) { db ->
        db.query("SELECT max_id, max_updated_at FROM sync_cursors WHERE chat_id = ?", chatId) {
            SyncCursor(it.long(0), it.string(1))
        }.firstOrNull()
    }

    fun readCursors(): Map<String, SyncCursor> = guard(emptyMap()) { db ->
        db.query("SELECT chat_id, max_id, max_updated_at FROM sync_cursors") {
            it.string(0).orEmpty() to SyncCursor(it.long(1), it.string(2))
        }.toMap()
    }

    fun applySync(chatId: String, response: MessagesSyncResponse, current: SyncCursor): SyncCursor = guard(current) { db ->
        val next = SyncCursor(response.maxId ?: current.maxId, response.maxUpdatedAt ?: current.maxUpdatedAt)
        db.transaction {
            for (message in response.changed) {
                if (message.deletedAt != null) {
                    db.execute("DELETE FROM messages WHERE chat_id = ? AND id = ? AND send_state = ?", chatId, message.id, SENT)
                } else if (isPersistable(message)) {
                    replaceExisting(db, message)
                }
            }
            for (message in response.created) if (isPersistable(message)) insertMessage(db, message)
            writeCursor(db, chatId, next)
        }
        next
    }

    fun applyTail(chatId: String, messages: List<MessageDto>): SyncCursor? = guard(null) { db ->
        val newest = messages.maxByOrNull { it.id }
        val cursor = if (newest == null) SyncCursor(0, null) else SyncCursor(newest.id, newest.createdAt)
        db.transaction {
            for (message in messages) if (isPersistable(message)) insertMessage(db, message)
            writeCursor(db, chatId, cursor)
        }
        cursor
    }

    fun resetHistory(chatId: String) {
        guard(Unit) { db ->
            db.transaction {
                db.execute("DELETE FROM messages WHERE chat_id = ? AND send_state = ?", chatId, SENT)
                db.execute("DELETE FROM message_ranges WHERE chat_id = ?", chatId)
                db.execute("DELETE FROM sync_cursors WHERE chat_id = ?", chatId)
            }
        }
    }

    fun insertUnsent(message: MessageDto, createdAtMs: Long) {
        val current = db ?: throw SqlException(0, "база недоступна")
        require(message.id < 0 && message.clientId != null) { "неотправленное — только с отрицательным id и clientId" }
        try {
            current.execute(
                "INSERT INTO messages(chat_id, id, send_state, client_id, created_at, attempts, data) VALUES (?, ?, ?, ?, ?, 0, ?)",
                message.chatId,
                message.id,
                SENDING,
                message.clientId,
                createdAtMs,
                encodeMessage(message),
            )
        } catch (e: SqlException) {
            if (e.corrupt) reset()
            throw e
        }
    }

    fun readUnsent(chatId: String? = null): List<UnsentMessage> = guard(emptyList()) { db ->
        val rows = if (chatId == null) {
            db.query("SELECT data, created_at, attempts FROM messages WHERE send_state = ? ORDER BY created_at, id DESC", SENDING, read = ::unsent)
        } else {
            db.query(
                "SELECT data, created_at, attempts FROM messages WHERE send_state = ? AND chat_id = ? ORDER BY created_at, id DESC",
                SENDING,
                chatId,
                read = ::unsent,
            )
        }
        rows.filterNotNull()
    }

    fun bumpAttempts(clientId: String): Int = guard(0) { db ->
        db.execute("UPDATE messages SET attempts = attempts + 1 WHERE client_id = ? AND send_state = ?", clientId, SENDING)
        db.queryLong("SELECT attempts FROM messages WHERE client_id = ? AND send_state = ?", clientId, SENDING)?.toInt() ?: 0
    }

    fun removeUnsent(clientId: String): Boolean = guard(false) { db ->
        db.execute("DELETE FROM messages WHERE client_id = ? AND send_state = ?", clientId, SENDING)
        db.changes() > 0
    }

    fun confirmUnsent(clientId: String, message: MessageDto): Boolean = guard(false) { db ->
        db.transaction {
            db.execute("DELETE FROM messages WHERE client_id = ? AND send_state = ?", clientId, SENDING)
            val existed = db.changes() > 0
            if (isPersistable(message)) insertMessage(db, message)
            existed
        }
    }

    fun prune(activeChatId: String?, totalLimit: Int, keepPerChat: Int): Int = guard(0) { db ->
        val total = db.queryLong("SELECT COUNT(*) FROM messages WHERE send_state = ?", SENT)?.toInt() ?: 0
        if (total <= totalLimit) return@guard 0
        val counts = db.query(
            "SELECT m.chat_id, COUNT(*), COALESCE(c.updated_at, '') FROM messages m LEFT JOIN chats c ON c.id = m.chat_id " +
                "WHERE m.send_state = ? GROUP BY m.chat_id",
            SENT,
        ) { ChatMessageCount(it.string(0).orEmpty(), it.string(2).orEmpty(), it.long(1).toInt()) }
        val victims = selectHistoryPruneVictims(counts, total, activeChatId, totalLimit, keepPerChat)
        var dropped = 0
        db.transaction {
            for (victim in victims) {
                val cutoff = db.queryLong(
                    "SELECT id FROM messages WHERE chat_id = ? AND send_state = ? ORDER BY id DESC LIMIT 1 OFFSET ?",
                    victim.chatId,
                    SENT,
                    victim.keep - 1,
                ) ?: continue
                db.execute("DELETE FROM messages WHERE chat_id = ? AND send_state = ? AND id < ?", victim.chatId, SENT, cutoff)
                dropped += db.changes()
                db.execute("DELETE FROM message_ranges WHERE chat_id = ? AND to_id < ?", victim.chatId, cutoff)
                db.execute("UPDATE message_ranges SET from_id = ? WHERE chat_id = ? AND from_id < ?", cutoff, victim.chatId, cutoff)
            }
        }
        dropped
    }

    fun stats(): StorageStats = guard(StorageStats(0, 0, 0, 0, fileBytes())) { db ->
        StorageStats(
            chats = db.queryLong("SELECT COUNT(*) FROM chats")?.toInt() ?: 0,
            messages = db.queryLong("SELECT COUNT(*) FROM messages WHERE send_state = ?", SENT)?.toInt() ?: 0,
            ranges = db.queryLong("SELECT COUNT(*) FROM message_ranges")?.toInt() ?: 0,
            unsent = db.queryLong("SELECT COUNT(*) FROM messages WHERE send_state = ?", SENDING)?.toInt() ?: 0,
            fileBytes = fileBytes(),
        )
    }

    private fun <T> guard(fallback: T, body: (SqlDatabase) -> T): T {
        val current = db ?: return fallback
        return try {
            body(current)
        } catch (e: SqlException) {
            log("ошибка базы ${e.code}: ${e.message}")
            if (e.corrupt) reset()
            fallback
        } catch (e: RuntimeException) {
            log("ошибка базы: ${e.message}")
            fallback
        }
    }

    private fun reset() {
        log("база испорчена, пересоздаётся")
        val broken = db
        db = null
        val rescued = broken?.let { rescueUnsent(it) }.orEmpty()
        try {
            broken?.close()
        } catch (e: Exception) {
            log("испорченная база не закрылась: ${e.message}")
        }
        db = rebuild(rescued)
    }

    private fun openAndMigrate(): SqlDatabase {
        val opened = opener.open(file)
        try {
            configure(opened)
            migrate(opened)
        } catch (e: Exception) {
            try {
                opened.close()
            } catch (ignored: Exception) {
            }
            throw e
        }
        return opened
    }

    private fun recreate(): SqlDatabase? {
        val rescued = try {
            opener.open(file).use { rescueUnsent(it) }
        } catch (e: Exception) {
            emptyList()
        }
        return rebuild(rescued)
    }

    private fun rebuild(rescued: List<UnsentRow>): SqlDatabase? {
        deleteFiles()
        return try {
            val fresh = openAndMigrate()
            if (rescued.isNotEmpty()) {
                fresh.transaction { for (row in rescued) insertUnsentRow(fresh, row) }
                log("перенесено неотправленных: ${rescued.size}")
            }
            fresh
        } catch (e: Exception) {
            log("база не создалась, работа без кэша: ${e.message}")
            null
        }
    }

    private fun rescueUnsent(source: SqlDatabase): List<UnsentRow> = try {
        source.query(
            "SELECT chat_id, id, client_id, created_at, attempts, data FROM messages WHERE send_state = ?",
            SENDING,
        ) { UnsentRow(it.string(0).orEmpty(), it.long(1), it.string(2).orEmpty(), it.long(3), it.long(4), it.string(5).orEmpty()) }
            .filter { it.chatId.isNotEmpty() && it.clientId.isNotEmpty() && it.data.isNotEmpty() }
    } catch (e: Exception) {
        log("неотправленное не вычиталось: ${e.message}")
        emptyList()
    }

    private fun insertUnsentRow(db: SqlDatabase, row: UnsentRow) {
        db.execute(
            "INSERT OR REPLACE INTO messages(chat_id, id, send_state, client_id, created_at, attempts, data) VALUES (?, ?, ?, ?, ?, ?, ?)",
            row.chatId,
            row.id,
            SENDING,
            row.clientId,
            row.createdAt,
            row.attempts,
            row.data,
        )
    }

    private fun configure(db: SqlDatabase) {
        db.execute("PRAGMA secure_delete = ON")
        db.execute("PRAGMA temp_store = MEMORY")
        db.execute("PRAGMA journal_mode = WAL")
        db.execute("PRAGMA journal_size_limit = $JOURNAL_SIZE_LIMIT")
    }

    private fun migrate(db: SqlDatabase) {
        val version = db.queryLong("PRAGMA user_version")?.toInt() ?: 0
        if (version > VERSION) throw SqlException(0, "версия базы $version новее известной $VERSION")
        for (next in version + 1..VERSION) {
            db.transaction {
                MIGRATIONS[next - 1](db)
                db.execute("PRAGMA user_version = $next")
            }
        }
    }

    private fun deleteFiles() {
        for (suffix in FILE_SUFFIXES) {
            val target = File(file.path + suffix)
            if (target.exists() && !target.delete()) log("файл ${target.name} не удалился")
        }
    }

    private fun fileBytes(): Long = FILE_SUFFIXES.sumOf { File(file.path + it).length() }

    private fun insertChat(db: SqlDatabase, chat: ChatListItemDto) {
        db.execute(
            "INSERT OR REPLACE INTO chats(id, updated_at, type, data) VALUES (?, ?, ?, ?)",
            chat.id,
            chat.updatedAt,
            chat.type.name,
            ApiJson.encodeToString(ChatListItemDto.serializer(), chat),
        )
    }

    private fun insertDetails(db: SqlDatabase, chat: ChatDto) {
        db.execute(
            "INSERT OR REPLACE INTO chat_details(id, data) VALUES (?, ?)",
            chat.id,
            ApiJson.encodeToString(ChatDto.serializer(), chat),
        )
    }

    private fun insertMessage(db: SqlDatabase, message: MessageDto) {
        db.execute(
            "INSERT OR REPLACE INTO messages(chat_id, id, send_state, client_id, created_at, attempts, data) VALUES (?, ?, ?, NULL, 0, 0, ?)",
            message.chatId,
            message.id,
            SENT,
            encodeMessage(message),
        )
    }

    private fun replaceExisting(db: SqlDatabase, message: MessageDto) {
        db.execute(
            "UPDATE messages SET data = ? WHERE chat_id = ? AND id = ? AND send_state = ?",
            encodeMessage(message),
            message.chatId,
            message.id,
            SENT,
        )
    }

    private fun writeCursor(db: SqlDatabase, chatId: String, cursor: SyncCursor) {
        db.execute(
            "INSERT OR REPLACE INTO sync_cursors(chat_id, max_id, max_updated_at) VALUES (?, ?, ?)",
            chatId,
            cursor.maxId,
            cursor.maxUpdatedAt,
        )
    }

    private fun mergeRange(db: SqlDatabase, chatId: String, fromId: Long, toId: Long) {
        val touching = db.query(
            "SELECT from_id, to_id FROM message_ranges WHERE chat_id = ? AND from_id <= ? AND to_id >= ?",
            chatId,
            toId + 1,
            fromId - 1,
        ) { MessageRange(it.long(0), it.long(1)) }
        val merged = MessageRange(
            minOf(fromId, touching.minOfOrNull { it.fromId } ?: fromId),
            maxOf(toId, touching.maxOfOrNull { it.toId } ?: toId),
        )
        for (range in touching) db.execute("DELETE FROM message_ranges WHERE chat_id = ? AND from_id = ?", chatId, range.fromId)
        db.execute("INSERT INTO message_ranges(chat_id, from_id, to_id) VALUES (?, ?, ?)", chatId, merged.fromId, merged.toId)
    }

    private fun unsent(row: SqlRow): UnsentMessage? {
        val message = decodeMessage(row.string(0)) ?: return null
        return UnsentMessage(message, row.long(1), row.long(2).toInt())
    }

    private fun decodeChat(text: String?): ChatListItemDto? =
        text?.let { decode(it) { value -> ApiJson.decodeFromString(ChatListItemDto.serializer(), value) } }

    private fun decodeMessage(text: String?): MessageDto? =
        text?.let { decode(it) { value -> ApiJson.decodeFromString(MessageDto.serializer(), value) } }

    private fun <T> decode(text: String, parse: (String) -> T): T? = try {
        parse(text)
    } catch (e: IllegalArgumentException) {
        log("строка базы не разобралась: ${e.message}")
        null
    }

    private fun encodeMessage(message: MessageDto): String = ApiJson.encodeToString(MessageDto.serializer(), message)

    private fun isPersistable(message: MessageDto): Boolean = message.id > 0 && message.deletedAt == null

    companion object {
        const val VERSION = 1
        const val FILE_NAME = "messages.db"
        private const val SENT = 0
        private const val SENDING = 1
        private const val JOURNAL_SIZE_LIMIT = 10_485_760
        private val FILE_SUFFIXES = listOf("", "-wal", "-shm", "-journal")

        private val MIGRATIONS: List<(SqlDatabase) -> Unit> = listOf(
            { db ->
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
                db.execute(
                    "CREATE TABLE message_ranges(chat_id TEXT NOT NULL, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL, " +
                        "PRIMARY KEY(chat_id, from_id)) WITHOUT ROWID",
                )
                db.execute(
                    "CREATE TABLE sync_cursors(chat_id TEXT PRIMARY KEY, max_id INTEGER NOT NULL, max_updated_at TEXT) WITHOUT ROWID",
                )
            },
        )
    }
}

fun selectHistoryPruneVictims(
    chats: List<ChatMessageCount>,
    totalMessages: Int,
    activeChatId: String?,
    totalLimit: Int,
    keepPerChat: Int,
): List<HistoryPruneVictim> {
    if (totalMessages <= totalLimit) return emptyList()
    val stale = chats
        .filter { it.chatId != activeChatId && it.count > keepPerChat }
        .sortedBy { it.updatedAt }
    var remaining = totalMessages
    val victims = ArrayList<HistoryPruneVictim>()
    for (chat in stale) {
        if (remaining <= totalLimit) break
        victims.add(HistoryPruneVictim(chat.chatId, keepPerChat))
        remaining -= chat.count - keepPerChat
    }
    return victims
}
