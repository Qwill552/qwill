package com.qwill.app.chat.bottom

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.Shader
import android.os.Build
import android.view.Gravity
import android.view.View
import android.view.ViewTreeObserver
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import com.qwill.app.chat.ChatGlass
import com.qwill.app.chat.composer.ComposerContextBar
import com.qwill.app.chat.composer.ComposerErrorLine
import com.qwill.app.chat.composer.ComposerView
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
import kotlin.math.min
import kotlin.math.roundToInt

enum class BottomMode { NONE, COMPOSER, BLOCKED, SERVICE, SEARCH, SELECTION }

class IslandFrame(val current: Float, val applied: Float, val listShift: Float)

class ChatBottomLayer(context: Context, blurSource: View, underlay: View) : FrameLayout(context) {
    private val blur = SharedBlur(blurSource, underlay, ChatGlass.BLUR_RADIUS, ChatGlass.SATURATION)
    private val backdrop = BottomBackdrop(context, blur)
    val contextBar = ComposerContextBar(context)
    val errorLine = ComposerErrorLine(context)
    val composer = ComposerView(context)
    val blocked = BlockedBar(context)
    val service = ServiceChatBar(context)
    val selectionBar = SelectionBar(context)
    val bar = ChatSearchBar(context)
    val mentions = MemberSuggestionsView(context)
    val members = MemberSuggestionsView(context)
    val arrows = SearchArrowsView(context)

    var onIsland: ((IslandFrame) -> Boolean)? = null
    var onKeyboardShift: ((Float) -> Unit)? = null

    private var safe = SafeArea.NONE
    private var imeAnimating = false
    private var keyboardShift = 0f
    private var mode = BottomMode.NONE
    private val fades = FloatArray(BottomMode.values().size)
    private val fadeFrom = FloatArray(BottomMode.values().size)
    private var fadeAnimator: ValueAnimator? = null
    private var contextWanted = false
    private var errorWanted = false
    private var replyWanted = false
    private var replyShown = 0f
    private var replyAnimator: ValueAnimator? = null
    private val island = IslandMotion(0f)
    private val rowTween = Tween(-1f)
    private val panelTween = Tween(0f)
    private val errorTween = Tween(0f)
    private var islandAnimator: ValueAnimator? = null
    private var islandReady = false
    private val clip = Rect()
    private val consumers = listOf(backdrop, contextBar, errorLine, composer.capsule, blocked, service, selectionBar, bar, mentions, members, arrows.older, arrows.newer)
    private val parts = listOf(backdrop, contextBar, errorLine, composer, blocked, service, selectionBar, bar, mentions, members, arrows)
    private val sourceWatcher = ViewTreeObserver.OnPreDrawListener {
        var draw = true
        if (visibility == View.VISIBLE) {
            if (syncIsland()) draw = false
            if (blur.source.isDirty) invalidate()
            if (blur.underlay?.isDirty == true) for (view in consumers) view.invalidate()
        }
        draw
    }

    init {
        clipChildren = false
        clipToPadding = false
        visibility = View.GONE
        addView(backdrop, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(contextBar, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(errorLine, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(composer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(blocked, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(service, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(selectionBar, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(bar, LayoutParams(LayoutParams.MATCH_PARENT, context.dp(ChatSearchBar.HEIGHT).roundToInt(), Gravity.BOTTOM))
        addView(mentions, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(members, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        addView(arrows, LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT, Gravity.BOTTOM or Gravity.END))
        for (view in consumers) blur.addConsumer(view)
        composer.blur = blur
        contextBar.blur = blur
        errorLine.blur = blur
        blocked.blur = blur
        service.blur = blur
        selectionBar.blur = blur
        bar.blur = blur
        mentions.blur = blur
        members.blur = blur
        arrows.blur = blur
        contextBar.visibility = View.GONE
        errorLine.visibility = View.GONE
        setWillNotDraw(false)
        applyFades()
        applyReply(0f)
        applyLayout()
        if (Build.VERSION.SDK_INT >= 30) trackKeyboard()
    }

    val currentMode: BottomMode get() = mode

    val islandCurrent: Float get() = island.current

    val islandTarget: Float get() = island.target

    val keyboardOffset: Float get() = keyboardShift

    fun setSafeArea(area: SafeArea) {
        if (area == safe) return
        safe = area
        applyLayout()
        if (!imeAnimating) applyShift(area.keyboard.toFloat())
    }

    fun setBlurSource(view: View, back: View?) {
        blur.setSource(view, back)
        invalidate()
        for (consumer in consumers) consumer.invalidate()
    }

    fun onSourceScrolled(dy: Int) {
        blur.onScrolled(dy)
    }

    fun invalidateBlur() {
        invalidate()
    }

    fun setMode(next: BottomMode, animated: Boolean) {
        if (next == mode && fadeAnimator == null) return
        mode = next
        fadeAnimator?.cancel()
        fadeAnimator = null
        if (next != BottomMode.NONE) visibility = View.VISIBLE
        for (index in fades.indices) fadeFrom[index] = fades[index]
        if (!animated || !Motion.animationsEnabled || !isShown) {
            setFades(1f)
            settleVisibility()
            requestLayout()
            return
        }
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(MODE_MS)
        animator.interpolator = Motion.decelerate
        animator.addUpdateListener { setFades(it.animatedValue as Float) }
        animator.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (fadeAnimator === animation) fadeAnimator = null
                if (!cancelled) settleVisibility()
            }
        })
        fadeAnimator = animator
        applyFadeVisibility()
        requestLayout()
        animator.start()
    }

    fun setContextShown(show: Boolean) {
        if (show == contextWanted) return
        contextWanted = show
        if (show) contextBar.visibility = View.VISIBLE
        requestLayout()
        invalidate()
    }

    fun setErrorShown(show: Boolean) {
        if (show == errorWanted) return
        errorWanted = show
        if (show) errorLine.visibility = View.VISIBLE
        requestLayout()
        invalidate()
    }

    val contextShown: Boolean get() = contextWanted

    fun setSelectionReply(show: Boolean, animated: Boolean) {
        if (show == replyWanted && replyAnimator == null) return
        replyWanted = show
        replyAnimator?.cancel()
        replyAnimator = null
        val target = if (show) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isShown) {
            applyReply(target)
            return
        }
        val from = replyShown
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(REPLY_MS)
        animator.interpolator = LinearInterpolator()
        animator.addUpdateListener {
            val t = it.animatedValue as Float
            applyReply(from + (target - from) * Motion.easeOutQuint.getInterpolation(t), from + (target - from) * Motion.decelerate.getInterpolation(t))
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (replyAnimator === animation) replyAnimator = null
            }
        })
        replyAnimator = animator
        animator.start()
    }

    fun settleVisibility() {
        val empty = mode == BottomMode.NONE && fadeAnimator == null && !arrows.visible
        visibility = if (empty) View.GONE else View.VISIBLE
        applyFadeVisibility()
        if (empty) blur.release()
    }

    fun applyTheme() {
        backdrop.applyTheme()
        bar.refresh()
        members.refresh()
        mentions.refresh()
        arrows.refresh()
        composer.refresh()
        contextBar.refresh()
        errorLine.refresh()
        blocked.refresh()
        service.refresh()
        selectionBar.refresh()
    }

    private fun setFades(t: Float) {
        for (value in BottomMode.values()) {
            val target = if (value == mode) 1f else 0f
            val from = fadeFrom[value.ordinal]
            fades[value.ordinal] = from + (target - from) * t
        }
        applyFades()
    }

    private fun fade(value: BottomMode): Float = fades[value.ordinal]

    private fun selectionPush(): Float = context.dp(SELECTION_PUSH) * fade(BottomMode.SELECTION)

    private fun applyFades() {
        val composerAlpha = fade(BottomMode.COMPOSER)
        composer.alpha = composerAlpha
        contextBar.alpha = composerAlpha
        errorLine.alpha = composerAlpha
        blocked.alpha = fade(BottomMode.BLOCKED)
        service.alpha = fade(BottomMode.SERVICE)
        bar.alpha = fade(BottomMode.SEARCH)
        selectionBar.alpha = fade(BottomMode.SELECTION) * replyShown
        var total = 0f
        for (value in BottomMode.values()) if (value != BottomMode.NONE) total += fade(value)
        backdrop.alpha = total.coerceIn(0f, 1f)
        applyFadeVisibility()
        applyIslandFrame()
    }

    private fun applyFadeVisibility() {
        fun show(view: View, alive: Boolean) {
            val next = if (alive) View.VISIBLE else View.INVISIBLE
            if (view.visibility != View.GONE && view.visibility != next) view.visibility = next
        }
        val composerAlive = fade(BottomMode.COMPOSER) > 0f
        show(composer, composerAlive)
        show(contextBar, composerAlive)
        show(errorLine, composerAlive)
        show(blocked, fade(BottomMode.BLOCKED) > 0f)
        show(service, fade(BottomMode.SERVICE) > 0f)
        show(bar, fade(BottomMode.SEARCH) > 0f)
        show(selectionBar, fade(BottomMode.SELECTION) > 0f && replyShown > 0f)
        show(backdrop, backdrop.alpha > 0f)
    }

    private fun applyReply(value: Float, slide: Float = value) {
        replyShown = value
        selectionBar.alpha = fade(BottomMode.SELECTION) * value
        selectionBar.translationY = -context.dp(SELECTION_PUSH) * (1f - value)
        selectionBar.translationX = -selectionBar.width / 2f * (1f - slide)
        applyFadeVisibility()
    }

    private fun modeHeight(value: BottomMode): Float = when (value) {
        BottomMode.NONE -> 0f
        BottomMode.COMPOSER -> composer.measuredHeight + panelTarget() + errorTarget()
        BottomMode.BLOCKED -> blocked.measuredHeight.toFloat()
        BottomMode.SERVICE -> service.measuredHeight.toFloat()
        BottomMode.SEARCH -> context.dp(ChatSearchBar.HEIGHT)
        BottomMode.SELECTION -> context.dp(SelectionBar.HEIGHT)
    }

    private fun panelTarget(): Float = if (contextWanted && contextBar.measuredHeight > 0) contextBar.measuredHeight + context.dp(GAP) else 0f

    private fun errorTarget(): Float = if (errorWanted && errorLine.measuredHeight > 0) errorLine.measuredHeight + context.dp(GAP) else 0f

    private fun syncIsland(): Boolean {
        if (composer.measuredHeight == 0) return false
        val rowTarget = composer.measuredHeight.toFloat()
        val panel = panelTarget()
        val error = errorTarget()
        val total = modeHeight(mode)
        if (!islandReady) {
            islandReady = true
            rowTween.jump(rowTarget)
            panelTween.jump(panel)
            errorTween.jump(error)
            island.jump(total)
            finishParts()
            return reportIsland()
        }
        val changed = rowTween.to != rowTarget || panelTween.to != panel || errorTween.to != error || island.target != total
        if (!changed) return false
        rowTween.retarget(rowTarget)
        panelTween.retarget(panel)
        errorTween.retarget(error)
        island.retarget(total)
        islandAnimator?.cancel()
        islandAnimator = null
        if (!Motion.animationsEnabled || !isShown) {
            finishIsland()
            return reportIsland()
        }
        advanceIsland(0f)
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(Motion.ISLAND)
        animator.interpolator = Motion.island
        animator.addUpdateListener {
            advanceIsland(it.animatedValue as Float)
            reportIsland()
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (islandAnimator === animation) islandAnimator = null
                if (!cancelled) {
                    finishIsland()
                    reportIsland()
                }
            }
        })
        islandAnimator = animator
        animator.start()
        return reportIsland()
    }

    private fun advanceIsland(t: Float) {
        rowTween.at(t)
        panelTween.at(t)
        errorTween.at(t)
        island.advance(t)
        applyIslandFrame()
    }

    private fun finishIsland() {
        advanceIsland(1f)
        finishParts()
    }

    private fun finishParts() {
        if (!contextWanted && panelTween.value <= 0f && contextBar.visibility != View.GONE) contextBar.visibility = View.GONE
        if (!errorWanted && errorTween.value <= 0f && errorLine.visibility != View.GONE) errorLine.visibility = View.GONE
        applyIslandFrame()
    }

    private fun reportIsland(): Boolean = onIsland?.invoke(IslandFrame(island.current, island.applied, island.listShift)) ?: false

    private fun applyIslandFrame() {
        val push = selectionPush()
        val bottomInset = context.dp(BOTTOM) + safe.bottom
        val row = if (rowTween.value < 0f) composer.measuredHeight.toFloat() else rowTween.value
        composer.setDrawnHeight(row)
        composer.translationY = push
        val errorHeight = errorLine.height.toFloat()
        val errorShown = errorTween.value
        val errorBottom = row + errorShown - errorHeight
        errorLine.translationY = push - errorBottom
        clipTop(errorLine, min(errorHeight, max(0f, errorShown)))
        val panelHeight = contextBar.height.toFloat()
        val panelShown = panelTween.value
        val panelBottom = row + errorShown + panelShown - panelHeight
        contextBar.translationY = push - panelBottom
        clipTop(contextBar, min(panelHeight, max(0f, panelShown)))
        blocked.translationY = push
        service.translationY = push
        bar.translationY = push
        mentions.baseShift = push - island.current
        backdrop.band = bottomInset + island.current
        backdrop.invalidate()
        invalidate()
    }

    private fun clipTop(view: View, visible: Float) {
        if (view.width == 0) return
        val bottom = visible.roundToInt()
        if (bottom >= view.height) {
            if (view.clipBounds != null) view.clipBounds = null
            return
        }
        clip.set(0, 0, view.width, max(0, bottom))
        view.clipBounds = clip
    }

    private fun applyLayout() {
        val side = context.dp(SIDE)
        val bottom = context.dp(BOTTOM) + safe.bottom
        val barHeight = context.dp(ChatSearchBar.HEIGHT)
        for (view in listOf(contextBar, errorLine, composer, blocked, service, selectionBar, bar)) {
            val params = view.layoutParams as LayoutParams
            params.leftMargin = (side + safe.left).roundToInt()
            params.rightMargin = (side + safe.right).roundToInt()
            params.bottomMargin = bottom.roundToInt()
        }
        val mentionParams = mentions.layoutParams as LayoutParams
        mentionParams.leftMargin = (side + safe.left).roundToInt()
        mentionParams.rightMargin = (side + safe.right).roundToInt()
        mentionParams.bottomMargin = (bottom + context.dp(MEMBERS_GAP)).roundToInt()
        mentions.screenHeight = resources.displayMetrics.heightPixels
        val memberParams = members.layoutParams as LayoutParams
        memberParams.leftMargin = (side + safe.left).roundToInt()
        memberParams.rightMargin = (side + safe.right).roundToInt()
        memberParams.bottomMargin = (bottom + barHeight + context.dp(MEMBERS_GAP)).roundToInt()
        members.screenHeight = resources.displayMetrics.heightPixels
        val outset = context.dp((ChromeCircleButton.TAP - ChromeCircleButton.CIRCLE) / 2f)
        val arrowParams = arrows.layoutParams as LayoutParams
        arrowParams.rightMargin = (side + safe.right - outset).roundToInt()
        arrowParams.bottomMargin = (bottom + barHeight + context.dp(ARROWS_GAP) - outset).roundToInt()
        requestLayout()
        applyIslandFrame()
    }

    private fun applyShift(keyboard: Float) {
        val shift = max(0f, keyboard - safe.bottom)
        keyboardShift = shift
        translationY = -shift
        onKeyboardShift?.invoke(shift)
    }

    private fun trackKeyboard() {
        if (Build.VERSION.SDK_INT < 30) return
        setWindowInsetsAnimationCallback(object : WindowInsetsAnimation.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
            override fun onPrepare(animation: WindowInsetsAnimation) {
                if (animation.typeMask and WindowInsets.Type.ime() != 0) imeAnimating = true
            }

            override fun onProgress(insets: WindowInsets, runningAnimations: MutableList<WindowInsetsAnimation>): WindowInsets {
                if (runningAnimations.none { it.typeMask and WindowInsets.Type.ime() != 0 }) return insets
                applyShift(insets.getInsets(WindowInsets.Type.ime()).bottom.toFloat())
                return insets
            }

            override fun onEnd(animation: WindowInsetsAnimation) {
                if (animation.typeMask and WindowInsets.Type.ime() == 0) return
                imeAnimating = false
                applyShift(safe.keyboard.toFloat())
            }
        })
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        applyIslandFrame()
        applyReply(replyShown)
    }

    override fun dispatchDraw(canvas: Canvas) {
        val top = regionTop()
        blur.update(this, width, height - top, canvas.isHardwareAccelerated, top)
        super.dispatchDraw(canvas)
    }

    private fun regionTop(): Int {
        var top = height.toFloat()
        for (view in parts) {
            if (view.visibility != View.VISIBLE || view.alpha <= 0f) continue
            val viewTop = if (view === backdrop) height - backdrop.band else view.y
            if (viewTop < top) top = viewTop
        }
        return top.coerceIn(0f, height.toFloat()).toInt()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        viewTreeObserver.addOnPreDrawListener(sourceWatcher)
    }

    override fun onDetachedFromWindow() {
        viewTreeObserver.removeOnPreDrawListener(sourceWatcher)
        super.onDetachedFromWindow()
        fadeAnimator?.cancel()
        fadeAnimator = null
        setFades(1f)
        replyAnimator?.cancel()
        replyAnimator = null
        applyReply(if (replyWanted) 1f else 0f)
        islandAnimator?.cancel()
        islandAnimator = null
        islandReady = false
        blur.release()
    }

    private class BottomBackdrop(context: Context, private val blur: SharedBlur) : View(context) {
        private val tintPaint = Paint()
        private val maskPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
        private val maskMatrix = Matrix()
        private val mask = LinearGradient(0f, 1f, 0f, 0f, intArrayOf(Color.BLACK, Color.BLACK, Color.TRANSPARENT), floatArrayOf(0f, SOLID_SHARE, 1f), Shader.TileMode.CLAMP)
        var band = 0f

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
            maskPaint.shader = mask
        }

        fun applyTheme() {
            tintPaint.color = withAlpha(Theme.palette.pulseDock, TINT_ALPHA)
            invalidate()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val height = if (MeasureSpec.getMode(heightMeasureSpec) == MeasureSpec.EXACTLY) MeasureSpec.getSize(heightMeasureSpec) else 0
            setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), height)
        }

        override fun onDraw(canvas: Canvas) {
            if (width == 0 || height == 0 || band <= 0f) return
            val top = height - band
            maskMatrix.setScale(1f, band)
            maskMatrix.postTranslate(0f, top)
            mask.setLocalMatrix(maskMatrix)
            val save = canvas.saveLayer(0f, top, width.toFloat(), height.toFloat(), null)
            canvas.clipRect(0f, top, width.toFloat(), height.toFloat())
            blur.draw(canvas, this)
            canvas.drawRect(0f, top, width.toFloat(), height.toFloat(), tintPaint)
            canvas.drawRect(0f, top, width.toFloat(), height.toFloat(), maskPaint)
            canvas.restoreToCount(save)
        }

        private companion object {
            const val TINT_ALPHA = 0.5f
            const val SOLID_SHARE = 0.2f
        }
    }

    companion object {
        const val SIDE = 14f
        const val BOTTOM = 20f
        const val GAP = 4f
        const val MEMBERS_GAP = 8f
        const val ARROWS_GAP = 12f
        const val SELECTION_PUSH = 54f
        const val MODE_MS = 240L
        const val REPLY_MS = 320L
    }
}
