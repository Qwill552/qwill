package com.qwill.app.chat.search

import android.animation.ValueAnimator
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.view.animation.Interpolator
import com.qwill.app.chat.top.ChromeCircleButton
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt

class SearchArrowsView(context: Context) : ViewGroup(context) {
    val older = ChromeCircleButton(context, QwillIcon.CHEVRON_UP, "К более старому совпадению")
    val newer = ChromeCircleButton(context, QwillIcon.CHEVRON_DOWN, "К более новому совпадению")

    private var shown = 0f
    private var shift = 0f
    private var shownTarget = false
    private var listTarget = false
    private var shownAnimator: ValueAnimator? = null
    private var shiftAnimator: ValueAnimator? = null
    private var olderAnimator: ValueAnimator? = null
    private var newerAnimator: ValueAnimator? = null

    var blur: SharedBlur? = null
        set(value) {
            field = value
            older.blur = value
            newer.blur = value
        }

    init {
        clipChildren = false
        addView(older)
        addView(newer)
        apply()
    }

    val visible: Boolean get() = shown > 0f

    fun setShown(show: Boolean, durationMs: Long, animated: Boolean, onHidden: () -> Unit = {}) {
        if (show == shownTarget && shownAnimator == null) {
            if (!show) onHidden()
            return
        }
        shownTarget = show
        shownAnimator?.cancel()
        shownAnimator = null
        val target = if (show) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isShown) {
            shown = target
            apply()
            if (!show) onHidden()
            return
        }
        shownAnimator = tween(shown, target, durationMs, Motion.decelerate, { shown = it }) {
            shownAnimator = null
            if (!show) onHidden()
        }
    }

    fun setListMode(list: Boolean, animated: Boolean) {
        if (list == listTarget) return
        listTarget = list
        shiftAnimator?.cancel()
        shiftAnimator = null
        val target = if (list) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isShown) {
            shift = target
            apply()
            return
        }
        shiftAnimator = tween(shift, target, LIST_MS, Motion.easeOutQuint, { shift = it }) { shiftAnimator = null }
    }

    fun setEnabledArrows(canOlder: Boolean, canNewer: Boolean, animated: Boolean) {
        olderAnimator = setButton(older, canOlder, olderAnimator, animated)
        newerAnimator = setButton(newer, canNewer, newerAnimator, animated)
    }

    fun refresh() {
        older.invalidate()
        newer.invalidate()
    }

    private fun setButton(button: ChromeCircleButton, enabled: Boolean, running: ValueAnimator?, animated: Boolean): ValueAnimator? {
        if (button.isEnabled == enabled) return running
        button.isEnabled = enabled
        running?.cancel()
        val target = if (enabled) 1f else DISABLED_ICON
        if (!animated || !Motion.animationsEnabled || !isShown) {
            button.iconAlpha = target
            return null
        }
        return ValueAnimator.ofFloat(button.iconAlpha, target).apply {
            duration = Motion.duration(ICON_MS)
            interpolator = Motion.easeOutQuint
            addUpdateListener { button.iconAlpha = it.animatedValue as Float }
            start()
        }
    }

    private fun tween(from: Float, to: Float, durationMs: Long, curve: Interpolator, update: (Float) -> Unit, end: () -> Unit): ValueAnimator {
        val animator = ValueAnimator.ofFloat(from, to)
        animator.duration = Motion.duration(durationMs)
        animator.interpolator = curve
        animator.addUpdateListener {
            update(it.animatedValue as Float)
            apply()
        }
        animator.addListener(object : android.animation.AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: android.animation.Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: android.animation.Animator) {
                if (!cancelled) end()
            }
        })
        animator.start()
        return animator
    }

    private fun apply() {
        val alpha = shown * (1f - shift)
        val scale = HIDDEN_SCALE + (1f - HIDDEN_SCALE) * shown
        for (button in listOf(older, newer)) {
            button.alpha = alpha
            button.scaleX = scale
            button.scaleY = scale
            button.translationY = context.dp(TRAVEL) * (1f - shown)
            button.translationX = context.dp(TRAVEL) * shift
        }
        val interactive = alpha > 0f && listTarget.not() && shownTarget
        visibility = if (alpha > 0f) View.VISIBLE else View.INVISIBLE
        older.isClickable = interactive
        newer.isClickable = interactive
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val tap = context.dpInt(ChromeCircleButton.TAP)
        val spec = MeasureSpec.makeMeasureSpec(tap, MeasureSpec.EXACTLY)
        older.measure(spec, spec)
        newer.measure(spec, spec)
        setMeasuredDimension(tap, tap * 2 + spacing())
    }

    private fun spacing(): Int = context.dpInt(VISIBLE_GAP - (ChromeCircleButton.TAP - ChromeCircleButton.CIRCLE))

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val tap = older.measuredHeight
        older.layout(0, 0, tap, tap)
        newer.layout(0, tap + spacing(), tap, tap * 2 + spacing())
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        for (animator in listOf(shownAnimator, shiftAnimator, olderAnimator, newerAnimator)) animator?.cancel()
        shownAnimator = null
        shiftAnimator = null
        olderAnimator = null
        newerAnimator = null
        shown = if (shownTarget) 1f else 0f
        shift = if (listTarget) 1f else 0f
        older.iconAlpha = if (older.isEnabled) 1f else DISABLED_ICON
        newer.iconAlpha = if (newer.isEnabled) 1f else DISABLED_ICON
        apply()
    }

    companion object {
        const val OPEN_MS = 280L
        const val SELECTION_MS = 240L
        private const val LIST_MS = 320L
        private const val ICON_MS = 320L
        private const val TRAVEL = 80f
        private const val HIDDEN_SCALE = 0.7f
        private const val DISABLED_ICON = 0.5f
        private const val VISIBLE_GAP = 8f
    }
}
