package com.qwill.app.messenger

import com.qwill.app.auth.SessionState
import com.qwill.app.database.JdbcSqlDatabase
import com.qwill.app.database.ME
import com.qwill.app.database.MessageRange
import com.qwill.app.database.MessagesStorage
import com.qwill.app.database.PEER
import com.qwill.app.database.SyncCursor
import com.qwill.app.database.chat
import com.qwill.app.database.details
import com.qwill.app.database.message
import com.qwill.app.database.tempDatabase
import com.qwill.app.database.time
import com.qwill.app.model.ChatBlockEvent
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatListResponse
import com.qwill.app.model.ChatPinnedEvent
import com.qwill.app.model.ChatReadEvent
import com.qwill.app.model.ChatUpdatedEvent
import com.qwill.app.model.MemberChangedEvent
import com.qwill.app.model.MessageReactionDto
import com.qwill.app.model.MessageReactionEvent
import com.qwill.app.model.MessagesPage
import com.qwill.app.model.MessagesSyncResponse
import com.qwill.app.model.PublicUser
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import com.qwill.app.net.RequestGuid
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MessagesControllerTest {
    private val queue = ManualQueue()
    private val transport = FakeTransport()
    private val file = tempDatabase()
    private val updating = ArrayList<Boolean>()
    private val updates = ArrayList<FeedUpdate>()
    private val user = PublicUser(ME, "me", "Я")
    private var holds = 0
    private var dataSaver = false
    private lateinit var storage: MessagesStorage
    private lateinit var controller: MessagesController

    private fun start(): MessagesController {
        storage = MessagesStorage(file, JdbcSqlDatabase.OPENER) {}
        controller = MessagesController(
            storage = storage,
            storageQueue = queue,
            main = queue,
            transport = transport,
            me = { user },
            seedPresence = { _, _ -> },
            setUpdating = { updating.add(it) },
            holdSocket = {
                holds++
                val release: () -> Unit = { holds-- }
                release
            },
            dataSaver = { dataSaver },
            clock = { queue.now + 1 },
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

    private fun serveChats(vararg chats: ChatListItemDto) {
        transport.chatList = { ApiResult.Success(ChatListResponse(chats.toList())) }
    }

    private fun callback(pages: MutableList<HistoryPage>, errors: MutableList<ApiException> = ArrayList()) = object : HistoryCallback {
        override fun onHistory(page: HistoryPage) {
            pages.add(page)
        }

        override fun onHistoryFailed(error: ApiException) {
            errors.add(error)
        }
    }

    private fun sendOffline(chatId: String = "c1", text: String = "привет"): String {
        transport.send = { ApiResult.Failure(NetworkError()) }
        controller.sendText(chatId, text)
        return transport.sent.last().clientId
    }

    private inline fun <reified T : FeedUpdate> updatesOf(): List<T> = updates.filterIsInstance<T>()

    @Test
    fun chatListFromDiskIsPublishedBeforeNetwork() {
        seed { replaceChats(listOf(chat("disk"))) }
        start()
        assertEquals(listOf("disk"), controller.chats.map { it.id })
        assertTrue(transport.calls.isEmpty())
    }

    @Test
    fun entryDrainsOutboxBeforeChatListAndReplacesTable() {
        seed { replaceChats(listOf(chat("stale"))) }
        start()
        val clientId = sendOffline()
        transport.calls.clear()
        transport.send = { null }
        serveChats(chat("c1"))

        controller.onSocketConnected()

        assertEquals(listOf("send:$clientId", "chats"), transport.calls)
        assertEquals(listOf("c1"), controller.chats.map { it.id })
        assertEquals(listOf("c1"), storage.readChats().map { it.id })
        assertEquals(listOf(true, false), updating)
        assertTrue(controller.lastCatchUpAt > 0)
    }

    @Test
    fun updatingGoesOffWhenChatListFails() {
        start()
        transport.chatList = { ApiResult.Failure(NetworkError()) }
        controller.onSocketConnected()
        assertEquals(listOf(true, false), updating)
        assertEquals(0L, controller.lastCatchUpAt)
    }

    @Test
    fun updatingGoesOffWhenSyncBreaksMidway() {
        seed {
            applyTail("c1", listOf(message(1, "c1")))
            applyTail("c2", listOf(message(1, "c2")))
        }
        start()
        serveChats(chat("c1", last = message(5, "c1")), chat("c2", last = message(5, "c2")))
        transport.sync = { _, _ -> ApiResult.Failure(NetworkError()) }

        controller.onSocketConnected()

        assertEquals(listOf(true, false), updating)
        assertEquals(1, transport.callsStartingWith("sync:").size)
    }

    @Test
    fun syncOnlyChatsWithNewerLastMessage() {
        seed {
            applyTail("same", listOf(message(10, "same")))
            applyTail("behind", listOf(message(5, "behind")))
        }
        start()
        serveChats(chat("same", last = message(10, "same")), chat("behind", last = message(8, "behind")), chat("fresh", last = message(3, "fresh")))

        controller.onSocketConnected()

        assertEquals(listOf("sync:behind:5"), transport.callsStartingWith("sync:"))
        assertTrue(transport.callsStartingWith("messages:").isEmpty())
    }

    @Test
    fun syncAppliesChangesAndRepeatsWhileHasMore() {
        seed { applyTail("c1", listOf(message(1), message(2), message(3))) }
        start()
        serveChats(chat("c1", last = message(10)))
        transport.sync = { _, cursor ->
            when (cursor.maxId) {
                3L -> ApiResult.Success(
                    MessagesSyncResponse(
                        created = (4L..6L).map { message(it) },
                        changed = listOf(message(1, content = "правка"), message(2, deleted = true)),
                        maxId = 6,
                        maxUpdatedAt = time(60),
                        hasMore = true,
                    ),
                )
                else -> ApiResult.Success(MessagesSyncResponse(created = (7L..10L).map { message(it) }, maxId = 10, maxUpdatedAt = time(70)))
            }
        }

        controller.onSocketConnected()

        assertEquals(listOf("sync:c1:3", "sync:c1:6"), transport.callsStartingWith("sync:"))
        assertEquals(listOf(1L, 3L, 4L, 5L, 6L, 7L, 8L, 9L, 10L), storage.readTail("c1", 50).map { it.id })
        assertEquals("правка", storage.readMessage("c1", 1)!!.content)
        assertEquals(SyncCursor(10, time(70)), storage.readCursor("c1"))
        assertEquals(listOf(listOf(2L)), updatesOf<FeedUpdate.Removed>().map { it.ids })
        assertEquals(2, updatesOf<FeedUpdate.Added>().size)
    }

    @Test
    fun tooLongSyncResetsHistoryAfterFivePages() {
        seed {
            applyTail("c1", listOf(message(1), message(2)))
            addRange("c1", 1, 1)
        }
        start()
        serveChats(chat("c1", last = message(5000)))
        transport.sync = { _, cursor ->
            ApiResult.Success(MessagesSyncResponse(created = listOf(message(cursor.maxId + 1)), maxId = cursor.maxId + 1, maxUpdatedAt = time(cursor.maxId), hasMore = true))
        }
        transport.messages = { _, _, _ -> ApiResult.Success(MessagesPage(listOf(message(4999), message(5000)), hasMore = true)) }

        controller.onSocketConnected()

        assertEquals(5, transport.callsStartingWith("sync:").size)
        assertEquals(listOf("messages:c1:-:-"), transport.callsStartingWith("messages:"))
        assertEquals(listOf(4999L, 5000L), storage.readTail("c1", 50).map { it.id })
        assertTrue(storage.readRanges("c1").isEmpty())
        assertEquals(SyncCursor(5000, time(5000)), storage.readCursor("c1"))
        assertEquals(1, updatesOf<FeedUpdate.Replaced>().size)
        assertEquals(listOf(true, false), updating)
    }

    @Test
    fun chatWithoutCursorGetsTailInsteadOfSyncFromZero() {
        start()
        transport.messages = { _, _, _ -> ApiResult.Success(MessagesPage((51L..100L).map { message(it) }, hasMore = true)) }
        val pages = ArrayList<HistoryPage>()

        controller.openChat("c1", RequestGuid.next(), callback(pages))

        assertTrue(transport.callsStartingWith("sync:").isEmpty())
        assertEquals(listOf("messages:c1:-:-"), transport.callsStartingWith("messages:"))
        assertEquals(SyncCursor(100, time(100)), storage.readCursor("c1"))
        assertEquals(listOf(HistorySource.DISK, HistorySource.NETWORK), pages.map { it.source })
        assertEquals(50, pages.last().messages.size)
        assertTrue(pages.last().hasMoreBefore)
        assertTrue(storage.readRanges("c1").isEmpty())
    }

    @Test
    fun openedChatIsSyncedFirstOnEntry() {
        seed {
            applyTail("a", listOf(message(1, "a")))
            applyTail("b", listOf(message(1, "b")))
        }
        start()
        transport.sync = { _, _ -> ApiResult.Failure(NetworkError()) }
        controller.openChat("b", RequestGuid.next(), callback(ArrayList()))
        transport.sync = { _, _ -> ApiResult.Success(MessagesSyncResponse()) }
        transport.calls.clear()
        serveChats(chat("a", last = message(9, "a")), chat("b", last = message(1, "b")))

        controller.onSocketConnected()

        assertEquals(listOf("sync:b:1", "sync:a:1"), transport.callsStartingWith("sync:"))
    }

    @Test
    fun pageInsideRangeComesFromDiskWithoutNetwork() {
        seed {
            putMessages((1L..100L).map { message(it) })
            addRange("c1", 1, 60)
        }
        start()
        val pages = ArrayList<HistoryPage>()

        controller.loadOlder("c1", 61, RequestGuid.next(), callback(pages))
        controller.loadOlder("c1", 11, RequestGuid.next(), callback(pages))

        assertTrue(transport.calls.isEmpty())
        assertEquals((11L..60L).toList(), pages[0].messages.map { it.id })
        assertEquals((1L..10L).toList(), pages[1].messages.map { it.id })
        assertTrue(pages.all { it.source == HistorySource.DISK })

        transport.messages = { _, _, _ -> ApiResult.Success(MessagesPage(emptyList(), hasMore = false)) }
        controller.loadOlder("c1", 1, RequestGuid.next(), callback(pages))
        assertEquals(listOf("messages:c1:1:-"), transport.calls)
        assertFalse(pages.last().hasMoreBefore)
    }

    @Test
    fun networkPageRecordsRangeAndSecondPassComesFromDisk() {
        start()
        transport.messages = { _, before, _ ->
            if (before == null) {
                ApiResult.Success(MessagesPage((51L..100L).map { message(it) }, hasMore = true))
            } else {
                ApiResult.Success(MessagesPage((1L..50L).map { message(it) }, hasMore = false))
            }
        }
        val pages = ArrayList<HistoryPage>()
        controller.openChat("c1", RequestGuid.next(), callback(pages))
        controller.loadOlder("c1", 51, RequestGuid.next(), callback(pages))

        assertEquals(listOf(MessageRange(1, 50)), storage.readRanges("c1"))
        transport.calls.clear()

        controller.loadOlder("c1", 51, RequestGuid.next(), callback(pages))
        assertTrue(transport.calls.isEmpty())
        assertEquals(HistorySource.DISK, pages.last().source)
        assertEquals((1L..50L).toList(), pages.last().messages.map { it.id })
    }

    @Test
    fun aroundWindowDoesNotRecordRange() {
        start()
        transport.around = { _, _ -> ApiResult.Success(com.qwill.app.model.MessagesAround((40L..60L).map { message(it) }, true, true)) }
        val pages = ArrayList<HistoryPage>()
        controller.openChatAt("c1", 50, RequestGuid.next(), callback(pages))
        assertEquals(21, pages.single().messages.size)
        assertTrue(storage.readRanges("c1").isEmpty())
        assertEquals(21, storage.readTail("c1", 100).size)
    }

    @Test
    fun offlineOpenOfEmptyChatIsMarkedOffline() {
        start()
        transport.messages = { _, _, _ -> ApiResult.Failure(NetworkError()) }
        val pages = ArrayList<HistoryPage>()
        controller.openChat("c1", RequestGuid.next(), callback(pages))
        assertTrue(pages.last().offline)
    }

    @Test
    fun cancelledOwnerGetsNoCallbacks() {
        start()
        val guid = RequestGuid.next()
        transport.messages = { _, _, _ -> null }
        val pages = ArrayList<HistoryPage>()
        controller.cancelRequestsForGuid(guid)
        controller.openChat("c1", guid, callback(pages))
        assertTrue(pages.isEmpty())
    }

    @Test
    fun acceptedSendRemovesRowAndReplacesByClientId() {
        start()
        serveChats(chat("c1"))
        controller.onSocketConnected()
        transport.send = { null }

        controller.sendText("c1", "привет")
        assertEquals(1, holds)
        val pending = updatesOf<FeedUpdate.Pending>().single().message
        assertTrue(pending.id < 0)
        assertEquals(1, storage.readUnsent().size)

        val clientId = transport.sent.single().clientId
        transport.heldSends.single().reply(ApiResult.Success(message(10, sender = ME, clientId = clientId)))

        assertTrue(storage.readUnsent().isEmpty())
        assertEquals(listOf(10L), storage.readTail("c1", 50).map { it.id })
        assertEquals(clientId, updatesOf<FeedUpdate.Sent>().single().clientId)
        assertEquals(10L, controller.chats.single().lastMessage?.id)
        assertEquals(0, controller.chats.single().unreadCount)
        assertEquals(0, holds)
    }

    @Test
    fun rateLimitedRetriesWithGrowingPauseUpToTwelveTimes() {
        start()
        transport.send = { ApiResult.Failure(ApiError(0, ErrorCode.RATE_LIMITED, "Слишком часто")) }
        controller.sendText("c1", "привет")

        val delays = ArrayList<Long>()
        repeat(15) {
            val next = queue.pendingDelays().firstOrNull { it < 3_600_000 } ?: return@repeat
            delays.add(next)
            queue.advance(next)
        }

        assertEquals(listOf(1_000L, 2_000L, 4_000L, 8_000L, 16_000L, 32_000L, 60_000L, 60_000L, 60_000L, 60_000L, 60_000L, 60_000L), delays)
        assertEquals(13, transport.sent.size)
        assertEquals(1, storage.readUnsent().size)
        assertTrue(updatesOf<FeedUpdate.Failed>().isEmpty())
    }

    @Test
    fun blockedDropsRowWithoutTextAndReloadsChat() {
        start()
        transport.send = { ApiResult.Failure(ApiError(0, ErrorCode.BLOCKED, "Вы заблокированы")) }
        controller.sendText("c1", "привет")
        assertTrue(storage.readUnsent().isEmpty())
        assertNull(updatesOf<FeedUpdate.Failed>().single().reason)
        assertEquals(listOf("chat:c1"), transport.callsStartingWith("chat:"))
    }

    @Test
    fun otherRejectionDropsRowWithServerText() {
        start()
        transport.send = { ApiResult.Failure(ApiError(0, ErrorCode.VALIDATION_FAILED, "Пустое сообщение")) }
        controller.sendText("c1", "привет")
        assertTrue(storage.readUnsent().isEmpty())
        assertEquals("Пустое сообщение", updatesOf<FeedUpdate.Failed>().single().reason)
    }

    @Test
    fun networkFailuresKeepRowAndItLeavesOnceOnNextEntry() {
        for (failure in listOf<ApiException>(NetworkError(), NoResponseError())) {
            updates.clear()
            transport.sent.clear()
            transport.calls.clear()
            if (!::controller.isInitialized) start()
            transport.send = { ApiResult.Failure(failure) }
            controller.sendText("c1", "привет")
            val clientId = transport.sent.single().clientId
            assertEquals(1, storage.readUnsent().size)
            assertTrue(updatesOf<FeedUpdate.Failed>().isEmpty())

            transport.send = { payload -> ApiResult.Success(message(20, sender = ME, clientId = payload.clientId)) }
            controller.onSocketConnected()

            assertEquals(listOf(clientId, clientId), transport.sent.map { it.clientId })
            assertTrue(storage.readUnsent().isEmpty())
            storage.deleteMessages("c1", listOf(20))
        }
    }

    @Test
    fun restartRestoresPendingAndSendsOnFirstEntry() {
        start()
        val clientId = sendOffline()
        storage.close()

        transport.sent.clear()
        start()
        val pages = ArrayList<HistoryPage>()
        transport.messages = { _, _, _ -> ApiResult.Failure(NetworkError()) }
        controller.openChat("c1", RequestGuid.next(), callback(pages))
        assertEquals(listOf(clientId), pages.first().pending.map { it.clientId })

        transport.send = { payload -> ApiResult.Success(message(30, sender = ME, clientId = payload.clientId)) }
        controller.onSocketConnected()
        assertEquals(listOf(clientId), transport.sent.map { it.clientId })
        assertTrue(storage.readUnsent().isEmpty())
    }

    @Test
    fun incomingMessageUpdatesListAndUnread() {
        start()
        serveChats(chat("c1"), chat("c2"))
        controller.onSocketConnected()

        controller.applyIncomingMessage(message(1, "c1"))
        controller.applyIncomingMessage(message(2, "c1", sender = ME))
        controller.setLiveChat("c2")
        controller.applyIncomingMessage(message(3, "c2"))

        val c1 = controller.chats.first { it.id == "c1" }
        assertEquals(1, c1.unreadCount)
        assertEquals(2L, c1.lastMessage?.id)
        assertEquals(0, controller.chats.first { it.id == "c2" }.unreadCount)
        assertEquals("c2", controller.chats.first().id)
        assertEquals(listOf(1L, 2L), storage.readTail("c1", 50).map { it.id })
        assertEquals(2L, storage.readChats().first { it.id == "c1" }.lastMessage?.id)

        controller.applyIncomingMessage(message(4, "unknown"))
        assertEquals(listOf("chat:unknown"), transport.callsStartingWith("chat:"))
    }

    @Test
    fun incomingCopyOfOwnPendingConfirmsIt() {
        start()
        val clientId = sendOffline()
        controller.applyIncomingMessage(message(40, sender = ME, clientId = clientId))
        assertTrue(storage.readUnsent().isEmpty())
        assertEquals(clientId, updatesOf<FeedUpdate.Sent>().single().clientId)
    }

    @Test
    fun updateAndDeleteTouchDiskListAndPin() {
        seed {
            putMessages(listOf(message(1), message(2), message(3)))
            putDetails(details("c1", pinned = message(3)))
        }
        start()
        serveChats(chat("c1", last = message(3)))
        controller.onSocketConnected()

        controller.applyMessageUpdate(message(3, content = "правка"))
        assertEquals("правка", storage.readMessage("c1", 3)!!.content)
        assertEquals("правка", controller.chats.single().lastMessage?.content)
        assertEquals("правка", storage.readDetails("c1")!!.pinnedMessage?.content)

        controller.applyMessageUpdate(message(3, deleted = true))
        assertNull(storage.readMessage("c1", 3))
        assertEquals(2L, controller.chats.single().lastMessage?.id)
        assertNull(storage.readDetails("c1")!!.pinnedMessage)
        assertEquals(listOf(listOf(3L)), updatesOf<FeedUpdate.Removed>().map { it.ids })

        controller.applyMessageUpdate(message(99, content = "нет на диске"))
        assertNull(storage.readMessage("c1", 99))
    }

    @Test
    fun reactionPinReadCreateUpdateBlockEvents() {
        seed {
            putMessages(listOf(message(1)))
            putDetails(details("c1"))
        }
        start()
        serveChats(chat("c1", last = message(1), unread = 4))
        controller.onSocketConnected()

        val reactions = listOf(MessageReactionDto("🔥", listOf(PEER)))
        controller.applyReactionUpdate(MessageReactionEvent("c1", 1, reactions))
        assertEquals(reactions, storage.readMessage("c1", 1)!!.reactions)
        assertEquals(reactions, controller.chats.single().lastMessage?.reactions)

        controller.applyChatPinned(ChatPinnedEvent("c1", message(1)))
        assertEquals(1L, storage.readDetails("c1")!!.pinnedMessage?.id)

        controller.applyChatRead(ChatReadEvent("c1", PEER, 1))
        assertEquals(1L, storage.readDetails("c1")!!.readCursors[PEER])
        assertEquals(4, controller.chats.single().unreadCount)
        controller.applyChatRead(ChatReadEvent("c1", ME, 1))
        assertEquals(0, controller.chats.single().unreadCount)

        controller.applyChatDetail(details("c9"))
        assertTrue(controller.chats.any { it.id == "c9" })
        assertEquals("c9", storage.readDetails("c9")?.id)
        assertTrue(storage.readChats().any { it.id == "c9" })

        controller.applyChatUpdated(ChatUpdatedEvent("c1", "Новое имя", null, time(9)))
        assertEquals("Новое имя", controller.chats.first { it.id == "c1" }.title)
        assertEquals("Новое имя", storage.readDetails("c1")!!.title)

        controller.applyChatBlock(ChatBlockEvent("c1", PEER, iBlocked = true, blockedMe = false))
        assertTrue(controller.chats.first { it.id == "c1" }.iBlocked)
        assertTrue(storage.readChats().first { it.id == "c1" }.iBlocked)
    }

    @Test
    fun deletedChatLosesEverything() {
        seed {
            applyTail("c1", listOf(message(1), message(2)))
            addRange("c1", 1, 1)
            putDetails(details("c1"))
        }
        start()
        serveChats(chat("c1", last = message(2)), chat("c2"))
        controller.onSocketConnected()
        sendOffline("c1")

        controller.applyChatDeleted("c1")

        assertEquals(listOf("c2"), controller.chats.map { it.id })
        assertTrue(storage.readTail("c1", 50).isEmpty())
        assertTrue(storage.readRanges("c1").isEmpty())
        assertNull(storage.readCursor("c1"))
        assertNull(storage.readDetails("c1"))
        assertTrue(storage.readUnsent().isEmpty())
        assertFalse(updatesOf<FeedUpdate.ChatGone>().single().kicked)
    }

    @Test
    fun removedFromGroupKeepsHistory() {
        seed {
            applyTail("g1", listOf(message(1, "g1")))
            putDetails(details("g1"))
        }
        start()
        serveChats(chat("g1", last = message(1, "g1")))
        controller.onSocketConnected()

        controller.applyMemberChanged(MemberChangedEvent(MemberChangedEvent.REMOVED, "g1", userId = PEER))
        assertEquals(listOf(ME), storage.readDetails("g1")!!.members.map { it.id })
        assertEquals(1, controller.chats.size)

        controller.applyMemberChanged(MemberChangedEvent(MemberChangedEvent.REMOVED, "g1", userId = ME))
        assertTrue(controller.chats.isEmpty())
        assertTrue(storage.readChats().isEmpty())
        assertEquals(1, storage.readTail("g1", 50).size)
        assertTrue(updatesOf<FeedUpdate.ChatGone>().single().kicked)
    }

    @Test
    fun preloadTopTenWithoutHistoryPausingForSends() {
        seed {
            applyTail("c2", listOf(message(1, "c2")))
            putMessages(listOf(message(1, "c5")))
        }
        start()
        val chats = (1..12).map { chat("c$it", updatedAt = time(100L - it)) }.toTypedArray()
        serveChats(*chats)
        transport.messages = { chatId, _, _ -> ApiResult.Success(MessagesPage(listOf(message(1, chatId)))) }
        controller.onSocketConnected()
        assertTrue(transport.callsStartingWith("messages:").isEmpty())

        transport.send = { null }
        controller.sendText("c1", "занят")
        queue.advance(400)
        queue.advance(400)
        assertTrue(transport.callsStartingWith("messages:").isEmpty())

        transport.heldSends.single().reply(ApiResult.Success(message(50, sender = ME, clientId = transport.sent.single().clientId)))
        repeat(20) { queue.advance(400) }

        val loaded = transport.callsStartingWith("messages:").map { it.split(":")[1] }
        assertEquals(listOf("c3", "c4", "c6", "c7", "c8", "c9", "c10"), loaded)
        assertEquals(SyncCursor(1, time(1)), storage.readCursor("c3"))
    }

    @Test
    fun preloadSkipsOnDataSaverAndResumesAfterNetworkLoss() {
        start()
        serveChats(chat("a", updatedAt = time(3)), chat("b", updatedAt = time(2)))
        dataSaver = true
        controller.onSocketConnected()
        repeat(5) { queue.advance(400) }
        assertTrue(transport.callsStartingWith("messages:").isEmpty())

        controller.onSessionCleared()
        dataSaver = false
        controller.onSessionState(SessionState.Authenticated(user, confirmed = true))
        transport.messages = { _, _, _ -> ApiResult.Failure(NetworkError()) }
        controller.onSocketConnected()
        repeat(5) { queue.advance(400) }
        assertEquals(listOf("messages:a:-:-"), transport.callsStartingWith("messages:"))

        transport.messages = { chatId, _, _ -> ApiResult.Success(MessagesPage(listOf(message(1, chatId)))) }
        controller.onSocketConnected()
        repeat(5) { queue.advance(400) }
        assertEquals(listOf("messages:a:-:-", "messages:a:-:-", "messages:b:-:-"), transport.callsStartingWith("messages:"))
    }

    @Test
    fun sessionClearWipesFileListAndPendingCallbacks() {
        start()
        serveChats(chat("c1"))
        controller.onSocketConnected()
        transport.send = { null }
        controller.sendText("c1", "привет")
        transport.messages = { _, _, _ -> null }
        val pages = ArrayList<HistoryPage>()
        controller.loadOlder("c1", 10, RequestGuid.next(), callback(pages))
        val held = transport.heldSends.single()
        updates.clear()
        val chatsSeen = ArrayList<Int>()
        controller.addChatsListener { chatsSeen.add(controller.chats.size) }

        controller.onSessionCleared()

        assertFalse(file.exists())
        assertTrue(controller.chats.isEmpty())
        assertEquals(listOf(0), chatsSeen)
        held.reply(ApiResult.Success(message(1, sender = ME, clientId = held.call.removePrefix("send:"))))
        assertTrue(updates.isEmpty())
        assertTrue(pages.isEmpty())
        assertEquals(0, holds)
        assertEquals(false, updating.last())
    }

    @Test
    fun wipeKeepsSessionAndEmptiesListUntilNextEntry() {
        seed { replaceChats(listOf(chat("c1"))) }
        start()
        controller.wipeStorage()
        assertTrue(controller.chats.isEmpty())
        assertTrue(storage.readChats().isEmpty())
        serveChats(chat("c2"))
        controller.onSocketConnected()
        assertEquals(listOf("c2"), controller.chats.map { it.id })
        assertEquals(listOf("c2"), storage.readChats().map { it.id })
    }
}
