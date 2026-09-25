package com.qwill.app.chats

import android.content.Context
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import androidx.recyclerview.widget.DefaultItemAnimator
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.RecyclerView

class FrozenUpdates<T> {
    private val holders = HashSet<String>()
    private var pending: T? = null
    private var hasPending = false

    val isFrozen: Boolean get() = holders.isNotEmpty()

    fun submit(value: T, apply: (T) -> Unit) {
        if (isFrozen) {
            pending = value
            hasPending = true
            return
        }
        apply(value)
    }

    fun hold(reason: String, held: Boolean, apply: (T) -> Unit) {
        if (held) {
            holders.add(reason)
            return
        }
        if (!holders.remove(reason) || isFrozen || !hasPending) return
        @Suppress("UNCHECKED_CAST")
        val value = pending as T
        pending = null
        hasPending = false
        apply(value)
    }
}

class ChatsAdapter(private val context: Context, private val host: ChatCellHost, private val clock: () -> Long) : RecyclerView.Adapter<ChatsAdapter.Holder>() {
    class Holder(val cell: ChatCell) : RecyclerView.ViewHolder(cell)

    var items: List<ChatRowModel> = emptyList()
        private set

    fun submit(next: List<ChatRowModel>, animate: Boolean) {
        val previous = items
        items = next
        if (!animate || previous.isEmpty() || next.isEmpty()) {
            notifyDataSetChanged()
            return
        }
        DiffUtil.calculateDiff(Diff(previous, next), true).dispatchUpdatesTo(this)
    }

    fun indexOf(chatId: String): Int = items.indexOfFirst { it.id == chatId }

    override fun getItemCount(): Int = items.size

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val cell = ChatCell(context, host)
        cell.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        return Holder(cell)
    }

    override fun onBindViewHolder(holder: Holder, position: Int) {
        holder.cell.bind(items[position], clock())
    }

    override fun onBindViewHolder(holder: Holder, position: Int, payloads: MutableList<Any>) {
        holder.cell.bind(items[position], clock())
    }

    private class Diff(private val old: List<ChatRowModel>, private val new: List<ChatRowModel>) : DiffUtil.Callback() {
        override fun getOldListSize(): Int = old.size

        override fun getNewListSize(): Int = new.size

        override fun areItemsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean = old[oldItemPosition].id == new[newItemPosition].id

        override fun areContentsTheSame(oldItemPosition: Int, newItemPosition: Int): Boolean = old[oldItemPosition] == new[newItemPosition]

        override fun getChangePayload(oldItemPosition: Int, newItemPosition: Int): Any = ChatCell.PAYLOAD_REBIND
    }
}

class ChatsItemAnimator : DefaultItemAnimator() {
    init {
        moveDuration = DURATION_MS
        addDuration = DURATION_MS
        removeDuration = DURATION_MS
        changeDuration = DURATION_MS
        supportsChangeAnimations = false
    }

    override fun animateMove(holder: RecyclerView.ViewHolder, fromX: Int, fromY: Int, toX: Int, toY: Int): Boolean {
        val pending = super.animateMove(holder, fromX, fromY, toX, toY)
        holder.itemView.animate().interpolator = CURVE
        return pending
    }

    override fun animateAdd(holder: RecyclerView.ViewHolder): Boolean {
        val pending = super.animateAdd(holder)
        holder.itemView.animate().interpolator = CURVE
        return pending
    }

    override fun animateRemove(holder: RecyclerView.ViewHolder): Boolean {
        val pending = super.animateRemove(holder)
        holder.itemView.animate().interpolator = CURVE
        return pending
    }

    private companion object {
        const val DURATION_MS = 180L
        val CURVE = DecelerateInterpolator()
    }
}
