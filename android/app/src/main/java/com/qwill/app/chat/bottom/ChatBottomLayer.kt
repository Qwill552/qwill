package com.qwill.app.chat.bottom

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
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.widget.FrameLayout
import com.qwill.app.chat.ChatGlass
import com.qwill.app.chat.search.ChatSearchBar
import com.qwill.app.chat.search.MemberSuggestionsView
import com.qwill.app.chat.search.SearchArrowsView
import com.qwill.app.chat.top.ChromeCircleButton
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.max
import kotlin.math.roundToInt

class ChatBottomLayer(context: Context, blurSource: View, underlay: View) : FrameLayout(context) {
    private val blur = SharedBlur(blurSource, underlay, ChatGlass.BLUR_RADIUS, ChatGlass.SATURATION)
    private val backdrop = BottomBackdrop(context, blur)
    val bar = ChatSearchBar(context)
    val members = MemberSuggestionsView(context)
    val arrows = SearchArrowsView(context)

    private var safe = SafeArea.NONE
    private var imeAnimating = false
    private var barShown = 0f
    private var barTarget = false
    private var barAnimator: ValueAnimator? = null
    private val consumers = listOf(backdrop, bar, members, arrows.older, arrows.newer)
    private val sourceWatcher = ViewTreeObserver.OnPreDrawListener {
        if (visibility == View.VISIBLE) {
            if (blur.source.isDirty) invalidate()
            if (blur.underlay?.isDirty == true) for (view in consumers) view.invalidate()
        }
        true
    }

    init {
        clipChildren = false
        visibility = View.GONE
        addView(backdrop, LayoutParams(LayoutParams.MATCH_PARENT, 0, Gravity.BOTTOM))
        addView(bar, LayoutParams(LayoutParams.MATCH_PARENT, context.dp(ChatSearchBar.HEIGHT).roundToInt(), Gravity.BOTTOM))
        addView(members, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(arrows, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.END))
        for (view in consumers) blur.addConsumer(view)
        bar.blur = blur
        members.blur = blur
        arrows.blur = blur
        setWillNotDraw(false)
        applyBar(0f)
        applyLayout()
        if (Build.VERSION.SDK_INT >= 30) trackKeyboard()
    }

    val barVisible: Boolean get() = barTarget

    fun setSafeArea(area: SafeArea) {
        if (area == safe) return
        safe = area
        applyLayout()
        if (!imeAnimating) applyShift(area.keyboard)
    }

    fun setBlurSource(view: View, back: View?) {
        blur.setSource(view, back)
        invalidate()
        for (consumer in consumers) consumer.invalidate()
    }

    fun onSourceScrolled(dy: Int) {
        blur.onScrolled(dy)
    }

    fun setBarShown(show: Boolean, durationMs: Long, animated: Boolean) {
        if (show == barTarget && barAnimator == null) return
        barTarget = show
        barAnimator?.cancel()
        barAnimator = null
        if (show) visibility = View.VISIBLE
        val target = if (show) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isShown) {
            applyBar(target)
            settleVisibility()
            return
        }
        val animator = ValueAnimator.ofFloat(barShown, target)
        animator.duration = Motion.duration(durationMs)
        animator.interpolator = Motion.decelerate
        animator.addUpdateListener { applyBar(it.animatedValue as Float) }
        animator.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (barAnimator === animation) barAnimator = null
                if (!cancelled) settleVisibility()
            }
        })
        barAnimator = animator
        animator.start()
    }

    fun settleVisibility() {
        val empty = !barTarget && barAnimator == null && !arrows.visible
        visibility = if (empty) View.GONE else View.VISIBLE
        if (empty) blur.release()
    }

    fun applyTheme() {
        backdrop.applyTheme()
        bar.refresh()
        members.refresh()
        arrows.refresh()
    }

    private fun applyBar(value: Float) {
        barShown = value
        bar.alpha = value
        backdrop.alpha = value
        bar.visibility = if (value > 0f) View.VISIBLE else View.INVISIBLE
        backdrop.visibility = bar.visibility
    }

    private fun applyLayout() {
        val side = context.dp(SIDE)
        val bottom = context.dp(BOTTOM) + safe.bottom
        val barHeight = context.dp(ChatSearchBar.HEIGHT)
        (backdrop.layoutParams as LayoutParams).height = (barHeight + bottom).roundToInt()
        val barParams = bar.layoutParams as LayoutParams
        barParams.leftMargin = (side + safe.left).roundToInt()
        barParams.rightMargin = (side + safe.right).roundToInt()
        barParams.bottomMargin = bottom.roundToInt()
        val memberParams = members.layoutParams as LayoutParams
        memberParams.leftMargin = barParams.leftMargin
        memberParams.rightMargin = barParams.rightMargin
        memberParams.bottomMargin = (bottom + barHeight + context.dp(MEMBERS_GAP)).roundToInt()
        members.screenHeight = resources.displayMetrics.heightPixels
        val outset = context.dp((ChromeCircleButton.TAP - ChromeCircleButton.CIRCLE) / 2f)
        val arrowParams = arrows.layoutParams as LayoutParams
        arrowParams.rightMargin = (side + safe.right - outset).roundToInt()
        arrowParams.bottomMargin = (bottom + barHeight + context.dp(ARROWS_GAP) - outset).roundToInt()
        requestLayout()
    }

    private fun applyShift(keyboard: Int) {
        val shift = max(0, keyboard - safe.bottom)
        translationY = -shift.toFloat()
    }

    private fun trackKeyboard() {
        if (Build.VERSION.SDK_INT < 30) return
        setWindowInsetsAnimationCallback(object : WindowInsetsAnimation.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            override fun onPrepare(animation: WindowInsetsAnimation) {
                if (animation.typeMask and WindowInsets.Type.ime() != 0) imeAnimating = true
            }

            override fun onProgress(insets: WindowInsets, runningAnimations: MutableList<WindowInsetsAnimation>): WindowInsets {
                if (runningAnimations.none { it.typeMask and WindowInsets.Type.ime() != 0 }) return insets
                applyShift(insets.getInsets(WindowInsets.Type.ime()).bottom)
                return insets
            }

            override fun onEnd(animation: WindowInsetsAnimation) {
                if (animation.typeMask and WindowInsets.Type.ime() == 0) return
                imeAnimating = false
                applyShift(safe.keyboard)
            }
        })
    }

    override fun dispatchDraw(canvas: Canvas) {
        blur.update(this, width, height, canvas.isHardwareAccelerated)
        super.dispatchDraw(canvas)
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        viewTreeObserver.addOnPreDrawListener(sourceWatcher)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnPreDrawListener(sourceWatcher)
        super.onDetachedFromWindow()
        barAnimator?.cancel()
        barAnimator = null
        applyBar(if (barTarget) 1f else 0f)
        blur.release()
    }

    private class BottomBackdrop(context: Context, private val blur: SharedBlur) : View(context) {
        private val tintPaint = Paint()
        private val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
        private var maskFor = -1

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        fun applyTheme() {
            tintPaint.color = withAlpha(Theme.palette.pulseDock, TINT_ALPHA)
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            if (width == 0 || height == 0) return
            if (maskFor != height) {
                maskFor = height
                maskPaint.shader = LinearGradient(
                    0f,
                    height.toFloat(),
                    0f,
                    0f,
                    intArrayOf(Color.BLACK, Color.BLACK, Color.TRANSPARENT),
                    floatArrayOf(0f, SOLID_SHARE, 1f),
                    Shader.TileMode.CLAMP,
                )
            }
            val save = canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), null)
            canvas.clipRect(0, 0, width, height)
            blur.draw(canvas, this)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), tintPaint)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), maskPaint)
            canvas.restoreToCount(save)
        }

        private companion object {
            const val TINT_ALPHA = 0.5f
            const val SOLID_SHARE = 0.2f
        }
    }

    private companion object {
        const val SIDE = 14f
        const val BOTTOM = 20f
        const val MEMBERS_GAP = 8f
        const val ARROWS_GAP = 12f
    }
}
