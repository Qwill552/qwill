package com.qwill.app.chat.composer

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.ClipboardManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.text.Editable
import android.text.InputType
import android.text.Spanned
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import com.qwill.app.chat.bottom.DockCapsule
import com.qwill.app.consent.CssGradient
import com.qwill.app.emoji.Emoji
import com.qwill.app.emoji.EmojiSpan
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class ComposerInput(context: Context) : EditText(context) {
    var onSendShortcut: (() -> Unit)? = null
    var onSelectionMoved: (() -> Unit)? = null
    var onUserEdit: ((String) -> Unit)? = null

    private var programmatic = false
    private var changeStart = -1
    private var changeEnd = -1

    init {
        background = null
        includeFontPadding = false
        val pad = context.dpInt(PAD_Y)
        setPadding(0, pad, 0, pad)
        typeface = Fonts.message(FontWeight.REGULAR)
        fontFeatureSettings = Fonts.MESSAGE_FEATURES
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, TEXT_SIZE)
        val line = context.dp(TEXT_SIZE * LINE_HEIGHT)
        if (Build.VERSION.SDK_INT >= 28) {
            lineHeight = line.roundToInt()
        } else {
            setLineSpacing(line - paint.fontMetrics.let { it.descent - it.ascent }, 1f)
        }
        inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
        imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_ACTION_NONE
        maxHeight = context.dpInt(MAX_HEIGHT)
        gravity = Gravity.TOP or Gravity.START
        isVerticalScrollBarEnabled = false
        if (Build.VERSION.SDK_INT >= 26) importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
        addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {
                changeStart = start
                changeEnd = start + count
            }

            override fun afterTextChanged(s: Editable?) {
                if (s == null) return
                applyEmoji(s, changeStart, changeEnd)
                if (!programmatic) onUserEdit?.invoke(s.toString())
            }
        })
        applyTheme()
    }

    val value: String get() = text?.toString().orEmpty()

    fun setProgrammatic(value: String, cursorToEnd: Boolean = true) {
        programmatic = true
        setText(value)
        if (cursorToEnd) setSelection(value.length)
        programmatic = false
    }

    fun replaceRange(start: Int, end: Int, value: String) {
        val editable = text ?: return
        editable.replace(start.coerceIn(0, editable.length), end.coerceIn(0, editable.length), value)
    }

    fun refreshEmoji() {
        val editable = text ?: return
        applyEmoji(editable, 0, editable.length)
        invalidate()
    }

    fun applyTheme() {
        val palette = Theme.palette
        setTextColor(palette.pulseInk)
        setHintTextColor(withAlpha(palette.pulseInk, HINT_ALPHA))
        highlightColor = withAlpha(palette.primary, SELECTION_ALPHA)
        if (Build.VERSION.SDK_INT >= 29) {
            textCursorDrawable = GradientDrawable().apply {
                setColor(palette.primary)
                setSize(context.dpInt(CURSOR_W), 0)
            }
            textSelectHandle?.setTint(palette.primary)
            textSelectHandleLeft?.setTint(palette.primary)
            textSelectHandleRight?.setTint(palette.primary)
        }
    }

    private fun applyEmoji(editable: Editable, start: Int, end: Int) {
        val matcher = Emoji.matcher ?: return
        if (editable.isEmpty() || start < 0) return
        val from = (start - EMOJI_REACH).coerceAtLeast(0)
        val to = (end + EMOJI_REACH).coerceAtMost(editable.length)
        if (from >= to) return
        val composingStart = BaseInputConnection.getComposingSpanStart(editable)
        val composingEnd = BaseInputConnection.getComposingSpanEnd(editable)
        for (span in editable.getSpans(from, to, EmojiSpan::class.java)) {
            val spanStart = editable.getSpanStart(span)
            val spanEnd = editable.getSpanEnd(span)
            if (spanStart >= from && spanEnd <= to) editable.removeSpan(span)
        }
        val size = context.dp(EMOJI_SIZE)
        for (match in matcher.find(editable.subSequence(from, to))) {
            val matchStart = from + match.start
            val matchEnd = from + match.end
            if (composingStart >= 0 && matchStart < composingEnd && matchEnd > composingStart) continue
            if (editable.getSpans(matchStart, matchEnd, EmojiSpan::class.java).isNotEmpty()) continue
            editable.setSpan(EmojiSpan(match.entry, size), matchStart, matchEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
    }

    override fun onTextContextMenuItem(id: Int): Boolean {
        if (id == android.R.id.paste) {
            if (Build.VERSION.SDK_INT >= 23) return super.onTextContextMenuItem(android.R.id.pasteAsPlainText)
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return true
            val clip = clipboard.primaryClip ?: return true
            val builder = StringBuilder()
            for (index in 0 until clip.itemCount) builder.append(clip.getItemAt(index).coerceToText(context).toString())
            val editable = text ?: return true
            val start = selectionStart.coerceAtLeast(0)
            val end = selectionEnd.coerceAtLeast(0)
            editable.replace(minOf(start, end), max(start, end), builder.toString())
            return true
        }
        return super.onTextContextMenuItem(id)
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if ((keyCode == KeyEvent.KEYCODE_ENTER || keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER) && event.isCtrlPressed) {
            onSendShortcut?.invoke()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onSelectionChanged(selStart: Int, selEnd: Int) {
        super.onSelectionChanged(selStart, selEnd)
        onSelectionMoved?.invoke()
    }

    companion object {
        const val TEXT_SIZE = 15.5f
        const val LINE_HEIGHT = 1.35f
        const val PAD_Y = 5f
        const val MAX_HEIGHT = 120f
        const val EMOJI_SIZE = 20f
        private const val EMOJI_REACH = 12
        private const val HINT_ALPHA = 0.45f
        private const val SELECTION_ALPHA = 0.3f
        private const val CURSOR_W = 2f
    }
}

class ComposerIconButton(
    context: Context,
    private val icon: QwillIcon,
    private val iconSize: Float,
    label: String,
    private val inkAlpha: Float = ICON_ALPHA,
) : View(context) {
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var pressedShown = false

    init {
        contentDescription = label
        isClickable = true
        isFocusable = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    override fun setEnabled(enabled: Boolean) {
        super.setEnabled(enabled)
        alpha = if (enabled) 1f else DISABLED_ALPHA
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val side = context.dpInt(SIZE)
        setMeasuredDimension(side, side)
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val size = context.dp(iconSize)
        val color = if (pressedShown && isEnabled) palette.primary else withAlpha(palette.pulseInk, inkAlpha)
        icon.draw(canvas, (width - size) / 2f, (height - size) / 2f, size, color, iconPaint)
        if (isFocused) {
            iconPaint.style = Paint.Style.STROKE
            iconPaint.strokeWidth = context.dp(FOCUS_RING)
            iconPaint.color = palette.primary
            canvas.drawCircle(width / 2f, height / 2f, width / 2f - context.dp(FOCUS_RING), iconPaint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> setPressedShown(true)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> setPressedShown(false)
        }
        return super.onTouchEvent(event)
    }

    override fun onFocusChanged(gainFocus: Boolean, direction: Int, previouslyFocusedRect: android.graphics.Rect?) {
        super.onFocusChanged(gainFocus, direction, previouslyFocusedRect)
        invalidate()
    }

    private fun setPressedShown(value: Boolean) {
        if (value == pressedShown) return
        pressedShown = value
        invalidate()
    }

    companion object {
        const val SIZE = 44f
        private const val ICON_ALPHA = 0.45f
        private const val DISABLED_ALPHA = 0.4f
        private const val FOCUS_RING = 2f
    }
}

class SendCircle(context: Context) : View(context) {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val rect = RectF()
    private val highlight = Path()
    private var gradientFor = -1
    private var shadow: Bitmap? = null
    private var icon = QwillIcon.MIC
    private var previous: QwillIcon? = null
    private var swap = 1f
    private var swapAnimator: ValueAnimator? = null
    private var press = 1f
    private var pressAnimator: ValueAnimator? = null
    private var pressing = false
    private var locked = false

    init {
        isClickable = true
        isFocusable = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = LABEL_MIC
    }

    val current: QwillIcon get() = icon

    fun setIcon(next: QwillIcon, animated: Boolean) {
        contentDescription = when (next) {
            QwillIcon.SEND -> LABEL_SEND
            QwillIcon.CHECK -> LABEL_SAVE
            else -> LABEL_MIC
        }
        if (next == icon) return
        previous = icon
        icon = next
        swapAnimator?.cancel()
        swapAnimator = null
        if (!animated || !Motion.animationsEnabled || !isAttachedToWindow) {
            swap = 1f
            previous = null
            invalidate()
            return
        }
        swap = 0f
        val animator = ValueAnimator.ofFloat(0f, 1f)
        animator.duration = Motion.duration(SWAP_MS)
        animator.interpolator = Motion.easeOutQuint
        animator.addUpdateListener {
            swap = it.animatedValue as Float
            invalidate()
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (swapAnimator === animation) {
                    swapAnimator = null
                    previous = null
                }
            }
        })
        swapAnimator = animator
        animator.start()
    }

    fun setLocked(value: Boolean, animated: Boolean) {
        if (value == locked) return
        locked = value
        isEnabled = !value
        animatePress(animated)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val side = context.dpInt(SIZE)
        setMeasuredDimension(side, side)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        pivotX = w / 2f
        pivotY = h / 2f
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        swapAnimator?.cancel()
        swapAnimator = null
        pressAnimator?.cancel()
        pressAnimator = null
        swap = 1f
        previous = null
        pressing = false
        applyPress(targetPress())
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val size = width.toFloat()
        val radius = size / 2f
        drawShadow(canvas, size)
        if (gradientFor != width) {
            gradientFor = width
            val line = CssGradient.linear(ANGLE, size, size)
            fillPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, palette.accentFrom, palette.accentTo, Shader.TileMode.CLAMP)
            val hairline = context.dp(HIGHLIGHT)
            val outer = Path().apply { addCircle(radius, radius, radius, Path.Direction.CW) }
            val lifted = Path().apply { addCircle(radius, radius + hairline, radius, Path.Direction.CW) }
            highlight.reset()
            highlight.op(outer, lifted, Path.Op.DIFFERENCE)
        }
        canvas.drawCircle(radius, radius, radius, fillPaint)
        highlightPaint.color = withAlpha(palette.pulseGlass, HIGHLIGHT_ALPHA)
        canvas.drawPath(highlight, highlightPaint)
        val iconSize = context.dp(ICON)
        val outgoing = previous
        if (outgoing != null && swap < 1f) drawIcon(canvas, outgoing, 1f - swap, -ROTATE * swap, iconSize)
        drawIcon(canvas, icon, if (outgoing != null) swap else 1f, 0f, iconSize)
    }

    private fun drawIcon(canvas: Canvas, glyph: QwillIcon, share: Float, rotation: Float, size: Float) {
        if (share <= 0f) return
        val scale = MIN_SCALE + (1f - MIN_SCALE) * share
        val save = canvas.save()
        canvas.translate(width / 2f, height / 2f)
        canvas.rotate(rotation)
        canvas.scale(scale, scale)
        glyph.draw(canvas, -size / 2f, -size / 2f, size, withAlpha(FixedColors.lift, share), iconPaint)
        canvas.restoreToCount(save)
    }

    private fun drawShadow(canvas: Canvas, size: Float) {
        val scale = resources.displayMetrics.density * SHADOW_SCALE
        val extent = size + context.dp(SHADOW_BLUR) * 2
        val bitmap = shadow ?: run {
            val side = ceil(extent / resources.displayMetrics.density * scale).toInt().coerceAtLeast(1)
            val created = Bitmap.createBitmap(side, side, Bitmap.Config.ALPHA_8)
            val sigma = SHADOW_BLUR / 2f * scale
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = FixedColors.lift
                maskFilter = BlurMaskFilter(max(0.5f, (sigma - 0.5f) / 0.57735f), BlurMaskFilter.Blur.NORMAL)
            }
            val core = (SIZE / 2f - SHADOW_SPREAD) * scale
            Canvas(created).drawCircle(side / 2f, side / 2f, core, paint)
            shadow = created
            created
        }
        shadowPaint.color = SHADOW_COLOR
        val cx = size / 2f
        val cy = size / 2f + context.dp(SHADOW_Y)
        rect.set(cx - extent / 2f, cy - extent / 2f, cx + extent / 2f, cy + extent / 2f)
        canvas.drawBitmap(bitmap, null, rect, shadowPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> if (isEnabled) setPressing(true)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> setPressing(false)
        }
        return super.onTouchEvent(event)
    }

    private fun setPressing(value: Boolean) {
        if (value == pressing) return
        pressing = value
        animatePress(true)
    }

    private fun targetPress(): Float = when {
        locked -> LOCKED_SCALE
        pressing -> PRESSED_SCALE
        else -> 1f
    }

    private fun animatePress(animated: Boolean) {
        pressAnimator?.cancel()
        pressAnimator = null
        val target = targetPress()
        if (!animated || !Motion.animationsEnabled || !isAttachedToWindow) {
            applyPress(target)
            return
        }
        val animator = ValueAnimator.ofFloat(press, target)
        animator.duration = Motion.duration(PRESS_MS)
        animator.interpolator = PRESS_CURVE
        animator.addUpdateListener { applyPress(it.animatedValue as Float) }
        pressAnimator = animator
        animator.start()
    }

    private fun applyPress(value: Float) {
        press = value
        scaleX = value
        scaleY = value
        val lockedShare = ((1f - value) / (1f - LOCKED_SCALE)).coerceIn(0f, 1f)
        alpha = if (locked) 1f - (1f - LOCKED_ALPHA) * lockedShare else 1f
    }

    companion object {
        const val SIZE = 48f
        private const val ICON = 22f
        private const val ANGLE = 140f
        private const val HIGHLIGHT = 1f
        private const val HIGHLIGHT_ALPHA = 0.4f
        private const val SHADOW_Y = 12f
        private const val SHADOW_BLUR = 26f
        private const val SHADOW_SPREAD = 12f
        private const val SHADOW_SCALE = 0.25f
        private val SHADOW_COLOR = (242 shl 24) or (90 shl 16) or (120 shl 8) or 255
        private const val SWAP_MS = 220L
        private const val PRESS_MS = 220L
        private val PRESS_CURVE = PathInterpolator(0.34f, 1.56f, 0.64f, 1f)
        private const val PRESSED_SCALE = 0.92f
        private const val LOCKED_SCALE = 0.86f
        private const val LOCKED_ALPHA = 0.45f
        private const val MIN_SCALE = 0.1f
        private const val ROTATE = 45f
        const val LABEL_MIC = "Записать голосовое"
        const val LABEL_SEND = "Отправить"
        const val LABEL_SAVE = "Сохранить"
    }
}

class ComposerCapsule(context: Context) : ViewGroup(context) {
    val emoji = ComposerIconButton(context, QwillIcon.EMOJI, EMOJI_ICON, "Эмодзи")
    val input = ComposerInput(context)
    val attach = ComposerIconButton(context, QwillIcon.ATTACH, ATTACH_ICON, "Прикрепить")
    private val capsule = DockCapsule(this, RADIUS, withShadow = true, stretchShadow = true)
    private var drawnHeight = -1f

    var blur: SharedBlur?
        get() = capsule.blur
        set(value) {
            capsule.blur = value
        }

    init {
        setWillNotDraw(false)
        clipChildren = false
        clipToPadding = false
        addView(emoji)
        addView(input)
        addView(attach)
    }

    fun setDrawnHeight(value: Float) {
        if (value == drawnHeight) return
        drawnHeight = value
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val button = MeasureSpec.makeMeasureSpec(context.dpInt(ComposerIconButton.SIZE), MeasureSpec.EXACTLY)
        emoji.measure(button, button)
        attach.measure(button, button)
        val side = context.dp(BUTTON_INSET + ComposerIconButton.SIZE + FIELD_GAP)
        val inputWidth = max(0, (width - side * 2).roundToInt())
        input.measure(MeasureSpec.makeMeasureSpec(inputWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
        val height = max(context.dp(MIN_HEIGHT), input.measuredHeight + context.dp(FIELD_BOTTOM) * 2).roundToInt()
        setMeasuredDimension(width, height)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val width = r - l
        val height = b - t
        val inset = context.dp(BUTTON_INSET).roundToInt()
        val buttonBottom = height - context.dp(BUTTON_BOTTOM).roundToInt()
        emoji.layout(inset, buttonBottom - emoji.measuredHeight, inset + emoji.measuredWidth, buttonBottom)
        attach.layout(width - inset - attach.measuredWidth, buttonBottom - attach.measuredHeight, width - inset, buttonBottom)
        val side = context.dp(BUTTON_INSET + ComposerIconButton.SIZE + FIELD_GAP).roundToInt()
        val inputBottom = height - context.dp(FIELD_BOTTOM).roundToInt()
        input.layout(side, inputBottom - input.measuredHeight, side + input.measuredWidth, inputBottom)
    }

    override fun dispatchDraw(canvas: Canvas) {
        capsule.top = if (drawnHeight < 0f) 0f else height - drawnHeight
        capsule.draw(canvas)
        val save = canvas.save()
        capsule.clip(canvas)
        super.dispatchDraw(canvas)
        canvas.restoreToCount(save)
    }

    fun refresh() {
        input.applyTheme()
        emoji.invalidate()
        attach.invalidate()
        invalidate()
    }

    companion object {
        const val RADIUS = 24f
        const val MIN_HEIGHT = 48f
        const val BUTTON_INSET = 10f
        const val BUTTON_BOTTOM = 2f
        const val FIELD_GAP = 6f
        const val FIELD_BOTTOM = 6f
        private const val EMOJI_ICON = 22f
        private const val ATTACH_ICON = 21f
    }
}

class ComposerView(context: Context) : ViewGroup(context) {
    val capsule = ComposerCapsule(context)
    val send = SendCircle(context)
    var onRowHeight: ((Int) -> Unit)? = null

    init {
        clipChildren = false
        clipToPadding = false
        addView(capsule)
        addView(send)
    }

    val input: ComposerInput get() = capsule.input

    var blur: SharedBlur?
        get() = capsule.blur
        set(value) {
            capsule.blur = value
        }

    fun setDrawnHeight(value: Float) {
        capsule.setDrawnHeight(value)
    }

    fun refresh() {
        capsule.refresh()
        send.invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val circle = MeasureSpec.makeMeasureSpec(context.dpInt(SendCircle.SIZE), MeasureSpec.EXACTLY)
        send.measure(circle, circle)
        val capsuleWidth = max(0, width - send.measuredWidth - context.dp(GAP).roundToInt())
        capsule.measure(MeasureSpec.makeMeasureSpec(capsuleWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
        setMeasuredDimension(width, max(capsule.measuredHeight, send.measuredHeight))
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val width = r - l
        val height = b - t
        capsule.layout(0, height - capsule.measuredHeight, capsule.measuredWidth, height)
        send.layout(width - send.measuredWidth, height - send.measuredHeight, width, height)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (h != oldh) onRowHeight?.invoke(h)
    }

    companion object {
        const val GAP = 10f
    }
}
