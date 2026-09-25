package com.qwill.app.search

import android.animation.LayoutTransition
import android.content.Context
import android.graphics.Rect
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.chats.EmptyStateView
import com.qwill.app.model.ChatSearchResult
import com.qwill.app.model.SearchResultsDto
import com.qwill.app.model.UserSearchResult
import com.qwill.app.realtime.LastSeen
import com.qwill.app.realtime.PresenceInfo
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import java.util.Locale

sealed class SearchItem(val key: String) {
    data class Section(val title: String) : SearchItem("section:$title")

    data class ChatRow(val chat: ChatSearchResult, val row: SearchRowModel) : SearchItem(row.key)

    data class UserRow(val user: UserSearchResult, val row: SearchRowModel) : SearchItem(row.key)

    data class RecentChat(val entry: RecentSearchEntry, val row: SearchRowModel) : SearchItem(row.key)

    data class People(val entries: List<RecentSearchEntry>) : SearchItem("people")

    object Hint : SearchItem("hint")

    data class Failure(val text: String) : SearchItem("failure")

    data class Empty(val title: String, val subtitle: String?) : SearchItem("empty:$title")
}

data class SearchState(
    val query: String = "",
    val results: SearchResultsDto? = null,
    val loading: Boolean = false,
    val failure: SearchFailure? = null,
    val openingUserId: String? = null,
)

object SearchItems {
    const val SECTION_CHATS = "Чаты"
    const val SECTION_USERS = "Глобальный поиск"
    const val SECTION_RECENT = "Недавние"
    const val SECTION_RECENT_CHATS = "Недавние чаты"
    const val HINT = "Ищу…"
    const val EMPTY_TITLE = "Ничего не нашлось"
    const val EMPTY_SUBTITLE = "Попробуйте другой запрос"
    const val RECENT_EMPTY = "Напиши что-то, чтобы я мог это найти"

    fun build(
        session: SearchState,
        recents: List<RecentSearchEntry>,
        presence: (String) -> PresenceInfo?,
        nowMs: Long,
    ): List<SearchItem> {
        if (session.query.trim().isEmpty()) return recentItems(recents)
        session.failure?.let { return listOf(SearchItem.Failure(it.text)) }
        val results = session.results ?: return if (session.loading) listOf(SearchItem.Hint) else emptyList()
        if (results.chats.isEmpty() && results.users.isEmpty()) return listOf(SearchItem.Empty(EMPTY_TITLE, EMPTY_SUBTITLE))
        val needle = Highlight.needleOf(session.query)
        val items = ArrayList<SearchItem>()
        if (results.chats.isNotEmpty()) {
            items.add(SearchItem.Section(SECTION_CHATS))
            for (chat in results.chats) {
                val row = SearchRowModel(
                    key = "chat:${chat.id}",
                    title = chat.title,
                    avatarLabel = chat.title,
                    avatarUrl = chat.avatarUrl,
                    avatarColor = chat.avatarColor,
                    colorKey = chat.id,
                    isService = chat.isService,
                    highlight = needle,
                    preview = chat.lastMessagePreview,
                )
                items.add(SearchItem.ChatRow(chat, row))
            }
        }
        if (results.users.isNotEmpty()) {
            items.add(SearchItem.Section(SECTION_USERS))
            for (user in results.users) {
                val live = presence(user.id)
                val online = live?.online == true
                val status = if (online) LastSeen.ONLINE else LastSeen.format(live?.lastSeenAt ?: user.lastSeenAt, nowMs)
                val row = SearchRowModel(
                    key = "user:${user.id}",
                    title = user.displayName,
                    avatarLabel = user.displayName,
                    avatarUrl = user.avatarUrl,
                    avatarColor = user.avatarColor,
                    colorKey = user.id,
                    isService = false,
                    highlight = needle,
                    username = user.username,
                    status = status,
                    online = online,
                    opening = session.openingUserId == user.id,
                )
                items.add(SearchItem.UserRow(user, row))
            }
        }
        if (session.loading) items.add(SearchItem.Hint)
        return items
    }

    private fun recentItems(entries: List<RecentSearchEntry>): List<SearchItem> {
        if (entries.isEmpty()) return listOf(SearchItem.Empty(RECENT_EMPTY, null))
        val items = ArrayList<SearchItem>()
        val people = entries.filter { it.kind == RecentKind.USER }
        val chats = entries.filter { it.kind == RecentKind.CHAT && it.chatId != null }
        if (people.isNotEmpty()) {
            items.add(SearchItem.Section(SECTION_RECENT))
            items.add(SearchItem.People(people))
        }
        if (chats.isNotEmpty()) {
            items.add(SearchItem.Section(SECTION_RECENT_CHATS))
            for (entry in chats) {
                val key = RecentSearches.keyOf(entry)
                val row = SearchRowModel(
                    key = "recent:$key",
                    title = entry.title,
                    avatarLabel = entry.title,
                    avatarUrl = entry.avatarUrl,
                    avatarColor = entry.avatarColor,
                    colorKey = key,
                    isService = entry.isService,
                    highlight = "",
                )
                items.add(SearchItem.RecentChat(entry, row))
            }
        }
        return items
    }
}

interface SearchAdapterHost {
    fun onChatResult(chat: ChatSearchResult)

    fun onUserResult(user: UserSearchResult)

    fun onRecentChat(entry: RecentSearchEntry)

    fun onRecentPerson(entry: RecentSearchEntry)

    fun onRecentLongPress(view: PressableView, entry: RecentSearchEntry)

    fun onRetry()
}

class SearchAdapter(private val context: Context, private val host: SearchAdapterHost) : RecyclerView.Adapter<SearchAdapter.Holder>() {
    class Holder(view: View) : RecyclerView.ViewHolder(view)

    var items: List<SearchItem> = emptyList()
        private set

    fun submit(next: List<SearchItem>) {
        val previous = items
        items = next
        if (previous.isEmpty() || next.isEmpty()) {
            notifyDataSetChanged()
            return
        }
        DiffUtil.calculateDiff(Diff(previous, next), true).dispatchUpdatesTo(this)
    }

    fun rebindAll() {
        notifyItemRangeChanged(0, itemCount, PAYLOAD_THEME)
    }

    override fun getItemCount(): Int = items.size

    override fun getItemViewType(position: Int): Int = when (items[position]) {
        is SearchItem.Section -> TYPE_SECTION
        is SearchItem.ChatRow, is SearchItem.UserRow, is SearchItem.RecentChat -> TYPE_ROW
        is SearchItem.People -> TYPE_PEOPLE
        SearchItem.Hint -> TYPE_HINT
        is SearchItem.Failure -> TYPE_FAILURE
        is SearchItem.Empty -> TYPE_EMPTY
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view: View = when (viewType) {
            TYPE_SECTION -> sectionTitle(context)
            TYPE_ROW -> SearchRowView(context)
            TYPE_PEOPLE -> PeopleStrip(context)
            TYPE_HINT -> hint(context)
            TYPE_FAILURE -> FailureView(context)
            else -> EmptyStateView(context)
        }
        view.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        when (val item = items[position]) {
            is SearchItem.Section -> (holder.itemView as TextView).apply {
                text = item.title.uppercase(Locale.forLanguageTag("ru"))
                styleSection(this)
            }
            is SearchItem.ChatRow -> (holder.itemView as SearchRowView).apply {
                bind(item.row)
                onTap = { host.onChatResult(item.chat) }
                onLongPress = null
            }
            is SearchItem.UserRow -> (holder.itemView as SearchRowView).apply {
                bind(item.row)
                onTap = { host.onUserResult(item.user) }
                onLongPress = null
            }
            is SearchItem.RecentChat -> (holder.itemView as SearchRowView).apply {
                bind(item.row)
                onTap = { host.onRecentChat(item.entry) }
                onLongPress = { host.onRecentLongPress(this, item.entry) }
            }
            is SearchItem.People -> (holder.itemView as PeopleStrip).bind(item.entries, host)
            SearchItem.Hint -> styleHint(holder.itemView as TextView)
            is SearchItem.Failure -> (holder.itemView as FailureView).bind(item.text) { host.onRetry() }
            is SearchItem.Empty -> (holder.itemView as EmptyStateView).apply {
                setTexts(item.title, item.subtitle.orEmpty())
                applyTheme()
            }
        }
    }

    override fun onBindViewHolder(holder: Holder, position: Int, payloads: MutableList<Any>) {
        onBindViewHolder(holder, position)
        if (payloads.contains(PAYLOAD_THEME)) {
            (holder.itemView as? SearchRowView)?.onThemeChanged()
            (holder.itemView as? PeopleStrip)?.onThemeChanged()
        }
    }

    private class Diff(private val old: List<SearchItem>, private val new: List<SearchItem>) : DiffUtil.Callback() {
        override fun getOldListSize(): Int = old.size

        override fun getNewListSize(): Int = new.size

        override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean = old[oldItemPosition].key == new[newItemPosition].key

        override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean = old[oldItemPosition] == new[newItemPosition]

        override fun getChangePayload(oldItemPosition: Int, newItemPosition: Int): Any = PAYLOAD_REBIND
    }

    class Spacing(private val context: Context, private val adapter: SearchAdapter) : RecyclerView.ItemDecoration() {
        override fun getItemOffsets(outRect: Rect, view: View, parent: RecyclerView, state: RecyclerView.State) {
            val position = parent.getChildAdapterPosition(view)
            if (position <= 0) return
            val item = adapter.items.getOrNull(position) ?: return
            if (item is SearchItem.Section || item === SearchItem.Hint) outRect.top = context.dpInt(SECTION_GAP)
        }
    }

    class PeopleStrip(context: Context) : HorizontalScrollView(context) {
        private val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            layoutTransition = LayoutTransition().apply {
                disableTransitionType(LayoutTransition.APPEARING)
                disableTransitionType(LayoutTransition.DISAPPEARING)
                disableTransitionType(LayoutTransition.CHANGE_APPEARING)
                setDuration(LayoutTransition.CHANGE_DISAPPEARING, MOVE_MS)
                setStartDelay(LayoutTransition.CHANGE_DISAPPEARING, 0)
                setInterpolator(LayoutTransition.CHANGE_DISAPPEARING, DecelerateInterpolator())
            }
        }

        init {
            isHorizontalScrollBarEnabled = false
            overScrollMode = OVER_SCROLL_NEVER
            clipToPadding = false
            val padX = context.dpInt(PAD_X)
            row.setPadding(padX, context.dpInt(PAD_TOP), padX, context.dpInt(PAD_BOTTOM))
            addView(row, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
        }

        fun bind(entries: List<RecentSearchEntry>, host: SearchAdapterHost) {
            val byKey = HashMap<String, RecentPersonView>()
            for (index in 0 until row.childCount) {
                val child = row.getChildAt(index) as RecentPersonView
                child.key?.let { byKey[it] = child }
            }
            val wanted = entries.map { RecentSearches.keyOf(it) }
            for (index in row.childCount - 1 downTo 0) {
                val child = row.getChildAt(index) as RecentPersonView
                if (child.key !in wanted) row.removeViewAt(index)
            }
            for ((index, entry) in entries.withIndex()) {
                val key = RecentSearches.keyOf(entry)
                val view = byKey[key]?.takeIf { it.parent === row } ?: RecentPersonView(context)
                view.bind(entry)
                view.onTap = { host.onRecentPerson(entry) }
                view.onLongPress = { host.onRecentLongPress(view, entry) }
                val params = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    if (index > 0) leftMargin = context.dpInt(GAP)
                }
                if (view.parent == null) {
                    row.addView(view, index, params)
                } else {
                    if (row.indexOfChild(view) != index) {
                        row.removeView(view)
                        row.addView(view, index, params)
                    } else {
                        view.layoutParams = params
                    }
                }
            }
        }

        fun onThemeChanged() {
            for (index in 0 until row.childCount) row.getChildAt(index).invalidate()
        }

        private companion object {
            const val PAD_X = 15f
            const val PAD_TOP = 8f
            const val PAD_BOTTOM = 4f
            const val GAP = 6f
            const val MOVE_MS = 180L
        }
    }

    class FailureView(context: Context) : LinearLayout(context) {
        private val message = TextView(context)
        private val retry = TextView(context)

        init {
            orientation = VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(context.dpInt(STATE_PAD_X), context.dpInt(STATE_PAD_Y), context.dpInt(STATE_PAD_X), context.dpInt(STATE_PAD_Y))
            message.setTextSize(TypedValue.COMPLEX_UNIT_DIP, STATE_TEXT)
            message.typeface = Fonts.message(FontWeight.REGULAR)
            message.gravity = Gravity.CENTER
            addView(message, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT))
            retry.text = RETRY
            retry.gravity = Gravity.CENTER
            retry.typeface = Fonts.message(FontWeight.SEMIBOLD)
            retry.setTextSize(TypedValue.COMPLEX_UNIT_DIP, RETRY_TEXT)
            retry.minWidth = context.dpInt(RETRY_MIN_W)
            retry.minHeight = context.dpInt(RETRY_MIN_H)
            retry.setPadding(context.dpInt(RETRY_PAD_X), 0, context.dpInt(RETRY_PAD_X), 0)
            retry.isClickable = true
            retry.isFocusable = true
            addView(retry, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT).apply { topMargin = context.dpInt(STATE_GAP) })
        }

        fun bind(text: String, onRetry: () -> Unit) {
            val palette = Theme.palette
            message.text = text
            message.setTextColor(withAlpha(palette.pulseInk, STATE_ALPHA))
            retry.setTextColor(palette.primary)
            retry.background = GradientDrawable().apply {
                cornerRadius = context.dp(RETRY_MIN_H)
                setColor(palette.primarySoft)
                setStroke(context.dpInt(1f), palette.primary)
            }
            retry.setOnClickListener { onRetry() }
        }

        private companion object {
            const val RETRY = "Повторить"
            const val STATE_PAD_X = 15f
            const val STATE_PAD_Y = 32f
            const val STATE_GAP = 12f
            const val STATE_TEXT = 14f
            const val STATE_ALPHA = 0.6f
            const val RETRY_TEXT = 15f
            const val RETRY_MIN_W = 120f
            const val RETRY_MIN_H = 44f
            const val RETRY_PAD_X = 24f
        }
    }

    companion object {
        const val PAYLOAD_REBIND = "rebind"
        const val PAYLOAD_THEME = "theme"
        private const val TYPE_SECTION = 0
        private const val TYPE_ROW = 1
        private const val TYPE_PEOPLE = 2
        private const val TYPE_HINT = 3
        private const val TYPE_FAILURE = 4
        private const val TYPE_EMPTY = 5
        private const val SECTION_GAP = 16f
        private const val SECTION_SCALE = 0.78f
        private const val SECTION_TRACKING = 0.08f
        private const val SECTION_PAD_X = 15f
        private const val SECTION_PAD_TOP = 8f
        private const val SECTION_PAD_BOTTOM = 4f
        private const val HINT_TEXT = 14f
        private const val HINT_ALPHA = 0.42f
        private const val HINT_PAD_X = 15f
        private const val HINT_PAD_Y = 16f

        fun sectionTitle(context: Context): TextView = TextView(context).apply {
            typeface = Fonts.display(FontWeight.BOLD)
            letterSpacing = SECTION_TRACKING
            includeFontPadding = false
            setPadding(context.dpInt(SECTION_PAD_X), context.dpInt(SECTION_PAD_TOP), context.dpInt(SECTION_PAD_X), context.dpInt(SECTION_PAD_BOTTOM))
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            isFocusable = false
            styleSection(this)
        }

        fun styleSection(view: TextView) {
            view.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(SECTION_SCALE))
            view.setTextColor(Theme.palette.primary)
            if (android.os.Build.VERSION.SDK_INT >= 28) view.isAccessibilityHeading = true
        }

        private fun hint(context: Context): TextView = TextView(context).apply {
            text = SearchItems.HINT
            gravity = Gravity.CENTER
            typeface = Fonts.message(FontWeight.REGULAR)
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, HINT_TEXT)
            setPadding(context.dpInt(HINT_PAD_X), context.dpInt(HINT_PAD_Y), context.dpInt(HINT_PAD_X), context.dpInt(HINT_PAD_Y))
            styleHint(this)
        }

        private fun styleHint(view: TextView) {
            view.setTextColor(withAlpha(Theme.palette.pulseInk, HINT_ALPHA))
        }
    }
}
