package com.qwill.app.contacts

import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.text.InputType
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.animation.Interpolator
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.FrameLayout
import androidx.core.graphics.PathParser
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.QwillApplication
import com.qwill.app.consent.CssGradient
import com.qwill.app.files.ImageReceiver
import com.qwill.app.realtime.LastSeen
import com.qwill.app.search.PressableView
import com.qwill.app.search.SearchGlyph
import com.qwill.app.search.SearchPillPainter
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max

class ContactsSearchField(context: Context) : FrameLayout(context) {
    val input = EditText(context)
    private val painter = SearchPillPainter(context)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()

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
        val left = context.dp(SearchPillPainter.contentLeft) + context.dp(SearchPillPainter.ICON) + context.dp(SearchPillPainter.ICON_GAP)
        addView(input, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT).apply {
            leftMargin = ceil(left).toInt()
            rightMargin = context.dpInt(SearchPillPainter.contentLeft)
        })
        applyTheme()
    }

    fun applyTheme() {
        val palette = Theme.palette
        input.setTextColor(palette.pulseInk)
        input.setHintTextColor(withAlpha(palette.pulseInk, SearchPillPainter.PLACEHOLDER_ALPHA))
        input.highlightColor = withAlpha(palette.primary, SELECTION_ALPHA)
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            input.textCursorDrawable = android.graphics.drawable.GradientDrawable().apply {
                setColor(palette.primary)
                setSize(context.dpInt(CURSOR_W), 0)
            }
        }
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(context.dpInt(SearchPillPainter.HEIGHT), MeasureSpec.EXACTLY))
    }

    override fun onDraw(canvas: Canvas) {
        rect.set(0f, 0f, width.toFloat(), height.toFloat())
        painter.draw(canvas, rect, context.dp(SearchPillPainter.RADIUS))
        val size = context.dp(SearchPillPainter.ICON)
        SearchGlyph.draw(canvas, context.dp(SearchPillPainter.contentLeft), (height - size) / 2f, size, withAlpha(Theme.palette.pulseInk, SearchPillPainter.ICON_ALPHA), iconPaint)
    }

    private companion object {
        const val PLACEHOLDER = "Поиск контактов"
        const val SELECTION_ALPHA = 0.3f
        const val CURSOR_W = 2f
    }
}

enum class EntryKind(val label: String) {
    INVITE("Пригласить друзей"),
    CALLS("Недавние звонки"),
}

class EntryRowView(context: Context, private val kind: EntryKind) : View(context) {
    private val labelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.MEDIUM)
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, LABEL_SIZE, context.resources.displayMetrics)
    }
    private val circlePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = FixedColors.lift
    }
    private val dividerPaint = Paint()
    private var shaderFor = -1f

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        contentDescription = kind.label
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), ceil(context.dp(PAD_Y) * 2 + context.dp(CIRCLE)).toInt())
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        if (kind == EntryKind.CALLS) {
            dividerPaint.color = withAlpha(palette.pulseGlass, DIVIDER_ALPHA)
            canvas.drawRect(context.dp(DIVIDER_INSET), 0f, width.toFloat(), context.dp(1f), dividerPaint)
        }
        val size = context.dp(CIRCLE)
        val left = context.dp(PAD_X)
        val top = (height - size) / 2f
        if (shaderFor != size) {
            val line = CssGradient.linear(GRADIENT_ANGLE, size, size, left, top)
            val from = if (kind == EntryKind.INVITE) FixedColors.contactsInviteFrom else FixedColors.contactsCallsFrom
            val to = if (kind == EntryKind.INVITE) FixedColors.contactsInviteTo else FixedColors.contactsCallsTo
            circlePaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, from, to, Shader.TileMode.CLAMP)
            shaderFor = size
        }
        canvas.drawCircle(left + size / 2f, top + size / 2f, size / 2f, circlePaint)
        val icon = if (kind == EntryKind.INVITE) context.dp(INVITE_ICON) else context.dp(CALL_ICON)
        val grid = if (kind == EntryKind.INVITE) INVITE_GRID else CALL_GRID
        val save = canvas.save()
        canvas.translate(left + (size - icon) / 2f, top + (size - icon) / 2f)
        canvas.scale(icon / grid, icon / grid)
        if (kind == EntryKind.INVITE) {
            strokePaint.strokeWidth = INVITE_STROKE
            canvas.drawCircle(9f, 7f, 3.3f, strokePaint)
            canvas.drawPath(INVITE_BODY, strokePaint)
            canvas.drawPath(INVITE_PLUS, strokePaint)
        } else {
            strokePaint.strokeWidth = CALL_STROKE
            canvas.drawPath(CALL_PATH, strokePaint)
        }
        canvas.restoreToCount(save)
        labelPaint.color = palette.pulseInk
        val metrics = labelPaint.fontMetrics
        val textLeft = left + size + context.dp(GAP)
        val shown = TextUtils.ellipsize(kind.label, labelPaint, max(0f, width - textLeft - context.dp(PAD_X)), TextUtils.TruncateAt.END)
        canvas.drawText(shown, 0, shown.length, textLeft, height / 2f - (metrics.ascent + metrics.descent) / 2f, labelPaint)
    }

    private companion object {
        const val PAD_X = 15f
        const val PAD_Y = 13f
        const val CIRCLE = 38f
        const val GAP = 13f
        const val LABEL_SIZE = 15.5f
        const val GRADIENT_ANGLE = 140f
        const val DIVIDER_INSET = 66f
        const val DIVIDER_ALPHA = 0.06f
        const val INVITE_ICON = 17f
        const val INVITE_GRID = 20f
        const val INVITE_STROKE = 1.6f
        const val CALL_ICON = 16f
        const val CALL_GRID = 16f
        const val CALL_STROKE = 1.5f
        val INVITE_BODY: Path = PathParser.createPathFromPathData("M3.5 16c.6-2.8 2.8-4.2 5.5-4.2 1 0 1.9.2 2.7.6")
        val INVITE_PLUS: Path = PathParser.createPathFromPathData("M15 12v5M12.5 14.5h5")
        val CALL_PATH: Path = PathParser.createPathFromPathData(
            "M2.2 3.4c0-.8.7-1.5 1.5-1.5h1.4c.6 0 1.1.4 1.3 1l.5 2c.1.5 0 1-.4 1.3l-.9.7a9 9 0 0 0 4 4l.7-.9c.3-.4.8-.5 1.3-.4l2 .5c.6.2 1 .7 1 1.3v1.4c0 .8-.7 1.5-1.5 1.5C6.6 14.3 2.2 9.9 2.2 3.4z",
        )
    }
}

class SortLabelView(context: Context) : View(context) {
    private val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.SEMIBOLD)
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, SIZE, context.resources.displayMetrics)
    }

    init {
        contentDescription = TEXT
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val metrics = paint.fontMetrics
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), ceil(context.dp(PAD_TOP) + context.dp(PAD_BOTTOM) + metrics.descent - metrics.ascent).toInt())
    }

    override fun onDraw(canvas: Canvas) {
        paint.color = Theme.palette.primary
        canvas.drawText(TEXT, context.dp(PAD_X), context.dp(PAD_TOP) - paint.fontMetrics.ascent, paint)
    }

    private companion object {
        const val TEXT = "Сортировка по имени"
        const val SIZE = 13f
        const val PAD_TOP = 12f
        const val PAD_BOTTOM = 6f
        const val PAD_X = 15f
    }
}

class ContactRowView(context: Context) : PressableView(context) {
    private val letterPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.SEMIBOLD)
        textSize = px(LETTER_SIZE)
    }
    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.MEDIUM)
        textSize = px(NAME_SIZE)
    }
    private val statusPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = px(STATUS_SIZE)
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val bgPath = Path()
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)
    private var contact: Contact? = null
    private var last = false
    private var nameShown: CharSequence = ""
    private var statusText = ""

    override val pressScale: Float get() = PRESS_SCALE
    override val pressBgMs: Long get() = PRESS_BG_MS
    override val pressScaleMs: Long get() = PRESS_SCALE_MS
    override val pressScaleCurve: Interpolator get() = PRESS_CURVE

    val userId: String? get() = contact?.userId

    fun bind(next: Contact, isLast: Boolean, nowMs: Long) {
        if (contact?.userId != next.userId) resetState()
        contact = next
        last = isLast
        avatar.set(next.name, next.avatarColor, next.userId, Fonts.message(FontWeight.BOLD))
        image.setImage(QwillApplication.files.avatarRequest(next.avatarUrl), null, px(AVATAR).toInt(), small = true)
        statusText = if (next.online) LastSeen.ONLINE else LastSeen.formatShort(next.lastSeenAt, nowMs)
        contentDescription = "${next.name}, $statusText"
        ellipsize()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), ceil(px(PAD_Y) * 2 + px(AVATAR)).toInt())
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        ellipsize()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
    }

    private fun ellipsize() {
        val current = contact ?: return
        if (width == 0) return
        nameShown = TextUtils.ellipsize(current.name, namePaint, max(0f, width - px(TEXT_LEFT) - px(PAD_X)), TextUtils.TruncateAt.END)
    }

    override fun onDraw(canvas: Canvas) {
        val current = contact ?: return
        val palette = Theme.palette
        if (pressBg > 0f || isFocused) {
            fillPaint.color = withAlpha(palette.pulseGlass, if (isFocused) FOCUS_BG else PRESS_BG * pressBg)
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            val radius = if (last) px(CARD_RADIUS) else 0f
            bgPath.reset()
            bgPath.addRoundRect(rect, floatArrayOf(0f, 0f, 0f, 0f, radius, radius, radius, radius), Path.Direction.CW)
            canvas.drawPath(bgPath, fillPaint)
        }
        val letterMetrics = letterPaint.fontMetrics
        letterPaint.color = withAlpha(palette.pulseInk, LETTER_ALPHA)
        canvas.drawText(current.letter, px(PAD_X), height / 2f - (letterMetrics.ascent + letterMetrics.descent) / 2f, letterPaint)
        val size = px(AVATAR)
        val left = px(PAD_X) + px(LETTER_W) + px(GAP)
        val top = (height - size) / 2f
        avatar.draw(canvas, left, top, size)
        rect.set(left, top, left + size, top + size)
        image.draw(canvas, rect, size / 2f)
        if (current.online) {
            val dot = max(size * ONLINE_SHARE, px(ONLINE_MIN))
            val cx = left + size - px(ONLINE_INSET) - dot / 2f
            val cy = top + size - px(ONLINE_INSET) - dot / 2f
            fillPaint.color = palette.bg
            canvas.drawCircle(cx, cy, dot / 2f, fillPaint)
            fillPaint.color = FixedColors.onlineDot
            canvas.drawCircle(cx, cy, max(0f, dot / 2f - px(ONLINE_RING)), fillPaint)
        }
        val nameMetrics = namePaint.fontMetrics
        val statusMetrics = statusPaint.fontMetrics
        val nameLine = nameMetrics.descent - nameMetrics.ascent
        val statusLine = statusMetrics.descent - statusMetrics.ascent
        val bodyTop = (height - nameLine - statusLine) / 2f
        val textLeft = px(TEXT_LEFT)
        namePaint.color = palette.pulseInk
        canvas.drawText(nameShown, 0, nameShown.length, textLeft, bodyTop - nameMetrics.ascent, namePaint)
        statusPaint.color = if (current.online) palette.online else withAlpha(palette.pulseInk, STATUS_ALPHA)
        canvas.drawText(statusText, textLeft, bodyTop + nameLine - statusMetrics.ascent, statusPaint)
    }

    private fun px(value: Float): Float = context.dp(value)

    private companion object {
        const val PAD_X = 15f
        const val PAD_Y = 9f
        const val LETTER_W = 22f
        const val GAP = 13f
        const val AVATAR = 42f
        const val TEXT_LEFT = PAD_X + LETTER_W + GAP + AVATAR + GAP
        const val LETTER_SIZE = 13f
        const val LETTER_ALPHA = 0.35f
        const val NAME_SIZE = 15f
        const val STATUS_SIZE = 12.5f
        const val STATUS_ALPHA = 0.4f
        const val ONLINE_SHARE = 0.24f
        const val ONLINE_MIN = 11f
        const val ONLINE_INSET = 1f
        const val ONLINE_RING = 2.5f
        const val CARD_RADIUS = 22f
        const val PRESS_BG = 0.08f
        const val FOCUS_BG = 0.1f
        const val PRESS_SCALE = 0.97f
        const val PRESS_BG_MS = 200L
        const val PRESS_SCALE_MS = 340L
        val PRESS_CURVE: Interpolator = PathInterpolator(0.22f, 1.4f, 0.4f, 1f)
    }
}

class CardDecoration(private val context: Context, private val groupOf: (Int) -> Int?) : RecyclerView.ItemDecoration() {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val rect = RectF()

    override fun onDraw(canvas: Canvas, parent: RecyclerView, state: RecyclerView.State) {
        val palette = Theme.palette
        val radius = context.dp(RADIUS)
        val hairline = context.dp(1f)
        fill.color = withAlpha(palette.pulseGlass, FILL_ALPHA)
        stroke.color = withAlpha(palette.pulseGlass, BORDER_ALPHA)
        stroke.strokeWidth = hairline
        val tops = HashMap<Int, Float>()
        val bottoms = HashMap<Int, Float>()
        val firsts = HashMap<Int, Int>()
        val lasts = HashMap<Int, Int>()
        for (index in 0 until parent.childCount) {
            val child = parent.getChildAt(index)
            val position = parent.getChildAdapterPosition(child)
            if (position == RecyclerView.NO_POSITION) continue
            val group = groupOf(position) ?: continue
            if (position < (firsts[group] ?: Int.MAX_VALUE)) {
                firsts[group] = position
                tops[group] = child.top.toFloat()
            }
            if (position > (lasts[group] ?: Int.MIN_VALUE)) {
                lasts[group] = position
                bottoms[group] = child.bottom.toFloat()
            }
        }
        val count = parent.adapter?.itemCount ?: 0
        for ((group, first) in firsts) {
            if (first > 0 && groupOf(first - 1) == group) tops[group] = -radius * 2
        }
        for ((group, last) in lasts) {
            if (last + 1 < count && groupOf(last + 1) == group) bottoms[group] = parent.height + radius * 2
        }
        val left = parent.paddingLeft.toFloat()
        val right = (parent.width - parent.paddingRight).toFloat()
        for ((group, top) in tops) {
            val bottom = bottoms[group] ?: continue
            rect.set(left, top, right, bottom)
            canvas.drawRoundRect(rect, radius, radius, fill)
            rect.inset(hairline / 2f, hairline / 2f)
            canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, stroke)
        }
    }

    private companion object {
        const val RADIUS = 22f
        const val FILL_ALPHA = 0.055f
        const val BORDER_ALPHA = 0.08f
    }
}
