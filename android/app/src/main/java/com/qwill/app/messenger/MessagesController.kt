package com.qwill.app.messenger

import com.qwill.app.auth.SessionState
import com.qwill.app.core.TaskQueue
import com.qwill.app.database.MessagesStorage
import com.qwill.app.database.PageSide
import com.qwill.app.database.StorageStats
import com.qwill.app.database.SyncCursor
import com.qwill.app.model.ChatBlockEvent
import com.qwill.app.model.ChatDeletedEvent
import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.model.ChatPinnedEvent
import com.qwill.app.model.ChatReadEvent
import com.qwill.app.model.ChatUpdatedEvent
import com.qwill.app.model.MemberChangedEvent
import com.qwill.app.model.MessageDeletedBatchEvent
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageReactionEvent
import com.qwill.app.model.MessageUpdatedEvent
import com.qwill.app.model.PublicUser
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import com.qwill.app.net.RequestGuid
import com.qwill.app.realtime.SocketConnection
import com.qwill.app.realtime.SocketEvent

class MessagesController(
    private val storage: MessagesStorage,
    private val storageQueue: TaskQueue,
    private val main: TaskQueue,
    private val transport: MessagesTransport,
    private val me: () -> PublicUser?,
    private val seedPresence: (userId: String, lastSeenAt: String) -> Unit,
    private val setUpdating: (Boolean) -> Unit,
    holdSocket: () -> () -> Unit,
    private val dataSaver: () -> Boolean,
    private val timings: MessagesTimings = MessagesTimings(),
    clock: () -> Long = System::currentTimeMillis,
) : SendMessagesHelper.Host {
    private sealed class SyncOutcome {
        object Done : SyncOutcome()

        class Failed(val error: ApiException) : SyncOutcome()
    }

    private val guid = RequestGuid.next()
    private val chatsListeners = ArrayList<ChatsListener>()
    private val feedListeners = ArrayList<FeedListener>()
    private val cancelledGuids = HashSet<Int>()
    private val syncWaiters = HashMap<String, MutableList<(SyncOutcome) -> Unit>>()
    private val preloadQueue = ArrayDeque<String>()
    private val clock = clock

    override var epoch = 0
        private set

    var chats: List<ChatListItemDto> = emptyList()
        private set

    var lastCatchUpAt = 0L
        private set

    var lastCatchUpChats = 0
        private set

    var openedChatId: String? = null
        private set

    private var liveChatId: String? = null
    private var started = false
    private var chatsFromNetwork = false
    private var entryGeneration = 0
    private var preloadStarted = false
    private var preloadWaiting = false
    private val preloadTask = Runnable { preloadStep() }
    private val cleanupTask = object : Runnable {
        override fun run() {
            prune()
            main.postDelayed(this, timings.cleanupIntervalMs)
        }
    }

    private val sender = SendMessagesHelper(storage, storageQueue, main, transport, holdSocket, timings, clock, guid, this)

    val isSending: Boolean get() = sender.isSending

    fun attach(socket: SocketConnection) {
        val none = RequestGuid.NONE
        socket.subscribe(SocketEvent.MESSAGE_NEW, MessageDto.serializer(), none) { applyIncomingMessage(it) }
        socket.subscribe(SocketEvent.MESSAGE_UPDATED, MessageUpdatedEvent.serializer(), none) { applyMessageUpdate(it.message) }
        socket.subscribe(SocketEvent.MESSAGE_DELETED, MessageUpdatedEvent.serializer(), none) { applyMessageUpdate(it.message) }
        socket.subscribe(SocketEvent.MESSAGE_DELETED_BATCH, MessageDeletedBatchEvent.serializer(), none) { event ->
            for (message in event.messages) applyMessageUpdate(message)
        }
        socket.subscribe(SocketEvent.MESSAGE_REACTION, MessageReactionEvent.serializer(), none) { applyReactionUpdate(it) }
        socket.subscribe(SocketEvent.CHAT_PINNED, ChatPinnedEvent.serializer(), none) { applyChatPinned(it) }
        socket.subscribe(SocketEvent.CHAT_READ, ChatReadEvent.serializer(), none) { applyChatRead(it) }
        socket.subscribe(SocketEvent.CHAT_CREATED, ChatDto.serializer(), none) { applyChatDetail(it) }
        socket.subscribe(SocketEvent.CHAT_UPDATED, ChatUpdatedEvent.serializer(), none) { applyChatUpdated(it) }
        socket.subscribe(SocketEvent.CHAT_BLOCK, ChatBlockEvent.serializer(), none) { applyChatBlock(it) }
        socket.subscribe(SocketEvent.CHAT_DELETED, ChatDeletedEvent.serializer(), none) { applyChatDeleted(it.chatId) }
        socket.subscribe(SocketEvent.MEMBER_CHANGED, MemberChangedEvent.serializer(), none) { applyMemberChanged(it) }
        socket.addConnectedListener { onSocketConnected() }
    }

    fun addChatsListener(listener: ChatsListener) {
        chatsListeners.add(listener)
    }

    fun removeChatsListener(listener: ChatsListener) {
        chatsListeners.remove(listener)
    }

    fun addFeedListener(listener: FeedListener) {
        feedListeners.add(listener)
    }

    fun removeFeedListener(listener: FeedListener) {
        feedListeners.remove(listener)
    }

    fun cancelRequestsForGuid(guid: Int) {
        if (guid != RequestGuid.NONE) cancelledGuids.add(guid)
    }

    fun onSessionState(state: SessionState) {
        if (state is SessionState.Authenticated) start()
    }

    fun onSessionCleared() {
        stop()
        chats = emptyList()
        chatsFromNetwork = false
        notifyChats()
        storageQueue.post { storage.wipe() }
    }

    fun wipeStorage() {
        val wasStarted = started
        stop()
        chats = emptyList()
        chatsFromNetwork = false
        notifyChats()
        storageQueue.post {
            storage.wipe()
            storage.open()
        }
        if (wasStarted) {
            started = true
            main.postDelayed(cleanupTask, timings.cleanupIntervalMs)
        }
    }

    fun setLiveChat(chatId: String?) {
        liveChatId = chatId
    }

    fun closeChat(chatId: String) {
        if (openedChatId == chatId) openedChatId = null
        if (liveChatId == chatId) liveChatId = null
    }

    fun stats(callback: (StorageStats) -> Unit) {
        val current = epoch
        storageQueue.post {
            val stats = storage.stats()
            main.post { if (current == epoch) callback(stats) }
        }
    }

    fun sendText(chatId: String, text: String, replyTo: MessageDto? = null, callback: SendCallback? = null) {
        sender.sendText(chatId, text, me()?.let { asSender(it) }, replyTo, callback)
    }

    fun openChat(chatId: String, requestGuid: Int, callback: HistoryCallback) {
        openedChatId = chatId
        val current = epoch
        storageQueue.post {
            val tail = storage.readTail(chatId, timings.pageSize)
            val pending = storage.readUnsent(chatId).map { it.message }
            val details = storage.readDetails(chatId)
            main.post {
                if (!alive(current, requestGuid)) return@post
                callback.onHistory(HistoryPage(chatId, tail, pending, tail.isNotEmpty(), false, HistorySource.DISK))
                if (details != null) callback.onDetails(details, HistorySource.DISK)
                loadDetails(chatId, requestGuid, callback)
                refreshOpenedHistory(chatId, tail.isEmpty() && pending.isEmpty(), requestGuid, callback)
            }
        }
    }

    fun openChatAt(chatId: String, messageId: Long, requestGuid: Int, callback: HistoryCallback) {
        openedChatId = chatId
        val current = epoch
        transport.getMessagesAround(chatId, messageId, requestGuid) { result ->
            if (!alive(current, requestGuid)) return@getMessagesAround
            when (result) {
                is ApiResult.Failure -> callback.onHistoryFailed(result.error)
                is ApiResult.Success -> {
                    val around = result.value
                    storageQueue.post { storage.putMessages(around.messages) }
                    callback.onHistory(
                        HistoryPage(chatId, alive(around.messages), emptyList(), around.hasMoreBefore, around.hasMoreAfter, HistorySource.NETWORK),
                    )
                }
            }
        }
    }

    fun loadOlder(chatId: String, edgeId: Long, requestGuid: Int, callback: HistoryCallback) {
        loadPage(chatId, PageSide.OLDER, edgeId, requestGuid, callback)
    }

    fun loadNewer(chatId: String, edgeId: Long, requestGuid: Int, callback: HistoryCallback) {
        loadPage(chatId, PageSide.NEWER, edgeId, requestGuid, callback)
    }

    fun onSocketConnected() {
        if (!started) return
        val generation = ++entryGeneration
        setUpdating(true)
        sender.resetRetry()
        if (preloadWaiting) {
            preloadWaiting = false
            main.postDelayed(preloadTask, timings.preloadIntervalMs)
        }
        sender.drain { if (generation == entryGeneration) loadChatList(generation) }
    }

    fun applyIncomingMessage(message: MessageDto) {
        val current = epoch
        val clientId = message.clientId
        storageQueue.post {
            val confirmed = clientId != null && storage.confirmUnsent(clientId, message)
            if (!confirmed) storage.putMessages(listOf(message))
            main.post {
                if (current != epoch) return@post
                if (confirmed) notify(FeedUpdate.Sent(message.chatId, clientId!!, message)) else notify(FeedUpdate.Added(message.chatId, listOf(message)))
                touchChat(message)
            }
        }
    }

    fun applyMessageUpdate(message: MessageDto) {
        val current = epoch
        val chatId = message.chatId
        val wasLast = chats.firstOrNull { it.id == chatId }?.lastMessage?.id == message.id
        if (message.deletedAt != null) {
            storageQueue.post {
                storage.deleteMessages(chatId, listOf(message.id))
                val previous = if (wasLast) storage.newestBefore(chatId, message.id) else null
                var unpinned = false
                val details = storage.updateDetails(chatId) {
                    unpinned = it.pinnedMessage?.id == message.id
                    if (unpinned) it.copy(pinnedMessage = null) else it
                }
                main.post {
                    if (current != epoch) return@post
                    notify(FeedUpdate.Removed(chatId, listOf(message.id)))
                    if (wasLast) updateChat(chatId) { if (it.lastMessage?.id == message.id) it.copy(lastMessage = previous) else it }
                    if (details != null && unpinned) notify(FeedUpdate.DetailsChanged(chatId, details))
                }
            }
            return
        }
        storageQueue.post {
            storage.updateMessages(listOf(message))
            val details = storage.updateDetails(chatId) { if (it.pinnedMessage?.id == message.id) it.copy(pinnedMessage = message) else it }
            main.post {
                if (current != epoch) return@post
                notify(FeedUpdate.Changed(chatId, listOf(message)))
                updateChat(chatId) { if (it.lastMessage?.id == message.id) it.copy(lastMessage = message) else it }
                if (details?.pinnedMessage?.id == message.id) notify(FeedUpdate.DetailsChanged(chatId, details))
            }
        }
    }

    fun applyReactionUpdate(event: MessageReactionEvent) {
        val current = epoch
        storageQueue.post {
            storage.updateReactions(event.chatId, event.messageId, event.reactions)
            main.post {
                if (current != epoch) return@post
                notify(FeedUpdate.ReactionsChanged(event.chatId, event.messageId, event.reactions))
                updateChat(event.chatId) { chat ->
                    val last = chat.lastMessage
                    if (last?.id == event.messageId) chat.copy(lastMessage = last.copy(reactions = event.reactions)) else chat
                }
            }
        }
    }

    fun applyChatPinned(event: ChatPinnedEvent) {
        updateDetails(event.chatId) { it.copy(pinnedMessage = event.message) }
    }

    fun applyChatRead(event: ChatReadEvent) {
        updateDetails(event.chatId) { it.copy(readCursors = it.readCursors + (event.userId to event.lastReadMessageId)) }
        if (event.userId == me()?.id) updateChat(event.chatId) { it.copy(unreadCount = 0) }
    }

    fun applyChatDetail(chat: ChatDto) {
        val current = epoch
        storageQueue.post {
            storage.putDetails(chat)
            main.post {
                if (current != epoch) return@post
                for (member in chat.members) seedPresence(member.id, member.lastSeenAt)
                upsertChat(chat.toListItem())
                notify(FeedUpdate.DetailsChanged(chat.id, chat))
            }
        }
    }

    fun applyChatUpdated(event: ChatUpdatedEvent) {
        updateChat(event.chatId) { it.copy(title = event.title, avatarUrl = event.avatarUrl) }
        updateDetails(event.chatId) { it.copy(title = event.title, avatarUrl = event.avatarUrl) }
    }

    fun applyChatBlock(event: ChatBlockEvent) {
        updateChat(event.chatId) { it.copy(iBlocked = event.iBlocked, blockedMe = event.blockedMe) }
        updateDetails(event.chatId) { it.copy(iBlocked = event.iBlocked, blockedMe = event.blockedMe) }
    }

    fun applyChatDeleted(chatId: String) {
        val current = epoch
        chats = chats.filter { it.id != chatId }
        notifyChats()
        preloadQueue.remove(chatId)
        storageQueue.post {
            storage.removeChat(chatId)
            main.post { if (current == epoch) notify(FeedUpdate.ChatGone(chatId, kicked = false)) }
        }
    }

    fun applyMemberChanged(event: MemberChangedEvent) {
        val selfGone = (event.type == MemberChangedEvent.REMOVED || event.type == MemberChangedEvent.LEFT) && event.userId == me()?.id
        updateDetails(event.chatId) { chat ->
            when (event.type) {
                MemberChangedEvent.ADDED -> {
                    val member = event.member ?: return@updateDetails chat
                    if (chat.members.any { it.id == member.userId }) chat
                    else chat.copy(members = chat.members + ChatMemberSummary(member.userId, member.username, member.displayName, member.avatarUrl, member.avatarColor))
                }
                MemberChangedEvent.REMOVED, MemberChangedEvent.LEFT -> chat.copy(members = chat.members.filter { it.id != event.userId })
                else -> chat
            }
        }
        if (!selfGone) return
        val current = epoch
        chats = chats.filter { it.id != event.chatId }
        notifyChats()
        storageQueue.post {
            storage.removeChatRow(event.chatId)
            main.post { if (current == epoch) notify(FeedUpdate.ChatGone(event.chatId, kicked = true)) }
        }
    }

    override fun notify(update: FeedUpdate) {
        for (listener in ArrayList(feedListeners)) listener.onFeedUpdate(update)
    }

    override fun onMessageSent(clientId: String, message: MessageDto) {
        notify(FeedUpdate.Sent(message.chatId, clientId, message))
        touchChat(message)
    }

    override fun reloadChat(chatId: String) {
        val current = epoch
        transport.getChat(chatId, guid) { result ->
            if (current != epoch || result !is ApiResult.Success) return@getChat
            applyChatDetail(result.value)
        }
    }

    private fun start() {
        if (started) return
        started = true
        val current = epoch
        storageQueue.post {
            storage.open()
            val cached = storage.readChats()
            main.post {
                if (current != epoch || chatsFromNetwork) return@post
                publishChats(cached)
            }
        }
        main.postDelayed(cleanupTask, timings.cleanupIntervalMs)
    }

    private fun stop() {
        epoch++
        entryGeneration++
        started = false
        openedChatId = null
        liveChatId = null
        syncWaiters.clear()
        preloadQueue.clear()
        preloadStarted = false
        preloadWaiting = false
        main.cancel(preloadTask)
        main.cancel(cleanupTask)
        sender.clear()
        transport.cancelRequestsForGuid(guid)
        setUpdating(false)
    }

    private fun loadChatList(generation: Int) {
        transport.listChats(guid) { result ->
            if (generation != entryGeneration) return@listChats
            when (result) {
                is ApiResult.Failure -> finishEntry(generation, null)
                is ApiResult.Success -> {
                    val list = sortChats(result.value.chats)
                    chatsFromNetwork = true
                    publishChats(list)
                    val opened = openedChatId
                    val current = epoch
                    storageQueue.post {
                        storage.replaceChats(list)
                        storage.prune(opened, timings.totalLimit, timings.pageSize)
                        val cursors = storage.readCursors()
                        main.post {
                            if (current != epoch || generation != entryGeneration) return@post
                            val targets = syncTargets(list, cursors)
                            runSyncQueue(ArrayDeque(targets), generation, targets.size)
                            startPreload()
                        }
                    }
                }
            }
        }
    }

    private fun syncTargets(list: List<ChatListItemDto>, cursors: Map<String, SyncCursor>): List<String> {
        val targets = ArrayList<String>()
        openedChatId?.let { targets.add(it) }
        for (chat in list) {
            if (chat.id == openedChatId) continue
            val cursor = cursors[chat.id] ?: continue
            val newest = chat.lastMessage?.id ?: continue
            if (newest > cursor.maxId) targets.add(chat.id)
        }
        return targets
    }

    private fun runSyncQueue(queue: ArrayDeque<String>, generation: Int, total: Int) {
        if (generation != entryGeneration) return
        val next = queue.removeFirstOrNull()
        if (next == null) {
            finishEntry(generation, total)
            return
        }
        syncChat(next, guid) { outcome ->
            if (generation != entryGeneration) return@syncChat
            if (outcome is SyncOutcome.Failed && isOffline(outcome.error)) finishEntry(generation, total - queue.size - 1) else runSyncQueue(queue, generation, total)
        }
    }

    private fun finishEntry(generation: Int, touched: Int?) {
        if (generation != entryGeneration) return
        if (touched != null) {
            lastCatchUpAt = clock()
            lastCatchUpChats = touched
        }
        setUpdating(false)
        notifyChats()
    }

    private fun syncChat(chatId: String, requestGuid: Int, done: (SyncOutcome) -> Unit) {
        val waiting = syncWaiters[chatId]
        if (waiting != null) {
            waiting.add(done)
            return
        }
        syncWaiters[chatId] = arrayListOf(done)
        val current = epoch
        val finish: (SyncOutcome) -> Unit = { outcome ->
            if (current == epoch) {
                val waiters = syncWaiters.remove(chatId).orEmpty()
                for (waiter in waiters) waiter(outcome)
            }
        }
        storageQueue.post {
            val cursor = storage.readCursor(chatId)
            main.post {
                if (current != epoch) return@post
                if (cursor == null) loadTail(chatId, requestGuid, finish) else syncPages(chatId, cursor, 1, requestGuid, finish)
            }
        }
    }

    private fun syncPages(chatId: String, cursor: SyncCursor, page: Int, requestGuid: Int, done: (SyncOutcome) -> Unit) {
        val current = epoch
        transport.sync(chatId, cursor, requestGuid) { result ->
            if (current != epoch) return@sync
            when (result) {
                is ApiResult.Failure -> done(SyncOutcome.Failed(result.error))
                is ApiResult.Success -> {
                    val response = result.value
                    storageQueue.post {
                        val next = storage.applySync(chatId, response, cursor)
                        main.post {
                            if (current != epoch) return@post
                            val removed = response.changed.filter { it.deletedAt != null }.map { it.id }
                            val created = alive(response.created)
                            val changed = alive(response.changed)
                            if (removed.isNotEmpty()) notify(FeedUpdate.Removed(chatId, removed))
                            if (changed.isNotEmpty()) notify(FeedUpdate.Changed(chatId, changed))
                            if (created.isNotEmpty()) notify(FeedUpdate.Added(chatId, created))
                            when {
                                !response.hasMore -> done(SyncOutcome.Done)
                                page >= timings.syncPageLimit -> resetHistory(chatId, requestGuid, done)
                                else -> syncPages(chatId, next, page + 1, requestGuid, done)
                            }
                        }
                    }
                }
            }
        }
    }

    private fun resetHistory(chatId: String, requestGuid: Int, done: (SyncOutcome) -> Unit) {
        val current = epoch
        storageQueue.post {
            storage.resetHistory(chatId)
            main.post { if (current == epoch) loadTail(chatId, requestGuid, done) }
        }
    }

    private fun loadTail(chatId: String, requestGuid: Int, done: (SyncOutcome) -> Unit) {
        val current = epoch
        transport.getMessages(chatId, null, null, requestGuid) { result ->
            if (current != epoch) return@getMessages
            when (result) {
                is ApiResult.Failure -> done(SyncOutcome.Failed(result.error))
                is ApiResult.Success -> {
                    val page = result.value
                    storageQueue.post {
                        storage.applyTail(chatId, page.messages)
                        main.post {
                            if (current != epoch) return@post
                            notify(FeedUpdate.Replaced(chatId, alive(page.messages), page.hasMore))
                            done(SyncOutcome.Done)
                        }
                    }
                }
            }
        }
    }

    private fun loadDetails(chatId: String, requestGuid: Int, callback: HistoryCallback) {
        val current = epoch
        transport.getChat(chatId, requestGuid) { result ->
            if (!alive(current, requestGuid) || result !is ApiResult.Success) return@getChat
            val chat = result.value
            storageQueue.post { storage.putDetails(chat) }
            for (member in chat.members) seedPresence(member.id, member.lastSeenAt)
            updateChat(chat.id) { chat.toListItem() }
            callback.onDetails(chat, HistorySource.NETWORK)
        }
    }

    private fun refreshOpenedHistory(chatId: String, emptyOnDisk: Boolean, requestGuid: Int, callback: HistoryCallback) {
        val current = epoch
        syncChat(chatId, requestGuid) { outcome ->
            if (!alive(current, requestGuid)) return@syncChat
            if (outcome is SyncOutcome.Failed) {
                if (isOffline(outcome.error) && emptyOnDisk) {
                    callback.onHistory(HistoryPage(chatId, emptyList(), emptyList(), false, false, HistorySource.DISK, offline = true))
                } else if (!isOffline(outcome.error)) {
                    callback.onHistoryFailed(outcome.error)
                }
                return@syncChat
            }
            storageQueue.post {
                val tail = storage.readTail(chatId, timings.pageSize)
                val pending = storage.readUnsent(chatId).map { it.message }
                main.post {
                    if (!alive(current, requestGuid)) return@post
                    callback.onHistory(HistoryPage(chatId, tail, pending, tail.size >= timings.pageSize, false, HistorySource.NETWORK))
                }
            }
        }
    }

    private fun loadPage(chatId: String, side: PageSide, edgeId: Long, requestGuid: Int, callback: HistoryCallback) {
        val current = epoch
        storageQueue.post {
            val cached = storage.readPage(chatId, side, edgeId, timings.pageSize)
            main.post {
                if (!alive(current, requestGuid)) return@post
                if (cached.isNotEmpty()) {
                    callback.onHistory(pageOf(chatId, side, cached, hasMore = true, HistorySource.DISK))
                    return@post
                }
                val before = if (side == PageSide.OLDER) edgeId else null
                val after = if (side == PageSide.NEWER) edgeId else null
                transport.getMessages(chatId, before, after, requestGuid) { result ->
                    if (!alive(current, requestGuid)) return@getMessages
                    when (result) {
                        is ApiResult.Failure -> callback.onHistoryFailed(result.error)
                        is ApiResult.Success -> {
                            val page = result.value
                            val fresh = alive(page.messages)
                            storageQueue.post {
                                storage.putMessages(page.messages)
                                if (fresh.isNotEmpty()) {
                                    if (side == PageSide.OLDER) storage.addRange(chatId, fresh.minOf { it.id }, edgeId - 1)
                                    else storage.addRange(chatId, edgeId + 1, fresh.maxOf { it.id })
                                }
                            }
                            callback.onHistory(pageOf(chatId, side, fresh, page.hasMore, HistorySource.NETWORK))
                        }
                    }
                }
            }
        }
    }

    private fun pageOf(chatId: String, side: PageSide, messages: List<MessageDto>, hasMore: Boolean, source: HistorySource): HistoryPage =
        if (side == PageSide.OLDER) {
            HistoryPage(chatId, messages, emptyList(), hasMore, false, source)
        } else {
            HistoryPage(chatId, messages, emptyList(), false, hasMore, source)
        }

    private fun startPreload() {
        if (preloadStarted) return
        preloadStarted = true
        preloadQueue.clear()
        for (chat in chats.take(timings.preloadLimit)) preloadQueue.add(chat.id)
        main.postDelayed(preloadTask, timings.preloadIntervalMs)
    }

    private fun preloadStep() {
        if (!started || preloadWaiting) return
        if (dataSaver()) {
            preloadQueue.clear()
            return
        }
        if (sender.isSending) {
            main.postDelayed(preloadTask, timings.preloadIntervalMs)
            return
        }
        val next = preloadQueue.firstOrNull() ?: return
        if (next == openedChatId) {
            preloadQueue.removeFirst()
            preloadStep()
            return
        }
        val current = epoch
        storageQueue.post {
            val known = storage.hasHistory(next) || storage.readCursor(next) != null
            main.post {
                if (current != epoch) return@post
                if (known) {
                    preloadQueue.remove(next)
                    preloadStep()
                    return@post
                }
                transport.getMessages(next, null, null, guid) { result ->
                    if (current != epoch) return@getMessages
                    when (result) {
                        is ApiResult.Success -> storageQueue.post {
                            storage.applyTail(next, result.value.messages)
                            main.post {
                                if (current != epoch) return@post
                                preloadQueue.remove(next)
                                main.postDelayed(preloadTask, timings.preloadIntervalMs)
                            }
                        }
                        is ApiResult.Failure -> if (isOffline(result.error)) {
                            preloadWaiting = true
                        } else {
                            preloadQueue.remove(next)
                            main.postDelayed(preloadTask, timings.preloadIntervalMs)
                        }
                    }
                }
            }
        }
    }

    private fun prune() {
        val opened = openedChatId
        storageQueue.post { storage.prune(opened, timings.totalLimit, timings.pageSize) }
    }

    private fun touchChat(message: MessageDto) {
        val chat = chats.firstOrNull { it.id == message.chatId }
        if (chat == null) {
            reloadChat(message.chatId)
            return
        }
        val mine = message.sender?.id == me()?.id
        val unread = when {
            mine -> chat.unreadCount
            liveChatId == message.chatId -> 0
            else -> chat.unreadCount + 1
        }
        upsertChat(chat.copy(lastMessage = message, updatedAt = message.createdAt, unreadCount = unread))
    }

    private fun updateChat(chatId: String, transform: (ChatListItemDto) -> ChatListItemDto) {
        val chat = chats.firstOrNull { it.id == chatId } ?: return
        val next = transform(chat)
        if (next == chat) return
        upsertChat(next)
    }

    private fun upsertChat(chat: ChatListItemDto) {
        chats = sortChats(chats.filter { it.id != chat.id } + chat)
        storageQueue.post { storage.putChat(chat) }
        notifyChats()
    }

    private fun updateDetails(chatId: String, transform: (ChatDto) -> ChatDto) {
        val current = epoch
        storageQueue.post {
            val details = storage.updateDetails(chatId, transform)
            main.post { if (current == epoch && details != null) notify(FeedUpdate.DetailsChanged(chatId, details)) }
        }
    }

    private fun publishChats(list: List<ChatListItemDto>) {
        chats = list
        for (chat in list) chat.otherMember?.let { seedPresence(it.id, it.lastSeenAt) }
        notifyChats()
    }

    private fun notifyChats() {
        for (listener in ArrayList(chatsListeners)) listener.onChatsChanged()
    }

    private fun alive(current: Int, requestGuid: Int): Boolean = current == epoch && requestGuid !in cancelledGuids

    private fun alive(messages: List<MessageDto>): List<MessageDto> = messages.filter { it.deletedAt == null }

    private fun isOffline(error: ApiException): Boolean = error is NetworkError || error is NoResponseError

    private fun sortChats(list: List<ChatListItemDto>): List<ChatListItemDto> = list.sortedByDescending { it.updatedAt }

    private fun asSender(user: PublicUser): ChatMemberSummary =
        ChatMemberSummary(user.id, user.username, user.displayName, user.avatarUrl, user.avatarColor, user.lastSeenAt, false)
}
