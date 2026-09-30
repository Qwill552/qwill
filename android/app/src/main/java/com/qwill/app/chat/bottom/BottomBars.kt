package com.qwill.app.chat.bottom

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.text.TextPaint
import android.text.TextUtils
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.QwillSwitch
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class GlassPill(private val view: View) {
    var blur: SharedBlur? = null

    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val shape = Path()
    private val highlight = Path()
    private val rect = RectF()
    private var shapeFor = ""
    private var shadow: Bitmap? = null
    private var shadowKey = ""

    fun draw(canvas: Canvas) {
        val width = view.width
        val height = view.height
        if (width == 0 || height == 0) return
        val context = view.context
        val palette = Theme.palette
        val hairline = context.dp(BORDER)
        val radius = minOf(context.dp(RADIUS), height / 2f)
        val key = "$width:$height"
        if (key != shapeFor) {
            shapeFor = key
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            shape.reset()
            shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
            val lifted = Path()
            rect.offset(0f, hairline)
            lifted.addRoundRect(rect, radius, radius, Path.Direction.CW)
            highlight.reset()
            highlight.op(shape, lifted, Path.Op.DIFFERENCE)
        }
        drawShadow(canvas, width, height, radius, palette.isDark)
        blur?.let {
            val save = canvas.save()
            canvas.clipPath(shape)
            it.draw(canvas, view)
            canvas.restoreToCount(save)
        }
        fillPaint.color = palette.chromeBg
        canvas.drawPath(shape, fillPaint)
        fillPaint.color = palette.chromeHighlight
        canvas.drawPath(highlight, fillPaint)
        strokePaint.strokeWidth = hairline
        strokePaint.color = palette.chromeBorder
        rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
        canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, strokePaint)
    }

    fun invalidateShadow() {
        shadowKey = ""
    }

    private fun drawShadow(canvas: Canvas, width: Int, height: Int, radius: Float, dark: Boolean) {
        val context = view.context
        val y = context.dp(if (dark) DARK_Y else LIGHT_Y)
        val reach = context.dp(if (dark) DARK_BLUR else LIGHT_BLUR)
        val key = "$width:$height:$dark"
        var bitmap = shadow
        if (bitmap == null || key != shadowKey) {
            bitmap?.recycle()
            val bw = ceil((width + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
            val bh = ceil((height + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
            bitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ALPHA_8)
            val sigma = reach / 2f * SHADOW_SCALE
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = FixedColors.lift
                maskFilter = BlurMaskFilter(max(0.5f, (sigma - 0.5f) / 0.57735f), BlurMaskFilter.Blur.NORMAL)
            }
            val corner = radius * SHADOW_SCALE
            val core = RectF(reach * SHADOW_SCALE, reach * SHADOW_SCALE, (reach + width) * SHADOW_SCALE, (reach + height) * SHADOW_SCALE)
            Canvas(bitmap).drawRoundRect(core, corner, corner, paint)
            shadow = bitmap
            shadowKey = key
        }
        shadowPaint.color = if (dark) withAlpha(Color.BLACK, DARK_ALPHA) else withAlpha(LIGHT_SHADOW, LIGHT_ALPHA)
        rect.set(-reach, -reach + y, width + reach, height + reach + y)
        canvas.drawBitmap(bitmap, null, rect, shadowPaint)
    }

    private companion object {
        const val RADIUS = 26f
        const val BORDER = 1f
        const val LIGHT_Y = 4f
        const val LIGHT_BLUR = 16f
        const val LIGHT_ALPHA = 0.08f
        const val DARK_Y = 10f
        const val DARK_BLUR = 34f
        const val DARK_ALPHA = 0.46f
        const val SHADOW_SCALE = 0.25f
        val LIGHT_SHADOW = Color.rgb(20, 24, 35)
    }
}

open class PillBar(context: Context, private val icon: QwillIcon) : ViewGroup(context) {
    protected val pill = GlassPill(this)
    private val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.SEMIBOLD) }
    private val notePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.REGULAR) }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var title = ""
    private var note: String? = null
    private var shownIcon = icon
    protected var trailing: View? = null

    var blur: SharedBlur?
        get() = pill.blur
        set(value) {
            pill.blur = value
        }

    init {
        setWillNotDraw(false)
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun setTexts(nextTitle: String, nextNote: String?, nextIcon: QwillIcon = icon) {
        if (nextTitle == title && nextNote == note && nextIcon == shownIcon) return
        title = nextTitle
        note = nextNote
        shownIcon = nextIcon
        contentDescription = listOfNotNull(nextTitle, nextNote).joinToString(". ")
        requestLayout()
        invalidate()
    }

    fun refresh() {
        pill.invalidateShadow()
        trailing?.invalidate()
        invalidate()
    }

    private fun applySizes() {
        titlePaint.textSize = context.dp(Theme.textSize(TextScale.SCREEN_TITLE))
        notePaint.textSize = context.dp(Theme.textSize(TextScale.CAPTION))
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        trailing?.measure(MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED), MeasureSpec.makeMeasureSpec(context.dp(Dimens.TAP_MIN).roundToInt(), MeasureSpec.EXACTLY))
        applySizes()
        val text = line(titlePaint, TITLE_LINE) + (if (note != null) line(notePaint, NOTE_LINE) else 0f)
        val height = max(context.dp(MIN_HEIGHT), text + context.dp(PAD_Y) * 2)
        setMeasuredDimension(width, ceil(height).toInt())
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val view = trailing ?: return
        val right = (r - l) - context.dp(PAD_X).roundToInt()
        val top = ((b - t) - view.measuredHeight) / 2
        view.layout(right - view.measuredWidth, top, right, top + view.measuredHeight)
    }

    private fun line(paint: TextPaint, factor: Float): Float = paint.fontMetrics.let { it.descent - it.ascent } * factor

    override fun dispatchDraw(canvas: Canvas) {
        pill.draw(canvas)
        val palette = Theme.palette
        applySizes()
        val iconSize = context.dp(ICON)
        val left = context.dp(PAD_X)
        shownIcon.draw(canvas, left, (height - iconSize) / 2f, iconSize, palette.textSecondary, iconPaint)
        val textLeft = left + iconSize + context.dp(GAP)
        val textRight = (trailing?.let { it.left - context.dp(GAP) } ?: (width - context.dp(PAD_X)))
        val room = max(0f, textRight - textLeft)
        val titleLine = line(titlePaint, TITLE_LINE)
        val noteLine = if (note != null) line(notePaint, NOTE_LINE) else 0f
        val top = (height - titleLine - noteLine) / 2f
        titlePaint.color = palette.textPrimary
        val titleText = TextUtils.ellipsize(title, titlePaint, room, TextUtils.TruncateAt.END)
        canvas.drawText(titleText, 0, titleText.length, textLeft, top + titleLine / 2f - (titlePaint.ascent() + titlePaint.descent()) / 2f, titlePaint)
        note?.let {
            notePaint.color = palette.textSecondary
            val noteText = TextUtils.ellipsize(it, notePaint, room, TextUtils.TruncateAt.END)
            canvas.drawText(noteText, 0, noteText.length, textLeft, top + titleLine + noteLine / 2f - (notePaint.ascent() + notePaint.descent()) / 2f, notePaint)
        }
        super.dispatchDraw(canvas)
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean = true

    companion object {
        const val MIN_HEIGHT = 48f
        private const val PAD_X = 12f
        private const val PAD_Y = 6f
        private const val GAP = 12f
        private const val ICON = 20f
        private const val TITLE_LINE = 1.25f
        private const val NOTE_LINE = 1.3f
    }
}

class PillAction(context: Context, label: String) : View(context) {
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.SEMIBOLD) }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val text = label
    private var pressedShown = false

    init {
        contentDescription = label
        isClickable = true
        isFocusable = true
    }

    override fun setEnabled(enabled: Boolean) {
        super.setEnabled(enabled)
        alpha = if (enabled) 1f else DISABLED_ALPHA
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        textPaint.textSize = context.dp(Theme.textSize(TextScale.META))
        val width = textPaint.measureText(text) + context.dp(PAD_X) * 2
        setMeasuredDimension(ceil(width).toInt(), context.dp(Dimens.TAP_MIN).roundToInt())
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        if (pressedShown || isFocused) {
            fillPaint.color = palette.primarySoft
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            canvas.drawRoundRect(rect, height / 2f, height / 2f, fillPaint)
        }
        textPaint.textSize = context.dp(Theme.textSize(TextScale.META))
        textPaint.color = palette.primary
        canvas.drawText(text, context.dp(PAD_X), height / 2f - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> setPressedShown(isEnabled)
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

    private companion object {
        const val PAD_X = 12f
        const val DISABLED_ALPHA = 0.6f
    }
}

class BlockedBar(context: Context) : PillBar(context, QwillIcon.LOCK) {
    val unblock = PillAction(context, "Разблокировать")

    init {
        trailing = unblock
        addView(unblock)
    }

    fun setState(iBlocked: Boolean, pending: Boolean) {
        if (iBlocked) setTexts(BLOCKER_TITLE, BLOCKER_NOTE) else setTexts(BLOCKED_TITLE, BLOCKED_NOTE)
        unblock.visibility = if (iBlocked) View.VISIBLE else View.GONE
        unblock.isEnabled = !pending
    }

    private companion object {
        const val BLOCKER_TITLE = "Опп устранен"
        const val BLOCKER_NOTE = "вы заблокировали данного пользователя"
        const val BLOCKED_TITLE = "Вы заблокированы"
        const val BLOCKED_NOTE = "Мы не ведем переговоры с оппами."
    }
}

class ServiceChatBar(context: Context) : PillBar(context, QwillIcon.BELL) {
    val toggle = QwillSwitch(context)
    var onMutedChange: ((Boolean) -> Unit)? = null
    private var syncing = false

    init {
        trailing = toggle
        toggle.contentDescription = "Уведомления об обновлениях"
        toggle.onCheckedChange = { enabled -> if (!syncing) onMutedChange?.invoke(!enabled) }
        addView(toggle)
        setTexts(TITLE, null)
    }

    fun setMuted(muted: Boolean, animated: Boolean) {
        setTexts(TITLE, null, if (muted) QwillIcon.MUTE else QwillIcon.BELL)
        syncing = true
        toggle.setChecked(!muted, animated)
        syncing = false
    }

    private companion object {
        const val TITLE = "Уведомления"
    }
}

class SelectionBar(context: Context) : ViewGroup(context) {
    val reply = SelectionAction(context, QwillIcon.REPLY, "Ответить")
    private val capsule = DockCapsule(this, RADIUS)

    var blur: SharedBlur?
        get() = capsule.blur
        set(value) {
            capsule.blur = value
        }

    init {
        setWillNotDraw(false)
        clipChildren = false
        addView(reply)
    }

    fun refresh() {
        reply.invalidate()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = context.dp(HEIGHT).roundToInt()
        reply.measure(MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
        setMeasuredDimension(width, height)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        reply.layout(0, 0, r - l, b - t)
    }

    override fun dispatchDraw(canvas: Canvas) {
        capsule.draw(canvas)
        super.dispatchDraw(canvas)
    }

    companion object {
        const val HEIGHT = 48f
        private const val RADIUS = 24f
    }
}

class SelectionAction(context: Context, private val icon: QwillIcon, private val label: String) : View(context) {
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.SEMIBOLD) }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private var pressedShown = false

    init {
        contentDescription = label
        isClickable = true
        isFocusable = true
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        if (pressedShown) {
            fillPaint.color = withAlpha(palette.pulseGlass, PRESSED_ALPHA)
            canvas.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), height / 2f, height / 2f, fillPaint)
        }
        textPaint.textSize = context.dp(TEXT)
        textPaint.color = palette.pulseInk
        val iconSize = context.dp(ICON)
        val gap = context.dp(GAP)
        val textWidth = textPaint.measureText(label)
        val left = (width - iconSize - gap - textWidth) / 2f
        icon.draw(canvas, left, (height - iconSize) / 2f, iconSize, palette.pulseInk, iconPaint)
        canvas.drawText(label, left + iconSize + gap, height / 2f - (textPaint.ascent() + textPaint.descent()) / 2f, textPaint)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> setPressedShown(true)
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> setPressedShown(false)
        }
        return super.onTouchEvent(event)
    }

    private fun setPressedShown(value: Boolean) {
        if (value == pressedShown) return
        pressedShown = value
        invalidate()
    }

    private companion object {
        const val TEXT = 14.5f
        const val ICON = 20f
        const val GAP = 8f
        const val PRESSED_ALPHA = 0.08f
    }
}
