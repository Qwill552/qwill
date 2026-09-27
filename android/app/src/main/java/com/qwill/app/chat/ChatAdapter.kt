package com.qwill.app.chat

import android.content.Context
import android.util.LruCache
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import androidx.recyclerview.widget.DefaultItemAnimator
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.chat.cells.BubbleInput
import com.qwill.app.chat.cells.BubbleLayout
import com.qwill.app.chat.cells.BubbleLayouts
import com.qwill.app.chat.cells.BubblePaints
import com.qwill.app.chat.cells.MessageCell
import com.qwill.app.chat.cells.MessageCellHost
import com.qwill.app.chat.cells.MessageCellModel
import com.qwill.app.model.LocalAttachment
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme

interface ChatAdapterHost {
    fun modelFor(row: FeedRow.Message): MessageCellModel

    fun isCovered(dayStartMs: Long): Boolean

    fun sideInsets(): Pair<Int, Int>

    fun idOf(row: FeedRow): Long
}

class ChatLayoutCache(private val paints: BubblePaints, private val versionCode: Int) {
    private class Key(
        val message: MessageDto,
        val own: Boolean,
        val showAuthor: Boolean,
        val status: Int,
        val local: LocalAttachment?,
        val rowWidth: Int,
        val fontSize: Float,
        val emojiReady: Boolean,
    ) {
        override fun equals(other: Any?): Boolean {
            if (other !is Key) return false
            return message === other.message && own == other.own && showAuthor == other.showAuthor && status == other.status &&
                local === other.local && rowWidth == other.rowWidth && fontSize == other.fontSize && emojiReady == other.emojiReady
        }

        override fun hashCode(): Int {
            var result = System.identityHashCode(message)
            result = result * 31 + own.hashCode()
            result = result * 31 + showAuthor.hashCode()
            result = result * 31 + status
            result = result * 31 + System.identityHashCode(local)
            result = result * 31 + rowWidth
            result = result * 31 + fontSize.hashCode()
            result = result * 31 + emojiReady.hashCode()
            return result
        }
    }

    private val cache = LruCache<Key, BubbleLayout>(CAPACITY)

    fun layoutFor(model: MessageCellModel, rowWidth: Int, emojiReady: Boolean): BubbleLayout {
        val message = model.row.message
        val key = Key(message, model.row.own, model.showAuthor, model.status.ordinal, model.local, rowWidth, Theme.fontSize.base, emojiReady)
        cache.get(key)?.let { return it }
        val built = BubbleLayouts.build(
            BubbleInput(message, model.row.own, model.showAuthor, model.status, model.myId, rowWidth, versionCode, model.local),
            paints,
        )
        cache.put(key, built)
        return built
    }

    fun clear() {
        cache.evictAll()
    }

    private companion object {
        const val CAPACITY = 200
    }
}

class ChatAdapter(
    private val context: Context,
    private val cellHost: MessageCellHost,
    private val host: ChatAdapterHost,
) : RecyclerView.Adapter<ChatAdapter.Holder>() {
    class Holder(view: View) : RecyclerView.ViewHolder(view)

    var rows: List<FeedRow> = emptyList()
        private set

    init {
        setHasStableIds(true)
    }

    fun submit(next: List<FeedRow>, diff: Boolean) {
        val previous = rows
        rows = next
        if (!diff || previous.isEmpty() || next.isEmpty()) {
            notifyDataSetChanged()
            return
        }
        DiffUtil.calculateDiff(Diff(previous, next), false).dispatchUpdatesTo(this)
    }

    fun rowAt(position: Int): FeedRow? = rows.getOrNull(rows.size - 1 - position)

    fun positionOfKey(key: String): Int {
        val index = rows.indexOfFirst { it.key == key }
        return if (index < 0) -1 else rows.size - 1 - index
    }

    fun positionOfMessage(id: Long): Int {
        val index = rows.indexOfFirst { it is FeedRow.Message && it.message.id == id }
        return if (index < 0) -1 else rows.size - 1 - index
    }

    override fun getItemCount(): Int = rows.size

    override fun getItemId(position: Int): Long = host.idOf(rowAt(position)!!)

    override fun getItemViewType(position: Int): Int = when (rowAt(position)) {
        is FeedRow.Day -> TYPE_DAY
        is FeedRow.Unread -> TYPE_UNREAD
        else -> TYPE_MESSAGE
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val view = when (viewType) {
            TYPE_DAY -> DayDividerView(context)
            TYPE_UNREAD -> UnreadDividerView(context)
            else -> MessageCell(context, cellHost)
        }
        view.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        return Holder(view)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        when (val row = rowAt(position)) {
            is FeedRow.Day -> (holder.itemView as DayDividerView).bind(row.dayStartMs, host.isCovered(row.dayStartMs))
            is FeedRow.Unread -> {
                val (left, right) = host.sideInsets()
                (holder.itemView as UnreadDividerView).bind(row.count, left, right)
            }
            is FeedRow.Message -> (holder.itemView as MessageCell).bind(host.modelFor(row))
            null -> Unit
        }
    }

    private class Diff(private val old: List<FeedRow>, private val new: List<FeedRow>) : DiffUtil.Callback() {
        override fun getOldListSize(): Int = old.size

        override fun getNewListSize(): Int = new.size

        override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean =
            old[old.size - 1 - oldItemPosition].key == new[new.size - 1 - newItemPosition].key

        override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean {
            val before = old[old.size - 1 - oldItemPosition]
            val after = new[new.size - 1 - newItemPosition]
            return when {
                before is FeedRow.Message && after is FeedRow.Message ->
                    before.message === after.message && before.own == after.own &&
                        before.sameAuthorAsPrev == after.sameAuthorAsPrev && before.sameAuthorAsNext == after.sameAuthorAsNext
                before is FeedRow.Unread && after is FeedRow.Unread -> before.count == after.count
                before is FeedRow.Day && after is FeedRow.Day -> before.dayStartMs == after.dayStartMs
                else -> false
            }
        }

        override fun getChangePayload(oldItemPosition: Int, newItemPosition: Int): Any = PAYLOAD_REBIND
    }

    override fun onBindViewHolder(holder: Holder, position: Int, payloads: MutableList<Any>) {
        onBindViewHolder(holder, position)
    }

    companion object {
        const val TYPE_MESSAGE = 0
        const val TYPE_DAY = 1
        const val TYPE_UNREAD = 2
        const val PAYLOAD_REBIND = "rebind"
    }
}

class ChatItemAnimator(private val shouldAppear: (RecyclerView.ViewHolder) -> Boolean, private val appearShift: Float) : DefaultItemAnimator() {
    private val pendingAppear = ArrayList<RecyclerView.ViewHolder>()
    private val runningAppear = ArrayList<RecyclerView.ViewHolder>()
    private var removing = false

    init {
        supportsChangeAnimations = false
        addDuration = APPEAR_MS
        removeDuration = REMOVE_MS
    }

    override fun animateAdd(holder: RecyclerView.ViewHolder): Boolean {
        if (!shouldAppear(holder)) {
            dispatchAddFinished(holder)
            return false
        }
        endAnimation(holder)
        val view = holder.itemView
        view.alpha = 0f
        view.translationY = appearShift
        view.scaleX = APPEAR_SCALE
        view.scaleY = APPEAR_SCALE
        pendingAppear.add(holder)
        return true
    }

    override fun animateRemove(holder: RecyclerView.ViewHolder): Boolean {
        removing = true
        val pending = super.animateRemove(holder)
        holder.itemView.animate().interpolator = Motion.easeScreen
        return pending
    }

    override fun animateMove(holder: RecyclerView.ViewHolder, fromX: Int, fromY: Int, toX: Int, toY: Int): Boolean {
        val pending = super.animateMove(holder, fromX, fromY, toX, toY)
        holder.itemView.animate().interpolator = if (removing) Motion.easeScreen else APPEAR_CURVE
        return pending
    }

    override fun runPendingAnimations() {
        moveDuration = if (removing) REMOVE_MS else APPEAR_MS
        removing = false
        super.runPendingAnimations()
        if (pendingAppear.isEmpty()) return
        val starting = ArrayList(pendingAppear)
        pendingAppear.clear()
        for (holder in starting) {
            runningAppear.add(holder)
            dispatchAddStarting(holder)
            val animation = holder.itemView.animate()
            animation.alpha(1f).translationY(0f).scaleX(1f).scaleY(1f)
                .setDuration(Motion.duration(APPEAR_MS))
                .setInterpolator(APPEAR_CURVE)
                .withEndAction {
                    holder.itemView.alpha = 1f
                    holder.itemView.translationY = 0f
                    holder.itemView.scaleX = 1f
                    holder.itemView.scaleY = 1f
                    runningAppear.remove(holder)
                    dispatchAddFinished(holder)
                    if (!isRunning) dispatchAnimationsFinished()
                }
                .start()
        }
    }

    override fun endAnimation(item: RecyclerView.ViewHolder) {
        if (pendingAppear.remove(item) || runningAppear.remove(item)) {
            item.itemView.animate().cancel()
            reset(item.itemView)
            dispatchAddFinished(item)
        }
        super.endAnimation(item)
    }

    override fun endAnimations() {
        for (holder in pendingAppear) {
            reset(holder.itemView)
            dispatchAddFinished(holder)
        }
        pendingAppear.clear()
        for (holder in ArrayList(runningAppear)) {
            holder.itemView.animate().cancel()
            reset(holder.itemView)
            dispatchAddFinished(holder)
        }
        runningAppear.clear()
        super.endAnimations()
    }

    override fun isRunning(): Boolean = pendingAppear.isNotEmpty() || runningAppear.isNotEmpty() || super.isRunning()

    private fun reset(view: View) {
        view.alpha = 1f
        view.translationY = 0f
        view.scaleX = 1f
        view.scaleY = 1f
    }

    companion object {
        const val APPEAR_MS = 380L
        const val REMOVE_MS = 200L
        const val APPEAR_SCALE = 0.94f
        const val APPEAR_SHIFT_DP = 12f
        val APPEAR_CURVE = PathInterpolator(0.22f, 1f, 0.36f, 1f)
    }
}
