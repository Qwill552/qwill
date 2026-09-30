package com.qwill.app.chat.top

import android.content.Context
import android.view.View
import android.view.ViewGroup
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.dp
import kotlin.math.max
import kotlin.math.roundToInt

open class ChromeRowLayout(
    context: Context,
    private val trailingGapDp: Float,
    private val middleGapDp: Float = GAP,
) : ViewGroup(context) {
    private var leading: View? = null
    private var middle: View? = null
    private val trailing = ArrayList<View>()
    private var safe = SafeArea.NONE

    protected fun setParts(leadingView: View, middleView: View, trailingViews: List<View>) {
        leading = leadingView
        middle = middleView
        trailing.clear()
        trailing.addAll(trailingViews)
        addView(leadingView)
        addView(middleView)
        for (view in trailingViews) addView(view)
    }

    fun setSafeArea(area: SafeArea) {
        if (area == safe) return
        safe = area
        requestLayout()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val tap = context.dp(ChromeCircleButton.TAP).roundToInt()
        val tapSpec = MeasureSpec.makeMeasureSpec(tap, MeasureSpec.EXACTLY)
        leading?.measure(tapSpec, tapSpec)
        for (view in trailing) view.measure(tapSpec, tapSpec)
        val (left, right) = middleBounds(width)
        middle?.measure(
            MeasureSpec.makeMeasureSpec(max(0, right - left), MeasureSpec.EXACTLY),
            MeasureSpec.makeMeasureSpec(context.dp(ChatCapsuleView.HEIGHT).roundToInt(), MeasureSpec.EXACTLY),
        )
        setMeasuredDimension(width, (safe.top + context.dp(ROW_HEIGHT)).roundToInt())
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val width = r - l
        val center = (safe.top + context.dp(TOP_PAD + ChatCapsuleView.HEIGHT / 2f)).roundToInt()
        val outset = context.dp((ChromeCircleButton.TAP - ChromeCircleButton.CIRCLE) / 2f)
        leading?.let {
            val left = (safe.left + context.dp(SIDE) - outset).roundToInt()
            it.layout(left, center - it.measuredHeight / 2, left + it.measuredWidth, center + it.measuredHeight / 2)
        }
        var circleRight = width - safe.right - context.dp(SIDE)
        for (index in trailing.indices.reversed()) {
            val view = trailing[index]
            if (view.visibility == GONE) continue
            val right = (circleRight + outset).roundToInt()
            view.layout(right - view.measuredWidth, center - view.measuredHeight / 2, right, center + view.measuredHeight / 2)
            circleRight -= context.dp(ChromeCircleButton.CIRCLE) + context.dp(trailingGapDp)
        }
        middle?.let {
            val (left, _) = middleBounds(width)
            it.layout(left, center - it.measuredHeight / 2, left + it.measuredWidth, center + it.measuredHeight / 2)
        }
    }

    private fun middleBounds(width: Int): Pair<Int, Int> {
        val circle = context.dp(ChromeCircleButton.CIRCLE)
        val gap = context.dp(middleGapDp)
        val left = safe.left + context.dp(SIDE) + circle + gap
        val shown = trailing.count { it.visibility != GONE }
        var right = width - safe.right - context.dp(SIDE)
        if (shown > 0) right -= circle * shown + context.dp(trailingGapDp) * (shown - 1) + gap
        return left.roundToInt() to right.roundToInt()
    }

    override fun shouldDelayChildPressedState(): Boolean = false

    companion object {
        const val SIDE = 12f
        const val GAP = 9f
        const val TOP_PAD = 6f
        const val ROW_HEIGHT = 58f
    }
}
