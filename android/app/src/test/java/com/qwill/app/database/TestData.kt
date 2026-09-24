package com.qwill.app.database

import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.model.ChatType
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageType
import java.io.File
import java.nio.file.Files

const val ME = "u1"
const val PEER = "u2"

fun member(id: String): ChatMemberSummary = ChatMemberSummary(id, "user_$id", "Имя $id", lastSeenAt = "2026-09-01T00:00:00.000Z")

fun time(second: Long): String = "2026-09-25T%02d:%02d:%02d.000Z".format(second / 3600 % 24, second / 60 % 60, second % 60)

fun message(
    id: Long,
    chatId: String = "c1",
    content: String = "сообщение $id",
    sender: String = PEER,
    deleted: Boolean = false,
    clientId: String? = null,
): MessageDto = MessageDto(
    id = id,
    chatId = chatId,
    clientId = clientId,
    sender = member(sender),
    type = MessageType.TEXT,
    content = if (deleted) null else content,
    deletedAt = if (deleted) time(id + 1000) else null,
    createdAt = time(id),
)

fun chat(id: String, updatedAt: String = time(0), last: MessageDto? = null, unread: Int = 0): ChatListItemDto = ChatListItemDto(
    id = id,
    type = ChatType.PRIVATE,
    title = "Чат $id",
    otherMember = member(PEER),
    lastMessage = last,
    updatedAt = last?.createdAt ?: updatedAt,
    unreadCount = unread,
)

fun details(id: String, pinned: MessageDto? = null): ChatDto = ChatDto(
    id = id,
    type = ChatType.PRIVATE,
    title = "Чат $id",
    otherMember = member(PEER),
    updatedAt = time(0),
    members = listOf(member(ME), member(PEER)),
    readCursors = mapOf(ME to null, PEER to null),
    pinnedMessage = pinned,
)

fun tempDatabase(): File {
    val dir = Files.createTempDirectory("qwill-db").toFile()
    dir.deleteOnExit()
    return File(dir, MessagesStorage.FILE_NAME)
}

fun openStorage(file: File = tempDatabase(), log: MutableList<String> = ArrayList()): MessagesStorage =
    MessagesStorage(file, JdbcSqlDatabase.OPENER) { log.add(it) }.also { it.open() }
