package com.qwill.app.chats

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Parcelable
import android.util.DisplayMetrics
import android.view.ContextThemeWrapper
import android.view.View
import android.view.ViewTreeObserver
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.LinearSmoothScroller
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.QwillApplication
import com.qwill.app.R
import com.qwill.app.auth.SessionState
import com.qwill.app.auth.SessionStateListener
import com.qwill.app.chat.ChatScreen
import com.qwill.app.core.MainQueue
import com.qwill.app.emoji.Emoji
import com.qwill.app.emoji.EmojiListener
import com.qwill.app.messenger.ChatsListener
import com.qwill.app.model.ChatSearchResult
import com.qwill.app.model.ChatType
import com.qwill.app.model.PublicUser
import com.qwill.app.model.UserRole
import com.qwill.app.model.UserSearchResult
import com.qwill.app.net.ApiResult
import com.qwill.app.realtime.ConnectionStateListener
import com.qwill.app.realtime.PresenceListener
import com.qwill.app.realtime.TypingListener
import com.qwill.app.search.PressableView
import com.qwill.app.search.RecentSearchEntry
import com.qwill.app.search.RecentSearches
import com.qwill.app.search.RecentSearchesListener
import com.qwill.app.search.RevealGeometry
import com.qwill.app.search.SearchAdapterHost
import com.qwill.app.search.SearchIconButton
import com.qwill.app.search.SearchItems
import com.qwill.app.search.SearchPillPainter
import com.qwill.app.search.SearchReveal
import com.qwill.app.search.SearchSession
import com.qwill.app.search.SearchTriggerView
import com.qwill.app.tabs.SearchCollapse
import com.qwill.app.ui.ConnectionTitle
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.QwillMenu
import com.qwill.app.ui.QwillMenuItem
import com.qwill.app.ui.ThemeReveal
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.ThemePreference
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class ChatsScreen : Screen(), ChatCellHost {
    override val paintsOwnBackground: Boolean get() = true

    override val interceptsBack: Boolean get() = menu?.isShowing == true || deleteDialog != null || searchOpen

    private lateinit var root: FrameLayout
    private lateinit var header: LinearLayout
    private lateinit var lupa: SearchIconButton
    private lateinit var spacer: View
    private lateinit var searchRow: SearchTriggerView
    private lateinit var body: FrameLayout
    private lateinit var ownAvatar: HeaderAvatarView
    private lateinit var title: ConnectionTitle
    private lateinit var more: MoreButton
    private lateinit var chips: ChipsRow
    private lateinit var list: RecyclerView
    private lateinit var layoutManager: LinearLayoutManager
    private lateinit var adapter: ChatsAdapter
    private lateinit var skeleton: SkeletonView
    private lateinit var empty: EmptyStateView

    private var menu: QwillMenu? = null
    private var menuKind = MenuKind.NONE
    private var deleteDialog: DeleteChatDialog? = null
    private var themeReveal: ThemeReveal? = null
    private val frozen = FrozenUpdates<List<ChatRowModel>>()
    private var filter = ChatFilter.ALL
    private var introPlayed = false
    private var savedListState: Parcelable? = null
    private var safeArea = SafeArea.NONE
    private var timeReceiverRegistered = false
    private var searchCollapsed = false
    private var collapseGeneration = 0
    private val collapseAnimators = ArrayList<Animator>()
    private var searchOpen = false
    private var searchRetreating = false
    private var searchFromIcon = false
    private var reveal: SearchReveal? = null
    private var recentMenu: QwillMenu? = null
    private var session: SearchSession? = null

    var onSearchActiveChanged: ((active: Boolean, animated: Boolean) -> Unit)? = null

    val searchActive: Boolean get() = searchOpen && !searchRetreating

    private val chatsListener = ChatsListener { refreshRows(animate = true) }
    private val presenceListener = PresenceListener {
        refreshRows(animate = true)
        refreshSearch()
    }
    private val recentsListener = RecentSearchesListener { refreshSearch() }
    private val typingListener = TypingListener { refreshRows(animate = true) }
    private val connectionListener = ConnectionStateListener { updateTitle() }
    private val sessionListener = SessionStateListener { onSessionChanged() }
    private val emojiListener = EmojiListener { indexChanged ->
        for (index in 0 until list.childCount) (list.getChildAt(index) as? ChatCell)?.onEmojiChanged(indexChanged)
    }
    private val timeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            refreshTimes()
        }
    }

    override fun createView(context: Context): View {
        root = FrameLayout(context)

        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        root.addView(column, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
        }
        ownAvatar = HeaderAvatarView(context)
        header.addView(ownAvatar)
        title = ConnectionTitle(context)
        header.addView(title, LinearLayout.LayoutParams(0, context.dpInt(HEADER_H), 1f).apply {
            leftMargin = context.dpInt(BRAND_GAP)
            rightMargin = context.dpInt(ACTIONS_GAP)
        })
        lupa = SearchIconButton(context)
        lupa.setOnClickListener { openSearch(fromIcon = true) }
        header.addView(lupa, LinearLayout.LayoutParams(context.dpInt(SearchIconButton.TAP), context.dpInt(SearchIconButton.TAP)))
        more = MoreButton(context)
        more.setOnClickListener { openMainMenu() }
        header.addView(more, LinearLayout.LayoutParams(context.dpInt(HEADER_H), context.dpInt(HEADER_H)).apply {
            rightMargin = -context.dpInt(MORE_OUTSET)
        })
        column.addView(header, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(HEADER_H)))

        spacer = View(context)
        column.addView(spacer, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(SEARCH_SLOT)))

        chips = ChipsRow(context) { pickFilter(it) }
        column.addView(chips, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        body = FrameLayout(context)
        column.addView(body, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        adapter = ChatsAdapter(context, this, System::currentTimeMillis)
        list = RecyclerView(ContextThemeWrapper(context, R.style.QwillChatList))
        layoutManager = LinearLayoutManager(context)
        list.layoutManager = layoutManager
        list.adapter = adapter
        list.clipToPadding = false
        list.itemAnimator = if (Motion.animationsEnabled) ChatsItemAnimator() else null
        list.overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
        body.addView(list, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        list.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                onListScrolled()
            }
        })

        skeleton = SkeletonView(context)
        body.addView(skeleton, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        empty = EmptyStateView(context)
        body.addView(empty, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        searchRow = SearchTriggerView(context, SEARCH_PLACEHOLDER)
        searchRow.setOnClickListener { openSearch(fromIcon = false) }
        root.addView(searchRow, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(SearchPillPainter.HEIGHT), android.view.Gravity.TOP))
        root.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> reveal?.setGeometry(revealGeometry()) }

        QwillApplication.messages.addChatsListener(chatsListener)
        QwillApplication.presence.addListener(presenceListener)
        QwillApplication.typing.addListener(typingListener)
        QwillApplication.socket.addStateListener(connectionListener)
        QwillApplication.session.addStateListener(sessionListener)
        Emoji.addListener(emojiListener)
        QwillApplication.recentSearches.addListener(recentsListener)

        applySearchLayout(animated = false)
        applyInsets()
        applyTheme()
        onSessionChanged()
        refreshRows(animate = false)
        savedListState?.let { layoutManager.onRestoreInstanceState(it) }
        savedListState = null
        if (searchOpen) {
            header.alpha = 0f
            showReveal(animated = false, focus = false)
        }
        return root
    }

    override fun onViewDestroyed() {
        savedListState = layoutManager.onSaveInstanceState()
        QwillApplication.messages.removeChatsListener(chatsListener)
        QwillApplication.presence.removeListener(presenceListener)
        QwillApplication.typing.removeListener(typingListener)
        QwillApplication.socket.removeStateListener(connectionListener)
        QwillApplication.session.removeStateListener(sessionListener)
        Emoji.removeListener(emojiListener)
        QwillApplication.recentSearches.removeListener(recentsListener)
        menu?.dismissNow()
        menu = null
        deleteDialog = null
        themeReveal?.finishNow()
        endCollapse()
        recentMenu?.dismissNow()
        recentMenu = null
        val closingSearch = reveal?.closing == true
        reveal?.finishNow()
        reveal = null
        if (closingSearch) finishSearch()
        unregisterTimeReceiver()
    }

    override fun onDestroyed() {
        session?.dispose()
        session = null
    }

    override fun onShown() {
        registerTimeReceiver()
        refreshTimes()
    }

    override fun onHidden() {
        unregisterTimeReceiver()
        reveal?.dropKeyboard()
    }

    override fun onBackPressed(): Boolean {
        deleteDialog?.let {
            it.requestClose()
            return true
        }
        if (menu?.isShowing == true) {
            menu?.close()
            return true
        }
        if (recentMenu?.isShowing == true) {
            recentMenu?.close()
            return true
        }
        if (searchOpen) {
            reveal?.requestClose()
            return true
        }
        return false
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        safeArea = area
        if (::root.isInitialized) applyInsets()
        reveal?.setSafeArea(area)
    }

    override fun onThemeChanged() {
        if (!::root.isInitialized) return
        applyTheme()
        if (menuKind == MenuKind.MAIN) menu?.setItems(mainMenuItems())
        menu?.applyTheme()
        recentMenu?.applyTheme()
        deleteDialog?.applyTheme()
        reveal?.applyTheme()
        adapter.notifyItemRangeChanged(0, adapter.itemCount, ChatCell.PAYLOAD_REBIND)
    }

    fun scrollToTop() {
        if (!::list.isInitialized) return
        list.smoothScrollToPosition(0)
    }

    fun scrollToFirstUnread() {
        if (!::list.isInitialized) return
        val index = VisibleChats.firstUnreadIndex(adapter.items.map { it.chat })
        if (index < 0) return
        val scroller = object : LinearSmoothScroller(list.context) {
            override fun calculateDtToFit(viewStart: Int, viewEnd: Int, boxStart: Int, boxEnd: Int, snapPreference: Int): Int =
                (boxStart + (boxEnd - boxStart) / 2) - (viewStart + (viewEnd - viewStart) / 2)

            override fun calculateSpeedPerPixel(displayMetrics: DisplayMetrics): Float = SCROLL_MS_PER_INCH / displayMetrics.densityDpi
        }
        scroller.targetPosition = index
        layoutManager.startSmoothScroll(scroller)
    }

    override fun onChatClick(model: ChatRowModel) {
        if (menu?.isShowing == true || deleteDialog != null || searchOpen) return
        stack?.push(ChatScreen(model.id))
    }

    override fun onChatLongPress(cell: ChatCell, model: ChatRowModel) {
        if (menu?.isShowing == true || deleteDialog != null || searchOpen) return
        openChatMenu(cell, model)
    }

    override fun onChatTouchHeld(held: Boolean) {
        frozen.hold(HOLD_FINGER, held) { applyRows(it, animate = true) }
    }

    private fun applyInsets() {
        val context = root.context
        val sideLeft = context.dpInt(HEADER_PAD_X) + safeArea.left
        val sideRight = context.dpInt(HEADER_PAD_X) + safeArea.right
        header.setPadding(sideLeft, 0, sideRight, 0)
        (header.layoutParams as LinearLayout.LayoutParams).topMargin = safeArea.top + context.dpInt(HEADER_TOP) - context.dpInt(TAP_OUTSET)
        chips.setPadding(sideLeft, 0, sideRight, 0)
        (chips.layoutParams as LinearLayout.LayoutParams).topMargin = context.dpInt(CHIPS_TOP)
        val listTop = context.dpInt(LIST_TOP)
        list.setPadding(context.dpInt(LIST_PAD_X) + safeArea.left, 0, context.dpInt(LIST_PAD_X) + safeArea.right, context.dpInt(LIST_PAD_BOTTOM) + safeArea.bottom)
        (searchRow.layoutParams as FrameLayout.LayoutParams).apply {
            leftMargin = sideLeft
            rightMargin = sideRight
            topMargin = safeArea.top + context.dpInt(HEADER_TOP) - context.dpInt(TAP_OUTSET) + context.dpInt(HEADER_H) + context.dpInt(SEARCH_TOP)
        }
        searchRow.requestLayout()
        (list.parent as View).let { body ->
            (body.layoutParams as LinearLayout.LayoutParams).topMargin = listTop
            body.requestLayout()
        }
        skeleton.setPadding(context.dpInt(LIST_PAD_X) + safeArea.left, 0, context.dpInt(LIST_PAD_X) + safeArea.right, 0)
        header.requestLayout()
    }

    private fun applyTheme() {
        val palette = Theme.palette
        title.onThemeChanged()
        lupa.invalidate()
        searchRow.invalidate()
        more.invalidate()
        ownAvatar.invalidate()
        chips.onThemeChanged()
        skeleton.invalidate()
        empty.applyTheme()
        if (Build.VERSION.SDK_INT >= 29) {
            list.verticalScrollbarThumbDrawable = GradientDrawable().apply {
                cornerRadius = root.context.dp(SCROLLBAR_RADIUS)
                setColor(withAlpha(palette.textPrimary, SCROLLBAR_ALPHA))
            }
        }
    }

    private fun onSessionChanged() {
        ownAvatar.setUser(currentUser())
        updateTitle()
        refreshRows(animate = false)
    }

    private fun currentUser(): PublicUser? = when (val state = QwillApplication.session.state) {
        is SessionState.Authenticated -> state.user
        is SessionState.IpBanned -> state.user
        else -> null
    }

    private fun isAdmin(): Boolean = currentUser()?.role == UserRole.ADMIN

    private fun updateTitle() {
        val ipBanned = QwillApplication.session.state is SessionState.IpBanned
        title.setState(QwillApplication.socket.state, ipBanned)
    }

    private fun chipsEnabled(): Boolean = QwillApplication.files.preferences.folderTabsEnabled() || isAdmin()

    private fun effectiveFilter(): ChatFilter {
        if (!chipsEnabled()) return ChatFilter.ALL
        return if (filter in ChatFilter.available(isAdmin())) filter else ChatFilter.ALL
    }

    private fun pickFilter(next: ChatFilter) {
        if (next == filter) return
        filter = next
        refreshRows(animate = false, jumpTop = true)
    }

    private fun refreshRows(animate: Boolean, jumpTop: Boolean = false) {
        if (!::list.isInitialized) return
        val controller = QwillApplication.messages
        val admin = isAdmin()
        val active = effectiveFilter()
        val showChips = chipsEnabled()
        val chipsVisibility = if (showChips) View.VISIBLE else View.GONE
        if (chips.visibility != chipsVisibility) chips.visibility = chipsVisibility
        if (showChips) chips.setFilters(ChatFilter.available(admin), active, VisibleChats.counts(controller.chats, admin))
        val myId = currentUser()?.id
        val presence = QwillApplication.presence
        val typing = QwillApplication.typing
        val models = VisibleChats.select(controller.chats, active, admin).map { chat ->
            val online = chat.type == ChatType.PRIVATE && chat.otherMember?.let { presence[it.id]?.online } == true
            ChatRowModel(chat, myId, online, typing.typists(chat.id).map { it.displayName })
        }
        updatePlaceholders(controller.chatsReady, controller.chats.isEmpty(), models.isEmpty())
        if (jumpTop) {
            applyRows(models, animate = false)
            layoutManager.scrollToPosition(0)
            return
        }
        frozen.submit(models) { applyRows(it, animate) }
    }

    private fun applyRows(models: List<ChatRowModel>, animate: Boolean) {
        val atTop = !list.canScrollVertically(-1)
        val wasEmpty = adapter.itemCount == 0
        adapter.submit(models, animate && list.itemAnimator != null)
        if (atTop && !wasEmpty) layoutManager.scrollToPosition(0)
        if (wasEmpty && models.isNotEmpty()) playIntroIfReady()
    }

    private fun updatePlaceholders(ready: Boolean, noChats: Boolean, nothingVisible: Boolean) {
        skeleton.visibility = if (!ready) View.VISIBLE else View.GONE
        val showEmpty = ready && nothingVisible
        empty.visibility = if (showEmpty) View.VISIBLE else View.GONE
        if (showEmpty) {
            if (noChats) empty.setTexts(EMPTY_TITLE, EMPTY_SUBTITLE) else empty.setTexts(FILTER_EMPTY_TITLE, FILTER_EMPTY_SUBTITLE)
        }
    }

    private fun playIntroIfReady() {
        if (introPlayed || adapter.itemCount == 0) return
        introPlayed = true
        if (!Motion.animationsEnabled) return
        val observer = list.viewTreeObserver
        observer.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (list.viewTreeObserver.isAlive) list.viewTreeObserver.removeOnPreDrawListener(this)
                val shift = root.context.dp(INTRO_SHIFT)
                for (index in 0 until list.childCount) {
                    val child = list.getChildAt(index)
                    child.alpha = 0f
                    child.translationY = shift
                    val animator = child.animate()
                    animator.alpha(1f)
                        .translationY(0f)
                        .setStartDelay(index * INTRO_STEP_MS)
                        .setDuration(INTRO_MS)
                        .setInterpolator(INTRO_CURVE)
                        .start()
                    animator.startDelay = 0
                }
                return true
            }
        })
    }

    private fun refreshTimes() {
        if (!::list.isInitialized) return
        adapter.notifyItemRangeChanged(0, adapter.itemCount, ChatCell.PAYLOAD_TIME)
    }

    private fun registerTimeReceiver() {
        if (timeReceiverRegistered || !::root.isInitialized) return
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_DATE_CHANGED)
            addAction(Intent.ACTION_TIME_CHANGED)
            addAction(Intent.ACTION_TIMEZONE_CHANGED)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            root.context.registerReceiver(timeReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            root.context.registerReceiver(timeReceiver, filter)
        }
        timeReceiverRegistered = true
    }

    private fun unregisterTimeReceiver() {
        if (!timeReceiverRegistered) return
        timeReceiverRegistered = false
        root.context.unregisterReceiver(timeReceiver)
    }

    private fun obtainMenu(kind: MenuKind): QwillMenu {
        val current = menu ?: QwillMenu(root).also { menu = it }
        menuKind = kind
        current.onClosed = {
            menuKind = MenuKind.NONE
            frozen.hold(HOLD_MENU, false) { applyRows(it, animate = true) }
            backStateChanged()
        }
        return current
    }

    private fun openMainMenu() {
        if (menu?.isShowing == true || deleteDialog != null) return
        val target = obtainMenu(MenuKind.MAIN)
        target.show(rectInRoot(more, circleInset = true), mainMenuItems(), safeArea)
        backStateChanged()
    }

    private fun mainMenuItems(): List<QwillMenuItem> {
        val dark = Theme.isDark
        return listOf(
            QwillMenuItem(
                label = if (dark) "Дневная тема" else "Ночная тема",
                icon = if (dark) QwillIcon.SUN else QwillIcon.MOON,
                keepOpen = true,
            ) { view -> toggleTheme(view) },
        )
    }

    private fun toggleTheme(source: View) {
        val activity = root.context as? android.app.Activity ?: return
        val toDark = !Theme.isDark
        val location = IntArray(2)
        source.getLocationInWindow(location)
        val x = location[0] + source.width / 2f
        val y = location[1] + source.height / 2f
        val runner = themeReveal ?: ThemeReveal(activity).also { themeReveal = it }
        runner.run(x, y, growNewTheme = toDark) {
            Theme.setPreference(activity, if (toDark) ThemePreference.DARK else ThemePreference.LIGHT)
        }
    }

    private fun openChatMenu(cell: ChatCell, model: ChatRowModel) {
        val chat = model.chat
        val service = chat.otherMember?.isService == true
        val muteItem = QwillMenuItem(
            label = if (chat.muted) "Включить уведомления" else "Отключить уведомления",
            icon = if (chat.muted) QwillIcon.MUTE else QwillIcon.BELL,
            muted = chat.muted,
        ) { QwillApplication.messages.setChatMuted(chat.id, !chat.muted) }
        val items = if (service || chat.type == ChatType.GROUP) {
            listOf(muteItem)
        } else {
            listOf(
                muteItem,
                QwillMenuItem(label = "Удалить чат", icon = QwillIcon.TRASH, danger = true) { openDeleteDialog(chat.id) },
            )
        }
        frozen.hold(HOLD_MENU, true) { applyRows(it, animate = true) }
        val target = obtainMenu(MenuKind.CHAT)
        target.show(rectInRoot(cell, circleInset = false), items, safeArea)
        backStateChanged()
    }

    private fun openDeleteDialog(chatId: String) {
        val chat = QwillApplication.messages.chats.firstOrNull { it.id == chatId } ?: return
        val dialog = DeleteChatDialog(root.context, root, chat) {
            deleteDialog = null
            backStateChanged()
        }
        deleteDialog = dialog
        dialog.show()
        backStateChanged()
    }

    private fun rectInRoot(view: View, circleInset: Boolean): RectF {
        val viewLocation = IntArray(2)
        val rootLocation = IntArray(2)
        view.getLocationInWindow(viewLocation)
        root.getLocationInWindow(rootLocation)
        val left = (viewLocation[0] - rootLocation[0]).toFloat()
        val top = (viewLocation[1] - rootLocation[1]).toFloat()
        val rect = RectF(left, top, left + view.width, top + view.height)
        if (circleInset) {
            val inset = (view.width - root.context.dp(MORE_CIRCLE)) / 2f
            rect.inset(inset, inset)
        }
        return rect
    }

    private fun onListScrolled() {
        if (searchOpen || !::list.isInitialized) return
        val offsetDp = list.computeVerticalScrollOffset() / root.resources.displayMetrics.density
        val next = SearchCollapse.next(searchCollapsed, offsetDp)
        if (next == searchCollapsed) return
        searchCollapsed = next
        applySearchLayout(animated = true)
    }

    private fun endCollapse() {
        collapseGeneration++
        val running = ArrayList(collapseAnimators)
        collapseAnimators.clear()
        for (animator in running) animator.cancel()
    }

    private fun applySearchLayout(animated: Boolean) {
        endCollapse()
        val collapsed = searchCollapsed
        spacer.visibility = if (collapsed) View.GONE else View.VISIBLE
        if (!animated || !Motion.animationsEnabled) {
            chips.translationY = 0f
            body.translationY = 0f
            settleSearchRow(collapsed)
            settleLupa(collapsed)
            return
        }
        val context = root.context
        val shift = context.dp(SEARCH_SLOT) * if (collapsed) 1f else -1f
        val generation = collapseGeneration
        chips.translationY = shift
        body.translationY = shift
        collapseAnimators.add(run(COLLAPSE_MS, COLLAPSE_CURVE) { value ->
            chips.translationY = shift * (1f - value)
            body.translationY = shift * (1f - value)
        })
        val lift = -context.dp(SEARCH_ROW_LIFT)
        if (collapsed) {
            val fromLift = searchRow.translationY
            val fromScale = searchRow.scaleX
            val fromAlpha = if (searchRow.visibility == View.GONE) 0f else searchRow.alpha
            searchRow.isClickable = false
            collapseAnimators.add(run(COLLAPSE_MS, COLLAPSE_CURVE) { value ->
                searchRow.translationY = fromLift + (lift - fromLift) * value
                val scale = fromScale + (SEARCH_ROW_SCALE - fromScale) * value
                searchRow.scaleX = scale
                searchRow.scaleY = scale
            })
            collapseAnimators.add(run(FADE_MS, FADE_CURVE, onEnd = { if (generation == collapseGeneration) settleSearchRow(true) }) { value ->
                searchRow.alpha = fromAlpha * (1f - value)
            })
            lupa.visibility = if (searchOpen) View.INVISIBLE else View.VISIBLE
            lupa.scaleX = LUPA_START_SCALE
            lupa.scaleY = LUPA_START_SCALE
            lupa.alpha = 0f
            collapseAnimators.add(run(LUPA_IN_MS, LUPA_CURVE, onEnd = { if (generation == collapseGeneration) settleLupa(true) }) { value ->
                val scale = LUPA_START_SCALE + (1f - LUPA_START_SCALE) * value
                lupa.scaleX = scale
                lupa.scaleY = scale
                lupa.alpha = value.coerceIn(0f, 1f)
            })
        } else {
            if (searchRow.visibility == View.GONE) {
                searchRow.translationY = lift
                searchRow.scaleX = SEARCH_ROW_SCALE
                searchRow.scaleY = SEARCH_ROW_SCALE
                searchRow.alpha = 0f
            }
            searchRow.visibility = if (searchOpen) View.INVISIBLE else View.VISIBLE
            searchRow.isClickable = true
            val fromLift = searchRow.translationY
            val fromScale = searchRow.scaleX
            val fromAlpha = searchRow.alpha
            collapseAnimators.add(run(COLLAPSE_MS, COLLAPSE_CURVE, onEnd = { if (generation == collapseGeneration) settleSearchRow(false) }) { value ->
                searchRow.translationY = fromLift * (1f - value)
                val scale = fromScale + (1f - fromScale) * value
                searchRow.scaleX = scale
                searchRow.scaleY = scale
            })
            collapseAnimators.add(run(FADE_MS, FADE_CURVE) { value ->
                searchRow.alpha = fromAlpha + (1f - fromAlpha) * value
            })
            val fromLupa = lupa.alpha
            val fromLupaScale = lupa.scaleX
            lupa.isClickable = false
            collapseAnimators.add(run(LUPA_OUT_MS, FADE_CURVE, onEnd = { if (generation == collapseGeneration) settleLupa(false) }) { value ->
                val scale = fromLupaScale + (LUPA_START_SCALE - fromLupaScale) * value
                lupa.scaleX = scale
                lupa.scaleY = scale
                lupa.alpha = fromLupa * (1f - value)
            })
        }
    }

    private fun settleSearchRow(collapsed: Boolean) {
        searchRow.translationY = 0f
        searchRow.scaleX = 1f
        searchRow.scaleY = 1f
        searchRow.alpha = 1f
        searchRow.isClickable = !collapsed
        searchRow.visibility = when {
            collapsed -> View.GONE
            searchOpen -> View.INVISIBLE
            else -> View.VISIBLE
        }
    }

    private fun settleLupa(collapsed: Boolean) {
        lupa.scaleX = 1f
        lupa.scaleY = 1f
        lupa.alpha = 1f
        lupa.isClickable = collapsed
        lupa.visibility = when {
            !collapsed -> View.GONE
            searchOpen && searchRetreating -> View.INVISIBLE
            else -> View.VISIBLE
        }
    }

    private fun run(ms: Long, curve: android.view.animation.Interpolator, onEnd: (() -> Unit)? = null, apply: (Float) -> Unit): Animator =
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = Motion.duration(ms)
            interpolator = curve
            addUpdateListener { apply(it.animatedValue as Float) }
            if (onEnd != null) {
                addListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: Animator) {
                        collapseAnimators.remove(animation)
                        onEnd()
                    }
                })
            }
            start()
        }

    private fun searchSession(): SearchSession = session ?: SearchSession(
        guid = classGuid,
        api = QwillApplication.api,
        main = MainQueue,
        recents = QwillApplication.recentSearches,
        startPrivateChat = { username, guid, callback ->
            QwillApplication.messages.startPrivateChat(username, guid) { result ->
                callback(
                    when (result) {
                        is ApiResult.Success -> ApiResult.Success(result.value.id)
                        is ApiResult.Failure -> result
                    },
                )
            }
        },
    ).also { created ->
        created.listener = { refreshSearch() }
        session = created
    }

    private fun openSearch(fromIcon: Boolean) {
        if (searchOpen || menu?.isShowing == true || deleteDialog != null) return
        if (fromIcon != searchCollapsed) return
        endCollapse()
        settleSearchRow(searchCollapsed)
        settleLupa(searchCollapsed)
        QwillApplication.recentSearches.ensureLoaded()
        searchOpen = true
        searchRetreating = false
        searchFromIcon = fromIcon
        searchRow.visibility = if (searchCollapsed) View.GONE else View.INVISIBLE
        header.animate().cancel()
        header.animate().alpha(0f).setStartDelay(0L).setDuration(Motion.duration(HEADER_FADE_MS)).setInterpolator(HEADER_CURVE).start()
        showReveal(animated = true, focus = true)
        onSearchActiveChanged?.invoke(true, true)
        backStateChanged()
    }

    private fun showReveal(animated: Boolean, focus: Boolean) {
        val current = searchSession()
        val view = SearchReveal(root.context, revealHost, adapterHost, searchFromIcon)
        root.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        reveal = view
        view.setSafeArea(safeArea)
        view.setGeometry(revealGeometry())
        view.setQuery(current.query)
        refreshSearch()
        view.start(animated, focus)
    }

    private fun revealGeometry(): RevealGeometry {
        val context = root.context
        val dockTop = header.top + context.dp(TAP_OUTSET) + context.dp(SEARCH_DOCK_GAP)
        val dock = RectF(header.paddingLeft.toFloat(), dockTop, (header.width - header.paddingRight).toFloat(), dockTop + context.dp(SearchPillPainter.HEIGHT))
        val source = if (searchFromIcon) lupa else searchRow
        val bounds = Rect(0, 0, source.width, source.height)
        root.offsetDescendantRectToMyCoords(source, bounds)
        val origin = RectF(bounds)
        return if (searchFromIcon) {
            val inset = (source.width - context.dp(SearchIconButton.CIRCLE)) / 2f
            origin.inset(inset, inset)
            RevealGeometry(origin, context.dp(SearchIconButton.CIRCLE) / 2f, dock, context.dp(SearchPillPainter.RADIUS))
        } else {
            RevealGeometry(origin, context.dp(SearchPillPainter.RADIUS), dock, context.dp(SearchPillPainter.RADIUS))
        }
    }

    private fun refreshSearch() {
        val view = reveal ?: return
        val current = session ?: return
        val presence = QwillApplication.presence
        view.submit(SearchItems.build(current.state, QwillApplication.recentSearches.entries, { presence[it] }, System.currentTimeMillis()))
    }

    private fun finishSearch() {
        searchOpen = false
        searchRetreating = false
        session?.reset()
        onSearchActiveChanged?.invoke(false, false)
    }

    private fun openChatFromSearch(chatId: String) {
        val view = reveal ?: return
        if (view.closing) return
        view.dropKeyboard()
        stack?.push(ChatScreen(chatId))
    }

    private val revealHost = object : SearchReveal.Host {
        override fun onRetreatStart() {
            searchRetreating = true
            recentMenu?.dismissNow()
            if (searchCollapsed) lupa.visibility = View.INVISIBLE
            header.animate().cancel()
            header.animate().alpha(1f).setStartDelay(Motion.duration(HEADER_RETURN_DELAY_MS)).setDuration(Motion.duration(HEADER_FADE_MS)).setInterpolator(HEADER_CURVE).start()
            onSearchActiveChanged?.invoke(false, true)
        }

        override fun onClosed() {
            reveal?.let { root.removeView(it) }
            reveal = null
            header.animate().cancel()
            header.alpha = 1f
            searchOpen = false
            searchRetreating = false
            session?.reset()
            settleSearchRow(searchCollapsed)
            settleLupa(searchCollapsed)
            backStateChanged()
        }

        override fun onQueryChanged(text: String) {
            searchSession().setQuery(text)
        }
    }

    private val adapterHost = object : SearchAdapterHost {
        override fun onChatResult(chat: ChatSearchResult) {
            if (reveal?.closing != false) return
            searchSession().openChat(chat) { openChatFromSearch(it) }
        }

        override fun onUserResult(user: UserSearchResult) {
            if (reveal?.closing != false) return
            searchSession().openUser(user) { openChatFromSearch(it) }
        }

        override fun onRecentChat(entry: RecentSearchEntry) {
            entry.chatId?.let { openChatFromSearch(it) }
        }

        override fun onRecentPerson(entry: RecentSearchEntry) {
            val username = entry.username ?: return
            if (reveal?.closing != false) return
            QwillApplication.messages.startPrivateChat(username, classGuid) { result ->
                if (result is ApiResult.Success) openChatFromSearch(result.value.id)
            }
        }

        override fun onRecentLongPress(view: PressableView, entry: RecentSearchEntry) {
            val host = reveal ?: return
            if (host.closing || recentMenu?.isShowing == true) return
            val key = RecentSearches.keyOf(entry)
            val target = recentMenu ?: QwillMenu(host).also { recentMenu = it }
            target.onClosed = { backStateChanged() }
            val bounds = Rect(0, 0, view.width, view.height)
            host.offsetDescendantRectToMyCoords(view, bounds)
            target.show(
                RectF(bounds),
                listOf(
                    QwillMenuItem(label = FORGET_LABEL, icon = QwillIcon.TRASH, danger = true) {
                        view.pop { QwillApplication.recentSearches.forget(key) }
                    },
                ),
                safeArea,
            )
            backStateChanged()
        }

        override fun onRetry() {
            searchSession().retry()
        }
    }

    private enum class MenuKind { NONE, MAIN, CHAT }

    private companion object {
        const val HEADER_H = 44f
        const val TAP_OUTSET = 3f
        const val HEADER_TOP = 6f
        const val HEADER_PAD_X = 16f
        const val BRAND_GAP = 11f
        const val ACTIONS_GAP = 8f
        const val MORE_OUTSET = 4f
        const val MORE_CIRCLE = 36f
        const val CHIPS_TOP = 6f
        const val LIST_TOP = 7f
        const val LIST_PAD_X = 10f
        const val LIST_PAD_BOTTOM = 96f
        const val SEARCH_TOP = 9f
        const val SEARCH_SLOT = 56f
        const val SEARCH_ROW_LIFT = 14f
        const val SEARCH_ROW_SCALE = 0.97f
        const val SEARCH_DOCK_GAP = 16f
        const val COLLAPSE_MS = 400L
        const val FADE_MS = 300L
        const val LUPA_IN_MS = 320L
        const val LUPA_OUT_MS = 200L
        const val LUPA_START_SCALE = 0.6f
        const val HEADER_FADE_MS = 120L
        const val HEADER_RETURN_DELAY_MS = 140L
        const val SEARCH_PLACEHOLDER = "Поиск чатов и людей"
        const val FORGET_LABEL = "Убрать из недавних"
        val COLLAPSE_CURVE = PathInterpolator(0.22f, 1f, 0.36f, 1f)
        val FADE_CURVE = PathInterpolator(0.25f, 0.1f, 0.25f, 1f)
        val LUPA_CURVE = PathInterpolator(0.34f, 1.56f, 0.64f, 1f)
        val HEADER_CURVE = PathInterpolator(0f, 0f, 0.58f, 1f)
        const val SCROLLBAR_RADIUS = 2f
        const val SCROLLBAR_ALPHA = 0.32f
        const val INTRO_SHIFT = 14f
        const val INTRO_MS = 450L
        const val INTRO_STEP_MS = 45L
        const val SCROLL_MS_PER_INCH = 60f
        const val HOLD_FINGER = "finger"
        const val HOLD_MENU = "menu"
        const val EMPTY_TITLE = "Пока нет чатов"
        const val EMPTY_SUBTITLE = "Нажмите «Написать», чтобы найти человека и начать переписку"
        const val FILTER_EMPTY_TITLE = "Ничего не подходит"
        const val FILTER_EMPTY_SUBTITLE = "В этом фильтре пока пусто"
        val INTRO_CURVE = PathInterpolator(0.22f, 1f, 0.36f, 1f)
    }
}
