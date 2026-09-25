package com.qwill.app.chats

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
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
import com.qwill.app.emoji.Emoji
import com.qwill.app.emoji.EmojiListener
import com.qwill.app.messenger.ChatsListener
import com.qwill.app.model.ChatType
import com.qwill.app.model.PublicUser
import com.qwill.app.model.UserRole
import com.qwill.app.realtime.ConnectionStateListener
import com.qwill.app.realtime.PresenceListener
import com.qwill.app.realtime.TypingListener
import com.qwill.app.ui.AmbientBlobsView
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

    override val interceptsBack: Boolean get() = menu?.isShowing == true || deleteDialog != null

    private lateinit var root: FrameLayout
    private lateinit var blobs: AmbientBlobsView
    private lateinit var header: LinearLayout
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
    private var reveal: ThemeReveal? = null
    private val frozen = FrozenUpdates<List<ChatRowModel>>()
    private var filter = ChatFilter.ALL
    private var introPlayed = false
    private var savedListState: Parcelable? = null
    private var safeArea = SafeArea.NONE
    private var timeReceiverRegistered = false

    private val chatsListener = ChatsListener { refreshRows(animate = true) }
    private val presenceListener = PresenceListener { refreshRows(animate = true) }
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
        blobs = AmbientBlobsView(context)
        root.addView(blobs, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

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
        more = MoreButton(context)
        more.setOnClickListener { openMainMenu() }
        header.addView(more, LinearLayout.LayoutParams(context.dpInt(HEADER_H), context.dpInt(HEADER_H)).apply {
            rightMargin = -context.dpInt(MORE_OUTSET)
        })
        column.addView(header, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(HEADER_H)))

        chips = ChipsRow(context) { pickFilter(it) }
        column.addView(chips, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val body = FrameLayout(context)
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

        skeleton = SkeletonView(context)
        body.addView(skeleton, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        empty = EmptyStateView(context)
        body.addView(empty, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        QwillApplication.messages.addChatsListener(chatsListener)
        QwillApplication.presence.addListener(presenceListener)
        QwillApplication.typing.addListener(typingListener)
        QwillApplication.socket.addStateListener(connectionListener)
        QwillApplication.session.addStateListener(sessionListener)
        Emoji.addListener(emojiListener)

        applyInsets()
        applyTheme()
        onSessionChanged()
        refreshRows(animate = false)
        savedListState?.let { layoutManager.onRestoreInstanceState(it) }
        savedListState = null
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
        menu?.dismissNow()
        menu = null
        deleteDialog = null
        reveal?.finishNow()
        unregisterTimeReceiver()
    }

    override fun onShown() {
        registerTimeReceiver()
        refreshTimes()
    }

    override fun onHidden() {
        unregisterTimeReceiver()
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
        return false
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        safeArea = area
        if (::root.isInitialized) applyInsets()
    }

    override fun onThemeChanged() {
        if (!::root.isInitialized) return
        applyTheme()
        if (menuKind == MenuKind.MAIN) menu?.setItems(mainMenuItems())
        menu?.applyTheme()
        deleteDialog?.applyTheme()
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
        if (menu?.isShowing == true || deleteDialog != null) return
        stack?.push(ChatScreen(model.id))
    }

    override fun onChatLongPress(cell: ChatCell, model: ChatRowModel) {
        if (menu?.isShowing == true || deleteDialog != null) return
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
        (list.parent as View).let { body ->
            (body.layoutParams as LinearLayout.LayoutParams).topMargin = listTop
            body.requestLayout()
        }
        skeleton.setPadding(context.dpInt(LIST_PAD_X) + safeArea.left, 0, context.dpInt(LIST_PAD_X) + safeArea.right, 0)
        header.requestLayout()
    }

    private fun applyTheme() {
        val palette = Theme.palette
        blobs.onThemeChanged()
        title.onThemeChanged()
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
        val runner = reveal ?: ThemeReveal(activity).also { reveal = it }
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
        const val LIST_PAD_BOTTOM = 16f
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
