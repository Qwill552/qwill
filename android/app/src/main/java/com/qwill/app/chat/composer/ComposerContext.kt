package com.qwill.app.chat.composer

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import com.qwill.app.chat.bottom.DockCapsule
import com.qwill.app.emoji.Emoji
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

sealed class ComposerContext {
    object None : ComposerContext()

    data class Reply(val message: MessageDto) : ComposerContext()

    data class Edit(val message: MessageDto, val stashed: String, val stashedReply: MessageDto?) : ComposerContext()

    val target: MessageDto?
        get() = when (this) {
            None -> null
            is Reply -> message
            is Edit -> message
        }
}

object ComposerTexts {
    const val EDITING = "Редактирование"
    const val PLACEHOLDER = "Сообщение"
    const val PLACEHOLDER_EDIT = "Изменить сообщение"
    const val NO_CONNECTION = "Нет соединения"
    const val EDIT_FAILED = "Не удалось изменить сообщение"
    const val DELETED = "Сообщение удалено"
    const val VOICE = "Голосовое сообщение"
    const val ATTACHMENT = "Вложение"

    fun replyTitle(message: MessageDto): String {
        val name = message.sender?.displayName
        return if (name.isNullOrEmpty()) "Ответ удалённому аккаунту" else "Ответ $name"
    }

    fun preview(message: MessageDto): String {
        if (message.deletedAt != null) return DELETED
        if (!message.content.isNullOrEmpty()) return message.content
        val attachment = message.attachment ?: return ""
        return if (attachment.peaks != null || attachment.file.mimeType.startsWith("audio/")) VOICE else ATTACHMENT
    }

    fun tooLong(length: Int, limit: Int): String = "Слишком длинное сообщение: $length из $limit"
}

class ComposerContextBar(context: Context) : ViewGroup(context) {
    val close = ComposerIconButton(context, QwillIcon.CLOSE, CLOSE_ICON, "Отменить", CLOSE_ALPHA)
    var onTap: (() -> Unit)? = null

    private val capsule = DockCapsule(this, RADIUS, withShadow = false)
    private val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.SEMIBOLD) }
    private val previewPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.REGULAR) }
    private val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private var title = ""
    private var preview: CharSequence = ""
    private var titleShown: CharSequence = ""
    private var previewLayout: StaticLayout? = null
    private var laidOutFor = -1
    private var pressed = false

    var blur: SharedBlur?
        get() = capsule.blur
        set(value) {
            capsule.blur = value
        }

    init {
        setWillNotDraw(false)
        isClickable = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        addView(close)
    }

    fun set(nextTitle: String, nextPreview: String) {
        if (nextTitle == title && nextPreview == preview.toString()) return
        title = nextTitle
        preview = nextPreview
        contentDescription = "$nextTitle. $nextPreview"
        laidOutFor = -1
        requestLayout()
        invalidate()
    }

    fun refresh() {
        laidOutFor = -1
        close.invalidate()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val button = MeasureSpec.makeMeasureSpec((context.dp(ComposerIconButton.SIZE)).roundToInt(), MeasureSpec.EXACTLY)
        close.measure(button, button)
        applyTextSizes()
        val text = lineHeight(titlePaint) + lineHeight(previewPaint)
        val content = max(close.measuredHeight.toFloat(), text)
        setMeasuredDimension(width, ceil(content + context.dp(PAD_Y) * 2).toInt())
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val width = r - l
        val height = b - t
        val right = width - context.dp(PAD_X).roundToInt()
        val top = (height - close.measuredHeight) / 2
        close.layout(right - close.measuredWidth, top, right, top + close.measuredHeight)
        layoutText(width)
    }

    private fun applyTextSizes() {
        val size = context.dp(Theme.textSize(TextScale.CAPTION))
        titlePaint.textSize = size
        previewPaint.textSize = size
    }

    private fun lineHeight(paint: TextPaint): Float = paint.fontMetrics.let { it.descent - it.ascent } * LINE

    private fun textLeft(): Float = context.dp(PAD_X + BAR + BAR_GAP)

    private fun layoutText(width: Int) {
        if (laidOutFor == width) return
        laidOutFor = width
        applyTextSizes()
        val room = max(1f, width - textLeft() - context.dp(PAD_X + ComposerIconButton.SIZE + GAP))
        titleShown = TextUtils.ellipsize(title, titlePaint, room, TextUtils.TruncateAt.END)
        val withEmoji = Emoji.replace(preview, context.dp(PREVIEW_EMOJI))
        val shown = TextUtils.ellipsize(withEmoji, previewPaint, room, TextUtils.TruncateAt.END)
        val layoutWidth = ceil(max(1f, Layout.getDesiredWidth(shown, previewPaint))).toInt()
        previewLayout = if (Build.VERSION.SDK_INT >= 23) {
            StaticLayout.Builder.obtain(shown, 0, shown.length, previewPaint, layoutWidth).setMaxLines(1).setIncludePad(false).build()
        } else {
            @Suppress("DEPRECATION")
            StaticLayout(shown, previewPaint, layoutWidth, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false)
        }
    }

    override fun dispatchDraw(canvas: Canvas) {
        capsule.draw(canvas)
        val palette = Theme.palette
        if (pressed) {
            barPaint.color = withAlpha(palette.pulseGlass, PRESSED_ALPHA)
            val save = canvas.save()
            capsule.clip(canvas)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), barPaint)
            canvas.restoreToCount(save)
        }
        layoutText(width)
        val titleLine = lineHeight(titlePaint)
        val previewLine = lineHeight(previewPaint)
        val top = (height - titleLine - previewLine) / 2f
        barPaint.color = palette.primary
        val barLeft = context.dp(PAD_X)
        rect.set(barLeft, top, barLeft + context.dp(BAR), top + titleLine + previewLine)
        canvas.drawRect(rect, barPaint)
        titlePaint.color = palette.primary
        val titleBaseline = top + titleLine / 2f - (titlePaint.ascent() + titlePaint.descent()) / 2f
        canvas.drawText(titleShown, 0, titleShown.length, textLeft(), titleBaseline, titlePaint)
        previewLayout?.let { layout ->
            previewPaint.color = withAlpha(palette.pulseInk, PREVIEW_ALPHA)
            val baseline = top + titleLine + previewLine / 2f - (previewPaint.ascent() + previewPaint.descent()) / 2f
            val save = canvas.save()
            canvas.translate(textLeft(), baseline - layout.getLineBaseline(0))
            layout.draw(canvas)
            canvas.restoreToCount(save)
        }
        super.dispatchDraw(canvas)
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> setPressedShown(true)
            MotionEvent.ACTION_MOVE -> if (event.x < 0 || event.y < 0 || event.x > width || event.y > height) setPressedShown(false)
            MotionEvent.ACTION_UP -> {
                val fire = pressed
                setPressedShown(false)
                if (fire) {
                    playSoundEffect(android.view.SoundEffectConstants.CLICK)
                    onTap?.invoke()
                }
            }
            MotionEvent.ACTION_CANCEL -> setPressedShown(false)
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        onTap?.invoke()
        return true
    }

    private fun setPressedShown(value: Boolean) {
        if (value == pressed) return
        pressed = value
        invalidate()
    }

    private companion object {
        const val RADIUS = 20f
        const val PAD_X = 12f
        const val PAD_Y = 8f
        const val GAP = 8f
        const val BAR = 3f
        const val BAR_GAP = 8f
        const val LINE = 1.25f
        const val CLOSE_ICON = 20f
        const val CLOSE_ALPHA = 0.6f
        const val PREVIEW_ALPHA = 0.6f
        const val PREVIEW_EMOJI = 16f
        const val PRESSED_ALPHA = 0.08f
    }
}

class ComposerErrorLine(context: Context) : View(context) {
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.REGULAR) }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shape = Path()
    private val rect = RectF()
    private var message = ""
    private var layout: StaticLayout? = null
    private var shapeFor = ""

    var blur: SharedBlur? = null

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        accessibilityLiveRegion = ACCESSIBILITY_LIVE_REGION_POLITE
    }

    val text: String get() = message

    fun set(value: String) {
        if (value == message) return
        message = value
        contentDescription = value
        layout = null
        requestLayout()
        invalidate()
    }

    fun refresh() {
        layout = null
        requestLayout()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val built = build(width)
        setMeasuredDimension(width, ceil(built.height + context.dp(PAD_Y) * 2).toInt())
    }

    private fun build(width: Int): StaticLayout {
        textPaint.textSize = context.dp(Theme.textSize(TextScale.CAPTION))
        val room = max(1, (width - context.dp(PAD_X) * 2).roundToInt())
        layout?.let { if (it.width == room) return it }
        val next = if (Build.VERSION.SDK_INT >= 23) {
            StaticLayout.Builder.obtain(message, 0, message.length, textPaint, room).setIncludePad(false).build()
        } else {
            @Suppress("DEPRECATION")
            StaticLayout(message, textPaint, room, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false)
        }
        layout = next
        return next
    }

    override fun onDraw(canvas: Canvas) {
        if (width == 0 || height == 0) return
        val palette = Theme.palette
        val radius = minOf(context.dp(RADIUS), height / 2f)
        val key = "$width:$height"
        if (key != shapeFor) {
            shapeFor = key
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            shape.reset()
            shape.addRoundRect(rect, radius, radius, Path.Direction.CW)
        }
        blur?.let {
            val save = canvas.save()
            canvas.clipPath(shape)
            it.draw(canvas, this)
            canvas.restoreToCount(save)
        }
        fillPaint.color = palette.dangerSoft
        canvas.drawPath(shape, fillPaint)
        val built = build(width)
        textPaint.color = palette.danger
        val save = canvas.save()
        canvas.translate(context.dp(PAD_X), context.dp(PAD_Y))
        built.draw(canvas)
        canvas.restoreToCount(save)
    }

    private companion object {
        const val PAD_X = 12f
        const val PAD_Y = 4f
        const val RADIUS = 20f
    }
}
