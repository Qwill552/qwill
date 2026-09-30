package com.qwill.app.chat.selection

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.os.SystemClock
import android.util.TypedValue
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.chat.cells.MessageCell
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
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

    override fun dispatchDraw(canvas: Canvas) {
        super.dispatchDraw(canvas)
        touchHelper?.drawSwipeIcon(canvas)
    }
}

class FeedTouchHelper(private val list: FeedListView, private val host: Host) {
    interface Host {
        val selectionActive: Boolean

        fun visibleTop(): Float

        fun visibleBottom(): Float

        fun onLongPress(message: MessageDto): Boolean

        fun onSelectTap(message: MessageDto)

        fun onDragTo(message: MessageDto)

        val keyboardShown: Boolean get() = false

        fun dismissKeyboard() {}

        fun canSwipeReply(message: MessageDto): Boolean = false

        fun onSwipeReply(message: MessageDto) {}
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
    private var dismissing = false
    private var swipeCandidate = false
    private var swiping = false
    private var swipeCell: MessageCell? = null
    private var swipeMessage: MessageDto? = null
    private var captureX = 0f
    private var swipeOffset = 0f
    private var swipeCrossed = false
    private var swipeFill = 0f
    private var fillAnimator: ValueAnimator? = null
    private var returnAnimator: ValueAnimator? = null
    private val swipeStart = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_MM, SwipeReply.START_MM, context.resources.displayMetrics)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val circlePaint = Paint(Paint.ANTI_ALIAS_FLAG)
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
                    swipeCandidate = false
                    list.removeCallbacks(longPress)
                }
            }
        })
    }

    fun dispatch(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                reset()
                finishReturn()
                downX = event.x
                downY = event.y
                lastX = event.x
                lastY = event.y
                downMessage = messageUnder(event.x, event.y)
                tapCandidate = true
                dismissing = host.keyboardShown
                if (!dismissing) {
                    if (downMessage != null) list.postDelayed(longPress, LONG_PRESS_MS)
                    val cell = list.findChildViewUnder(event.x, event.y) as? MessageCell
                    val message = cell?.boundModel?.row?.message
                    if (cell != null && message != null && !host.selectionActive && list.scrollState == RecyclerView.SCROLL_STATE_IDLE && host.canSwipeReply(message)) {
                        swipeCandidate = true
                        swipeCell = cell
                        swipeMessage = message
                    }
                }
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
                if (swiping) {
                    onSwipeMove(event.x)
                    return true
                }
                if (swipeCandidate && SwipeReply.shouldStart(event.x - downX, event.y - downY, swipeStart)) {
                    startSwipe(event)
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
                if (swiping) {
                    val message = swipeMessage
                    val crossed = swipeCrossed
                    endSwipe()
                    if (crossed && message != null) host.onSwipeReply(message)
                    reset()
                    return true
                }
                if (dismissing && tapCandidate) {
                    cancelList(event)
                    reset()
                    host.dismissKeyboard()
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
                if (swiping) {
                    endSwipe()
                    reset()
                    return true
                }
                reset()
                return list.dispatchToList(event)
            }
        }
        if (owning || swiping) return true
        return list.dispatchToList(event)
    }

    fun cancel() {
        list.removeCallbacks(longPress)
        if (swiping) endSwipe()
        reset()
    }

    private fun cancelList(event: MotionEvent) {
        val now = SystemClock.uptimeMillis()
        val cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, event.x, event.y, 0)
        list.dispatchToList(cancel)
        cancel.recycle()
    }

    private fun startSwipe(event: MotionEvent) {
        swiping = true
        swipeCandidate = false
        tapCandidate = false
        list.removeCallbacks(longPress)
        captureX = event.x
        swipeOffset = 0f
        swipeCrossed = false
        swipeFill = 0f
        fillAnimator?.cancel()
        fillAnimator = null
        cancelList(event)
        list.parent?.requestDisallowInterceptTouchEvent(true)
    }

    private fun onSwipeMove(x: Float) {
        val offset = SwipeReply.offset(x - captureX, context.dp(SwipeReply.LIMIT))
        setSwipeOffset(offset)
        val crossed = SwipeReply.crossed(offset, context.dp(SwipeReply.THRESHOLD))
        if (crossed != swipeCrossed) {
            swipeCrossed = crossed
            if (crossed) tick()
            animateFill(if (crossed) 1f else 0f)
        }
    }

    @Suppress("DEPRECATION")
    private fun tick() {
        list.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP, HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING)
    }

    private fun setSwipeOffset(value: Float) {
        swipeOffset = value
        val cell = swipeCell
        if (cell != null && cell.boundModel?.row?.message?.id == swipeMessage?.id) cell.slideOffset = value
        list.invalidate()
    }

    private fun animateFill(target: Float) {
        fillAnimator?.cancel()
        fillAnimator = null
        if (!Motion.animationsEnabled) {
            swipeFill = target
            list.invalidate()
            return
        }
        val animator = ValueAnimator.ofFloat(swipeFill, target)
        animator.duration = Motion.duration(FILL_MS)
        animator.addUpdateListener {
            swipeFill = it.animatedValue as Float
            list.invalidate()
        }
        fillAnimator = animator
        animator.start()
    }

    private fun endSwipe() {
        swiping = false
        val start = swipeOffset
        if (start == 0f || !Motion.animationsEnabled) {
            finishReturn()
            return
        }
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(SwipeReply.RETURN_MS)
        animator.addUpdateListener { setSwipeOffset(start * (1f - Motion.decelerate.getInterpolation(it.animatedValue as Float))) }
        animator.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (returnAnimator === animation) returnAnimator = null
                if (!cancelled) finishReturn()
            }
        })
        returnAnimator = animator
        animator.start()
    }

    private fun finishReturn() {
        returnAnimator?.cancel()
        returnAnimator = null
        fillAnimator?.cancel()
        fillAnimator = null
        if (swipeOffset != 0f) setSwipeOffset(0f)
        swipeCell = null
        swipeMessage = null
        swipeCrossed = false
        swipeFill = 0f
        list.invalidate()
    }

    fun drawSwipeIcon(canvas: Canvas) {
        val cell = swipeCell ?: return
        val offset = swipeOffset
        if (offset == 0f || cell.parent !== list) return
        val progress = SwipeReply.progress(offset, context.dp(SwipeReply.ICON_FROM), context.dp(SwipeReply.ICON_SPAN))
        if (progress <= 0f) return
        val own = cell.boundModel?.row?.own == true
        val palette = Theme.palette
        val cx = SwipeReply.iconCenterX(list.width.toFloat(), offset, own)
        val cy = cell.y + cell.height / 2f
        val radius = context.dp(ICON_CIRCLE) / 2f
        val save = canvas.save()
        canvas.translate(cx, cy)
        canvas.rotate(-ICON_TURN * progress)
        circlePaint.color = blend(palette.primarySoft, palette.primary, swipeFill)
        circlePaint.alpha = (circlePaint.alpha * progress).toInt().coerceIn(0, 255)
        canvas.drawCircle(0f, 0f, radius, circlePaint)
        val icon = context.dp(ICON)
        val ink = blend(palette.primary, palette.textOnPrimary, swipeFill)
        QwillIcon.REPLY.draw(canvas, -icon / 2f, -icon / 2f, icon, withAlpha(ink, progress * (ink ushr 24) / 255f), iconPaint)
        canvas.restoreToCount(save)
    }

    private fun blend(from: Int, to: Int, share: Float): Int {
        val t = share.coerceIn(0f, 1f)
        fun channel(shift: Int): Int {
            val a = (from ushr shift) and 0xFF
            val b = (to ushr shift) and 0xFF
            return (a + (b - a) * t).toInt() and 0xFF
        }
        return (channel(24) shl 24) or (channel(16) shl 16) or (channel(8) shl 8) or channel(0)
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
        dismissing = false
        swipeCandidate = false
        swiping = false
    }

    private companion object {
        const val LONG_PRESS_MS = 500L
        const val TAP_SLOP = 10f
        const val EDGE = 56f
        const val SPEED = 12f
        const val ICON_CIRCLE = 28f
        const val ICON = 16f
        const val ICON_TURN = 16f
        const val FILL_MS = 140L
    }
}
