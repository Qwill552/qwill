package com.qwill.app.chat.search

import android.animation.ValueAnimator
import android.content.Context
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
import android.text.TextPaint
import android.text.TextWatcher
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import com.qwill.app.chat.top.ChatCapsuleView
import com.qwill.app.chat.top.ChromeCircleButton
import com.qwill.app.chat.top.ChromeRowLayout
import com.qwill.app.consent.CssGradient
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.max
import kotlin.math.roundToInt

class ChatSearchHeaderView(context: Context) : ChromeRowLayout(context, ChromeRowLayout.GAP, FIELD_GAP) {
    val back = ChromeCircleButton(context, QwillIcon.BACK, "Выйти из поиска")
    val field = SearchFieldView(context)
    val clear = ChromeCircleButton(context, QwillIcon.CLOSE, "Очистить поле")
    private var clearShown = false
    private var clearAnimator: ValueAnimator? = null

    init {
        setParts(back, field, listOf(clear))
        clear.visibility = View.INVISIBLE
        clear.alpha = 0f
    }

    fun setClearShown(shown: Boolean, animated: Boolean) {
        if (shown == clearShown) return
        clearShown = shown
        clearAnimator?.cancel()
        clear.isEnabled = shown
        clear.visibility = View.VISIBLE
        val from = clear.alpha
        val to = if (shown) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isShown) {
            applyClear(to)
            return
        }
        clearAnimator = ValueAnimator.ofFloat(from, to).apply {
            duration = Motion.duration(CLEAR_MS)
            interpolator = Motion.decelerate
            addUpdateListener { applyClear(it.animatedValue as Float) }
            start()
        }
    }

    private fun applyClear(value: Float) {
        clear.alpha = value
        val scale = CLEAR_HIDDEN_SCALE + (1f - CLEAR_HIDDEN_SCALE) * value
        clear.scaleX = scale
        clear.scaleY = scale
        clear.visibility = if (value <= 0f) View.INVISIBLE else View.VISIBLE
    }

    fun focusInput() {
        field.input.requestFocus()
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager ?: return
        imm.showSoftInput(field.input, InputMethodManager.SHOW_IMPLICIT)
    }

    fun dropKeyboard() {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(field.input.windowToken, 0)
        field.input.clearFocus()
    }

    fun refresh() {
        field.applyTheme()
        for (view in listOf(back, clear)) view.invalidate()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        clearAnimator?.cancel()
        clearAnimator = null
        applyClear(if (clearShown) 1f else 0f)
    }

    private companion object {
        const val FIELD_GAP = 8f
        const val CLEAR_MS = 180L
        const val CLEAR_HIDDEN_SCALE = 0.7f
    }
}

class SearchInput(context: Context) : EditText(context) {
    var onDeleteEmpty: (() -> Unit)? = null

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection? {
        val base = super.onCreateInputConnection(outAttrs) ?: return null
        return object : InputConnectionWrapper(base, true) {
            override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
                if (beforeLength > 0 && text.isNullOrEmpty()) onDeleteEmpty?.invoke()
                return super.deleteSurroundingText(beforeLength, afterLength)
            }

            override fun sendKeyEvent(event: KeyEvent): Boolean {
                if (event.action == KeyEvent.ACTION_DOWN && event.keyCode == KeyEvent.KEYCODE_DEL && text.isNullOrEmpty()) {
                    onDeleteEmpty?.invoke()
                    return true
                }
                return super.sendKeyEvent(event)
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_DEL && text.isNullOrEmpty()) {
            onDeleteEmpty?.invoke()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }
}

class SearchFieldView(context: Context) : ViewGroup(context) {
    val input = SearchInput(context)
    var blur: SharedBlur? = null
    var onText: ((String) -> Unit)? = null
    var onSubmit: (() -> Unit)? = null

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val captionPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = context.dp(TEXT_SIZE) }
    private val shape = Path()
    private val highlight = Path()
    private val rect = RectF()
    private var shapeFor = -1
    private var gradientDark: Boolean? = null
    private var caption: String? = null
    private var captionName: String? = null
    private var applying = false

    init {
        setWillNotDraw(false)
        input.background = null
        input.setPadding(0, 0, 0, 0)
        input.isSingleLine = true
        input.includeFontPadding = false
        input.gravity = Gravity.CENTER_VERTICAL
        input.typeface = Fonts.message(FontWeight.REGULAR)
        input.setTextSize(TypedValue.COMPLEX_UNIT_DIP, TEXT_SIZE)
        input.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        input.imeOptions = EditorInfo.IME_ACTION_SEARCH or EditorInfo.IME_FLAG_NO_EXTRACT_UI
        input.contentDescription = PLACEHOLDER
        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) = Unit

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) = Unit

            override fun afterTextChanged(s: Editable?) {
                if (!applying) onText?.invoke(s?.toString().orEmpty())
            }
        })
        input.setOnEditorActionListener { _, actionId, event ->
            val enter = event != null && event.keyCode == KeyEvent.KEYCODE_ENTER && event.action == KeyEvent.ACTION_DOWN
            if (actionId == EditorInfo.IME_ACTION_SEARCH || enter) {
                onSubmit?.invoke()
                true
            } else {
                false
            }
        }
        addView(input)
        applyTheme()
    }

    fun setText(value: String) {
        if (input.text.toString() == value) return
        applying = true
        input.setText(value)
        input.setSelection(value.length)
        applying = false
    }

    fun setCaption(picking: Boolean, name: String?) {
        val nextCaption = if (picking || name != null) CAPTION else null
        val hint = when {
            name != null -> null
            picking -> MEMBERS_PLACEHOLDER
            else -> PLACEHOLDER
        }
        input.hint = hint
        input.contentDescription = listOfNotNull(nextCaption?.let { if (name != null) "$it $name" else it }, hint).joinToString(", ").ifEmpty { PLACEHOLDER }
        if (nextCaption == caption && name == captionName) return
        caption = nextCaption
        captionName = name
        requestLayout()
        invalidate()
    }

    fun applyTheme() {
        val palette = Theme.palette
        input.setTextColor(palette.pulseInk)
        input.setHintTextColor(withAlpha(palette.pulseInk, SOFT_ALPHA))
        input.highlightColor = withAlpha(palette.primary, SELECTION_ALPHA)
        if (Build.VERSION.SDK_INT >= 29) {
            input.textCursorDrawable = GradientDrawable().apply {
                setColor(palette.primary)
                setSize(context.dpInt(CURSOR_W), 0)
            }
        }
        gradientDark = null
        invalidate()
    }

    private fun captionWidth(): Float {
        val label = caption ?: return 0f
        captionPaint.typeface = Fonts.message(FontWeight.REGULAR)
        var width = captionPaint.measureText(label)
        captionName?.let {
            captionPaint.typeface = Fonts.message(FontWeight.SEMIBOLD)
            width += captionPaint.measureText(" $it")
        }
        return width
    }

    private fun inputLeft(): Float {
        var left = context.dp(PAD_X + ICON + GAP)
        val width = captionWidth()
        if (width > 0f) left += width + context.dp(GAP)
        return left
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = context.dp(ChatCapsuleView.HEIGHT).roundToInt()
        val inputWidth = max(0, (width - inputLeft() - context.dp(PAD_X)).roundToInt())
        val inputHeight = max(0, height - context.dpInt(PAD_Y * 2))
        input.measure(MeasureSpec.makeMeasureSpec(inputWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(inputHeight, MeasureSpec.EXACTLY))
        setMeasuredDimension(width, height)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val left = inputLeft().roundToInt()
        val top = context.dpInt(PAD_Y)
        input.layout(left, top, left + input.measuredWidth, top + input.measuredHeight)
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val hairline = context.dp(BORDER)
        val radius = context.dp(RADIUS)
        if (shapeFor != width) {
            shapeFor = width
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            shape.reset()
            shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
            val lifted = Path()
            rect.offset(0f, hairline)
            lifted.addRoundRect(rect, radius, radius, Path.Direction.CW)
            highlight.reset()
            highlight.op(shape, lifted, Path.Op.DIFFERENCE)
            gradientDark = null
        }
        if (gradientDark != palette.isDark) {
            val line = CssGradient.linear(GRADIENT_ANGLE, width.toFloat(), height.toFloat())
            fillPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, palette.pulseCapFrom, palette.pulseCapTo, Shader.TileMode.CLAMP)
            gradientDark = palette.isDark
        }
        blur?.let {
            val save = canvas.save()
            canvas.clipPath(shape)
            it.draw(canvas, this)
            canvas.restoreToCount(save)
        }
        canvas.drawPath(shape, fillPaint)
        iconPaint.style = Paint.Style.FILL
        iconPaint.shader = null
        iconPaint.color = withAlpha(palette.pulseGlass, HIGHLIGHT)
        canvas.drawPath(highlight, iconPaint)
        strokePaint.strokeWidth = hairline
        strokePaint.color = palette.pulseCapBorder
        rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
        canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, strokePaint)
        val soft = withAlpha(palette.pulseInk, SOFT_ALPHA)
        val icon = context.dp(ICON)
        QwillIcon.SEARCH.draw(canvas, context.dp(PAD_X), (height - icon) / 2f, icon, soft, iconPaint)
        val label = caption ?: return
        var x = context.dp(PAD_X + ICON + GAP)
        captionPaint.typeface = Fonts.message(FontWeight.REGULAR)
        captionPaint.color = soft
        val baseline = height / 2f - (captionPaint.ascent() + captionPaint.descent()) / 2f
        canvas.drawText(label, x, baseline, captionPaint)
        x += captionPaint.measureText(label)
        captionName?.let {
            captionPaint.typeface = Fonts.message(FontWeight.SEMIBOLD)
            captionPaint.color = palette.pulseInk
            canvas.drawText(" $it", x, baseline, captionPaint)
        }
    }

    companion object {
        const val PLACEHOLDER = "Поиск в чате"
        const val MEMBERS_PLACEHOLDER = "Поиск участников"
        const val CAPTION = "От:"
        private const val TEXT_SIZE = 15f
        private const val PAD_X = 14f
        private const val PAD_Y = 5f
        private const val ICON = 18f
        private const val GAP = 8f
        private const val RADIUS = 24f
        private const val BORDER = 1f
        private const val GRADIENT_ANGLE = 130f
        private const val HIGHLIGHT = 0.16f
        private const val SOFT_ALPHA = 0.45f
        private const val SELECTION_ALPHA = 0.3f
        private const val CURSOR_W = 2f
    }
}
