package com.qwill.app.search

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
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.Interpolator
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.R
import com.qwill.app.chats.ChatsItemAnimator
import com.qwill.app.ui.AmbientBlobsView
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.roundToInt

data class RevealGeometry(val origin: RectF, val originRadius: Float, val dock: RectF, val dockRadius: Float)

class SearchReveal(
    context: Context,
    private val host: Host,
    adapterHost: SearchAdapterHost,
    private val fromIcon: Boolean,
) : FrameLayout(context) {
    interface Host {
        fun onRetreatStart()

        fun onClosed()

        fun onQueryChanged(text: String)
    }

    enum class Phase { DOCK, WAVE_OPEN, OPEN, WAVE_CLOSE, RETREAT, CLOSED }

    var phase = Phase.DOCK
        private set

    val closing: Boolean get() = phase == Phase.WAVE_CLOSE || phase == Phase.RETREAT || phase == Phase.CLOSED

    val adapter = SearchAdapter(context, adapterHost)
    private val panel = PanelView(context)
    private val capsule = CapsuleView(context) { requestClose() }
    private var geometry: RevealGeometry? = null
    private var safeArea = SafeArea.NONE
    private var capsuleAnimator: ValueAnimator? = null
    private var labelAnimator: ValueAnimator? = null
    private var edgeAnimator: ValueAnimator? = null
    private val startWave = Runnable { beginWaveOpen() }

    val input: EditText get() = capsule.input

    init {
        addView(panel, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        addView(capsule, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        panel.visibility = GONE
        panel.list.adapter = adapter
        panel.list.addItemDecoration(SearchAdapter.Spacing(context, adapter))
        capsule.input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}

            override fun afterTextChanged(s: Editable?) {
                host.onQueryChanged(s?.toString().orEmpty())
            }
        })
        capsule.input.setOnEditorActionListener { view, actionId, _ ->
            if (actionId != EditorInfo.IME_ACTION_SEARCH) return@setOnEditorActionListener false
            hideKeyboard(view)
            true
        }
        applyTheme()
    }

    fun setGeometry(next: RevealGeometry) {
        geometry = next
        capsule.geometry = next
        panel.list.setPadding(panel.list.paddingLeft, (next.dock.bottom + context.dp(BODY_GAP)).roundToInt(), panel.list.paddingRight, panel.list.paddingBottom)
        if (phase == Phase.DOCK || phase == Phase.RETREAT) return
        if (edgeAnimator == null) panel.edge = if (phase == Phase.CLOSED) next.dock.bottom else openEdge()
    }

    fun setSafeArea(area: SafeArea) {
        safeArea = area
        val bottom = if (area.keyboard > 0) area.keyboard + context.dpInt(KEYBOARD_GAP) else context.dpInt(KEYBOARD_GAP) + area.bottom
        panel.list.setPadding(area.left, panel.list.paddingTop, area.right, bottom + context.dpInt(LIST_BOTTOM))
    }

    fun setQuery(text: String) {
        if (capsule.input.text.toString() == text) return
        capsule.input.setText(text)
        capsule.input.setSelection(text.length)
    }

    fun submit(items: List<SearchItem>) {
        adapter.submit(items)
    }

    fun applyTheme() {
        capsule.applyTheme()
        panel.applyTheme()
        adapter.rebindAll()
    }

    fun start(animated: Boolean, focus: Boolean) {
        val current = geometry ?: return
        phase = Phase.DOCK
        capsule.labelAlpha = if (fromIcon) 0f else 1f
        if (!animated || !Motion.animationsEnabled) {
            capsule.progress = 1f
            capsule.labelAlpha = 1f
            panel.visibility = VISIBLE
            panel.edge = openEdge()
            phase = Phase.OPEN
            if (focus) post { if (phase == Phase.OPEN) focusInput() }
            return
        }
        capsule.progress = 0f
        val dockMs = if (fromIcon) DOCK_MS_ICON else DOCK_MS_PILL
        capsuleAnimator = animateCapsule(0f, 1f, dockMs) {}
        if (fromIcon) animateLabel(1f, LABEL_DELAY_MS)
        postDelayed(startWave, dockMs / 2)
        panel.edge = current.dock.bottom
    }

    fun focusInput() {
        capsule.input.requestFocus()
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager ?: return
        imm.showSoftInput(capsule.input, InputMethodManager.SHOW_IMPLICIT)
    }

    fun dropKeyboard() {
        hideKeyboard(capsule.input)
    }

    fun requestClose(): Boolean {
        if (closing) return false
        removeCallbacks(startWave)
        hideKeyboard(capsule.input)
        phase = Phase.WAVE_CLOSE
        val current = geometry ?: return true
        edgeAnimator?.cancel()
        edgeAnimator = null
        if (!Motion.animationsEnabled) {
            beginRetreat()
            return true
        }
        val from = if (panel.visibility == VISIBLE) panel.edge else current.dock.bottom
        panel.visibility = VISIBLE
        edgeAnimator = animateEdge(from, current.dock.bottom, WAVE_CLOSE_MS, Motion.easeClose) {
            panel.visibility = GONE
            beginRetreat()
        }
        return true
    }

    fun finishNow() {
        removeCallbacks(startWave)
        capsuleAnimator?.cancel()
        labelAnimator?.cancel()
        edgeAnimator?.cancel()
        capsuleAnimator = null
        labelAnimator = null
        edgeAnimator = null
        hideKeyboard(capsule.input)
        phase = Phase.CLOSED
    }

    private fun openEdge(): Float = if (height > 0) height.toFloat() else Float.MAX_VALUE

    private fun beginWaveOpen() {
        val current = geometry ?: return
        if (phase != Phase.DOCK) return
        phase = Phase.WAVE_OPEN
        panel.visibility = VISIBLE
        edgeAnimator = animateEdge(current.dock.bottom, openEdge(), WAVE_OPEN_MS, WAVE_OPEN_CURVE) {
            phase = Phase.OPEN
            focusInput()
        }
    }

    private fun beginRetreat() {
        phase = Phase.RETREAT
        panel.visibility = GONE
        host.onRetreatStart()
        val retreatMs = if (fromIcon) RETREAT_MS_ICON else RETREAT_MS_PILL
        if (fromIcon) animateLabel(0f, 0L)
        if (!Motion.animationsEnabled) {
            capsule.progress = 0f
            finishClose()
            return
        }
        capsuleAnimator?.cancel()
        capsuleAnimator = animateCapsule(capsule.progress, 0f, retreatMs) { finishClose() }
    }

    private fun finishClose() {
        phase = Phase.CLOSED
        host.onClosed()
    }

    private fun animateCapsule(from: Float, to: Float, ms: Long, onEnd: () -> Unit): ValueAnimator =
        ValueAnimator.ofFloat(from, to).apply {
            duration = Motion.duration(ms)
            interpolator = Motion.easeSpring
            addUpdateListener { capsule.progress = it.animatedValue as Float }
            addListener(object : AnimatorListenerAdapter() {
                private var cancelled = false

                override fun onAnimationCancel(animation: Animator) {
                    cancelled = true
                }

                override fun onAnimationEnd(animation: Animator) {
                    if (capsuleAnimator === animation) capsuleAnimator = null
                    if (!cancelled) onEnd()
                }
            })
            start()
        }

    private fun animateLabel(to: Float, delay: Long) {
        labelAnimator?.cancel()
        if (!Motion.animationsEnabled) {
            capsule.labelAlpha = to
            return
        }
        labelAnimator = ValueAnimator.ofFloat(capsule.labelAlpha, to).apply {
            duration = Motion.duration(LABEL_FADE_MS)
            startDelay = delay
            interpolator = LABEL_CURVE
            addUpdateListener { capsule.labelAlpha = it.animatedValue as Float }
            start()
        }
    }

    private fun animateEdge(from: Float, to: Float, ms: Long, curve: Interpolator, onEnd: () -> Unit): ValueAnimator =
        ValueAnimator.ofFloat(from, to).apply {
            duration = Motion.duration(ms)
            interpolator = curve
            addUpdateListener { panel.edge = it.animatedValue as Float }
            addListener(object : AnimatorListenerAdapter() {
                private var cancelled = false

                override fun onAnimationCancel(animation: Animator) {
                    cancelled = true
                }

                override fun onAnimationEnd(animation: Animator) {
                    if (edgeAnimator === animation) edgeAnimator = null
                    if (!cancelled) onEnd()
                }
            })
            start()
        }

    private fun hideKeyboard(view: View) {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(view.windowToken, 0)
        view.clearFocus()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean = true

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        removeCallbacks(startWave)
        capsuleAnimator?.cancel()
        labelAnimator?.cancel()
        edgeAnimator?.cancel()
    }

    private class PanelView(context: Context) : FrameLayout(context) {
        val blobs = AmbientBlobsView(context)
        val list = RecyclerView(ContextThemeWrapper(context, R.style.QwillChatList))
        private val featherPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
        private var featherFor = Float.NaN
        private val feather = context.dp(FEATHER)

        var edge = 0f
            set(value) {
                if (field == value) return
                field = value
                invalidate()
            }

        init {
            setWillNotDraw(false)
            addView(blobs, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            list.layoutManager = LinearLayoutManager(context)
            list.clipToPadding = true
            list.itemAnimator = if (Motion.animationsEnabled) ChatsItemAnimator() else null
            list.overScrollMode = View.OVER_SCROLL_IF_CONTENT_SCROLLS
            addView(list, LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }

        fun applyTheme() {
            blobs.onThemeChanged()
            if (Build.VERSION.SDK_INT >= 29) {
                list.verticalScrollbarThumbDrawable = GradientDrawable().apply {
                    cornerRadius = context.dp(SCROLLBAR_RADIUS)
                    setColor(withAlpha(Theme.palette.textPrimary, SCROLLBAR_ALPHA))
                }
            }
        }

        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            if (edge >= oldh.toFloat() && oldh > 0) edge = h.toFloat()
        }

        override fun dispatchDraw(canvas: Canvas) {
            val bottom = height.toFloat()
            if (edge >= bottom) {
                super.dispatchDraw(canvas)
                return
            }
            val w = width.toFloat()
            val cut = edge.coerceAtLeast(0f)
            if (cut > 0f) {
                val save = canvas.save()
                canvas.clipRect(0f, 0f, w, cut)
                super.dispatchDraw(canvas)
                canvas.restoreToCount(save)
            }
            val featherBottom = (edge + feather).coerceAtMost(bottom)
            if (featherBottom <= cut) return
            if (featherFor != edge) {
                featherPaint.shader = LinearGradient(0f, edge, 0f, edge + feather, Color.BLACK, Color.TRANSPARENT, Shader.TileMode.CLAMP)
                featherFor = edge
            }
            val layer = canvas.saveLayer(0f, cut, w, featherBottom, null)
            canvas.clipRect(0f, cut, w, featherBottom)
            super.dispatchDraw(canvas)
            canvas.drawRect(0f, cut, w, featherBottom, featherPaint)
            canvas.restoreToCount(layer)
        }

        private companion object {
            const val FEATHER = 28f
            const val SCROLLBAR_RADIUS = 2f
            const val SCROLLBAR_ALPHA = 0.32f
        }
    }

    private class CapsuleView(context: Context, private val onClose: () -> Unit) : ViewGroup(context) {
        val input = EditText(context)
        private val close = CloseButton(context)
        private val painter = SearchPillPainter(context)
        private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rect = RectF()

        var geometry: RevealGeometry? = null
            set(value) {
                field = value
                requestLayout()
                apply()
            }

        var progress = 0f
            set(value) {
                field = value
                apply()
            }

        var labelAlpha = 1f
            set(value) {
                field = value
                input.alpha = value
                close.alpha = value
            }

        init {
            setWillNotDraw(false)
            input.background = null
            input.setPadding(0, 0, 0, 0)
            input.isSingleLine = true
            input.includeFontPadding = false
            input.gravity = Gravity.CENTER_VERTICAL
            input.typeface = Fonts.message(FontWeight.REGULAR)
            input.setTextSize(TypedValue.COMPLEX_UNIT_DIP, SearchPillPainter.TEXT_SIZE)
            input.hint = PLACEHOLDER
            input.contentDescription = PLACEHOLDER
            input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            input.imeOptions = EditorInfo.IME_ACTION_SEARCH or EditorInfo.IME_FLAG_NO_EXTRACT_UI
            addView(input)
            close.setOnClickListener { onClose() }
            addView(close)
        }

        fun applyTheme() {
            val palette = Theme.palette
            input.setTextColor(palette.pulseInk)
            input.setHintTextColor(withAlpha(palette.pulseInk, SearchPillPainter.PLACEHOLDER_ALPHA))
            input.highlightColor = withAlpha(palette.primary, SELECTION_ALPHA)
            if (Build.VERSION.SDK_INT >= 29) {
                input.textCursorDrawable = GradientDrawable().apply {
                    setColor(palette.primary)
                    setSize(context.dpInt(CURSOR_W), 0)
                }
            }
            close.invalidate()
            invalidate()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
            val dock = geometry?.dock
            if (dock == null) {
                input.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.EXACTLY))
                close.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.EXACTLY))
                return
            }
            val inputWidth = (inputRight(dock) - inputLeft(dock)).roundToInt().coerceAtLeast(0)
            input.measure(MeasureSpec.makeMeasureSpec(inputWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(dock.height().roundToInt(), MeasureSpec.EXACTLY))
            val tap = context.dpInt(CLOSE_TAP)
            close.measure(MeasureSpec.makeMeasureSpec(tap, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(tap, MeasureSpec.EXACTLY))
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val dock = geometry?.dock ?: return
            val left = inputLeft(dock).roundToInt()
            val top = dock.top.roundToInt()
            input.layout(left, top, left + input.measuredWidth, top + input.measuredHeight)
            val centerX = dock.right - context.dp(SearchPillPainter.contentLeft) + context.dp(CLOSE_OUTSET) - context.dp(CLOSE_CIRCLE) / 2f
            val half = close.measuredWidth / 2f
            val closeLeft = (centerX - half).roundToInt()
            val closeTop = (dock.centerY() - close.measuredHeight / 2f).roundToInt()
            close.layout(closeLeft, closeTop, closeLeft + close.measuredWidth, closeTop + close.measuredHeight)
            apply()
        }

        private fun inputLeft(dock: RectF): Float = dock.left + context.dp(SearchPillPainter.contentLeft) + context.dp(SearchPillPainter.ICON) + context.dp(SearchPillPainter.ICON_GAP)

        private fun inputRight(dock: RectF): Float =
            dock.right - context.dp(SearchPillPainter.contentLeft) + context.dp(CLOSE_OUTSET) - context.dp(CLOSE_CIRCLE) - context.dp(SearchPillPainter.ICON_GAP)

        private fun currentRadius(current: RevealGeometry): Float = lerp(current.originRadius, current.dockRadius, progress)

        private fun apply() {
            val current = geometry ?: return
            val origin = current.origin
            val dock = current.dock
            rect.set(
                lerp(origin.left, dock.left, progress),
                lerp(origin.top, dock.top, progress),
                lerp(origin.right, dock.right, progress),
                lerp(origin.bottom, dock.bottom, progress),
            )
            val dy = rect.centerY() - dock.centerY()
            input.translationX = rect.left - dock.left
            input.translationY = dy
            close.translationX = rect.right - dock.right
            close.translationY = dy
            invalidate()
        }

        override fun dispatchTouchEvent(event: MotionEvent): Boolean {
            if (event.actionMasked == MotionEvent.ACTION_DOWN && !rect.contains(event.x, event.y)) return false
            return super.dispatchTouchEvent(event)
        }

        override fun dispatchDraw(canvas: Canvas) {
            val current = geometry ?: return
            val radius = currentRadius(current)
            painter.draw(canvas, rect, radius)
            val save = canvas.save()
            painter.clip(canvas, rect, radius)
            val size = context.dp(SearchPillPainter.ICON)
            val restLeft = context.dp(SearchPillPainter.contentLeft)
            val iconLeft = if (current.origin.width() < current.dock.width()) lerp((current.origin.width() - size) / 2f, restLeft, progress) else restLeft
            SearchGlyph.draw(canvas, rect.left + iconLeft, rect.centerY() - size / 2f, size, withAlpha(Theme.palette.pulseInk, SearchPillPainter.ICON_ALPHA), iconPaint)
            super.dispatchDraw(canvas)
            canvas.restoreToCount(save)
        }

        private fun lerp(from: Float, to: Float, t: Float): Float = from + (to - from) * t
    }

    private class CloseButton(context: Context) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val cross = android.graphics.Path().apply {
            moveTo(1f, 1f)
            lineTo(13f, 13f)
            moveTo(13f, 1f)
            lineTo(1f, 13f)
        }

        init {
            isClickable = true
            isFocusable = true
            contentDescription = "Закрыть"
        }

        override fun setPressed(pressed: Boolean) {
            super.setPressed(pressed)
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            val cx = width / 2f
            val cy = height / 2f
            if (isPressed || isFocused) {
                paint.style = Paint.Style.FILL
                paint.color = withAlpha(palette.pulseGlass, PRESSED_ALPHA)
                canvas.drawCircle(cx, cy, context.dp(CLOSE_CIRCLE) / 2f, paint)
            }
            val size = context.dp(ICON)
            paint.style = Paint.Style.STROKE
            paint.strokeCap = Paint.Cap.ROUND
            paint.strokeWidth = STROKE
            paint.color = palette.pulseInk
            val save = canvas.save()
            canvas.translate(cx - size / 2f, cy - size / 2f)
            canvas.scale(size / GRID, size / GRID)
            canvas.drawPath(cross, paint)
            canvas.restoreToCount(save)
        }

        override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(info)
            info.className = "android.widget.Button"
        }

        private companion object {
            const val ICON = 14f
            const val GRID = 14f
            const val STROKE = 1.8f
            const val PRESSED_ALPHA = 0.14f
        }
    }

    private companion object {
        const val PLACEHOLDER = "Поиск чатов и людей"
        const val DOCK_MS_PILL = 380L
        const val DOCK_MS_ICON = 440L
        const val RETREAT_MS_PILL = 300L
        const val RETREAT_MS_ICON = 340L
        const val WAVE_OPEN_MS = 400L
        const val WAVE_CLOSE_MS = 340L
        const val LABEL_DELAY_MS = 100L
        const val LABEL_FADE_MS = 160L
        const val BODY_GAP = 32f
        const val KEYBOARD_GAP = 16f
        const val LIST_BOTTOM = 32f
        const val CLOSE_TAP = 44f
        const val CLOSE_CIRCLE = 28f
        const val CLOSE_OUTSET = 4f
        const val CURSOR_W = 2f
        const val SELECTION_ALPHA = 0.3f
        val WAVE_OPEN_CURVE: Interpolator = PathInterpolator(0.2f, 0.9f, 0.25f, 1f)
        val LABEL_CURVE: Interpolator = PathInterpolator(0.25f, 0.1f, 0.25f, 1f)
    }
}
