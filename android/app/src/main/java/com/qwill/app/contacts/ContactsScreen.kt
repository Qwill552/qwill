package com.qwill.app.contacts

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.text.Editable
import android.text.TextWatcher
import android.util.TypedValue
import android.view.ContextThemeWrapper
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.QwillApplication
import com.qwill.app.R
import com.qwill.app.chat.ChatScreen
import com.qwill.app.chats.EmptyStateView
import com.qwill.app.messenger.ChatsListener
import com.qwill.app.realtime.PresenceListener
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

sealed class ContactsItem(val key: String, val group: Int?) {
    data class Entry(val kind: EntryKind) : ContactsItem("entry:${kind.name}", GROUP_ENTRIES)

    object Label : ContactsItem("label", GROUP_CONTACTS)

    data class Row(val contact: Contact, val last: Boolean, val index: Int) : ContactsItem("contact:${contact.userId}", GROUP_CONTACTS)

    data class Empty(val title: String, val subtitle: String) : ContactsItem("empty", null)

    companion object {
        const val GROUP_ENTRIES = 0
        const val GROUP_CONTACTS = 1
    }
}

class ContactsScreen : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    private lateinit var root: LinearLayout
    private lateinit var top: LinearLayout
    private lateinit var title: TextView
    private lateinit var field: ContactsSearchField
    private lateinit var list: RecyclerView
    private lateinit var layoutManager: LinearLayoutManager
    private lateinit var adapter: Adapter

    private var query = ""
    private var safeArea = SafeArea.NONE
    private var introPlayed = false
    private var savedListState: android.os.Parcelable? = null
    private var timeReceiverRegistered = false

    private val chatsListener = ChatsListener { refresh() }
    private val presenceListener = PresenceListener { refresh() }
    private val timeReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            refresh(force = true)
        }
    }

    override fun createView(context: Context): View {
        root = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        top = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        title = TextView(context).apply {
            text = TITLE
            typeface = Fonts.display(FontWeight.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, TITLE_SIZE)
            letterSpacing = TITLE_TRACKING_PX / TITLE_SIZE
            includeFontPadding = false
            if (Build.VERSION.SDK_INT >= 28) isAccessibilityHeading = true
        }
        top.addView(title, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        field = ContactsSearchField(context)
        field.input.setText(query)
        field.input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}

            override fun afterTextChanged(s: Editable?) {
                val next = s?.toString().orEmpty()
                if (next == query) return
                query = next
                refresh()
            }
        })
        field.input.setOnEditorActionListener { view, actionId, _ ->
            if (actionId != EditorInfo.IME_ACTION_SEARCH) return@setOnEditorActionListener false
            val imm = view.context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
            imm?.hideSoftInputFromWindow(view.windowToken, 0)
            view.clearFocus()
            true
        }
        top.addView(field, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(FIELD_H)).apply {
            topMargin = context.dpInt(TOP_GAP)
        })
        root.addView(top, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        adapter = Adapter(context) { openChat(it) }
        list = RecyclerView(ContextThemeWrapper(context, R.style.QwillChatList))
        layoutManager = LinearLayoutManager(context)
        list.layoutManager = layoutManager
        list.adapter = adapter
        list.clipToPadding = false
        list.itemAnimator = null
        list.overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
        list.addItemDecoration(CardDecoration(context) { adapter.items.getOrNull(it)?.group })
        list.addItemDecoration(Spacing(context, adapter))
        root.addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        QwillApplication.messages.addChatsListener(chatsListener)
        QwillApplication.presence.addListener(presenceListener)

        applyInsets()
        applyTheme()
        refresh(force = true)
        savedListState?.let { layoutManager.onRestoreInstanceState(it) }
        savedListState = null
        return root
    }

    override fun onViewDestroyed() {
        savedListState = layoutManager.onSaveInstanceState()
        QwillApplication.messages.removeChatsListener(chatsListener)
        QwillApplication.presence.removeListener(presenceListener)
        unregisterTimeReceiver()
    }

    override fun onShown() {
        registerTimeReceiver()
        refresh(force = true)
        playIntroIfReady()
    }

    override fun onHidden() {
        unregisterTimeReceiver()
        if (!::field.isInitialized) return
        val imm = field.context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(field.input.windowToken, 0)
        field.input.clearFocus()
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        safeArea = area
        if (::root.isInitialized) applyInsets()
    }

    override fun onThemeChanged() {
        if (!::root.isInitialized) return
        applyTheme()
        adapter.notifyItemRangeChanged(0, adapter.itemCount)
        list.invalidateItemDecorations()
    }

    private fun applyInsets() {
        val context = root.context
        top.setPadding(
            context.dpInt(TOP_PAD_X) + safeArea.left,
            context.dpInt(TOP_PAD_TOP) + safeArea.top,
            context.dpInt(TOP_PAD_X) + safeArea.right,
            context.dpInt(TOP_PAD_BOTTOM),
        )
        val bottom = if (safeArea.keyboard > 0) safeArea.keyboard + context.dpInt(KEYBOARD_GAP) else context.dpInt(LIST_PAD_BOTTOM) + safeArea.bottom
        list.setPadding(context.dpInt(LIST_PAD_X) + safeArea.left, 0, context.dpInt(LIST_PAD_X) + safeArea.right, bottom)
    }

    private fun applyTheme() {
        val palette = Theme.palette
        title.setTextColor(palette.pulseInk)
        field.applyTheme()
        if (Build.VERSION.SDK_INT >= 29) {
            list.verticalScrollbarThumbDrawable = GradientDrawable().apply {
                cornerRadius = root.context.dp(SCROLLBAR_RADIUS)
                setColor(withAlpha(palette.textPrimary, SCROLLBAR_ALPHA))
            }
        }
    }

    private fun refresh(force: Boolean = false) {
        if (!::list.isInitialized) return
        val presence = QwillApplication.presence
        val built = Contacts.build(QwillApplication.messages.chats, { presence[it] }, query)
        val items = ArrayList<ContactsItem>()
        items.add(ContactsItem.Entry(EntryKind.INVITE))
        items.add(ContactsItem.Entry(EntryKind.CALLS))
        if (built.contacts.isNotEmpty()) {
            items.add(ContactsItem.Label)
            for ((index, contact) in built.contacts.withIndex()) {
                items.add(ContactsItem.Row(contact, index == built.contacts.lastIndex, index))
            }
        } else if (built.hasContacts) {
            items.add(ContactsItem.Empty(FILTER_EMPTY_TITLE, FILTER_EMPTY_SUBTITLE))
        } else {
            items.add(ContactsItem.Empty(EMPTY_TITLE, EMPTY_SUBTITLE))
        }
        adapter.submit(items, force)
        playIntroIfReady()
    }

    private fun playIntroIfReady() {
        if (introPlayed || !::list.isInitialized || view == null) return
        if (adapter.items.none { it is ContactsItem.Row }) return
        introPlayed = true
        if (!Motion.animationsEnabled) return
        list.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                if (list.viewTreeObserver.isAlive) list.viewTreeObserver.removeOnPreDrawListener(this)
                runIntro()
                return true
            }
        })
        list.invalidate()
    }

    private fun runIntro() {
        val shift = root.context.dp(INTRO_SHIFT)
        for (index in 0 until list.childCount) {
            val child = list.getChildAt(index) as? ContactRowView ?: continue
            val position = list.getChildAdapterPosition(child)
            val row = adapter.items.getOrNull(position) as? ContactsItem.Row ?: continue
            child.alpha = 0f
            child.translationY = shift
            child.animate()
                .alpha(1f)
                .translationY(0f)
                .setStartDelay(row.index * INTRO_STEP_MS)
                .setDuration(Motion.duration(INTRO_MS))
                .setInterpolator(INTRO_CURVE)
                .withEndAction { child.animate().startDelay = 0 }
                .start()
        }
    }

    private fun openChat(chatId: String) {
        stack?.push(ChatScreen(chatId))
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

    private class Spacing(private val context: Context, private val adapter: Adapter) : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
            val position = parent.getChildAdapterPosition(view)
            if (position <= 0) return
            val item = adapter.items.getOrNull(position) ?: return
            if (item === ContactsItem.Label || item is ContactsItem.Empty) outRect.top = context.dpInt(CARD_GAP)
        }
    }

    private class Adapter(private val context: Context, private val onOpen: (String) -> Unit) : RecyclerView.Adapter<Adapter.Holder>() {
        class Holder(view: View) : RecyclerView.ViewHolder(view)

        var items: List<ContactsItem> = emptyList()
            private set
        private var nowMs = System.currentTimeMillis()

        fun submit(next: List<ContactsItem>, force: Boolean) {
            val previous = items
            items = next
            nowMs = System.currentTimeMillis()
            if (previous.isEmpty()) {
                notifyDataSetChanged()
                return
            }
            DiffUtil.calculateDiff(Diff(previous, next), false).dispatchUpdatesTo(this)
            if (force) notifyItemRangeChanged(0, itemCount, PAYLOAD_STATUS)
        }

        override fun getItemCount(): Int = items.size

        override fun getItemViewType(position: Int): Int = when (val item = items[position]) {
            is ContactsItem.Entry -> if (item.kind == EntryKind.INVITE) TYPE_INVITE else TYPE_CALLS
            ContactsItem.Label -> TYPE_LABEL
            is ContactsItem.Row -> TYPE_ROW
            is ContactsItem.Empty -> TYPE_EMPTY
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
            val view: View = when (viewType) {
                TYPE_INVITE -> EntryRowView(context, EntryKind.INVITE)
                TYPE_CALLS -> EntryRowView(context, EntryKind.CALLS)
                TYPE_LABEL -> SortLabelView(context)
                TYPE_ROW -> ContactRowView(context)
                else -> EmptyStateView(context)
            }
            view.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            return Holder(view)
        }

        override fun onBindViewHolder(holder: Holder, position: Int) {
            when (val item = items[position]) {
                is ContactsItem.Row -> (holder.itemView as ContactRowView).apply {
                    bind(item.contact, item.last, nowMs)
                    onTap = { onOpen(item.contact.chatId) }
                }
                is ContactsItem.Empty -> (holder.itemView as EmptyStateView).apply {
                    setTexts(item.title, item.subtitle)
                    applyTheme()
                }
                else -> holder.itemView.invalidate()
            }
        }

        private class Diff(private val old: List<ContactsItem>, private val new: List<ContactsItem>) : DiffUtil.Callback() {
            override fun getOldListSize(): Int = old.size

            override fun getNewListSize(): Int = new.size

            override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean = old[oldItemPosition].key == new[newItemPosition].key

            override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean = old[oldItemPosition] == new[newItemPosition]

            override fun getChangePayload(oldItemPosition: Int, newItemPosition: Int): Any = PAYLOAD_STATUS
        }

        private companion object {
            const val TYPE_INVITE = 0
            const val TYPE_CALLS = 1
            const val TYPE_LABEL = 2
            const val TYPE_ROW = 3
            const val TYPE_EMPTY = 4
            const val PAYLOAD_STATUS = "status"
        }
    }

    private companion object {
        const val TITLE = "Контакты"
        const val TITLE_SIZE = 26f
        const val TITLE_TRACKING_PX = -0.5f
        const val TOP_PAD_X = 18f
        const val TOP_PAD_TOP = 6f
        const val TOP_PAD_BOTTOM = 12f
        const val TOP_GAP = 12f
        const val FIELD_H = 44f
        const val LIST_PAD_X = 14f
        const val LIST_PAD_BOTTOM = 96f
        const val KEYBOARD_GAP = 16f
        const val CARD_GAP = 14f
        const val SCROLLBAR_RADIUS = 2f
        const val SCROLLBAR_ALPHA = 0.32f
        const val INTRO_SHIFT = 14f
        const val INTRO_MS = 400L
        const val INTRO_STEP_MS = 40L
        const val EMPTY_TITLE = "Пока никого нет"
        const val EMPTY_SUBTITLE = "Найдите человека — и он появится здесь"
        const val FILTER_EMPTY_TITLE = "Никто не подходит"
        const val FILTER_EMPTY_SUBTITLE = "Попробуйте другой запрос"
        val INTRO_CURVE = PathInterpolator(0.22f, 1f, 0.36f, 1f)
    }
}
