package com.qwill.app.chat

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.widget.FrameLayout
import android.widget.TextView
import android.widget.Toast
import android.view.animation.LinearInterpolator
import android.view.animation.PathInterpolator
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSmoothScroller
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.BuildConfig
import com.qwill.app.QwillApplication
import com.qwill.app.auth.SessionState
import com.qwill.app.calls.ActiveCallsListener
import com.qwill.app.chat.dialogs.ChatDialogs
import com.qwill.app.chat.dialogs.ConfirmDialog
import com.qwill.app.chat.selection.FeedListView
import com.qwill.app.chat.selection.FeedTouchHelper
import com.qwill.app.chat.selection.MessageSelection
import com.qwill.app.chat.selection.SelectionRules
import com.qwill.app.chat.top.CapsuleModel
import com.qwill.app.chat.top.ChatSubtitle
import com.qwill.app.chat.top.ChatTopLayer
import com.qwill.app.chat.top.ChatTopLayout
import com.qwill.app.chat.top.SubtitleInput
import com.qwill.app.chats.DeleteChatDialog
import com.qwill.app.chat.cells.BubbleLayout
import com.qwill.app.chat.cells.BubblePaints
import com.qwill.app.chat.cells.MessageCell
import com.qwill.app.chat.cells.MessageCellHost
import com.qwill.app.chat.cells.MessageCellModel
import com.qwill.app.chat.cells.SendStatus
import com.qwill.app.chat.wallpaper.ChatWallpaperView
import com.qwill.app.core.MainQueue
import com.qwill.app.emoji.Emoji
import com.qwill.app.emoji.EmojiListener
import com.qwill.app.messenger.ChatsListener
import com.qwill.app.messenger.FeedListener
import com.qwill.app.messenger.FeedUpdate
import com.qwill.app.messenger.HistoryCallback
import com.qwill.app.messenger.HistoryPage
import com.qwill.app.messenger.HistorySource
import com.qwill.app.messenger.MembersListener
import com.qwill.app.model.ChatDto
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatType
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import com.qwill.app.realtime.ConnectionStateListener
import com.qwill.app.realtime.PresenceListener
import com.qwill.app.realtime.TypingListener
import com.qwill.app.ui.AppForeground
import com.qwill.app.ui.ConnectionTitleRule
import com.qwill.app.ui.ForegroundListener
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.QwillMenu
import com.qwill.app.ui.QwillMenuItem
import com.qwill.app.ui.TitleKind
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.withAlpha
import java.util.TimeZone
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

class ChatScreen(val chatId: String, private val initialJumpId: Long? = null) :
    Screen(), MessageCellHost, ChatAdapterHost, FeedScrollThumb.Host, FeedTouchHelper.Host {
    private sealed class Placement {
        object Bottom : Placement()

        class Center(val key: String, val flash: Boolean) : Placement()

        class Top(val key: String, val offset: Int) : Placement()
    }

    private val messages get() = QwillApplication.messages
    private val feed = ChatFeed(::myId)
    private val readTracker = ReadTracker(MainQueue, SystemClock::uptimeMillis) { id -> messages.markRead(chatId, id) }

    private lateinit var context: Context
    private lateinit var root: FrameLayout
    private lateinit var wallpaper: ChatWallpaperView
    private lateinit var list: FeedListView
    private lateinit var top: ChatTopLayer
    private lateinit var touchHelper: FeedTouchHelper
    private lateinit var layoutManager: LinearLayoutManager
    private lateinit var adapter: ChatAdapter
    private lateinit var floating: FloatingDateView
    private lateinit var jump: JumpDownButton
    private lateinit var thumb: FeedScrollThumb
    private lateinit var status: TextView
    private lateinit var layoutCache: ChatLayoutCache
    private var paintsHolder: BubblePaints? = null

    override val paints: BubblePaints get() = paintsHolder!!

    private var safe = SafeArea.NONE
    private var details: ChatDto? = null
    private var opened = false
    private var shown = false
    private var failure: String? = null
    private var offlineEmpty = false
    private var unreadDecided = false
    private var cursorKnown = false
    private var userScrolled = false
    private var expectTail = false
    private var loadingOlder = false
    private var loadingNewer = false
    private var retryOlderAt = 0L
    private var retryNewerAt = 0L
    private var lastLoadedSide = FeedSide.OLDER
    private var prefetchNeed = FeedWindow.PREFETCH_ROWS
    private var autoScrollUntil = 0L
    private var showJump = false
    private var pendingJumpId: Long? = null
    private var placement: Placement? = null
    private var flashKey: String? = null
    private var flashStarted = 0L
    private var liveKeys = HashSet<String>()
    private var floatingDay = -1L
    private var jumpSeq = 0
    private var restoreAnchor: Pair<String, Int>? = null
    private var lastTopAnchor: Pair<String, Int>? = null
    private var awaitingUnread = false
    private var layoutDirty = false
    private var appliedSides: Pair<Int, Int>? = null

    private val selection = MessageSelection()
    private val selectedCache = HashMap<Long, MessageDto>()
    private var selectionShown = 0f
    private var selectionAnimator: ValueAnimator? = null
    private var dragBase: List<Long> = emptyList()
    private var dragStart = 0L
    private var dragAdding = true
    private var menu: QwillMenu? = null
    private var dialog: ConfirmDialog? = null
    private var deleteChatDialog: DeleteChatDialog? = null
    private var membersRequested = false
    private var connectionKind = TitleKind.BRAND
    private var targetKind = TitleKind.BRAND
    private val kindTask = Runnable {
        connectionKind = targetKind
        updateSubtitle(animated = true)
    }
    private val minuteTask = object : Runnable {
        override fun run() {
            updateSubtitle(animated = false)
            MainQueue.postDelayed(this, MINUTE_MS)
        }
    }

    private val trimTask = Runnable { trimIfIdle() }
    private val floatingHide = Runnable { floating.hide(animated = true) }

    private val historyCallback = object : HistoryCallback {
        override fun onHistory(page: HistoryPage) = onOpenPage(page)

        override fun onHistoryFailed(error: ApiException) = onOpenFailed(error)

        override fun onDetails(chat: ChatDto, source: HistorySource) = onChatDetails(chat)
    }

    private val feedListener = FeedListener { update -> if (update.chatId == chatId) onFeedUpdate(update) }
    private val chatsListener = ChatsListener {
        updateJumpCount()
        updateHeader(animated = true)
    }
    private val presenceListener = PresenceListener { updateSubtitle(animated = true) }
    private val typingListener = TypingListener { changed -> if (changed == null || changed == chatId) updateSubtitle(animated = true) }
    private val connectionListener = ConnectionStateListener { onConnectionChanged() }
    private val callsListener = ActiveCallsListener { changed -> if (changed == chatId) updateCall(animated = true) }
    private val membersListener = MembersListener { changed ->
        if (changed != chatId) return@MembersListener
        updatePinned(animated = true)
        updateSelectionHeader(animated = false)
    }
    private val emojiListener = EmojiListener { indexChanged ->
        if (indexChanged) {
            layoutCache.clear()
            rebindAll()
            top.pinnedBanner.applyTheme()
        } else {
            for (index in 0 until list.childCount) list.getChildAt(index).invalidate()
            top.pinnedBanner.invalidate()
        }
    }
    private val foregroundListener = ForegroundListener { active ->
        if (active) {
            list.post { updateReading() }
            top.header.capsule.invalidate()
        } else {
            readTracker.flush()
        }
    }

    override val interceptsBack: Boolean
        get() = menu?.isShowing == true || dialog != null || deleteChatDialog != null || selection.active

    override val selectionActive: Boolean get() = selection.active

    override val selectionProgress: Float get() = selectionShown

    override val paintsOwnBackground: Boolean get() = true

    override fun createView(context: Context): View {
        this.context = context
        paintsHolder = BubblePaints(context)
        layoutCache = ChatLayoutCache(paints, BuildConfig.VERSION_CODE)
        root = FrameLayout(context)
        wallpaper = ChatWallpaperView(context)
        root.addView(wallpaper, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        list = FeedListView(context)
        layoutManager = LinearLayoutManager(context, RecyclerView.VERTICAL, true)
        list.layoutManager = layoutManager
        list.setHasFixedSize(true)
        list.clipToPadding = false
        list.overScrollMode = View.OVER_SCROLL_NEVER
        list.isVerticalScrollBarEnabled = false
        adapter = ChatAdapter(context, this, this)
        list.adapter = adapter
        list.itemAnimator = if (Motion.animationsEnabled) ChatItemAnimator(::shouldAppear, px(ChatItemAnimator.APPEAR_SHIFT_DP)) else null
        list.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                if (::top.isInitialized) top.onSourceScrolled(dy)
                onListScrolled(dy)
            }

            override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
                if (newState == RecyclerView.SCROLL_STATE_DRAGGING) {
                    userScrolled = true
                    pendingJumpId = null
                    placement = null
                }
                if (newState == RecyclerView.SCROLL_STATE_IDLE) {
                    prefetchNeed = FeedWindow.PREFETCH_ROWS
                    scheduleTrim()
                }
            }
        })
        list.onFlingListener = object : RecyclerView.OnFlingListener() {
            override fun onFling(velocityX: Int, velocityY: Int): Boolean {
                prefetchNeed = max(FeedWindow.PREFETCH_ROWS, FlingPrediction.rows(context, velocityY, averageRowHeight()))
                checkEdges()
                return false
            }
        }
        list.beforeFrame = {
            if (layoutDirty) {
                layoutDirty = false
                updateFloatingDate(false)
                list.post { onListScrolled(0) }
            } else {
                updateCovered()
            }
        }
        root.addView(list, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        status = TextView(context).apply {
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.REGULAR)
            visibility = View.GONE
        }
        root.addView(status, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        floating = FloatingDateView(context) { day -> jumpToDay(day) }
        root.addView(floating, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        jump = JumpDownButton(context) { onJumpPressed() }
        root.addView(jump, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END or Gravity.BOTTOM))

        thumb = FeedScrollThumb(context, this)
        root.addView(thumb, FrameLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.END))

        top = ChatTopLayer(
            context,
            list,
            wallpaper,
            onContentTopChanged = { applyInsets() },
            onPinnedJump = { onPinnedJump() },
            onPinnedClose = { onPinnedClose() },
            onJoinCall = {},
        )
        root.addView(top, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        top.header.back.setOnClickListener { stack?.pop() }
        top.header.call.setOnClickListener {}
        top.header.more.setOnClickListener { openMenu() }
        top.selection.close.setOnClickListener { exitSelection(animated = true) }
        top.selection.copy.setOnClickListener { copySelection() }
        top.selection.delete.setOnClickListener { confirmDeleteSelection() }
        touchHelper = FeedTouchHelper(list, this)
        list.touchHelper = touchHelper
        selectionShown = if (selection.active) 1f else 0f

        root.addOnLayoutChangeListener { _, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom ->
            if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) onRootResized()
        }
        applyInsets()
        applyTheme()
        updateHeader(animated = false)
        updateCall(animated = false)
        if (selection.active) {
            top.setSelectionMode(true, animated = false)
            updateSelectionHeader(animated = false)
        }
        if (!opened) {
            open()
        } else {
            submitRows(diff = false)
            updateStatus()
            setPlacement(restoreAnchor?.let { Placement.Top(it.first, it.second) } ?: Placement.Bottom)
            restoreAnchor = null
        }
        return root
    }

    override fun onShown() {
        shown = true
        messages.setLiveChat(chatId)
        updateJumpCount()
        updateSubtitle(animated = false)
        MainQueue.cancel(minuteTask)
        MainQueue.postDelayed(minuteTask, MINUTE_MS)
        list.post { updateReading() }
    }

    override fun onHidden() {
        shown = false
        MainQueue.cancel(minuteTask)
        touchHelper.cancel()
        menu?.dismissNow()
        if (selection.active) exitSelection(animated = false)
        rememberPosition()
        readTracker.flush()
        if (messages.liveChatId == chatId) messages.setLiveChat(null)
    }

    override fun onBackPressed(): Boolean {
        if (menu?.isShowing == true) {
            menu?.close()
            return true
        }
        dialog?.let {
            it.requestClose()
            return true
        }
        deleteChatDialog?.let {
            it.requestClose()
            return true
        }
        if (selection.active) {
            exitSelection(animated = true)
            return true
        }
        return false
    }

    override fun onViewDestroyed() {
        restoreAnchor = topAnchor()
        MainQueue.cancel(trimTask)
        MainQueue.cancel(kindTask)
        selectionAnimator?.cancel()
        selectionAnimator = null
        menu?.dismissNow()
        menu = null
        dialog?.dismissNow()
        dialog = null
        deleteChatDialog = null
    }

    override fun onDestroyed() {
        readTracker.stop()
        MainQueue.cancel(minuteTask)
        MainQueue.cancel(kindTask)
        messages.removeFeedListener(feedListener)
        messages.removeChatsListener(chatsListener)
        messages.removeMembersListener(membersListener)
        QwillApplication.presence.removeListener(presenceListener)
        QwillApplication.typing.removeListener(typingListener)
        QwillApplication.socket.removeStateListener(connectionListener)
        QwillApplication.calls.removeListener(callsListener)
        Emoji.removeListener(emojiListener)
        AppForeground.removeListener(foregroundListener)
        messages.releaseMembers(chatId)
        messages.closeChat(chatId)
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        if (area == safe) return
        safe = area
        if (::list.isInitialized) applyInsets()
    }

    override fun onThemeChanged() {
        if (!::list.isInitialized) return
        applyTheme()
        top.applyTheme()
        menu?.applyTheme()
        dialog?.applyTheme()
        deleteChatDialog?.applyTheme()
        wallpaper.refresh()
        layoutCache.clear()
        val anchor = topAnchor()
        rebindAll()
        if (anchor != null) setPlacement(Placement.Top(anchor.first, anchor.second))
        floating.invalidate()
        jump.invalidate()
        thumb.invalidate()
    }

    private fun applyTheme() {
        val palette = Theme.palette
        status.setTextSize(TypedValue.COMPLEX_UNIT_PX, px(Theme.textSize(TextScale.META)))
        status.setTextColor(if (failure != null) palette.danger else withAlpha(palette.pulseInk, STATUS_ALPHA))
    }

    private fun applyInsets() {
        top.setSafeArea(safe)
        val contentTop = top.contentTop + safe.top
        setListPadding(contentTop, (px(ChatInsets.LIST_BOTTOM) + safe.bottom).roundToInt())
        status.setPadding((px(STATUS_PAD_X) + safe.left).roundToInt(), list.paddingTop, (px(STATUS_PAD_X) + safe.right).roundToInt(), list.paddingBottom)
        (floating.layoutParams as FrameLayout.LayoutParams).topMargin =
            (contentTop + px(ChatTopLayout.FLOATING_DATE_GAP) - px(FLOATING_TAP_EXTRA)).roundToInt()
        floating.requestLayout()
        val jumpParams = jump.layoutParams as FrameLayout.LayoutParams
        jumpParams.rightMargin = (px(ChatInsets.JUMP_RIGHT) + safe.right - jump.pad).roundToInt()
        jumpParams.bottomMargin = (px(ChatInsets.JUMP_BOTTOM) + safe.bottom - jump.pad).roundToInt()
        jump.requestLayout()
        val thumbParams = thumb.layoutParams as FrameLayout.LayoutParams
        thumbParams.width = (px(THUMB_STRIP) + safe.right).roundToInt()
        thumb.layoutParams = thumbParams
        thumb.edge = px(Dimens.SCROLLBAR_EDGE) + safe.right
        updateThumbTrack()
        val sides = sideInsets()
        if (sides != appliedSides) {
            appliedSides = sides
            rebindAll()
        }
    }

    private fun setListPadding(paddingTop: Int, paddingBottom: Int) {
        val oldTop = list.paddingTop
        if (oldTop == paddingTop && list.paddingBottom == paddingBottom) return
        val dy = oldTop - paddingTop
        if (dy != 0 && list.childCount > 0 && placement == null) {
            val blocked = (dy < 0 && !list.canScrollVertically(1)) || (dy > 0 && !list.canScrollVertically(-1))
            if (!blocked) {
                list.addOnLayoutChangeListener(object : View.OnLayoutChangeListener {
                    override fun onLayoutChange(v: View, l: Int, t: Int, r: Int, b: Int, ol: Int, ot: Int, or: Int, ob: Int) {
                        list.removeOnLayoutChangeListener(this)
                        list.scrollBy(0, dy)
                    }
                })
            }
        }
        list.setPadding(0, paddingTop, 0, paddingBottom)
    }

    private fun updateThumbTrack() {
        thumb.trackTop = list.paddingTop.toFloat()
        thumb.trackBottom = root.height - list.paddingBottom.toFloat()
    }

    private fun onRootResized() {
        updateThumbTrack()
        val anchor = lastTopAnchor
        if (anchor != null && feed.loaded) setPlacement(Placement.Top(anchor.first, anchor.second))
    }

    private fun open() {
        opened = true
        feed.unreadAtEntry = messages.chats.firstOrNull { it.id == chatId }?.unreadCount ?: 0
        messages.addFeedListener(feedListener)
        messages.addChatsListener(chatsListener)
        messages.addMembersListener(membersListener)
        QwillApplication.presence.addListener(presenceListener)
        QwillApplication.typing.addListener(typingListener)
        QwillApplication.socket.addStateListener(connectionListener)
        QwillApplication.calls.addListener(callsListener)
        Emoji.addListener(emojiListener)
        AppForeground.addListener(foregroundListener)
        connectionKind = currentKind()
        targetKind = connectionKind
        requestMembersIfGroup()
        messages.openChat(chatId, classGuid, historyCallback)
    }

    private fun replaceFeed(settled: List<MessageDto>, pending: List<MessageDto>, before: Boolean, after: Boolean) {
        feed.replace(settled, pending, before, after)
        loadingOlder = false
        loadingNewer = false
        retryOlderAt = 0L
        retryNewerAt = 0L
    }

    private fun onOpenPage(page: HistoryPage) {
        feed.locals.putAll(page.pendingLocal)
        if (page.offline && page.messages.isEmpty() && page.pending.isEmpty() && !feed.loaded) {
            offlineEmpty = true
            updateStatus()
            return
        }
        offlineEmpty = false
        val emptyDisk = page.source == HistorySource.DISK && page.messages.isEmpty() && page.pending.isEmpty()
        if (emptyDisk && !feed.loaded && !expectTail) return
        if (!feed.loaded || expectTail) {
            val wasTail = expectTail
            expectTail = false
            replaceFeed(page.messages, page.pending, page.hasMoreBefore, false)
            submitRows(diff = false)
            updateStatus()
            if (wasTail) {
                setPlacement(Placement.Bottom)
                return
            }
            placeInitial()
            return
        }
        if (page.source == HistorySource.NETWORK && feed.atTail) {
            val settledNewest = feed.newestId()
            val pageOldest = page.messages.minOfOrNull { it.id }
            if (settledNewest != null && pageOldest != null && pageOldest > settledNewest) {
                replaceFeed(page.messages, page.pending, page.hasMoreBefore, false)
                submitRows(diff = false)
                updateStatus()
                setPlacement(Placement.Bottom)
                return
            }
            feed.mergeTail(page.messages, page.pending, page.hasMoreBefore)
            submitRows(diff = true)
            updateStatus()
            if (!unreadDecided && cursorKnown) decideUnread()
        }
    }

    private fun onOpenFailed(error: ApiException) {
        if (error is NetworkError || error is NoResponseError) return
        if (feed.loaded && !feed.isEmpty) return
        failure = "Чат не найден или недоступен"
        applyTheme()
        updateStatus()
        updateHeader(animated = false)
    }

    private fun onChatDetails(chat: ChatDto) {
        details = chat
        requestMembersIfGroup()
        updateHeader(animated = true)
        if (selection.active) updateSelectionHeader(animated = false)
        val me = myId()
        if (me != null && chat.readCursors.containsKey(me)) {
            cursorKnown = true
            readTracker.know(chat.readCursors[me])
        }
        rebindVisible()
        if (!unreadDecided && feed.loaded) decideUnread()
        list.post { updateReading() }
    }

    private fun placeInitial() {
        val jumpId = initialJumpId
        if (jumpId != null) {
            unreadDecided = true
            setPlacement(Placement.Bottom)
            jumpTo(jumpId)
            return
        }
        when (val remembered = ChatPositions.recall(chatId)) {
            is ChatPosition.At -> {
                unreadDecided = true
                val position = adapter.positionOfMessage(remembered.messageId)
                if (position >= 0) {
                    setPlacement(Placement.Top(keyOfMessage(remembered.messageId), remembered.offsetPx))
                } else {
                    setPlacement(Placement.Bottom)
                    loadWindow(remembered.messageId, flash = false, offset = remembered.offsetPx)
                }
            }
            ChatPosition.Tail -> {
                unreadDecided = true
                setPlacement(Placement.Bottom)
            }
            null -> {
                setPlacement(Placement.Bottom)
                if (feed.unreadAtEntry <= 0) unreadDecided = true
                if (cursorKnown) decideUnread()
            }
        }
    }

    private fun decideUnread() {
        if (unreadDecided) return
        if (userScrolled) {
            unreadDecided = true
            return
        }
        val count = feed.unreadAtEntry
        if (count <= 0) {
            unreadDecided = true
            return
        }
        val me = myId()
        val cursor = details?.readCursors?.get(me ?: "") ?: 0L
        val newest = feed.newestId()
        if (newest != null && cursor >= newest && !feed.hasMoreAfter) {
            unreadDecided = true
            return
        }
        val oldest = feed.oldestId()
        if (oldest != null && (oldest <= cursor || !feed.hasMoreBefore)) {
            unreadDecided = true
            anchorUnread(cursor)
            return
        }
        unreadDecided = true
        awaitingUnread = true
        val epoch = feed.epoch
        messages.loadNewer(
            chatId,
            cursor,
            classGuid,
            object : HistoryCallback {
                override fun onHistory(page: HistoryPage) {
                    awaitingUnread = false
                    if (feed.epoch != epoch || userScrolled || page.messages.isEmpty()) {
                        list.post { updateReading() }
                        return
                    }
                    val pending = feed.messages.filter { it.id < 0 }
                    replaceFeed(page.messages, pending, true, page.hasMoreAfter)
                    anchorUnread(cursor)
                }

                override fun onHistoryFailed(error: ApiException) {
                    awaitingUnread = false
                    list.post { updateReading() }
                }
            },
        )
    }

    private fun anchorUnread(cursor: Long) {
        val me = myId()
        val first = feed.messages.firstOrNull { it.id > cursor && it.sender?.id != me } ?: return
        feed.unreadAnchorId = first.id
        submitRows(diff = false)
        setPlacement(Placement.Center(FeedRow.Unread.KEY, flash = false))
    }

    private fun onFeedUpdate(update: FeedUpdate) {
        when (update) {
            is FeedUpdate.Added -> onAdded(update.messages)
            is FeedUpdate.Pending -> {
                if (!feed.atTail) return
                if (feed.pending(update.message)) {
                    update.message.clientId?.let { liveKeys.add(FeedRow.keyOf(update.message)) }
                    submitRows(diff = true)
                    afterLayout { scrollToBottom(smooth = true) }
                }
            }
            is FeedUpdate.Sent -> {
                if (feed.sent(update.clientId, update.message)) submitRows(diff = true)
            }
            is FeedUpdate.Failed -> {
                if (feed.discard(update.clientId)) submitRows(diff = true)
            }
            is FeedUpdate.Discarded -> {
                if (feed.discard(update.clientId)) submitRows(diff = true)
            }
            is FeedUpdate.LocalAttachmentChanged -> {
                feed.locals[update.clientId] = update.local
                refreshKey("c:${update.clientId}")
            }
            is FeedUpdate.UploadProgress -> Unit
            is FeedUpdate.Changed -> {
                if (feed.change(update.messages)) submitRows(diff = true)
                for (message in update.messages) if (message.id in selectedCache) selectedCache[message.id] = message
                if (selection.active) updateSelectionHeader(animated = false)
            }
            is FeedUpdate.Removed -> {
                if (feed.remove(update.ids)) submitRows(diff = true)
                if (selection.active && selection.removeAll(update.ids)) onSelectionChanged()
            }
            is FeedUpdate.ReactionsChanged -> if (feed.reactions(update.messageId, update.reactions)) submitRows(diff = true)
            is FeedUpdate.Replaced -> {
                val pending = feed.messages.filter { it.id < 0 }
                replaceFeed(update.messages, pending, update.hasMoreBefore, false)
                submitRows(diff = false)
                setPlacement(Placement.Bottom)
            }
            is FeedUpdate.DetailsChanged -> onChatDetails(update.details)
            is FeedUpdate.ChatGone -> {
                if (selection.active) exitSelection(animated = false)
                if (stack?.top === this) stack?.pop()
            }
        }
    }

    private fun onAdded(list: List<MessageDto>) {
        val distance = distanceFromBottom()
        val wasNewest = feed.atTail
        val previousLast = feed.lastMessage()?.id
        val fresh = feed.add(list)
        if (fresh.isEmpty()) return
        val live = list.size == 1
        if (live && Motion.animationsEnabled) for (message in fresh) liveKeys.add(FeedRow.keyOf(message))
        submitRows(diff = true)
        updateStatus()
        val last = feed.lastMessage() ?: return
        val follow = pendingJumpId == null && FeedFollow.shouldFollow(
            FollowInput(
                lastId = last.id,
                prevLastId = previousLast,
                liveMessageId = if (live) fresh.last().id else 0L,
                isOwnLast = last.sender?.id == myId(),
                wasNewest = wasNewest,
                isAutoScrolling = SystemClock.uptimeMillis() < autoScrollUntil,
                distanceBefore = distance,
                threshold = px(FeedFollow.FOLLOW_DP),
            ),
        )
        if (follow) afterLayout { scrollToBottom(smooth = true) }
    }

    private fun submitRows(diff: Boolean) {
        val rows = feed.rows()
        adapter.submit(rows, diff && list.itemAnimator != null)
        layoutDirty = true
        list.invalidate()
    }

    private fun refreshKey(key: String) {
        val position = adapter.positionOfKey(key)
        if (position >= 0) adapter.notifyItemChanged(position, ChatAdapter.PAYLOAD_REBIND)
    }

    private fun rebindVisible() {
        if (!::adapter.isInitialized || adapter.itemCount == 0) return
        val first = layoutManager.findFirstVisibleItemPosition()
        val last = layoutManager.findLastVisibleItemPosition()
        if (first == RecyclerView.NO_POSITION || last == RecyclerView.NO_POSITION) {
            adapter.notifyDataSetChanged()
            return
        }
        val from = max(0, first - REBIND_MARGIN)
        val to = minOf(adapter.itemCount - 1, last + REBIND_MARGIN)
        adapter.notifyItemRangeChanged(from, to - from + 1, ChatAdapter.PAYLOAD_REBIND)
    }

    private fun rebindAll() {
        if (!::adapter.isInitialized || adapter.itemCount == 0) return
        adapter.notifyDataSetChanged()
        layoutDirty = true
    }

    private fun updateStatus() {
        val text = when {
            failure != null -> failure
            offlineEmpty -> "Нет связи. История не загружена."
            feed.loaded && feed.isEmpty && !feed.hasMoreBefore && !feed.hasMoreAfter && !offlineEmpty -> "Сообщений пока нет. Напишите первым."
            else -> null
        }
        status.text = text.orEmpty()
        status.visibility = if (text == null) View.GONE else View.VISIBLE
        list.visibility = if (failure != null) View.INVISIBLE else View.VISIBLE
        applyTheme()
    }

    private fun setPlacement(next: Placement) {
        placement = next
        applyPlacement(first = true)
    }

    private fun applyPlacement(first: Boolean) {
        val target = placement ?: return
        when (target) {
            Placement.Bottom -> {
                placement = null
                if (adapter.itemCount > 0) layoutManager.scrollToPositionWithOffset(0, 0)
            }
            is Placement.Center -> {
                val position = adapter.positionOfKey(target.key)
                if (position < 0) {
                    placement = null
                    return
                }
                val view = layoutManager.findViewByPosition(position)
                if (view == null || first) {
                    val offset = (listEnd() - visibleCenter()).roundToInt()
                    layoutManager.scrollToPositionWithOffset(position, max(0, offset - (view?.height ?: 0) / 2))
                    afterLayout { applyPlacement(first = false) }
                    return
                }
                val delta = (view.top + view.bottom) / 2f - visibleCenter()
                if (abs(delta) >= 1f) list.scrollBy(0, delta.roundToInt())
                placement = null
                if (target.flash) startFlash(target.key)
                pendingJumpId = null
            }
            is Placement.Top -> {
                val position = adapter.positionOfKey(target.key)
                if (position < 0) {
                    placement = null
                    return
                }
                val view = layoutManager.findViewByPosition(position)
                if (view == null || first) {
                    val estimate = listEnd() - (list.paddingTop + target.offset) - (view?.height ?: 0)
                    layoutManager.scrollToPositionWithOffset(position, max(0f, estimate).roundToInt())
                    afterLayout { applyPlacement(first = false) }
                    return
                }
                val delta = view.top - (list.paddingTop + target.offset)
                if (delta != 0) list.scrollBy(0, delta)
                placement = null
            }
        }
    }

    private fun afterLayout(action: () -> Unit) {
        val observer = list.viewTreeObserver
        observer.addOnGlobalLayoutListener(object : ViewTreeObserver.OnGlobalLayoutListener {
            override fun onGlobalLayout() {
                if (list.viewTreeObserver.isAlive) list.viewTreeObserver.removeOnGlobalLayoutListener(this)
                action()
            }
        })
        list.requestLayout()
    }

    private fun onListScrolled(dy: Int) {
        if (!::list.isInitialized) return
        if (dy != 0) thumb.onScrolled()
        if (placement == null) lastTopAnchor = topAnchor()
        updateJumpVisibility()
        updateFloatingDate(dy != 0)
        checkEdges()
        updateReading()
        scheduleTrim()
    }

    private fun listEnd(): Float = (list.height - list.paddingBottom).toFloat()

    override fun visibleTop(): Float = list.paddingTop.toFloat()

    override fun visibleBottom(): Float = list.height - (px(ChatInsets.COMPOSER_TOP) + safe.bottom)

    private fun visibleCenter(): Float = (list.paddingTop + visibleBottom()) / 2f

    private fun distanceFromBottom(): Float {
        if (adapter.itemCount == 0) return 0f
        val bottom = layoutManager.findViewByPosition(0) ?: return estimatedDistance()
        return bottom.bottom - listEnd()
    }

    private fun estimatedDistance(): Float {
        val first = layoutManager.findFirstVisibleItemPosition()
        if (first == RecyclerView.NO_POSITION) return Float.MAX_VALUE
        val view = layoutManager.findViewByPosition(first) ?: return Float.MAX_VALUE
        return (view.bottom - listEnd()) + first * averageRowHeight()
    }

    private fun averageRowHeight(): Float {
        var total = 0
        var count = 0
        for (index in 0 until list.childCount) {
            total += list.getChildAt(index).height
            count++
        }
        return if (count == 0) px(DEFAULT_ROW) else max(1f, total.toFloat() / count)
    }

    private fun scrollToBottom(smooth: Boolean) {
        if (adapter.itemCount == 0) return
        list.stopScroll()
        autoScrollUntil = SystemClock.uptimeMillis() + AUTO_SCROLL_GUARD_MS
        val distance = distanceFromBottom()
        if (smooth && Motion.animationsEnabled && distance <= list.height * FeedFollow.SCROLL_ANIMATE_SCREENS) {
            val scroller = EdgeScroller(context, snapToEnd = true)
            scroller.targetPosition = 0
            layoutManager.startSmoothScroll(scroller)
        } else {
            layoutManager.scrollToPositionWithOffset(0, 0)
        }
    }

    private fun updateJumpVisibility() {
        val distance = distanceFromBottom()
        if (distance > list.height * FeedFollow.JUMP_AFTER_SCREENS) {
            showJump = true
        } else if (distance < px(FeedFollow.STICK_DP)) {
            showJump = false
        }
        val visible = feed.loaded && (showJump || feed.hasMoreAfter)
        if (!visible && jump.shown) feed.returnToId = null
        jump.setShown(visible)
    }

    private fun updateJumpCount() {
        jump.setCount(messages.chats.firstOrNull { it.id == chatId }?.unreadCount ?: 0)
    }

    private fun onJumpPressed() {
        list.stopScroll()
        val back = feed.returnToId
        if (back != null) {
            feed.returnToId = null
            jumpTo(back)
            return
        }
        pendingJumpId = null
        if (feed.atTail) {
            scrollToBottom(smooth = true)
            return
        }
        returnToTail()
    }

    private fun returnToTail() {
        expectTail = true
        messages.openChat(chatId, classGuid, historyCallback)
    }

    private fun jumpTo(messageId: Long, from: Long? = null) {
        list.stopScroll()
        if (from != null) feed.returnToId = from
        pendingJumpId = messageId
        userScrolled = true
        val position = adapter.positionOfMessage(messageId)
        if (position < 0) {
            loadWindow(messageId, flash = true, offset = null)
            return
        }
        val key = keyOfMessage(messageId)
        val view = layoutManager.findViewByPosition(position)
        val distance = if (view != null) {
            abs((view.top + view.bottom) / 2f - visibleCenter())
        } else {
            abs(position - (layoutManager.findFirstVisibleItemPosition() + layoutManager.findLastVisibleItemPosition()) / 2f) * averageRowHeight()
        }
        if (Motion.animationsEnabled && distance <= list.height * FeedFollow.SCROLL_ANIMATE_SCREENS) {
            placement = null
            val scroller = CenterScroller(context, key)
            scroller.targetPosition = position
            layoutManager.startSmoothScroll(scroller)
        } else {
            setPlacement(Placement.Center(key, flash = true))
        }
    }

    private fun loadWindow(messageId: Long, flash: Boolean, offset: Int?) {
        val seq = ++jumpSeq
        messages.openChatAt(
            chatId,
            messageId,
            classGuid,
            object : HistoryCallback {
                override fun onHistory(page: HistoryPage) {
                    if (seq != jumpSeq) return
                    if (page.messages.none { it.id == messageId }) {
                        pendingJumpId = null
                        return
                    }
                    feed.locals.putAll(page.pendingLocal)
                    replaceFeed(page.messages, page.pending, page.hasMoreBefore, page.hasMoreAfter)
                    submitRows(diff = false)
                    updateStatus()
                    val key = keyOfMessage(messageId)
                    if (offset != null) setPlacement(Placement.Top(key, offset)) else setPlacement(Placement.Center(key, flash))
                }

                override fun onHistoryFailed(error: ApiException) {
                    if (seq == jumpSeq) pendingJumpId = null
                }
            },
        )
    }

    private fun jumpToDay(dayStart: Long) {
        val found = feed.firstOfDay(dayStart)
        if (found != null && (found.first > 0 || !feed.hasMoreBefore)) {
            jumpTo(found.second.id)
            return
        }
        val date = DayLabel.dayKey(dayStart)
        QwillApplication.api.send(ChatRequests.messageAtDate(chatId, date, TimeZone.getDefault().id), classGuid) { result ->
            if (result is ApiResult.Success) result.value.messageId?.let { jumpTo(it) }
        }
    }

    private fun startFlash(key: String) {
        flashKey = key
        flashStarted = SystemClock.uptimeMillis()
        val position = adapter.positionOfKey(key)
        if (position >= 0) layoutManager.findViewByPosition(position)?.invalidate()
    }

    override fun flashStartedAt(key: String): Long = if (key == flashKey) flashStarted else 0L

    private fun keyOfMessage(messageId: Long): String {
        val message = feed.messages.firstOrNull { it.id == messageId }
        return if (message != null) FeedRow.keyOf(message) else "m:$messageId"
    }

    private fun checkEdges() {
        if (!feed.loaded || adapter.itemCount == 0) return
        val now = SystemClock.uptimeMillis()
        val need = prefetchNeed
        val top = layoutManager.findLastVisibleItemPosition()
        val bottom = layoutManager.findFirstVisibleItemPosition()
        if (top == RecyclerView.NO_POSITION || bottom == RecyclerView.NO_POSITION) return
        val above = adapter.itemCount - 1 - top
        if (above < need && feed.hasMoreBefore && !loadingOlder && now >= retryOlderAt) loadOlder()
        if (bottom < need && feed.hasMoreAfter && !loadingNewer && now >= retryNewerAt) loadNewer()
    }

    private fun loadOlder() {
        val edge = feed.oldestId() ?: return
        loadingOlder = true
        val epoch = feed.epoch
        messages.loadOlder(
            chatId,
            edge,
            classGuid,
            object : HistoryCallback {
                override fun onHistory(page: HistoryPage) {
                    if (feed.epoch != epoch) return
                    loadingOlder = false
                    lastLoadedSide = FeedSide.OLDER
                    feed.mergeOlder(page.messages, page.hasMoreBefore)
                    submitRows(diff = true)
                    list.post { checkEdges() }
                }

                override fun onHistoryFailed(error: ApiException) {
                    if (feed.epoch != epoch) return
                    loadingOlder = false
                    retryOlderAt = SystemClock.uptimeMillis() + FeedWindow.RETRY_MS
                }
            },
        )
    }

    private fun loadNewer() {
        val edge = feed.newestId() ?: return
        loadingNewer = true
        val epoch = feed.epoch
        messages.loadNewer(
            chatId,
            edge,
            classGuid,
            object : HistoryCallback {
                override fun onHistory(page: HistoryPage) {
                    if (feed.epoch != epoch) return
                    loadingNewer = false
                    lastLoadedSide = FeedSide.NEWER
                    if (!page.hasMoreAfter) {
                        messages.readUnsent(chatId) { rows ->
                            for (row in rows) {
                                val clientId = row.message.clientId ?: continue
                                row.local?.let { feed.locals[clientId] = it }
                            }
                            finishNewer(epoch, page, rows.map { it.message })
                        }
                    } else {
                        finishNewer(epoch, page, emptyList())
                    }
                }

                override fun onHistoryFailed(error: ApiException) {
                    if (feed.epoch != epoch) return
                    loadingNewer = false
                    retryNewerAt = SystemClock.uptimeMillis() + FeedWindow.RETRY_MS
                }
            },
        )
    }

    private fun finishNewer(epoch: Int, page: HistoryPage, pending: List<MessageDto>) {
        if (feed.epoch != epoch) return
        feed.mergeNewer(page.messages, page.hasMoreAfter, pending)
        submitRows(diff = true)
        list.post { checkEdges() }
    }

    private fun scheduleTrim() {
        MainQueue.cancel(trimTask)
        MainQueue.postDelayed(trimTask, FeedWindow.TRIM_IDLE_MS)
    }

    private fun trimIfIdle() {
        if (!::list.isInitialized || list.scrollState != RecyclerView.SCROLL_STATE_IDLE) return
        if (feed.messages.size <= FeedWindow.ACCUMULATOR_LIMIT) return
        val keep = FeedWindow.keepRange(visibleMessageIds())
        if (feed.trim(lastLoadedSide, keep)) submitRows(diff = true)
    }

    private fun visibleMessageIds(): List<Long> {
        val ids = ArrayList<Long>()
        for (index in 0 until list.childCount) {
            val cell = list.getChildAt(index) as? MessageCell ?: continue
            cell.boundModel?.row?.message?.id?.let { ids.add(it) }
        }
        return ids
    }

    private fun updateReading() {
        if (!::list.isInitialized || !shown || !AppForeground.active || !feed.loaded) return
        if (feed.unreadAtEntry > 0 && (!cursorKnown || !unreadDecided || awaitingUnread)) return
        if (placement != null) return
        val top = list.paddingTop.toFloat()
        val bottom = visibleBottom()
        val me = myId()
        var newest = 0L
        for (index in 0 until list.childCount) {
            val child = list.getChildAt(index)
            val cell = child as? MessageCell ?: continue
            if (child.bottom <= top || child.top >= bottom) continue
            val message = cell.boundModel?.row?.message ?: continue
            if (message.id <= 0 || message.sender?.id == me) continue
            if (message.id > newest) newest = message.id
        }
        if (newest <= 0L) return
        val before = readTracker.cursor
        if (!readTracker.seen(newest)) return
        val read = ReadTracker.unreadBetween(feed.messages, me, before, newest)
        if (read <= 0) return
        val current = messages.chats.firstOrNull { it.id == chatId }?.unreadCount ?: return
        messages.setLocalUnread(chatId, current - read)
    }

    private fun updateFloatingDate(scrolled: Boolean) {
        val count = list.childCount
        if (count == 0 || !feed.loaded) {
            setFloating(null, 0f, scrolled)
            return
        }
        val children = ArrayList<View>(count)
        for (index in 0 until count) children.add(list.getChildAt(index))
        children.sortBy { it.y }
        val tops = FloatArray(children.size) { children[it].y }
        val rows = children.map { child -> adapter.rowAt(list.getChildAdapterPosition(child)) }
        val topmostPosition = list.getChildAdapterPosition(children.first())
        val dayAbove = topmostPosition in 0 until adapter.itemCount - 1
        val place = StickyDate.compute(
            tops,
            children.size,
            { rows[it] is FeedRow.Day },
            list.paddingTop.toFloat(),
            dayDividerHeight(context),
            dayAbove,
        )
        if (place == null) {
            setFloating(null, 0f, scrolled)
            return
        }
        val day = if (place.dayIndex >= 0) {
            (rows[place.dayIndex] as FeedRow.Day).dayStartMs
        } else {
            dayOfRow(rows, place.topIndex)
        }
        setFloating(day, place.offset, scrolled)
    }

    private fun dayOfRow(rows: List<FeedRow?>, index: Int): Long {
        for (at in index until rows.size) {
            when (val row = rows[at]) {
                is FeedRow.Message -> return row.dayStartMs
                is FeedRow.Day -> return row.dayStartMs
                else -> Unit
            }
        }
        return -1L
    }

    private fun setFloating(day: Long?, offset: Float, scrolled: Boolean) {
        if (day == null || day < 0) {
            if (floatingDay != -1L) {
                floatingDay = -1L
                floating.clear()
            }
            updateCovered()
            return
        }
        val changed = day != floatingDay
        floatingDay = day
        if (scrolled || changed || !floating.present) {
            floating.show(day, offset)
            floating.removeCallbacks(floatingHide)
            floating.postDelayed(floatingHide, StickyDate.HIDE_MS)
        } else {
            floating.translationY = offset
        }
        updateCovered()
    }

    private fun updateCovered() {
        for (index in 0 until list.childCount) {
            val view = list.getChildAt(index) as? DayDividerView ?: continue
            view.covered = isCoveredView(view)
        }
    }

    private fun isCoveredView(view: DayDividerView): Boolean {
        val line = list.paddingTop
        val top = view.y
        return top + view.height <= line || (floatingDay >= 0 && view.dayStartMs == floatingDay && top <= line)
    }

    override fun isCovered(dayStartMs: Long): Boolean = floatingDay >= 0 && dayStartMs == floatingDay

    override fun sideInsets(): Pair<Int, Int> =
        (px(ChatInsets.SIDE) + safe.left).roundToInt() to (px(ChatInsets.SIDE) + safe.right).roundToInt()

    override fun idOf(row: FeedRow): Long = feed.rowIds.idOf(row.key)

    override fun modelFor(row: FeedRow.Message): MessageCellModel {
        val chat = details
        val group = chat?.type == ChatType.GROUP || messages.chats.firstOrNull { it.id == chatId }?.type == ChatType.GROUP
        val message = row.message
        val local = message.clientId?.let { feed.locals[it] }
        val status = when {
            message.id > 0 -> SendStatus.SENT
            local?.failed == true -> SendStatus.FAILED
            else -> SendStatus.SENDING
        }
        val service = chat?.otherMember?.isService == true
        val (left, right) = sideInsets()
        return MessageCellModel(
            row = row,
            showAuthor = group && !row.own && !row.sameAuthorAsPrev,
            group = group && !row.own,
            showAvatar = group && !row.own && !row.sameAuthorAsNext,
            read = row.own && status == SendStatus.SENT && isReadByOthers(message.id),
            status = status,
            local = local,
            canReact = !service && message.id > 0,
            myId = myId(),
            sideLeft = left,
            sideRight = right,
        )
    }

    private fun isReadByOthers(messageId: Long): Boolean {
        val cursors = details?.readCursors ?: return false
        val me = myId()
        val others = cursors.filterKeys { it != me }
        if (others.isEmpty()) return false
        return others.values.all { it != null && it >= messageId }
    }

    override fun layoutFor(model: MessageCellModel, rowWidth: Int): BubbleLayout = layoutCache.layoutFor(model, rowWidth, Emoji.matcher != null)

    override fun onLinkClick(url: String) {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            android.util.Log.w(TAG, "ссылку нечем открыть", e)
        }
    }

    override fun onQuoteClick(model: MessageCellModel) {
        val reply = model.row.message.replyTo ?: return
        if (reply.deletedAt != null) return
        jumpTo(reply.id, from = model.row.message.id)
    }

    override fun onReactionClick(model: MessageCellModel, emoji: String) {
        messages.react(chatId, model.row.message.id, emoji)
    }

    private fun shouldAppear(holder: RecyclerView.ViewHolder): Boolean {
        val cell = holder.itemView as? MessageCell ?: return false
        val key = cell.key ?: return false
        return liveKeys.remove(key)
    }

    override fun scrollFraction(): Float {
        val range = list.computeVerticalScrollRange() - list.computeVerticalScrollExtent()
        if (range <= 0) return 1f
        return list.computeVerticalScrollOffset().toFloat() / range
    }

    override fun scrollByFraction(delta: Float) {
        val range = list.computeVerticalScrollRange() - list.computeVerticalScrollExtent()
        if (range <= 0) return
        list.scrollBy(0, (delta * range).roundToInt())
    }

    override fun onThumbDrag(active: Boolean) {
        if (active) {
            list.stopScroll()
            userScrolled = true
            pendingJumpId = null
            placement = null
        }
    }

    private fun rememberPosition() {
        if (!feed.loaded) return
        if (feed.atTail && distanceFromBottom() < px(FeedFollow.STICK_DP)) {
            ChatPositions.remember(chatId, ChatPosition.Tail)
            return
        }
        val anchor = topMessageAnchor() ?: return
        ChatPositions.remember(chatId, ChatPosition.At(anchor.first, anchor.second))
    }

    private fun topMessageAnchor(): Pair<Long, Int>? {
        var best: MessageCell? = null
        for (index in 0 until list.childCount) {
            val cell = list.getChildAt(index) as? MessageCell ?: continue
            if (cell.bottom <= list.paddingTop) continue
            if (best == null || cell.top < best.top) best = cell
        }
        val cell = best ?: return null
        val id = cell.boundModel?.row?.message?.id ?: return null
        if (id <= 0) return null
        return id to (cell.top - list.paddingTop)
    }

    private fun topAnchor(): Pair<String, Int>? {
        if (!::list.isInitialized) return null
        var best: View? = null
        for (index in 0 until list.childCount) {
            val child = list.getChildAt(index)
            if (child.bottom <= list.paddingTop) continue
            if (best == null || child.top < best.top) best = child
        }
        val view = best ?: return null
        val row = adapter.rowAt(list.getChildAdapterPosition(view)) ?: return null
        if (feed.atTail && distanceFromBottom() < px(FeedFollow.BOTTOM_SNAP_DP)) return null
        return row.key to (view.top - list.paddingTop)
    }


    private fun listItem(): ChatListItemDto? = messages.chats.firstOrNull { it.id == chatId } ?: details?.toListItem()

    private fun isGroup(): Boolean = listItem()?.type == ChatType.GROUP

    private fun isService(): Boolean = listItem()?.otherMember?.isService == true

    private fun isGroupAdmin(): Boolean = SelectionRules.isGroupAdmin(isGroup(), messages.membersOf(chatId), myId())

    private fun requestMembersIfGroup() {
        if (membersRequested || !isGroup()) return
        membersRequested = true
        messages.loadMembers(chatId)
    }

    private fun updateHeader(animated: Boolean) {
        if (!::top.isInitialized) return
        val chat = listItem()
        val service = isService()
        val available = failure == null
        top.header.setMode(available, service)
        if (chat != null) {
            top.header.capsule.setModel(
                CapsuleModel(
                    title = chat.title,
                    avatarColor = chat.otherMember?.avatarColor,
                    avatarKey = chatId,
                    avatarUrl = chat.avatarUrl,
                    service = service,
                    official = service || chat.isSupportRequest,
                    muted = chat.muted,
                ),
            )
        } else {
            top.header.capsule.setModel(CapsuleModel("", null, chatId, null, service = false, official = false, muted = false))
        }
        updateSubtitle(animated)
        updatePinned(animated)
        updateCall(animated)
        if (!available && selection.active) exitSelection(animated = false)
    }

    private fun updateSubtitle(animated: Boolean) {
        if (!::top.isInitialized) return
        val chat = listItem()
        if (chat == null && connectionKind == TitleKind.BRAND) {
            top.header.capsule.setSubtitle(null, animated)
            return
        }
        val input = SubtitleInput(
            connection = connectionKind,
            service = isService(),
            group = chat?.type == ChatType.GROUP,
            members = details?.members,
            myId = myId(),
            typists = QwillApplication.typing.typists(chatId),
            otherMember = chat?.otherMember ?: details?.otherMember,
            presence = { QwillApplication.presence[it] },
        )
        top.header.capsule.setSubtitle(ChatSubtitle.of(input), animated && shown)
    }

    private fun currentKind(): TitleKind =
        ConnectionTitleRule.kindOf(QwillApplication.socket.state, QwillApplication.session.state is SessionState.IpBanned)

    private fun onConnectionChanged() {
        val next = currentKind()
        if (next == targetKind) return
        targetKind = next
        MainQueue.cancel(kindTask)
        val delay = ConnectionTitleRule.delayFor(next)
        if (delay > 0L) {
            MainQueue.postDelayed(kindTask, delay)
        } else {
            connectionKind = next
            updateSubtitle(animated = true)
        }
    }

    private fun canUnpin(): Boolean = !isGroup() || isGroupAdmin()

    private fun updatePinned(animated: Boolean) {
        if (!::top.isInitialized) return
        val pinned = details?.pinnedMessage
        val visible = pinned != null && failure == null && !selection.active && !QwillApplication.hiddenPins.isHidden(chatId, pinned.id)
        top.setPinned(if (visible) pinned else null, canUnpin(), animated && shown)
    }

    private fun updateCall(animated: Boolean) {
        if (!::top.isInitialized) return
        val call = if (isGroup() && failure == null) QwillApplication.calls.callOf(chatId) else null
        top.setCall(call, animated && shown)
    }

    private fun onPinnedJump() {
        val pinned = details?.pinnedMessage ?: return
        jumpTo(pinned.id)
    }

    private fun onPinnedClose() {
        val pinned = details?.pinnedMessage ?: return
        if (!canUnpin()) {
            QwillApplication.hiddenPins.hide(chatId, pinned.id)
            updatePinned(animated = true)
            return
        }
        if (dialog != null) return
        val next = ChatDialogs.unpin(context, root, { messages.unpinMessage(chatId) }) {
            dialog = null
            backStateChanged()
        }
        dialog = next
        next.show()
        backStateChanged()
    }

    private fun openMenu() {
        if (menu?.isShowing == true || dialog != null || deleteChatDialog != null) return
        val chat = listItem() ?: return
        val target = menu ?: QwillMenu(root).also { menu = it }
        target.onClosed = { backStateChanged() }
        target.show(anchorOf(top.header.more), menuItems(chat), safe)
        backStateChanged()
    }

    private fun menuItems(chat: ChatListItemDto): List<QwillMenuItem> {
        val muteItem = QwillMenuItem(
            label = if (chat.muted) "Включить уведомления" else "Отключить уведомления",
            icon = if (chat.muted) QwillIcon.MUTE else QwillIcon.BELL,
            muted = chat.muted,
        ) { messages.setChatMuted(chatId, !chat.muted) }
        if (isService() || chat.type == ChatType.GROUP) return listOf(muteItem)
        val items = arrayListOf(muteItem)
        val other = chat.otherMember
        if (other != null) {
            items.add(
                QwillMenuItem(label = if (chat.iBlocked) "Разблокировать" else "Заблокировать", icon = QwillIcon.LOCK) {
                    if (chat.iBlocked) messages.setUserBlocked(chatId, other.id, false) {} else openBlockDialog(other.id, other.username)
                },
            )
        }
        items.add(QwillMenuItem(label = "Удалить чат", icon = QwillIcon.TRASH, danger = true) { openDeleteChat() })
        return items
    }

    private fun openBlockDialog(userId: String, username: String) {
        if (dialog != null) return
        val next = ChatDialogs.block(context, root, chatId, userId, username) {
            dialog = null
            backStateChanged()
        }
        dialog = next
        next.show()
        backStateChanged()
    }

    private fun openDeleteChat() {
        if (deleteChatDialog != null) return
        val chat = listItem() ?: return
        val next = DeleteChatDialog(context, root, chat) {
            deleteChatDialog = null
            backStateChanged()
        }
        deleteChatDialog = next
        next.show()
        backStateChanged()
    }

    private fun anchorOf(view: View): RectF {
        val viewLocation = IntArray(2)
        val rootLocation = IntArray(2)
        view.getLocationInWindow(viewLocation)
        root.getLocationInWindow(rootLocation)
        val left = (viewLocation[0] - rootLocation[0]).toFloat()
        val topY = (viewLocation[1] - rootLocation[1]).toFloat()
        val rect = RectF(left, topY, left + view.width, topY + view.height)
        val inset = (view.width - px(CIRCLE)) / 2f
        rect.inset(inset, inset)
        return rect
    }

    override fun isSelected(messageId: Long): Boolean = messageId in selection

    override fun onLongPress(message: MessageDto): Boolean {
        if (failure != null || !SelectionRules.selectable(message)) return false
        if (!selection.active) {
            selection.start(message.id)
            dragAdding = true
        } else if (message.id in selection) {
            selection.set(selection.ids - message.id)
            dragAdding = false
        } else {
            selection.set(SelectionRules.toggle(selection.ids, message.id))
            dragAdding = true
        }
        selectedCache[message.id] = message
        dragBase = selection.ids
        dragStart = message.id
        onSelectionChanged()
        return true
    }

    override fun onSelectTap(message: MessageDto) {
        if (!selection.active) return
        selectedCache[message.id] = message
        selection.set(SelectionRules.toggle(selection.ids, message.id))
        onSelectionChanged()
    }

    override fun onDragTo(message: MessageDto) {
        if (!selection.active) return
        val ordered = feed.messages.filter { SelectionRules.selectable(it) }.map { it.id }
        val range = SelectionRules.rangeBetween(ordered, dragStart, message.id)
        for (id in range) feed.messages.firstOrNull { it.id == id }?.let { selectedCache[id] = it }
        val next = SelectionRules.dragSelect(dragBase, range, dragAdding)
        if (next == selection.ids) return
        selection.set(next)
        onSelectionChanged()
    }

    private fun onSelectionChanged() {
        if (!selection.active) {
            exitSelection(animated = true)
            return
        }
        selectedCache.keys.retainAll(selection.ids.toHashSet())
        if (selectionShown < 1f && selectionAnimator == null) runSelectionProgress(1f)
        top.setSelectionMode(true, animated = true)
        updateSelectionHeader(animated = true)
        syncCells()
        updatePinned(animated = true)
        backStateChanged()
    }

    private fun updateSelectionHeader(animated: Boolean) {
        if (!::top.isInitialized || !selection.active) return
        top.selection.setState(selection.count, SelectionRules.canDelete(selectedMessages(), myId(), isGroupAdmin()), animated)
    }

    private fun selectedMessages(): List<MessageDto> =
        selection.ids.mapNotNull { id -> feed.messages.firstOrNull { it.id == id } ?: selectedCache[id] }

    private fun exitSelection(animated: Boolean) {
        val wasActive = selection.active || selectionShown > 0f
        selection.clear()
        selectedCache.clear()
        dialog?.let { if (!it.isClosed) it.requestClose() }
        if (!::top.isInitialized) return
        top.setSelectionMode(false, animated)
        if (wasActive) {
            if (animated) runSelectionProgress(0f) else setSelectionShown(0f)
        }
        syncCells()
        updatePinned(animated)
        backStateChanged()
    }

    private fun runSelectionProgress(target: Float) {
        selectionAnimator?.cancel()
        selectionAnimator = null
        if (!Motion.animationsEnabled || !shown) {
            setSelectionShown(target)
            return
        }
        val from = selectionShown
        val curve = if (target > from) SELECT_IN else SELECT_OUT
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(SELECT_MS)
        animator.interpolator = LinearInterpolator()
        animator.addUpdateListener { setSelectionShown(from + (target - from) * curve.getInterpolation(it.animatedValue as Float)) }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (selectionAnimator === animation) selectionAnimator = null
            }
        })
        selectionAnimator = animator
        animator.start()
    }

    private fun setSelectionShown(value: Float) {
        selectionShown = value
        for (index in 0 until list.childCount) list.getChildAt(index).invalidate()
    }

    private fun syncCells() {
        for (index in 0 until list.childCount) {
            val cell = list.getChildAt(index) as? MessageCell ?: continue
            cell.syncSelection(animated = true)
            cell.invalidate()
        }
    }

    private fun copySelection() {
        val text = SelectionRules.copyText(selectedMessages())
        if (text.isNotEmpty()) {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager
            clipboard?.setPrimaryClip(ClipData.newPlainText(CLIP_LABEL, text))
            if (Build.VERSION.SDK_INT < 33) Toast.makeText(context, "Текст скопирован", Toast.LENGTH_SHORT).show()
        }
        exitSelection(animated = true)
    }

    private fun confirmDeleteSelection() {
        if (dialog != null || !selection.active) return
        val ids = selection.ids.toList()
        val next = ChatDialogs.deleteMessages(context, root, ids.size, {
            messages.deleteMessages(chatId, ids) { failure -> if (failure == null && selection.active) exitSelection(animated = true) }
        }) {
            dialog = null
            backStateChanged()
        }
        dialog = next
        next.show()
        backStateChanged()
    }

    private fun myId(): String? = (QwillApplication.session.state as? SessionState.Authenticated)?.user?.id

    private fun px(dp: Float): Float = dp * context.resources.displayMetrics.density

    private inner class CenterScroller(context: Context, private val key: String) : LinearSmoothScroller(context) {
        override fun calculateDtToFit(viewStart: Int, viewEnd: Int, boxStart: Int, boxEnd: Int, snapPreference: Int): Int {
            val center = visibleCenter()
            return (center - (viewStart + viewEnd) / 2f).roundToInt()
        }

        override fun onStop() {
            super.onStop()
            if (pendingJumpId != null) {
                pendingJumpId = null
                startFlash(key)
            }
        }
    }

    private class EdgeScroller(context: Context, private val snapToEnd: Boolean) : LinearSmoothScroller(context) {
        override fun getVerticalSnapPreference(): Int = if (snapToEnd) SNAP_TO_END else SNAP_TO_START
    }

    private companion object {
        const val TAG = "QwillChat"
        const val STATUS_ALPHA = 0.5f
        const val STATUS_PAD_X = 32f
        const val FLOATING_TAP_EXTRA = 10f
        const val THUMB_STRIP = 52f
        const val REBIND_MARGIN = 4
        const val DEFAULT_ROW = 56f
        const val AUTO_SCROLL_GUARD_MS = 700L
        const val MINUTE_MS = 60_000L
        const val SELECT_MS = 200L
        val SELECT_IN = PathInterpolator(0f, 0f, 0.58f, 1f)
        val SELECT_OUT = PathInterpolator(0.42f, 0f, 1f, 1f)
        const val CIRCLE = 40f
        const val CLIP_LABEL = "Qwill"
    }
}
