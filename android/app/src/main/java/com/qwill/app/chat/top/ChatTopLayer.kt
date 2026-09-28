package com.qwill.app.chat.top

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Shader
import android.view.Gravity
import android.view.View
import android.view.animation.Interpolator
import android.widget.FrameLayout
import com.qwill.app.model.CallDto
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.glass.GlassView
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.roundToInt

class ChatTopLayer(
    context: Context,
    blurSource: View,
    private val onContentTopChanged: () -> Unit,
    onPinnedJump: () -> Unit,
    onPinnedClose: () -> Unit,
    onJoinCall: () -> Unit,
) : FrameLayout(context) {
    private val backdrop = TopBackdrop(context, blurSource)
    val callBanner = GroupCallBannerView(context, onJoinCall)
    val pinnedBanner = PinnedBannerView(context, onPinnedJump, onPinnedClose)
    val header = ChatHeaderView(context)
    val selection = SelectionHeaderView(context)

    private var safe = SafeArea.NONE
    private var callShown = false
    private var callLeaving = false
    private var pinnedShown = false
    private var pinnedLeaving = false
    private var selectionShown = false

    private var callOffset = 0f
    private var callAlpha = 1f
    private var pinnedShift = 0f
    private var pinnedOffset = 0f
    private var pinnedAlpha = 1f

    private var callAnimator: ValueAnimator? = null
    private var pinnedAnimator: ValueAnimator? = null
    private var modeAnimator: ValueAnimator? = null

    val contentTop: Int get() = context.dp(ChatTopLayout.contentTop(callShown, pinnedShown)).roundToInt()

    val selectionActive: Boolean get() = selectionShown

    init {
        clipChildren = false
        addView(backdrop, LayoutParams(LayoutParams.MATCH_PARENT, 0, Gravity.TOP))
        callBanner.visibility = View.GONE
        addView(callBanner, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP))
        pinnedBanner.visibility = View.GONE
        addView(pinnedBanner, LayoutParams(LayoutParams.MATCH_PARENT, context.dp(ChatTopLayout.PINNED_BANNER).roundToInt(), Gravity.TOP))
        addView(header, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP))
        selection.visibility = View.INVISIBLE
        selection.alpha = 0f
        addView(selection, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP))
        header.clipChildren = false
        selection.clipChildren = false
        applyTheme()
        applyLayout()
    }

    fun setSafeArea(area: SafeArea) {
        if (area == safe) return
        safe = area
        header.setSafeArea(area)
        selection.setSafeArea(area)
        applyLayout()
    }

    fun applyTheme() {
        backdrop.applyTheme()
        pinnedBanner.applyTheme()
        callBanner.invalidate()
        header.refresh()
        selection.refresh()
    }

    fun setCall(call: CallDto?, animated: Boolean) {
        val animate = animated && Motion.animationsEnabled && isShown
        if (call != null) {
            callBanner.setCall(call)
            if (callShown && !callLeaving) return
            callAnimator?.cancel()
            val wasLeaving = callLeaving
            callLeaving = false
            if (!wasLeaving) {
                callShown = true
                callBanner.visibility = View.VISIBLE
                applyLayout()
                onContentTopChanged()
            }
            val shift = -context.dp(ChatTopLayout.CALL_BANNER + ChatTopLayout.GAP)
            if (!animate) {
                callOffset = 0f
                callAlpha = 1f
                pinnedShift = 0f
                applyTransforms()
                return
            }
            val fromOffset = if (wasLeaving) callOffset else -context.dp(ChatTopLayout.CALL_BANNER) * RISE_SHARE
            val fromAlpha = if (wasLeaving) callAlpha else 0f
            val fromShift = if (wasLeaving) pinnedShift else shift
            callAnimator = tween(Motion.MENU, Motion.easeSpring, { p ->
                callOffset = fromOffset * (1f - p)
                callAlpha = (fromAlpha + (1f - fromAlpha) * p).coerceIn(0f, 1f)
                pinnedShift = fromShift * (1f - p)
                applyTransforms()
            }) { callAnimator = null }
            return
        }
        if (!callShown || callLeaving) return
        callAnimator?.cancel()
        val finish = {
            callLeaving = false
            callShown = false
            callBanner.visibility = View.GONE
            callOffset = 0f
            callAlpha = 1f
            pinnedShift = 0f
            applyTransforms()
            applyLayout()
            onContentTopChanged()
        }
        if (!animate) {
            finish()
            return
        }
        callLeaving = true
        val target = -context.dp(ChatTopLayout.CALL_BANNER) * RISE_SHARE
        val shift = -context.dp(ChatTopLayout.CALL_BANNER + ChatTopLayout.GAP)
        callAnimator = tween(Motion.CLOSE, Motion.easeClose, { p ->
            callOffset = target * p
            callAlpha = 1f - p
            pinnedShift = shift * p
            applyTransforms()
        }) {
            callAnimator = null
            finish()
        }
    }

    fun setPinned(message: MessageDto?, canUnpin: Boolean, animated: Boolean) {
        val animate = animated && Motion.animationsEnabled && isShown
        if (message != null) {
            pinnedBanner.setMessage(message, canUnpin, animate && pinnedShown && !pinnedLeaving)
            if (pinnedShown && !pinnedLeaving) return
            pinnedAnimator?.cancel()
            val wasLeaving = pinnedLeaving
            pinnedLeaving = false
            if (!wasLeaving) {
                pinnedShown = true
                pinnedBanner.visibility = View.VISIBLE
                applyLayout()
                onContentTopChanged()
            }
            if (!animate) {
                pinnedOffset = 0f
                pinnedAlpha = 1f
                applyTransforms()
                return
            }
            val fromOffset = if (wasLeaving) pinnedOffset else -context.dp(PINNED_RISE)
            val fromAlpha = if (wasLeaving) pinnedAlpha else 0f
            pinnedAnimator = tween(Motion.MENU, Motion.easeScreen, { p ->
                pinnedOffset = fromOffset * (1f - p)
                pinnedAlpha = fromAlpha + (1f - fromAlpha) * p
                applyTransforms()
            }) { pinnedAnimator = null }
            return
        }
        if (!pinnedShown || pinnedLeaving) return
        pinnedAnimator?.cancel()
        val finish = {
            pinnedLeaving = false
            pinnedShown = false
            pinnedBanner.visibility = View.GONE
            pinnedBanner.forget()
            pinnedOffset = 0f
            pinnedAlpha = 1f
            applyTransforms()
            applyLayout()
            onContentTopChanged()
        }
        if (!animate) {
            finish()
            return
        }
        pinnedLeaving = true
        val target = -context.dp(PINNED_RISE)
        pinnedAnimator = tween(Motion.CLOSE, Motion.easeClose, { p ->
            pinnedOffset = target * p
            pinnedAlpha = 1f - p
            applyTransforms()
        }) {
            pinnedAnimator = null
            finish()
        }
    }

    fun setSelectionMode(active: Boolean, animated: Boolean) {
        if (active == selectionShown) return
        selectionShown = active
        modeAnimator?.cancel()
        val incoming = if (active) selection else header
        val outgoing = if (active) header else selection
        incoming.visibility = View.VISIBLE
        if (!animated || !Motion.animationsEnabled || !isShown) {
            incoming.alpha = 1f
            outgoing.alpha = 0f
            outgoing.visibility = View.INVISIBLE
            return
        }
        val fromIn = incoming.alpha
        val fromOut = outgoing.alpha
        modeAnimator = tween(Motion.MENU, Motion.easeScreen, { p ->
            incoming.alpha = fromIn + (1f - fromIn) * p
            outgoing.alpha = fromOut * (1f - p)
        }) {
            modeAnimator = null
            outgoing.visibility = View.INVISIBLE
        }
    }

    fun stopAnimations() {
        for (animator in listOf(callAnimator, pinnedAnimator, modeAnimator)) animator?.end()
    }

    private fun applyLayout() {
        val side = (context.dp(ChatTopLayout.SIDE)).roundToInt()
        val backdropParams = backdrop.layoutParams as LayoutParams
        backdropParams.height = safe.top + contentTop
        backdrop.layoutParams = backdropParams
        val callParams = callBanner.layoutParams as LayoutParams
        callParams.topMargin = safe.top + context.dp(ChatTopLayout.callTop()).roundToInt()
        callParams.leftMargin = side + safe.left
        callParams.rightMargin = side + safe.right
        callBanner.layoutParams = callParams
        val pinnedParams = pinnedBanner.layoutParams as LayoutParams
        pinnedParams.topMargin = safe.top + context.dp(ChatTopLayout.pinnedTop(callShown)).roundToInt()
        pinnedParams.leftMargin = side + safe.left
        pinnedParams.rightMargin = side + safe.right
        pinnedBanner.layoutParams = pinnedParams
    }

    private fun applyTransforms() {
        callBanner.translationY = callOffset
        callBanner.alpha = callAlpha
        pinnedBanner.translationY = pinnedShift + pinnedOffset
        pinnedBanner.alpha = pinnedAlpha
    }

    private fun tween(durationMs: Long, curve: Interpolator, update: (Float) -> Unit, end: () -> Unit): ValueAnimator {
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(durationMs)
        animator.interpolator = curve
        animator.addUpdateListener { update(it.animatedValue as Float) }
        animator.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (!cancelled) end()
            }
        })
        animator.start()
        return animator
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        stopAnimations()
    }

    private class TopBackdrop(context: Context, source: View) : FrameLayout(context) {
        private val glass = GlassView(context, source, BLUR, SATURATION)
        private val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
        private var maskFor = -1

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
            glass.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
            addView(glass, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        }

        fun applyTheme() {
            glass.tint = withAlpha(Theme.palette.pulseDock, TINT_ALPHA)
        }

        override fun dispatchDraw(canvas: Canvas) {
            if (width == 0 || height == 0) return
            if (maskFor != height) {
                maskFor = height
                maskPaint.shader = LinearGradient(
                    0f,
                    0f,
                    0f,
                    height.toFloat(),
                    intArrayOf(Color.BLACK, Color.BLACK, Color.TRANSPARENT),
                    floatArrayOf(0f, SOLID_SHARE, 1f),
                    Shader.TileMode.CLAMP,
                )
            }
            val save = canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), null)
            super.dispatchDraw(canvas)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), maskPaint)
            canvas.restoreToCount(save)
        }

        private companion object {
            const val BLUR = 6f
            const val SATURATION = 1.5f
            const val TINT_ALPHA = 0.5f
            const val SOLID_SHARE = 0.2f
        }
    }

    private companion object {
        const val RISE_SHARE = 1.2f
        const val PINNED_RISE = 6f
    }
}
