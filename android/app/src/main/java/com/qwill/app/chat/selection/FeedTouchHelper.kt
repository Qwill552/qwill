package com.qwill.app.chat.selection

import android.content.Context
import android.os.SystemClock
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.chat.cells.MessageCell
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.theme.dp
import kotlin.math.abs
import kotlin.math.hypot

class FeedListView(context: Context) : RecyclerView(context) {
    var touchHelper: FeedTouchHelper? = null
    var beforeFrame: (() -> Unit)? = null
    private val frameWatcher = android.view.ViewTreeObserver.OnPreDrawListener {
        beforeFrame?.invoke()
        true
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        viewTreeObserver.addOnPreDrawListener(frameWatcher)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnPreDrawListener(frameWatcher)
        super.onDetachedFromWindow()
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        val helper = touchHelper ?: return super.dispatchTouchEvent(event)
        return helper.dispatch(event)
    }

    fun dispatchToList(event: MotionEvent): Boolean = super.dispatchTouchEvent(event)
}

class FeedTouchHelper(private val list: FeedListView, private val host: Host) {
    interface Host {
        val selectionActive: Boolean

        fun visibleTop(): Float

        fun visibleBottom(): Float

        fun onLongPress(message: MessageDto): Boolean

        fun onSelectTap(message: MessageDto)

        fun onDragTo(message: MessageDto)
    }

    private val context = list.context
    private val tapSlop = context.dp(TAP_SLOP)
    private val dragSlop = ViewConfiguration.get(context).scaledTouchSlop.toFloat()
    private var downX = 0f
    private var downY = 0f
    private var lastX = 0f
    private var lastY = 0f
    private var downMessage: MessageDto? = null
    private var tapCandidate = false
    private var owning = false
    private var dragging = false
    private var scrollSpeed = 0
    private var lastTarget = 0L
    private val longPress = Runnable { fireLongPress() }
    private val autoScroll = object : Runnable {
        override fun run() {
            if (!owning || scrollSpeed == 0) return
            list.scrollBy(0, scrollSpeed)
            pickTarget()
            list.postOnAnimation(this)
        }
    }

    init {
        list.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrollStateChanged(recyclerView: RecyclerView, newState: Int) {
                if (newState == RecyclerView.SCROLL_STATE_DRAGGING && !owning) {
                    tapCandidate = false
                    list.removeCallbacks(longPress)
                }
            }
        })
    }

    fun dispatch(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                reset()
                downX = event.x
                downY = event.y
                lastX = event.x
                lastY = event.y
                downMessage = messageUnder(event.x, event.y)
                tapCandidate = true
                if (downMessage != null) list.postDelayed(longPress, LONG_PRESS_MS)
                return list.dispatchToList(event)
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                if (owning) return true
                tapCandidate = false
                list.removeCallbacks(longPress)
                return list.dispatchToList(event)
            }
            MotionEvent.ACTION_MOVE -> {
                lastX = event.x
                lastY = event.y
                if (owning) {
                    onDrag()
                    return true
                }
                if (tapCandidate && hypot(event.x - downX, event.y - downY) > tapSlop) {
                    tapCandidate = false
                    list.removeCallbacks(longPress)
                }
                return list.dispatchToList(event)
            }
            MotionEvent.ACTION_UP -> {
                list.removeCallbacks(longPress)
                if (owning) {
                    reset()
                    return true
                }
                val handled = list.dispatchToList(event)
                val message = downMessage
                if (tapCandidate && message != null && host.selectionActive) host.onSelectTap(message)
                reset()
                return handled
            }
            MotionEvent.ACTION_CANCEL -> {
                list.removeCallbacks(longPress)
                if (owning) {
                    reset()
                    return true
                }
                reset()
                return list.dispatchToList(event)
            }
        }
        if (owning) return true
        return list.dispatchToList(event)
    }

    fun cancel() {
        list.removeCallbacks(longPress)
        reset()
    }

    private fun fireLongPress() {
        val message = downMessage ?: return
        if (!tapCandidate || owning) return
        tapCandidate = false
        if (!host.onLongPress(message)) return
        list.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        owning = true
        dragging = false
        lastTarget = message.id
        val now = SystemClock.uptimeMillis()
        val cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, lastX, lastY, 0)
        list.dispatchToList(cancel)
        cancel.recycle()
        list.stopScroll()
    }

    private fun onDrag() {
        if (!dragging) {
            if (abs(lastY - downY) <= dragSlop) return
            dragging = true
        }
        pickTarget()
        val edge = context.dp(EDGE)
        val speed = context.dp(SPEED).toInt()
        val next = when {
            lastY < host.visibleTop() + edge -> -speed
            lastY > host.visibleBottom() - edge -> speed
            else -> 0
        }
        if (next != 0 && scrollSpeed == 0) {
            scrollSpeed = next
            list.postOnAnimation(autoScroll)
        } else {
            scrollSpeed = next
        }
    }

    private fun pickTarget() {
        if (!dragging) return
        val y = lastY.coerceIn(host.visibleTop(), host.visibleBottom() - 1f)
        val message = messageUnder(list.width / 2f, y) ?: return
        if (message.id == lastTarget) return
        lastTarget = message.id
        host.onDragTo(message)
    }

    private fun messageUnder(x: Float, y: Float): MessageDto? {
        val cell = list.findChildViewUnder(x, y) as? MessageCell ?: return null
        val message = cell.boundModel?.row?.message ?: return null
        return if (SelectionRules.selectable(message)) message else null
    }

    private fun reset() {
        list.removeCallbacks(autoScroll)
        owning = false
        dragging = false
        scrollSpeed = 0
        tapCandidate = false
        downMessage = null
    }

    private companion object {
        const val LONG_PRESS_MS = 500L
        const val TAP_SLOP = 10f
        const val EDGE = 56f
        const val SPEED = 12f
    }
}
