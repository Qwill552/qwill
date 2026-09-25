package com.qwill.app.chats

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.text.Layout
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.PathInterpolator
import com.qwill.app.QwillApplication
import com.qwill.app.R
import com.qwill.app.consent.CssGradient
import com.qwill.app.emoji.Emoji
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatType
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Palette
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max

data class ChatRowModel(
    val chat: ChatListItemDto,
    val myUserId: String?,
    val online: Boolean,
    val typists: List<String>,
) {
    val id: String get() = chat.id
}

interface ChatCellHost {
    fun onChatClick(model: ChatRowModel)

    fun onChatLongPress(cell: ChatCell, model: ChatRowModel)

    fun onChatTouchHeld(held: Boolean)
}

class ChatCell(context: Context, private val host: ChatCellHost) : View(context) {
    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.SEMIBOLD)
        textSize = px(NAME_SIZE)
    }
    private val timePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = px(TIME_SIZE)
    }
    private val previewPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = px(PREVIEW_SIZE)
    }
    private val badgePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.BOLD)
        textSize = px(BADGE_TEXT)
        fontFeatureSettings = "'tnum' 1"
        textAlign = Paint.Align.CENTER
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bitmapPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val badgeGradientPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)

    private var model: ChatRowModel? = null
    private var laidOutFor: ChatRowModel? = null
    private var laidOutWidth = -1
    private var laidOutPalette: Palette? = null
    private var laidOutEmoji = false
    private var nameText: CharSequence = ""
    private var timeText = ""
    private var timeWidth = 0f
    private var preview: ChatPreviewText? = null
    private var previewLayout: StaticLayout? = null
    private var typingText: CharSequence? = null
    private var badgeText = ""
    private var badgeWidth = 0f
    private var badgeShaderWidth = -1f
    private var service = false
    private var ownSent = false

    private var onlineProgress = 0f
    private var onlineAnimator: ValueAnimator? = null
    private var pressBg = 0f
    private var pressBgAnimator: ValueAnimator? = null
    private var pressScaleAnimator: ValueAnimator? = null
    private var pressedShown = false

    private var downX = 0f
    private var downY = 0f
    private var tracking = false
    private var longPressed = false
    private val moveCancel = context.dp(MOVE_CANCEL_DP)
    private val showPress = Runnable { setPressShown(true) }
    private val longPress = Runnable { fireLongPress() }

    val chatId: String? get() = model?.id

    init {
        isClickable = true
        isLongClickable = true
        isFocusable = true
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun bind(next: ChatRowModel, nowMs: Long) {
        val previous = model
        val sameChat = previous?.id == next.id
        model = next
        if (!sameChat) {
            onlineAnimator?.cancel()
            onlineAnimator = null
            onlineProgress = if (next.online) 1f else 0f
            setPressShown(false, animated = false)
        } else if (previous?.online != next.online) {
            animateOnline(next.online)
        }
        val chat = next.chat
        service = chat.otherMember?.isService == true
        avatar.set(chat.title, chat.otherMember?.avatarColor, chat.id, Fonts.message(FontWeight.BOLD))
        val avatarSize = px(AVATAR).toInt()
        if (service) {
            image.setImage(null, null, avatarSize, small = true)
        } else {
            image.setImage(QwillApplication.files.avatarRequest(chat.avatarUrl), null, avatarSize, small = true)
        }
        val time = chat.lastMessage?.let { ChatRowTime.format(it.createdAt, nowMs) }.orEmpty()
        val timeChanged = time != timeText
        timeText = time
        val needsText = next != laidOutFor || timeChanged || laidOutPalette !== Theme.palette || laidOutEmoji != (Emoji.matcher != null)
        if (needsText && width > 0) layoutText()
        updateDescription()
        invalidate()
    }

    fun onEmojiChanged(indexChanged: Boolean) {
        if (indexChanged && width > 0 && model != null) layoutText()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), px(Dimens.ROW_CHAT_H).toInt())
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        pivotX = w / 2f
        pivotY = h / 2f
        if (w != laidOutWidth && model != null) layoutText()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
        val stale = laidOutPalette !== Theme.palette || laidOutEmoji != (Emoji.matcher != null)
        if (stale && width > 0 && model != null) layoutText()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
        cancelTouch()
        onlineAnimator?.cancel()
        onlineAnimator = null
        model?.let { onlineProgress = if (it.online) 1f else 0f }
        pressBgAnimator?.cancel()
        pressScaleAnimator?.cancel()
        pressedShown = false
        pressBg = 0f
        scaleX = 1f
        scaleY = 1f
    }

    private fun layoutText() {
        val current = model ?: return
        val chat = current.chat
        val palette = Theme.palette
        laidOutFor = current
        laidOutWidth = width
        laidOutPalette = palette
        laidOutEmoji = Emoji.matcher != null
        val bodyWidth = width - px(TEXT_LEFT) - px(PAD_X)
        timeWidth = if (timeText.isEmpty()) 0f else timePaint.measureText(timeText)
        val typing = current.typists.isNotEmpty()
        val last = chat.lastMessage
        val nextPreview = ChatPreview.of(chat, current.myUserId)
        preview = nextPreview
        ownSent = nextPreview.own && !typing
        var nameRoom = bodyWidth
        if (timeWidth > 0f) nameRoom -= timeWidth + px(GAP)
        if (ownSent) nameRoom -= px(CHECK_SIZE) + px(GAP)
        if (service) nameRoom -= px(OFFICIAL_SIZE) + px(OFFICIAL_GAP)
        nameText = TextUtils.ellipsize(chat.title, namePaint, max(0f, nameRoom), TextUtils.TruncateAt.END)
        val unread = chat.unreadCount
        badgeText = when {
            unread <= 0 -> ""
            unread > MAX_BADGE -> "$MAX_BADGE+"
            else -> unread.toString()
        }
        badgeWidth = if (badgeText.isEmpty()) 0f else max(px(BADGE_H), badgePaint.measureText(badgeText) + px(BADGE_PAD) * 2)
        var previewRoom = bodyWidth
        if (badgeWidth > 0f) previewRoom -= badgeWidth + px(GAP)
        if (typing) {
            val label = if (chat.type == ChatType.GROUP) "${current.typists.joinToString(", ")} печатает…" else "печатает…"
            typingText = TextUtils.ellipsize(label, previewPaint, max(0f, previewRoom), TextUtils.TruncateAt.END)
            previewLayout = null
        } else {
            typingText = null
            if (nextPreview.icon != null) previewRoom -= px(PREVIEW_ICON) + px(PREVIEW_ICON_GAP)
            previewLayout = buildPreview(nextPreview, max(0f, previewRoom), palette)
        }
        if (last == null) timeWidth = 0f
    }

    private fun buildPreview(content: ChatPreviewText, room: Float, palette: Palette): StaticLayout {
        val builder = SpannableStringBuilder()
        if (content.author.isNotEmpty()) {
            builder.append(content.author)
            builder.setSpan(ForegroundColorSpan(withAlpha(palette.pulseInk, AUTHOR_ALPHA)), 0, content.author.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        builder.append(Emoji.replace(content.text, px(PREVIEW_EMOJI)))
        previewPaint.color = withAlpha(palette.pulseInk, PREVIEW_ALPHA)
        val shown = TextUtils.ellipsize(builder, previewPaint, room, TextUtils.TruncateAt.END)
        val layoutWidth = ceil(max(1f, Layout.getDesiredWidth(shown, previewPaint))).toInt()
        return singleLine(shown, previewPaint, layoutWidth)
    }

    private fun singleLine(text: CharSequence, paint: TextPaint, width: Int): StaticLayout {
        if (Build.VERSION.SDK_INT >= 23) {
            return StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
                .setMaxLines(1)
                .setIncludePad(false)
                .build()
        }
        @Suppress("DEPRECATION")
        return StaticLayout(text, paint, width, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false)
    }

    override fun onDraw(canvas: Canvas) {
        val current = model ?: return
        val palette = Theme.palette
        if (pressBg > 0f) {
            fillPaint.shader = null
            fillPaint.color = withAlpha(palette.pulseGlass, PRESS_BG_ALPHA * pressBg)
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            canvas.drawRoundRect(rect, px(ROW_RADIUS), px(ROW_RADIUS), fillPaint)
        }
        drawAvatar(canvas, palette)
        drawBody(canvas, current, palette)
    }

    private fun drawAvatar(canvas: Canvas, palette: Palette) {
        val size = px(AVATAR)
        val left = px(PAD_X)
        val top = (height - size) / 2f
        val shadow = AvatarShadow.bitmap(context)
        val extent = px(AvatarShadow.EXTENT)
        rect.set(left + size / 2f - extent / 2f, top + size / 2f + px(AvatarShadow.OFFSET_Y) - extent / 2f, 0f, 0f)
        rect.right = rect.left + extent
        rect.bottom = rect.top + extent
        canvas.drawBitmap(shadow, null, rect, bitmapPaint)
        if (service) {
            ServiceLogo.draw(canvas, context, left, top, size, bitmapPaint)
        } else {
            avatar.draw(canvas, left, top, size)
            rect.set(left, top, left + size, top + size)
            image.draw(canvas, rect, size / 2f)
        }
        if (onlineProgress > 0f) {
            val dot = max(size * ONLINE_SHARE, px(ONLINE_MIN))
            val radius = dot / 2f * onlineProgress
            val cx = left + size - px(ONLINE_INSET) - dot / 2f
            val cy = top + size - px(ONLINE_INSET) - dot / 2f
            fillPaint.shader = null
            fillPaint.color = palette.bg
            canvas.drawCircle(cx, cy, radius, fillPaint)
            fillPaint.color = FixedColors.onlineDot
            canvas.drawCircle(cx, cy, max(0f, radius - px(ONLINE_RING) * onlineProgress), fillPaint)
        }
    }

    private fun drawBody(canvas: Canvas, current: ChatRowModel, palette: Palette) {
        val left = px(TEXT_LEFT)
        val right = width - px(PAD_X)
        val nameMetrics = namePaint.fontMetrics
        val timeMetrics = timePaint.fontMetrics
        val previewMetrics = previewPaint.fontMetrics
        val nameLine = nameMetrics.descent - nameMetrics.ascent
        val timeLine = timeMetrics.descent - timeMetrics.ascent
        val previewLine = previewMetrics.descent - previewMetrics.ascent
        val topRow = maxOf(nameLine, timeLine, if (ownSent) px(CHECK_SIZE) else 0f)
        val bottomRow = max(previewLine, if (badgeWidth > 0f) px(BADGE_H) else 0f)
        val bodyTop = (height - topRow - px(ROW_GAP) - bottomRow) / 2f
        val topCenter = bodyTop + topRow / 2f
        val bottomCenter = bodyTop + topRow + px(ROW_GAP) + bottomRow / 2f

        namePaint.color = palette.pulseInk
        canvas.drawText(nameText, 0, nameText.length, left, topCenter - (nameMetrics.ascent + nameMetrics.descent) / 2f, namePaint)
        if (service) {
            val markLeft = left + namePaint.measureText(nameText, 0, nameText.length) + px(OFFICIAL_GAP)
            drawOfficialMark(canvas, markLeft, topCenter, palette)
        }
        var timeRight = right
        if (timeWidth > 0f) {
            timePaint.color = withAlpha(palette.pulseInk, META_ALPHA)
            canvas.drawText(timeText, right - timeWidth, topCenter - (timeMetrics.ascent + timeMetrics.descent) / 2f, timePaint)
            timeRight = right - timeWidth - px(GAP)
        }
        if (ownSent) {
            val size = px(CHECK_SIZE)
            QwillIcon.CHECK.draw(canvas, timeRight - size, topCenter - size / 2f, size, withAlpha(palette.pulseInk, META_ALPHA), iconPaint)
        }

        val typing = typingText
        if (typing != null) {
            previewPaint.color = FixedColors.typingInk
            canvas.drawText(typing, 0, typing.length, left, bottomCenter - (previewMetrics.ascent + previewMetrics.descent) / 2f, previewPaint)
        } else {
            var x = left
            val content = preview
            val icon = content?.icon
            if (icon != null) {
                val size = px(PREVIEW_ICON)
                val color = if (content.failedCall) palette.danger else withAlpha(palette.pulseInk, META_ALPHA)
                icon.draw(canvas, x, bottomCenter - size / 2f, size, color, iconPaint)
                x += size + px(PREVIEW_ICON_GAP)
            }
            val layout = previewLayout
            if (layout != null) {
                previewPaint.color = withAlpha(palette.pulseInk, PREVIEW_ALPHA)
                val baseline = bottomCenter - (previewMetrics.ascent + previewMetrics.descent) / 2f
                val save = canvas.save()
                canvas.translate(x, baseline - layout.getLineBaseline(0))
                layout.draw(canvas)
                canvas.restoreToCount(save)
            }
        }
        if (badgeWidth > 0f) drawBadge(canvas, right - badgeWidth, bottomCenter, current.chat.muted, palette)
    }

    private fun drawOfficialMark(canvas: Canvas, left: Float, centerY: Float, palette: Palette) {
        val size = px(OFFICIAL_SIZE)
        fillPaint.shader = null
        fillPaint.color = palette.primary
        canvas.drawCircle(left + size / 2f, centerY, size / 2f, fillPaint)
        val check = px(OFFICIAL_CHECK)
        QwillIcon.CHECK.draw(canvas, left + (size - check) / 2f, centerY - check / 2f, check, FixedColors.lift, iconPaint)
    }

    private fun drawBadge(canvas: Canvas, left: Float, centerY: Float, muted: Boolean, palette: Palette) {
        val height = px(BADGE_H)
        rect.set(left, centerY - height / 2f, left + badgeWidth, centerY + height / 2f)
        val paint: Paint
        if (muted) {
            fillPaint.shader = null
            fillPaint.color = withAlpha(palette.pulseInk, BADGE_MUTED_ALPHA)
            paint = fillPaint
        } else {
            if (badgeShaderWidth != badgeWidth) {
                val line = CssGradient.linear(BADGE_ANGLE, badgeWidth, height)
                badgeGradientPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, FixedColors.badgeFrom, FixedColors.badgeTo, Shader.TileMode.CLAMP)
                badgeShaderWidth = badgeWidth
            }
            paint = badgeGradientPaint
        }
        val save = canvas.save()
        canvas.translate(rect.left, rect.top)
        rect.offsetTo(0f, 0f)
        canvas.drawRoundRect(rect, px(BADGE_RADIUS), px(BADGE_RADIUS), paint)
        canvas.restoreToCount(save)
        badgePaint.color = FixedColors.lift
        val metrics = badgePaint.fontMetrics
        canvas.drawText(badgeText, left + badgeWidth / 2f, centerY - (metrics.ascent + metrics.descent) / 2f, badgePaint)
    }

    private fun animateOnline(online: Boolean) {
        onlineAnimator?.cancel()
        val target = if (online) 1f else 0f
        if (!isAttachedToWindow || !Motion.animationsEnabled) {
            onlineProgress = target
            invalidate()
            return
        }
        onlineAnimator = ValueAnimator.ofFloat(onlineProgress, target).apply {
            duration = Motion.duration(ONLINE_MS)
            addUpdateListener {
                onlineProgress = it.animatedValue as Float
                invalidate()
            }
            start()
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                tracking = true
                longPressed = false
                host.onChatTouchHeld(true)
                postDelayed(showPress, ViewConfiguration.getTapTimeout().toLong())
                postDelayed(longPress, LONG_PRESS_MS)
                return true
            }
            MotionEvent.ACTION_MOVE -> {
                if (!tracking) return true
                if (hypot(event.x - downX, event.y - downY) > moveCancel) {
                    removeCallbacks(longPress)
                    removeCallbacks(showPress)
                    setPressShown(false)
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                if (!tracking) return true
                val fired = longPressed
                val moved = hypot(event.x - downX, event.y - downY) > moveCancel
                finishTouch()
                if (!fired && !moved) {
                    if (!pressedShown) setPressShown(true)
                    postDelayed({ setPressShown(false) }, RELEASE_DELAY_MS)
                    performClick()
                } else {
                    setPressShown(false)
                }
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                cancelTouch()
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun performClick(): Boolean {
        super.performClick()
        model?.let { host.onChatClick(it) }
        return true
    }

    override fun performLongClick(): Boolean {
        val current = model ?: return false
        host.onChatLongPress(this, current)
        return true
    }

    private fun fireLongPress() {
        if (!tracking) return
        longPressed = true
        performHapticFeedback(LONG_PRESS_FEEDBACK)
        model?.let { host.onChatLongPress(this, it) }
    }

    private fun finishTouch() {
        tracking = false
        removeCallbacks(showPress)
        removeCallbacks(longPress)
        host.onChatTouchHeld(false)
    }

    private fun cancelTouch() {
        if (!tracking) return
        finishTouch()
        setPressShown(false)
    }

    private fun setPressShown(shown: Boolean, animated: Boolean = true) {
        if (shown == pressedShown && animated) return
        pressedShown = shown
        pressBgAnimator?.cancel()
        pressScaleAnimator?.cancel()
        val bgTarget = if (shown) 1f else 0f
        val scaleTarget = if (shown) PRESS_SCALE else 1f
        if (!animated || !Motion.animationsEnabled || !isAttachedToWindow) {
            pressBg = bgTarget
            scaleX = scaleTarget
            scaleY = scaleTarget
            invalidate()
            return
        }
        pressBgAnimator = ValueAnimator.ofFloat(pressBg, bgTarget).apply {
            duration = Motion.duration(PRESS_BG_MS)
            interpolator = EASE
            addUpdateListener {
                pressBg = it.animatedValue as Float
                invalidate()
            }
            start()
        }
        pressScaleAnimator = ValueAnimator.ofFloat(scaleX, scaleTarget).apply {
            duration = Motion.duration(PRESS_SCALE_MS)
            interpolator = PRESS_CURVE
            addUpdateListener {
                val value = it.animatedValue as Float
                scaleX = value
                scaleY = value
            }
            start()
        }
    }

    private fun updateDescription() {
        val current = model ?: return
        val chat = current.chat
        val parts = ArrayList<String>()
        parts.add(chat.title)
        if (current.typists.isNotEmpty()) {
            parts.add(if (chat.type == ChatType.GROUP) "${current.typists.joinToString(", ")} печатает" else "печатает")
        } else {
            val content = ChatPreview.of(chat, current.myUserId)
            parts.add(content.author + content.text)
        }
        if (timeText.isNotEmpty()) parts.add(timeText)
        if (chat.unreadCount > 0) parts.add("непрочитанных: ${chat.unreadCount}")
        if (chat.muted) parts.add("уведомления выключены")
        contentDescription = parts.joinToString(", ")
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.addAction(AccessibilityNodeInfo.AccessibilityAction(AccessibilityNodeInfo.ACTION_LONG_CLICK, "Меню чата"))
    }

    override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean {
        if (action == AccessibilityNodeInfo.ACTION_LONG_CLICK) return performLongClick()
        return super.performAccessibilityAction(action, arguments)
    }

    private fun px(dp: Float): Float = context.dp(dp)

    private object AvatarShadow {
        const val EXTENT = 92f
        const val OFFSET_Y = 8f
        private const val CORE = 32f
        private const val SIGMA = 10f
        private const val SCALE = 0.25f
        private var cached: Bitmap? = null
        private var cachedDensity = 0f

        fun bitmap(context: Context): Bitmap {
            val density = context.resources.displayMetrics.density
            val existing = cached
            if (existing != null && cachedDensity == density) return existing
            val scale = density * SCALE
            val side = ceil(EXTENT * scale).toInt()
            val result = Bitmap.createBitmap(side, side, Bitmap.Config.ALPHA_8)
            val sigmaPx = SIGMA * scale
            val radius = max(0.5f, (sigmaPx - 0.5f) / 0.57735f)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = FixedColors.avatarShadow
                maskFilter = BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL)
            }
            Canvas(result).drawCircle(side / 2f, side / 2f, CORE * scale / 2f, paint)
            cached = result
            cachedDensity = density
            return result
        }
    }

    private object ServiceLogo {
        private const val PADDING_SHARE = 0.1875f
        private var light: Bitmap? = null
        private var dark: Bitmap? = null
        private var mark: Bitmap? = null
        private val rect = RectF()

        fun draw(canvas: Canvas, context: Context, left: Float, top: Float, size: Float, paint: Paint) {
            val resources = context.resources
            val background = if (Theme.isDark) {
                dark ?: BitmapFactory.decodeResource(resources, R.drawable.logo_bg_dark).also { dark = it }
            } else {
                light ?: BitmapFactory.decodeResource(resources, R.drawable.logo_bg_light).also { light = it }
            }
            val foreground = mark ?: BitmapFactory.decodeResource(resources, R.drawable.logo_mark).also { mark = it }
            rect.set(left, top, left + size, top + size)
            canvas.drawBitmap(background, null, rect, paint)
            val inset = size * PADDING_SHARE
            rect.inset(inset, inset)
            canvas.drawBitmap(foreground, null, rect, paint)
        }
    }

    companion object {
        const val PAYLOAD_REBIND = "rebind"
        const val PAYLOAD_TIME = "time"

        private const val NAME_SIZE = 15.5f
        private const val TIME_SIZE = 12f
        private const val PREVIEW_SIZE = 14f
        private const val PREVIEW_EMOJI = 20f
        private const val PREVIEW_ICON = 14f
        private const val PREVIEW_ICON_GAP = 2f
        private const val BADGE_TEXT = 12f
        private const val BADGE_H = 22f
        private const val BADGE_PAD = 7f
        private const val BADGE_RADIUS = 11f
        private const val BADGE_ANGLE = 140f
        private const val BADGE_MUTED_ALPHA = 0.35f
        private const val MAX_BADGE = 99
        private const val PAD_X = 12f
        private const val AVATAR = 52f
        private const val TEXT_LEFT = PAD_X + AVATAR + 12f
        private const val GAP = 6f
        private const val ROW_GAP = 3f
        private const val ROW_RADIUS = 20f
        private const val CHECK_SIZE = 15f
        private const val OFFICIAL_SIZE = 15f
        private const val OFFICIAL_CHECK = 10f
        private const val OFFICIAL_GAP = 4f
        private const val META_ALPHA = 0.4f
        private const val PREVIEW_ALPHA = 0.45f
        private const val AUTHOR_ALPHA = 0.55f
        private const val ONLINE_SHARE = 0.24f
        private const val ONLINE_MIN = 11f
        private const val ONLINE_INSET = 1f
        private const val ONLINE_RING = 2.5f
        private const val ONLINE_MS = 150L
        private const val PRESS_BG_ALPHA = 0.09f
        private const val PRESS_SCALE = 0.965f
        private const val PRESS_BG_MS = 220L
        private const val PRESS_SCALE_MS = 340L
        private const val RELEASE_DELAY_MS = 64L
        const val LONG_PRESS_MS = 500L
        const val MOVE_CANCEL_DP = 10f
        private val LONG_PRESS_FEEDBACK = android.view.HapticFeedbackConstants.LONG_PRESS
        private val EASE = PathInterpolator(0.25f, 0.1f, 0.25f, 1f)
        private val PRESS_CURVE = PathInterpolator(0.22f, 1.4f, 0.4f, 1f)
    }
}
