package com.qwill.app.consent

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ObjectAnimator
import android.content.Context
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import com.qwill.app.model.PendingConsentDto
import com.qwill.app.ui.glass.GlassView
import com.qwill.app.ui.stack.ScreenStack
import com.qwill.app.ui.theme.Glass
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme

class ConsentGateLayer(context: Context, private val underlay: View) : FrameLayout(context) {
    val stack = ScreenStack(context)
    private val scrim = GlassView(context, underlay, blurDp = Glass.SCRIM_BLUR, saturation = Glass.SHEET_SATURATION)
    private var screen: ConsentGateScreen? = null
    private var fade: Animator? = null
    private var wide = false

    var shown = false
        private set

    var onBackStateChanged: (() -> Unit)? = null

    init {
        visibility = View.GONE
        isClickable = true
        isFocusable = false
        addView(scrim, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        addView(stack, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        stack.onBackStateChanged = { onBackStateChanged?.invoke() }
        applyAppearance()
    }

    fun apply(change: GateChange, consent: PendingConsentDto?) {
        when (change) {
            GateChange.NONE -> if (consent != null) screen?.updateConsent(consent)
            GateChange.SHOW_INSTANT -> show(consent ?: return, animated = false)
            GateChange.SHOW_ANIMATED -> show(consent ?: return, animated = true)
            GateChange.HIDE_INSTANT -> hide(animated = false)
            GateChange.HIDE_ANIMATED -> hide(animated = true)
        }
    }

    fun applyAppearance() {
        scrim.tint = Theme.palette.scrimBg
    }

    fun dispatchThemeChanged() {
        applyAppearance()
        stack.dispatchThemeChanged()
    }

    private fun show(consent: PendingConsentDto, animated: Boolean) {
        fade?.cancel()
        shown = true
        val gate = ConsentGateScreen(consent)
        screen = gate
        stack.setRoot(gate)
        visibility = View.VISIBLE
        underlay.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        underlay.visibility = View.VISIBLE
        onBackStateChanged?.invoke()
        if (!animated || !Motion.animationsEnabled) {
            alpha = 1f
            coverUnderlay()
            return
        }
        alpha = 0f
        runFade(1f, DecelerateInterpolator()) { coverUnderlay() }
    }

    private fun hide(animated: Boolean) {
        if (!shown) return
        fade?.cancel()
        shown = false
        underlay.visibility = View.VISIBLE
        underlay.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
        onBackStateChanged?.invoke()
        if (!animated || !Motion.animationsEnabled) {
            finishHide()
            return
        }
        runFade(0f, AccelerateInterpolator()) { finishHide() }
    }

    private fun finishHide() {
        visibility = View.GONE
        alpha = 1f
        stack.destroyAll()
        screen = null
        onBackStateChanged?.invoke()
    }

    private fun runFade(to: Float, interpolator: android.animation.TimeInterpolator, onEnd: () -> Unit) {
        val animator = ObjectAnimator.ofFloat(this, View.ALPHA, alpha, to)
        animator.duration = FADE_MS
        animator.interpolator = interpolator
        animator.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (fade === animation) fade = null
                if (!cancelled) onEnd()
            }
        })
        fade = animator
        animator.start()
    }

    private fun coverUnderlay() {
        if (shown && !wide) underlay.visibility = View.INVISIBLE
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        wide = w / resources.displayMetrics.density >= PosterMetrics.WIDE_MIN_DP
        scrim.visibility = if (wide) View.VISIBLE else View.GONE
        if (!shown) return
        if (wide) {
            underlay.visibility = View.VISIBLE
        } else if (fade == null) {
            underlay.visibility = View.INVISIBLE
        }
    }

    private companion object {
        const val FADE_MS = 150L
    }
}
