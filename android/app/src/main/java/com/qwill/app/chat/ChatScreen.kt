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
import android.view.inputmethod.InputMethodManager
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
import com.qwill.app.chat.bottom.BottomMode
import com.qwill.app.chat.bottom.ChatBottomLayer
import com.qwill.app.chat.bottom.IslandFrame
import com.qwill.app.chat.composer.ComposerController
import com.qwill.app.chat.calendar.CalendarFilter
import com.qwill.app.chat.calendar.ChatCalendarSheet
import com.qwill.app.chat.calendar.DatePickerSheet
import com.qwill.app.chat.dialogs.ChatDialogs
import com.qwill.app.chat.dialogs.ConfirmDialog
import com.qwill.app.chat.search.ChatSearch
import com.qwill.app.chat.search.ChatSearchListView
import com.qwill.app.chat.search.ChatSearchMode
import com.qwill.app.chat.search.ChatSearchText
import com.qwill.app.chat.search.ChatSearchTransport
import com.qwill.app.chat.search.MemberSuggest
import com.qwill.app.chat.search.SearchArrowsView
import com.qwill.app.chat.search.SearchCancel
import com.qwill.app.chat.selection.FeedListView
import com.qwill.app.chat.selection.FeedTouchHelper
import com.qwill.app.chat.selection.MessageSelection
import com.qwill.app.chat.selection.EditRules
import com.qwill.app.chat.selection.ReplyRules
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
import com.qwill.app.model.ChatSearchResponse
import com.qwill.app.model.ChatType
import com.qwill.app.model.GroupMemberDTO
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import com.qwill.app.realtime.ConnectionState
import com.qwill.app.realtime.ConnectionStateListener
import com.qwill.app.realtime.PresenceListener
import com.qwill.app.realtime.TypingListener
import com.qwill.app.search.Highlight
import com.qwill.app.ui.AppForeground
import com.qwill.app.ui.ConnectionTitleRule
import com.qwill.app.ui.ForegroundListener
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.QwillMenu
import com.qwill.app.ui.QwillMenuItem
import com.qwill.app.ui.TitleKind
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.BackGestureOverlay
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

enum class JumpOutcome { OK, FAILED, SUPERSEDED }

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
    private lateinit var bottom: ChatBottomLayer
    private lateinit var searchPanel: ChatSearchListView
    private lateinit var touchHelper: FeedTouchHelper
    private lateinit var layoutManager: LinearLayoutManager
    private lateinit var adapter: ChatAdapter
    private lateinit var floating: FloatingDateView
    private lateinit var jump: JumpDownButton
    private lateinit var mentionJump: JumpDownButton
    private lateinit var sideStack: FrameLayout
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
    private val flashes = HashMap<String, Long>()
    private var islandCurrent = 0f
    private var islandApplied = 0f
    private var islandShift = 0f
    private var keyboardShift = 0f
    private var blockPending = false
    private var mentionsRequested = false
    private val pendingMentionReads = LinkedHashSet<Long>()
    private var mentionReadScheduled = false
    private val mentionReadTask = Runnable { flushMentionReads() }
    private val composerHost = object : ComposerController.Host {
        override val myId: String? get() = this@ChatScreen.myId()

        override val groupChat: Boolean get() = isGroup()

        override fun members(): List<GroupMemberDTO>? = messages.membersOf(chatId)

        override fun recentAuthorIds(): List<String> = feed.messages.asReversed().mapNotNull { it.sender?.id }.distinct()

        override fun jumpTo(messageId: Long) = this@ChatScreen.jumpTo(messageId)

        override fun socketReady(): Boolean {
            val state = QwillApplication.socket.state
            return state == ConnectionState.Connected || state == ConnectionState.Updating
        }
    }
    private val composer = ComposerController(chatId, composerHost)
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
    private val search = ChatSearch(SearchTransport()) { onSearchChanged() }
    private var calendarSheet: ChatCalendarSheet? = null
    private var dateSheet: DatePickerSheet? = null
    private var jumpOutcome: ((JumpOutcome) -> Unit)? = null
    private var panelSource = false
    private var appliedHighlight: String? = null
    private var counterIndex = 0
    private var searchSelectionHidden = false
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
        updateMentionJump(animated = true)
    }
    private val presenceListener = PresenceListener { updateSubtitle(animated = true) }
    private val typingListener = TypingListener { changed -> if (changed == null || changed == chatId) updateSubtitle(animated = true) }
    private val connectionListener = ConnectionStateListener { onConnectionChanged() }
    private val callsListener = ActiveCallsListener { changed -> if (changed == chatId) updateCall(animated = true) }
    private val membersListener = MembersListener { changed ->
        if (changed != chatId) return@MembersListener
        updatePinned(animated = true)
        updateSelectionHeader(animated = false)
        if (search.open) renderSearch(animated = true)
        composer.refreshMentions()
    }
    private val emojiListener = EmojiListener { indexChanged ->
        if (indexChanged) {
            layoutCache.clear()
            rebindAll()
            top.pinnedBanner.applyTheme()
            bottom.composer.input.refreshEmoji()
            bottom.contextBar.refresh()
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
            flushMentionReads()
            composer.saveDraft()
        }
    }

    override val interceptsBack: Boolean
        get() = menu?.isShowing == true || dialog != null || deleteChatDialog != null || calendarSheet != null || dateSheet != null ||
            selection.active || search.open

    override val backOverlay: BackGestureOverlay?
        get() = calendarSheet?.sheet ?: dateSheet?.sheet

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
                if (!panelSource) feedBlur(dy)
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

        sideStack = FrameLayout(context)
        sideStack.clipChildren = false
        sideStack.clipToPadding = false
        jump = JumpDownButton(context) { onJumpPressed() }
        mentionJump = JumpDownButton(context, QwillIcon.AT, MENTIONS_LABEL, MENTIONS_COUNT_LABEL) { onMentionJumpPressed() }
        mentionJump.onLongPress = { openMentionMenu() }
        sideStack.addView(jump, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        sideStack.addView(mentionJump, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        root.addView(sideStack, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END or Gravity.BOTTOM))

        thumb = FeedScrollThumb(context, this)
        root.addView(thumb, FrameLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.END))

        searchPanel = ChatSearchListView(context)
        searchPanel.onSelect = { index -> search.select(index) }
        searchPanel.onLoadMore = { search.loadMore() }
        searchPanel.onReveal = { progress -> onPanelReveal(progress) }
        searchPanel.onScrolledBy = { dy -> if (panelSource) feedBlur(dy) }
        root.addView(searchPanel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        bottom = ChatBottomLayer(context, list, wallpaper)
        root.addView(bottom, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        bottom.onIsland = { frame -> applyIsland(frame) }
        bottom.onKeyboardShift = { shift ->
            keyboardShift = shift
            applyListTranslation()
        }
        bottom.selectionBar.reply.setOnClickListener { replyToSelection() }
        bottom.blocked.unblock.setOnClickListener { unblockFromBar() }
        bottom.service.onMutedChange = { muted -> messages.setChatMuted(chatId, muted) }
        composer.attach(bottom)
        bottom.bar.calendar.setOnClickListener { openDatePicker() }
        bottom.bar.from.setOnClickListener {
            search.startPicking()
            top.search.focusInput()
        }
        bottom.bar.toggle.setOnClickListener {
            search.setMode(if (search.mode == ChatSearchMode.LIST) ChatSearchMode.CHAT else ChatSearchMode.LIST)
            if (search.mode == ChatSearchMode.LIST) top.search.dropKeyboard()
        }
        bottom.arrows.older.setOnClickListener { search.next() }
        bottom.arrows.newer.setOnClickListener { search.prev() }
        bottom.members.onPick = { member -> search.pick(member) }

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
        top.search.back.setOnClickListener { closeSearch() }
        top.search.clear.setOnClickListener { onSearchClear() }
        top.search.field.onText = { text -> search.setDraft(text) }
        top.search.field.onSubmit = {
            top.search.dropKeyboard()
            search.submit()
        }
        top.search.field.input.onDeleteEmpty = { if (search.from != null || search.picking) search.clearCaption() }
        top.selection.close.setOnClickListener { exitSelection(animated = true) }
        top.selection.edit.setOnClickListener { editSelection() }
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
        if (search.open) renderSearch(animated = false)
        updateBottomMode(animated = false)
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
        top.search.dropKeyboard()
        composer.saveDraft()
        composer.onLeave()
        composer.dropKeyboard()
        flushMentionReads()
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
        calendarSheet?.let {
            it.requestClose()
            return true
        }
        dateSheet?.let {
            it.requestClose()
            return true
        }
        if (selection.active) {
            exitSelection(animated = true)
            return true
        }
        if (search.open) {
            if (search.mode == ChatSearchMode.LIST) search.setMode(ChatSearchMode.CHAT) else closeSearch()
            return true
        }
        return false
    }

    override fun onViewDestroyed() {
        restoreAnchor = topAnchor()
        composer.detach()
        MainQueue.cancel(mentionReadTask)
        mentionReadScheduled = false
        MainQueue.cancel(trimTask)
        MainQueue.cancel(kindTask)
        selectionAnimator?.cancel()
        selectionAnimator = null
        menu?.dismissNow()
        menu = null
        dialog?.dismissNow()
        dialog = null
        deleteChatDialog = null
        calendarSheet?.dismissNow()
        calendarSheet = null
        dateSheet?.dismissNow()
        dateSheet = null
        panelSource = false
    }

    override fun onDestroyed() {
        readTracker.stop()
        composer.onLeave()
        MainQueue.cancel(mentionReadTask)
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
        bottom.applyTheme()
        searchPanel.applyTheme()
        calendarSheet?.applyTheme()
        dateSheet?.applyTheme()
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
        bottom.setSafeArea(safe)
        calendarSheet?.setSafeArea(safe)
        dateSheet?.setSafeArea(safe)
        val contentTop = top.contentTop + safe.top
        setListPadding(contentTop, listBottomPadding())
        searchPanel.setInsets(contentTop, (px(PANEL_BOTTOM) + safe.bottom).roundToInt())
        status.setPadding((px(STATUS_PAD_X) + safe.left).roundToInt(), list.paddingTop, (px(STATUS_PAD_X) + safe.right).roundToInt(), list.paddingBottom)
        (floating.layoutParams as FrameLayout.LayoutParams).topMargin =
            (contentTop + px(ChatTopLayout.FLOATING_DATE_GAP) - px(FLOATING_TAP_EXTRA)).roundToInt()
        floating.requestLayout()
        val stackParams = sideStack.layoutParams as FrameLayout.LayoutParams
        stackParams.rightMargin = (px(ChatInsets.JUMP_RIGHT) + safe.right - jump.pad).roundToInt()
        stackParams.bottomMargin = (bottomInset() + px(STACK_GAP) - jump.pad).roundToInt()
        stackParams.height = (px(Dimens.TAP_MIN) + jump.pad * 2 + px(STACK_ROOM)).roundToInt()
        sideStack.requestLayout()
        applyStackTranslation()
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
        composer.restoreDraft()
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
        updateMentionJump(animated = true)
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
                update.reason?.let { composer.showError(it) }
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
                for (message in update.messages) composer.onMessageChanged(message)
                for (message in update.messages) if (message.id in selectedCache) selectedCache[message.id] = message
                if (selection.active) updateSelectionHeader(animated = false)
            }
            is FeedUpdate.Removed -> {
                if (feed.remove(update.ids)) submitRows(diff = true)
                composer.onMessagesRemoved(update.ids)
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
                composer.onChatGone()
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
        applyFeedVisibility()
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

    override fun visibleBottom(): Float = list.height - list.paddingBottom + px(LIST_EXTRA)

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
        if (!visible && jump.shown && !search.open) feed.returnToId = null
        jump.setShown(visible && !search.open)
        updateStack(animated = true)
    }

    private fun updateJumpCount() {
        jump.setCount(messages.chats.firstOrNull { it.id == chatId }?.unreadCount ?: 0)
        updateStack(animated = true)
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

    private fun settleJump(outcome: JumpOutcome) {
        val callback = jumpOutcome ?: return
        jumpOutcome = null
        callback(outcome)
    }

    private fun jumpTo(messageId: Long, from: Long? = null, onOutcome: ((JumpOutcome) -> Unit)? = null) {
        settleJump(JumpOutcome.SUPERSEDED)
        jumpOutcome = onOutcome
        jumpSeq++
        list.stopScroll()
        if (from != null) feed.returnToId = from
        pendingJumpId = messageId
        userScrolled = true
        val position = adapter.positionOfMessage(messageId)
        if (position < 0) {
            loadWindow(messageId, flash = true, offset = null)
            return
        }
        settleJump(JumpOutcome.OK)
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
                        settleJump(JumpOutcome.FAILED)
                        return
                    }
                    settleJump(JumpOutcome.OK)
                    feed.locals.putAll(page.pendingLocal)
                    replaceFeed(page.messages, page.pending, page.hasMoreBefore, page.hasMoreAfter)
                    submitRows(diff = false)
                    updateStatus()
                    val key = keyOfMessage(messageId)
                    if (offset != null) setPlacement(Placement.Top(key, offset)) else setPlacement(Placement.Center(key, flash))
                }

                override fun onHistoryFailed(error: ApiException) {
                    if (seq != jumpSeq) return
                    pendingJumpId = null
                    settleJump(JumpOutcome.FAILED)
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
        val now = SystemClock.uptimeMillis()
        flashes.entries.removeAll { now - it.value > Motion.FLASH }
        flashes[key] = now
        val position = adapter.positionOfKey(key)
        if (position >= 0) layoutManager.findViewByPosition(position)?.invalidate()
    }

    override fun flashStartedAt(key: String): Long = flashes[key] ?: 0L

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
        if (searchPanel.revealed >= 1f) return
        if (placement == null) collectMentionReads(list.paddingTop.toFloat(), visibleBottom())
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
        val query = appliedHighlight
        val highlight = if (query != null && !message.content.isNullOrEmpty() && Highlight.ranges(message.content, query).isNotEmpty()) query else null
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
            highlight = highlight,
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
        if (!available && search.open) closeSearch()
        updateBottomMode(animated)
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
        val visible = pinned != null && failure == null && !selection.active && !search.open && !QwillApplication.hiddenPins.isHidden(chatId, pinned.id)
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
        val searchItem = QwillMenuItem(label = "Поиск", icon = QwillIcon.SEARCH) { openSearch() }
        val muteItem = QwillMenuItem(
            label = if (chat.muted) "Включить уведомления" else "Отключить уведомления",
            icon = if (chat.muted) QwillIcon.MUTE else QwillIcon.BELL,
            muted = chat.muted,
        ) { messages.setChatMuted(chatId, !chat.muted) }
        if (isService() || chat.type == ChatType.GROUP) return listOf(searchItem, muteItem)
        val items = arrayListOf(searchItem, muteItem)
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
        if (search.open) renderSearch(animated = true)
        updateBottomMode(animated = true)
        backStateChanged()
    }

    private fun updateSelectionHeader(animated: Boolean) {
        if (!::top.isInitialized || !selection.active) return
        val selected = selectedMessages()
        val canEdit = selected.size == 1 && EditRules.canEdit(selected[0], myId())
        top.selection.setState(selection.count, SelectionRules.canDelete(selected, myId(), isGroupAdmin()), canEdit, animated)
        if (::bottom.isInitialized) bottom.setSelectionReply(selectionReplyTarget() != null, animated && shown)
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
        if (search.open) renderSearch(animated)
        updateBottomMode(animated)
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

    private fun bottomInset(): Float = px(ChatBottomLayer.BOTTOM) + safe.bottom

    private fun listBottomPadding(): Int = (islandApplied + bottomInset() + px(LIST_EXTRA)).roundToInt()

    private fun applyIsland(frame: IslandFrame): Boolean {
        islandCurrent = frame.current
        islandApplied = frame.applied
        islandShift = frame.listShift
        if (!::list.isInitialized) return false
        val padding = listBottomPadding()
        val changed = padding != list.paddingBottom
        if (changed) {
            list.setPadding(list.paddingLeft, list.paddingTop, list.paddingRight, padding)
            status.setPadding(status.paddingLeft, status.paddingTop, status.paddingRight, padding)
            updateThumbTrack()
        }
        applyListTranslation()
        return changed
    }

    private fun applyListTranslation() {
        if (!::list.isInitialized) return
        val next = islandShift - keyboardShift
        if (list.translationY != next) {
            list.translationY = next
            if (::top.isInitialized) top.invalidate()
            if (::bottom.isInitialized) bottom.invalidateBlur()
        }
        applyStackTranslation()
    }

    private fun applyStackTranslation() {
        if (!::sideStack.isInitialized) return
        sideStack.translationY = -(islandCurrent + keyboardShift)
    }

    private fun chatWritable(): Boolean {
        val chat = listItem()
        return failure == null && !isService() && chat?.iBlocked != true && chat?.blockedMe != true
    }

    private fun bottomModeNow(): BottomMode {
        val chat = listItem()
        return when {
            failure != null -> BottomMode.NONE
            selection.active -> BottomMode.SELECTION
            search.open -> BottomMode.SEARCH
            isService() -> BottomMode.SERVICE
            chat != null && (chat.iBlocked || chat.blockedMe) -> BottomMode.BLOCKED
            else -> BottomMode.COMPOSER
        }
    }

    private fun updateBottomMode(animated: Boolean) {
        if (!::bottom.isInitialized) return
        val chat = listItem()
        if (chat != null) {
            bottom.blocked.setState(chat.iBlocked, blockPending)
            bottom.service.setMuted(chat.muted, animated && shown)
        }
        val mode = bottomModeNow()
        val changed = mode != bottom.currentMode
        bottom.setMode(mode, animated && shown)
        bottom.setSelectionReply(selectionReplyTarget() != null, animated && shown)
        if (changed) composer.onModeChanged()
    }

    private fun selectionReplyTarget(): MessageDto? {
        if (!selection.active || selection.count != 1) return null
        val message = selectedMessages().singleOrNull() ?: return null
        return if (ReplyRules.canReply(message, chatWritable())) message else null
    }

    private fun replyToSelection() {
        val message = selectionReplyTarget() ?: return
        exitSelection(animated = true)
        composer.reply(message)
    }

    private fun editSelection() {
        val message = selectedMessages().singleOrNull() ?: return
        if (!EditRules.canEdit(message, myId())) return
        exitSelection(animated = true)
        composer.edit(message)
    }

    private fun unblockFromBar() {
        val other = listItem()?.otherMember ?: return
        if (blockPending) return
        blockPending = true
        updateBottomMode(animated = true)
        messages.setUserBlocked(chatId, other.id, false) {
            blockPending = false
            updateBottomMode(animated = true)
        }
    }

    private fun mentionCount(): Int = listItem()?.unreadMentionsCount ?: 0

    private fun requestMentionsIfNeeded() {
        if (mentionsRequested || !isGroup() || mentionCount() <= 0) return
        mentionsRequested = true
        messages.loadUnreadMentions(chatId, classGuid) { result ->
            if (result is ApiResult.Success && ::list.isInitialized) list.post { updateReading() }
        }
    }

    private fun updateMentionJump(animated: Boolean) {
        if (!::mentionJump.isInitialized) return
        val count = mentionCount()
        mentionJump.setCount(count)
        mentionJump.setShown(count > 0 && feed.loaded && failure == null && !search.open, animated && shown)
        updateStack(animated)
        if (count > 0) requestMentionsIfNeeded()
    }

    private fun updateStack(animated: Boolean) {
        if (!::mentionJump.isInitialized) return
        val gap = px(STACK_BUTTONS_GAP)
        val offset = if (jump.shown) -(px(Dimens.TAP_MIN) + gap + if (jump.hasCount) gap else 0f) else 0f
        mentionJump.setStackOffset(offset, animated && shown)
    }

    private fun onMentionJumpPressed() {
        list.stopScroll()
        val first = messages.unreadMentionIds(chatId).firstOrNull { it !in pendingMentionReads }
        if (first != null) {
            jumpTo(first)
            return
        }
        messages.loadUnreadMentions(chatId, classGuid) { result ->
            if (result is ApiResult.Success) result.value.firstOrNull()?.let { jumpTo(it) }
        }
    }

    private fun openMentionMenu() {
        if (menu?.isShowing == true || dialog != null || deleteChatDialog != null) return
        val target = menu ?: QwillMenu(root).also { menu = it }
        target.onClosed = { backStateChanged() }
        val items = listOf(QwillMenuItem(label = MENTIONS_READ_ALL, icon = QwillIcon.CHECK_DOUBLE) { readAllMentions() })
        target.show(anchorOf(mentionJump), items, safe)
        backStateChanged()
    }

    private fun readAllMentions() {
        pendingMentionReads.clear()
        MainQueue.cancel(mentionReadTask)
        mentionReadScheduled = false
        messages.readAllMentions(chatId)
    }

    private fun collectMentionReads(topEdge: Float, bottomEdge: Float) {
        val unread = messages.unreadMentionIds(chatId)
        if (unread.isEmpty()) return
        val wanted = unread.toHashSet()
        for (index in 0 until list.childCount) {
            val child = list.getChildAt(index)
            val cell = child as? MessageCell ?: continue
            if (child.bottom <= topEdge || child.top >= bottomEdge) continue
            val message = cell.boundModel?.row?.message ?: continue
            if (message.id !in wanted || !pendingMentionReads.add(message.id)) continue
            cell.key?.let { startFlash(it) }
        }
        if (pendingMentionReads.isNotEmpty() && !mentionReadScheduled) {
            mentionReadScheduled = true
            MainQueue.postDelayed(mentionReadTask, ReadTracker.MIN_INTERVAL_MS)
        }
    }

    private fun flushMentionReads() {
        MainQueue.cancel(mentionReadTask)
        mentionReadScheduled = false
        if (pendingMentionReads.isEmpty()) return
        val ids = pendingMentionReads.toList()
        pendingMentionReads.clear()
        messages.readMentions(chatId, ids)
    }

    private fun hideKeyboard() {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(root.windowToken, 0)
        composer.dropKeyboard()
    }

    override val keyboardShown: Boolean get() = keyboardShift > 0f || safe.keyboard > 0

    override fun dismissKeyboard() {
        hideKeyboard()
    }

    override fun canSwipeReply(message: MessageDto): Boolean =
        ::bottom.isInitialized && bottom.currentMode == BottomMode.COMPOSER && ReplyRules.canReply(message, chatWritable())

    override fun onSwipeReply(message: MessageDto) {
        composer.reply(message)
    }

    override fun onMentionClick(username: String) {
        val me = (QwillApplication.session.state as? SessionState.Authenticated)?.user
        if (me != null && me.username.equals(username, ignoreCase = true)) return
        val known = messages.chats.firstOrNull { it.type == ChatType.PRIVATE && it.otherMember?.username.equals(username, ignoreCase = true) }
        if (known != null) {
            if (known.id != chatId && stack?.top === this) stack?.push(ChatScreen(known.id))
            return
        }
        messages.startPrivateChat(username, classGuid) { result ->
            when (result) {
                is ApiResult.Success -> if (result.value.id != chatId && stack?.top === this) stack?.push(ChatScreen(result.value.id))
                is ApiResult.Failure -> Toast.makeText(context, result.error.message ?: MENTION_NOT_FOUND, Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDayTap(dayStartMs: Long) {
        openCalendar(dayStartMs)
    }

    private fun feedBlur(dy: Int) {
        if (::top.isInitialized) top.onSourceScrolled(dy)
        if (::bottom.isInitialized) bottom.onSourceScrolled(dy)
    }

    private fun applyFeedVisibility() {
        val covered = ::searchPanel.isInitialized && searchPanel.revealed >= 1f
        list.visibility = if (failure != null || covered) View.INVISIBLE else View.VISIBLE
        wallpaper.visibility = if (covered) View.INVISIBLE else View.VISIBLE
    }

    private fun onPanelReveal(progress: Float) {
        val usePanel = progress > 0f
        if (usePanel != panelSource) {
            panelSource = usePanel
            val source: View = if (usePanel) searchPanel else list
            top.setBlurSource(source, wallpaper)
            bottom.setBlurSource(source, wallpaper)
        }
        val wasCovered = list.visibility == View.INVISIBLE && failure == null
        applyFeedVisibility()
        if (wasCovered && progress < 1f) list.post { updateReading() }
    }

    private fun openSearch() {
        if (failure != null || search.open) return
        search.open()
        top.search.focusInput()
    }

    private fun closeSearch() {
        if (!search.open) return
        top.search.dropKeyboard()
        search.close()
    }

    private fun onSearchClear() {
        if (search.draft.isNotEmpty()) search.setDraft("") else search.clearCaption()
    }

    private fun onSearchChanged() {
        if (view == null || !::top.isInitialized) return
        renderSearch(animated = true)
    }

    private fun renderSearch(animated: Boolean) {
        val open = search.open
        val animate = animated && shown
        top.setSearchMode(open, animate)
        val field = top.search.field
        field.setText(search.draft)
        field.setCaption(search.picking, search.from?.let { MemberSuggest.firstName(it) })
        top.search.setClearShown(open && (search.draft.isNotEmpty() || search.picking || search.from != null), animate)
        val bar = bottom.bar
        bar.setButtons(calendarShown = !search.picking, fromShown = isGroup() && !search.picking)
        val up = search.index >= counterIndex
        counterIndex = search.index
        bar.counter.set(ChatSearchText.counter(search), up, animate)
        bar.toggle.setState(search.mode == ChatSearchMode.LIST, search.total > 0, animate)
        bottom.arrows.setEnabledArrows(search.canOlder, search.canNewer, animate)
        val visible = open && !selection.active
        val selectionChanged = open && searchSelectionHidden != selection.active
        searchSelectionHidden = selection.active
        updateBottomMode(animate)
        bottom.arrows.setListMode(search.mode == ChatSearchMode.LIST, animate)
        bottom.arrows.setShown(visible, if (selectionChanged) SearchArrowsView.SELECTION_MS else SearchArrowsView.OPEN_MS, animate) {
            bottom.settleVisibility()
        }
        val suggestions = if (open && search.picking) {
            val recent = feed.messages.asReversed().mapNotNull { it.sender?.id }.distinct()
            MemberSuggest.filter(messages.membersOf(chatId), search.draft, recent, myId())
        } else {
            emptyList()
        }
        bottom.members.setMembers(suggestions, search.draft, open && search.picking, animate)
        searchPanel.setData(search.results, search.query, search.index, search.loading, search.loadingMore, myId())
        searchPanel.setOpen(open && search.mode == ChatSearchMode.LIST, animate)
        val highlight = if (open) search.query.trim().ifEmpty { null } else null
        if (highlight != appliedHighlight) {
            appliedHighlight = highlight
            rebindVisible()
        }
        updateJumpVisibility()
        updateMentionJump(animate)
        updatePinned(animate)
        backStateChanged()
    }

    private fun openCalendar(dayStartMs: Long) {
        if (calendarSheet != null || dateSheet != null || failure != null) return
        menu?.dismissNow()
        val day = DayLabel.dayKey(dayStartMs)
        val next = ChatCalendarSheet(context, root, chatId, CalendarFilter.ALL, day, day, classGuid, { picked -> jumpTo(picked.firstMessageId) }) {
            calendarSheet = null
            backStateChanged()
        }
        calendarSheet = next
        next.setSafeArea(safe)
        next.show()
        backStateChanged()
    }

    private fun openDatePicker() {
        if (calendarSheet != null || dateSheet != null) return
        top.search.dropKeyboard()
        val next = DatePickerSheet(context, root, chatId, classGuid, { id, done -> jumpTo(id, null, done) }) {
            dateSheet = null
            backStateChanged()
        }
        dateSheet = next
        next.setSafeArea(safe)
        next.show()
        backStateChanged()
    }

    private inner class SearchTransport : ChatSearchTransport {
        override fun search(q: String, before: Long?, fromUserId: String?, done: (ApiResult<ChatSearchResponse>) -> Unit): SearchCancel {
            val handle = QwillApplication.api.send(ChatRequests.search(chatId, q, before, fromUserId), classGuid) { done(it) }
            return SearchCancel { QwillApplication.api.cancel(handle) }
        }

        override fun jump(messageId: Long, done: (JumpOutcome) -> Unit) {
            jumpTo(messageId, null, done)
        }
    }

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
        const val PANEL_BOTTOM = 100f
        const val LIST_EXTRA = 40f
        const val STACK_GAP = 12f
        const val STACK_BUTTONS_GAP = 10f
        const val STACK_ROOM = 64f
        const val MENTIONS_LABEL = "К непрочитанным упоминаниям"
        const val MENTIONS_COUNT_LABEL = "упоминаний"
        const val MENTIONS_READ_ALL = "Отметить все прочитанными"
        const val MENTION_NOT_FOUND = "Пользователь не найден"
    }
}
