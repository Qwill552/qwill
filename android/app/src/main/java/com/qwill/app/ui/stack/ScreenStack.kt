package com.qwill.app.ui.stack

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.pow

class ScreenStack(context: Context) : FrameLayout(context) {
    private val screens = ArrayList<Screen>()
    private val scrimPaint = Paint()
    private var animator: ValueAnimator? = null
    private var movingTop: View? = null
    private var movingUnder: View? = null
    private var openness = 1f
    private var backGestureActive = false

    var onBackStateChanged: (() -> Unit)? = null

    var safeArea: SafeArea = SafeArea.NONE
        set(value) {
            if (value == field) return
            field = value
            for (screen in screens) if (screen.view != null) screen.onSafeAreaChanged(value)
        }

    val depth: Int get() = screens.size

    val top: Screen? get() = screens.lastOrNull()

    fun canHandleBack(): Boolean = top?.interceptsBack == true || screens.size > 1

    fun setRoot(screen: Screen) {
        destroyAll()
        attach(screen)
        screens.add(screen)
        screen.onShown()
        notifyBackStateChanged()
    }

    fun resetTo(screen: Screen) {
        setRoot(screen)
    }

    fun replaceAll(screen: Screen) {
        finishTransition()
        val outgoing = ArrayList(screens)
        val under = screens.lastOrNull()
        val view = attach(screen)
        screens.clear()
        screens.add(screen)
        notifyBackStateChanged()
        val underView = under?.view
        if (under == null || underView == null || width == 0 || !Motion.animationsEnabled) {
            finishReplace(under, outgoing, screen)
            return
        }
        view.translationX = width.toFloat()
        runTransition(view, underView, 0f, 1f) { finishReplace(under, outgoing, screen) }
    }

    private fun finishReplace(under: Screen?, outgoing: List<Screen>, incoming: Screen) {
        under?.onHidden()
        for (screen in outgoing.asReversed()) {
            screen.view?.let { removeView(it) }
            screen.releaseView()
            screen.destroy()
            screen.stack = null
        }
        incoming.view?.translationX = 0f
        clearMoving()
        incoming.onShown()
    }

    fun push(screen: Screen, animated: Boolean = true) {
        finishTransition()
        val under = screens.lastOrNull()
        val view = attach(screen)
        screens.add(screen)
        notifyBackStateChanged()
        val underView = under?.view
        if (under == null || underView == null) {
            screen.onShown()
            return
        }
        if (!animated || width == 0 || !Motion.animationsEnabled) {
            finishPush(under, screen)
            return
        }
        view.translationX = width.toFloat()
        runTransition(view, underView, 0f, 1f) { finishPush(under, screen) }
    }

    fun pop(animated: Boolean = true): Boolean {
        if (screens.size < 2) return false
        finishTransition()
        val topView = screens.last().view ?: return false
        val underView = revealUnder() ?: return false
        if (!animated || width == 0 || !Motion.animationsEnabled) {
            finishPop()
            return true
        }
        runTransition(topView, underView, 1f, 0f) { finishPop() }
        return true
    }

    fun handleBack(): Boolean {
        val current = top ?: return false
        if (current.interceptsBack && current.onBackPressed()) return true
        return pop()
    }

    fun beginBackGesture(): Boolean {
        if (top?.interceptsBack == true || screens.size < 2) return false
        finishTransition()
        val topView = screens.last().view ?: return false
        val underView = revealUnder() ?: return false
        movingTop = topView
        movingUnder = underView
        backGestureActive = true
        applyOpenness(1f)
        return true
    }

    fun updateBackGesture(progress: Float) {
        if (!backGestureActive || width == 0) return
        val pulled = (progress - Motion.SYSTEM_BACK_LAZY_START) / (1f - Motion.SYSTEM_BACK_LAZY_START)
        if (pulled <= 0f) {
            applyOpenness(1f)
            return
        }
        val eased = 1f - (1f - min(1f, pulled)).pow(3)
        val shift = context.dp(Motion.SYSTEM_BACK_NUDGE_DP) * eased
        applyOpenness(1f - shift / width)
    }

    fun cancelBackGesture() {
        if (!backGestureActive) return
        backGestureActive = false
        val topView = movingTop ?: return
        val underView = movingUnder ?: return
        runTransition(topView, underView, openness, 1f) { settleCovered(underView) }
    }

    fun commitBackGesture() {
        if (!backGestureActive) {
            handleBack()
            return
        }
        backGestureActive = false
        val topView = movingTop ?: return
        val underView = movingUnder ?: return
        runTransition(topView, underView, openness, 0f) { finishPop() }
    }

    fun dispatchThemeChanged() {
        for (screen in screens) {
            val view = screen.view ?: continue
            paintBackground(screen, view)
            screen.onThemeChanged()
        }
        invalidate()
    }

    fun destroyAll() {
        finishTransition()
        for (screen in screens.asReversed()) {
            screen.view?.let { removeView(it) }
            screen.releaseView()
            screen.destroy()
            screen.stack = null
        }
        screens.clear()
    }

    internal fun notifyBackStateChanged() {
        onBackStateChanged?.invoke()
    }

    override fun onInterceptTouchEvent(ev: MotionEvent): Boolean = isMoving() || super.onInterceptTouchEvent(ev)

    override fun onTouchEvent(event: MotionEvent): Boolean = isMoving() || super.onTouchEvent(event)

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (!backGestureActive) finishTransition()
    }

    override fun drawChild(canvas: Canvas, child: View, drawingTime: Long): Boolean {
        if (child === movingTop && openness > 0f) {
            scrimPaint.color = withAlpha(Color.BLACK, SCRIM_MAX * openness)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), scrimPaint)
        }
        return super.drawChild(canvas, child, drawingTime)
    }

    private fun isMoving(): Boolean = animator != null || backGestureActive

    private fun attach(screen: Screen): View {
        screen.stack = this
        val view = screen.obtainView(context)
        paintBackground(screen, view)
        screen.onSafeAreaChanged(safeArea)
        if (view.parent == null) addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        return view
    }

    private fun paintBackground(screen: Screen, view: View) {
        if (!screen.paintsOwnBackground) view.setBackgroundColor(Theme.palette.bg)
    }

    private fun revealUnder(): View? {
        val under = screens.getOrNull(screens.size - 2) ?: return null
        val view = under.view ?: prepareHidden(under) ?: return null
        view.visibility = View.VISIBLE
        return view
    }

    private fun prepareHidden(screen: Screen): View? {
        val view = screen.obtainView(context)
        paintBackground(screen, view)
        screen.onSafeAreaChanged(safeArea)
        if (view.parent == null) addView(view, 0, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        view.visibility = View.INVISIBLE
        return view
    }

    private fun runTransition(topView: View, underView: View, from: Float, to: Float, onEnd: () -> Unit) {
        movingTop = topView
        movingUnder = underView
        applyOpenness(from)
        val transition = ValueAnimator.ofFloat(from, to)
        transition.duration = (Motion.duration(Motion.SCREEN) * abs(to - from).coerceAtLeast(MIN_DURATION_SHARE)).toLong()
        transition.interpolator = Motion.easeScreen
        transition.addUpdateListener { applyOpenness(it.animatedValue as Float) }
        transition.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (animator !== animation) return
                animator = null
                applyOpenness(to)
                onEnd()
            }
        })
        animator = transition
        transition.start()
    }

    private fun finishTransition() {
        animator?.end()
    }

    private fun applyOpenness(value: Float) {
        openness = value
        val w = width.toFloat()
        movingTop?.translationX = w * (1f - value)
        movingUnder?.translationX = -UNDER_SHIFT * w * value
        invalidate()
    }

    private fun finishPush(under: Screen, screen: Screen) {
        under.view?.let { settleCovered(it) }
        screen.view?.translationX = 0f
        clearMoving()
        under.onHidden()
        screen.onShown()
        trimViews()
    }

    private fun finishPop() {
        val leaving = screens.removeAt(screens.size - 1)
        leaving.view?.let { removeView(it) }
        leaving.onHidden()
        leaving.releaseView()
        leaving.destroy()
        leaving.stack = null
        val current = screens.last()
        current.view?.translationX = 0f
        clearMoving()
        current.onShown()
        notifyBackStateChanged()
        post {
            val under = screens.getOrNull(screens.size - 2)
            if (under != null && under.view == null && animator == null && !backGestureActive) prepareHidden(under)
        }
    }

    private fun settleCovered(view: View) {
        view.visibility = View.INVISIBLE
        view.translationX = 0f
        clearMoving()
    }

    private fun clearMoving() {
        movingTop = null
        movingUnder = null
        openness = 1f
        invalidate()
    }

    private fun trimViews() {
        for (index in 0 until screens.size - KEPT_VIEWS) {
            val screen = screens[index]
            val view = screen.view ?: continue
            removeView(view)
            screen.releaseView()
        }
    }

    private companion object {
        const val KEPT_VIEWS = 2
        const val UNDER_SHIFT = 0.22f
        const val SCRIM_MAX = 0.45f
        const val MIN_DURATION_SHARE = 0.4f
    }
}
