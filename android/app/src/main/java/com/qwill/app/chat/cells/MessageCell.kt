package com.qwill.app.chat.cells

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.CornerPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.os.Bundle
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.QwillApplication
import com.qwill.app.chat.AuthorTint
import com.qwill.app.chat.FeedRow
import com.qwill.app.chat.LinkRange
import com.qwill.app.chat.selection.SelectionRules
import com.qwill.app.consent.CssGradient
import com.qwill.app.emoji.Emoji
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.LocalAttachment
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Palette
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.abs
import kotlin.math.max

class MessageCellModel(
    val row: FeedRow.Message,
    val showAuthor: Boolean,
    val group: Boolean,
    val showAvatar: Boolean,
    val read: Boolean,
    val status: SendStatus,
    val local: LocalAttachment?,
    val canReact: Boolean,
    val myId: String?,
    val sideLeft: Int,
    val sideRight: Int,
    val highlight: String? = null,
) {
    val key: String get() = row.key
}

interface MessageCellHost {
    val paints: BubblePaints

    fun layoutFor(model: MessageCellModel, rowWidth: Int): BubbleLayout

    fun flashStartedAt(key: String): Long

    fun onLinkClick(url: String)

    fun onQuoteClick(model: MessageCellModel)

    fun onReactionClick(model: MessageCellModel, emoji: String)

    val selectionActive: Boolean get() = false

    val selectionProgress: Float get() = 0f

    fun isSelected(messageId: Long): Boolean = false
}

class MessageCell(context: Context, private val host: MessageCellHost) : View(context) {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val emojiPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val gradientPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val linkPressPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val hitPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val bubbleRect = RectF()
    private val bubblePath = Path()
    private val rimPath = Path()
    private val scratchPath = Path()
    private val avatar = AvatarDrawable()
    private val avatarImage = ImageReceiver(this, QwillApplication.files.images)

    private var model: MessageCellModel? = null
    private var layout: BubbleLayout? = null
    private var pathFor: BubbleLayout? = null
    private var gradientWidth = -1f
    private var gradientHeight = -1f
    private var bubbleX = 0f
    private var bubbleY = 0f
    private var rowHeight = 0

    private var pressedLink: LinkRange? = null
    private var pressedQuote = false
    private var quoteFlashUntil = 0L
    private var pressedChip: String? = null
    private var downX = 0f
    private var downY = 0f
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

    private val chipCounts = HashMap<String, Int>()
    private val chipBumps = HashMap<String, Long>()
    private var chipsKey: String? = null
    private var bumpAnimator: ValueAnimator? = null

    private var checkKey: String? = null
    private var checked = false
    private var checkProgress = 0f
    private var checkAnimator: ValueAnimator? = null

    val key: String? get() = model?.key

    val boundModel: MessageCellModel? get() = model

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun bind(next: MessageCellModel) {
        val previous = model
        model = next
        trackReactionBumps(previous, next)
        val sender = next.row.message.sender
        if (next.showAvatar && sender != null) {
            avatar.set(sender.displayName, sender.avatarColor, sender.id, Fonts.message(FontWeight.BOLD))
            avatarImage.setImage(QwillApplication.files.avatarRequest(sender.avatarUrl), null, px(BubbleGeometry.AVATAR).toInt(), small = true)
        } else {
            avatarImage.setImage(null, null, 0, small = true)
        }
        syncSelection(animated = previous?.key == next.key)
        layout = null
        requestLayout()
        invalidate()
    }

    fun syncSelection(animated: Boolean) {
        val current = model ?: return
        val message = current.row.message
        val next = SelectionRules.selectable(message) && host.isSelected(message.id)
        val sameRow = checkKey == current.key
        checkKey = current.key
        if (next == checked && sameRow) return
        checked = next
        checkAnimator?.cancel()
        checkAnimator = null
        val target = if (next) 1f else 0f
        if (!animated || !sameRow || !Motion.animationsEnabled || !isAttachedToWindow) {
            checkProgress = target
            invalidate()
            return
        }
        val animator = ValueAnimator.ofFloat(checkProgress, target)
        animator.duration = Motion.duration(Motion.CHECK)
        animator.interpolator = Motion.easeScreen
        animator.addUpdateListener {
            checkProgress = it.animatedValue as Float
            invalidate()
        }
        checkAnimator = animator
        animator.start()
    }

    fun rebindLayout() {
        layout = null
        pathFor = null
        requestLayout()
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val current = model
        if (current == null || width <= 0) {
            setMeasuredDimension(width, px(BubbleGeometry.ROW_MIN + BubbleGeometry.ROW_GAP).toInt())
            return
        }
        val rowWidth = max(1, width - current.sideLeft - current.sideRight)
        val next = host.layoutFor(current, rowWidth)
        if (next !== layout) {
            layout = next
            updateDescription()
        }
        val density = resources.displayMetrics.density
        rowHeight = kotlin.math.ceil(BubbleGeometry.rowHeight(next.bubbleHeight, density)).toInt()
        bubbleY = BubbleGeometry.bubbleTop(next.bubbleHeight, density)
        bubbleX = if (current.row.own) {
            width - current.sideRight - next.bubbleWidth
        } else {
            current.sideLeft + if (current.group) px(BubbleGeometry.AVATAR) else 0f
        }
        setMeasuredDimension(width, rowHeight)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        pivotX = w / 2f
        pivotY = h / 2f
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        avatarImage.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        avatarImage.onDetach()
        clearPress()
        bumpAnimator?.cancel()
        bumpAnimator = null
        chipBumps.clear()
        checkAnimator?.cancel()
        checkAnimator = null
        checkProgress = if (checked) 1f else 0f
    }

    override fun onDraw(canvas: Canvas) {
        val current = model ?: return
        val bubble = layout ?: return
        val palette = Theme.palette
        val selection = host.selectionProgress
        drawSelectionHighlight(canvas, palette)
        drawFlash(canvas, current, palette)
        if (selection > 0f && SelectionRules.selectable(current.row.message)) drawCheckbox(canvas, current, bubble, selection, palette)
        val shift = shiftX(current)
        if (shift != 0f) {
            canvas.save()
            canvas.translate(shift, 0f)
        }
        if (current.showAvatar && current.row.message.sender != null) drawAvatar(canvas, bubble)
        val save = canvas.save()
        canvas.translate(bubbleX, bubbleY)
        if (bubble.kind == BubbleKind.EMOJI) {
            drawEmojiOnly(canvas, bubble, current, palette)
        } else {
            drawBubble(canvas, bubble, current, palette)
            drawContent(canvas, bubble, current, palette)
        }
        canvas.restoreToCount(save)
        if (shift != 0f) canvas.restore()
    }

    private fun shiftX(current: MessageCellModel): Float = if (current.row.own) 0f else px(CHECK_SHIFT) * host.selectionProgress

    private fun drawSelectionHighlight(canvas: Canvas, palette: Palette) {
        if (checkProgress <= 0f) return
        fillPaint.shader = null
        fillPaint.color = palette.primarySoft
        fillPaint.alpha = (android.graphics.Color.alpha(palette.primarySoft) * checkProgress).toInt().coerceIn(0, 255)
        rect.set(0f, 0f, width.toFloat(), rowHeight - px(BubbleGeometry.ROW_GAP))
        canvas.drawRoundRect(rect, px(FLASH_RADIUS), px(FLASH_RADIUS), fillPaint)
    }

    private fun drawCheckbox(canvas: Canvas, current: MessageCellModel, bubble: BubbleLayout, progress: Float, palette: Palette) {
        val size = px(CHECK_SIZE)
        val left = current.sideLeft + px(CHECK_LEFT) - px(CHECK_SHIFT) * (1f - progress)
        val cx = left + size / 2f
        val cy = bubbleY + bubble.bubbleHeight - px(CHECK_BOTTOM) - size / 2f
        val radius = size / 2f
        val ring = px(CHECK_RING)
        fillPaint.shader = null
        fillPaint.color = blend(palette.surface, palette.primary, checkProgress)
        canvas.drawCircle(cx, cy, radius, fillPaint)
        strokePaint.pathEffect = null
        strokePaint.strokeWidth = ring
        strokePaint.color = blend(palette.border, palette.primary, checkProgress)
        canvas.drawCircle(cx, cy, radius - ring / 2f, strokePaint)
        if (checkProgress > 0f) {
            val icon = px(CHECK_ICON)
            QwillIcon.CHECK.draw(canvas, cx - icon / 2f, cy - icon / 2f, icon, withAlpha(palette.textOnPrimary, checkProgress), iconPaint)
        }
    }

    private fun blend(from: Int, to: Int, share: Float): Int {
        val t = share.coerceIn(0f, 1f)
        fun channel(shift: Int): Int {
            val a = (from ushr shift) and 0xFF
            val b = (to ushr shift) and 0xFF
            return (a + (b - a) * t).toInt() and 0xFF
        }
        return (channel(24) shl 24) or (channel(16) shl 16) or (channel(8) shl 8) or channel(0)
    }

    private fun drawFlash(canvas: Canvas, current: MessageCellModel, palette: Palette) {
        val started = host.flashStartedAt(current.key)
        if (started <= 0L) return
        val duration = Motion.duration(Motion.FLASH)
        if (duration <= 0L) return
        val progress = (SystemClock.uptimeMillis() - started).toFloat() / duration
        if (progress >= 1f || progress < 0f) return
        val alpha = if (progress < FLASH_HOLD) 1f else 1f - Motion.easeScreen.getInterpolation((progress - FLASH_HOLD) / (1f - FLASH_HOLD))
        fillPaint.shader = null
        fillPaint.color = palette.primarySoft
        fillPaint.alpha = (alpha * 255f).toInt().coerceIn(0, 255)
        rect.set(0f, 0f, width.toFloat(), rowHeight - px(BubbleGeometry.ROW_GAP))
        canvas.drawRoundRect(rect, px(FLASH_RADIUS), px(FLASH_RADIUS), fillPaint)
        postInvalidateOnAnimation()
    }

    private fun drawAvatar(canvas: Canvas, bubble: BubbleLayout) {
        val current = model ?: return
        val size = px(BubbleGeometry.AVATAR)
        val left = current.sideLeft.toFloat()
        val top = bubbleY + bubble.bubbleHeight - size
        avatar.draw(canvas, left, top, size)
        rect.set(left, top, left + size, top + size)
        avatarImage.draw(canvas, rect, size / 2f)
    }

    private fun ensurePath(bubble: BubbleLayout) {
        if (pathFor === bubble) return
        pathFor = bubble
        val big = px(BubbleGeometry.RADIUS)
        val small = px(BubbleGeometry.RADIUS_TAIL)
        bubbleRect.set(0f, 0f, bubble.bubbleWidth, bubble.bubbleHeight)
        bubblePath.reset()
        bubblePath.addRoundRect(bubbleRect, BubbleShadows.radii(bubble.own, big, small), Path.Direction.CW)
        val inset = px(BubbleGeometry.BORDER)
        val rim = inset + px(RIM) / 2f
        rimPath.reset()
        val innerBig = big - inset
        rimPath.arcTo(RectF(rim, rim, rim + innerBig * 2, rim + innerBig * 2), 225f, 45f, true)
        rimPath.lineTo(bubble.bubbleWidth - rim - innerBig, rim)
        rimPath.arcTo(RectF(bubble.bubbleWidth - rim - innerBig * 2, rim, bubble.bubbleWidth - rim, rim + innerBig * 2), 270f, 45f, false)
    }

    private fun drawBubble(canvas: Canvas, bubble: BubbleLayout, current: MessageCellModel, palette: Palette) {
        ensurePath(bubble)
        val own = bubble.own
        BubbleShadows.draw(canvas, BubbleShadows.of(own, resources.displayMetrics.density), bubbleRect, shadowPaint)
        if (own) {
            if (gradientWidth != bubble.bubbleWidth || gradientHeight != bubble.bubbleHeight) {
                val line = CssGradient.linear(OUT_ANGLE, bubble.bubbleWidth, bubble.bubbleHeight)
                gradientPaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, OUT_FROM, OUT_TO, Shader.TileMode.CLAMP)
                gradientWidth = bubble.bubbleWidth
                gradientHeight = bubble.bubbleHeight
            }
            canvas.drawPath(bubblePath, gradientPaint)
        } else {
            fillPaint.shader = null
            fillPaint.color = if (palette.isDark) palette.messageIn else palette.pulseBubble
            canvas.drawPath(bubblePath, fillPaint)
        }
        val border = px(BubbleGeometry.BORDER)
        strokePaint.strokeWidth = border
        strokePaint.pathEffect = null
        strokePaint.color = if (own) OUT_BORDER else palette.pulseBubbleBorder
        val save = canvas.save()
        canvas.scale(
            (bubble.bubbleWidth - border) / bubble.bubbleWidth,
            (bubble.bubbleHeight - border) / bubble.bubbleHeight,
            bubble.bubbleWidth / 2f,
            bubble.bubbleHeight / 2f,
        )
        canvas.drawPath(bubblePath, strokePaint)
        canvas.restoreToCount(save)
        strokePaint.strokeWidth = px(RIM)
        strokePaint.strokeCap = Paint.Cap.BUTT
        strokePaint.color = withAlpha(palette.pulseGlass, if (own) OUT_RIM else IN_RIM)
        canvas.drawPath(rimPath, strokePaint)
        if (current.status == SendStatus.FAILED) {
            strokePaint.strokeWidth = border
            strokePaint.color = palette.danger
            val grow = canvas.save()
            canvas.scale(
                (bubble.bubbleWidth + border) / bubble.bubbleWidth,
                (bubble.bubbleHeight + border) / bubble.bubbleHeight,
                bubble.bubbleWidth / 2f,
                bubble.bubbleHeight / 2f,
            )
            canvas.drawPath(bubblePath, strokePaint)
            canvas.restoreToCount(grow)
        }
    }

    private fun textColor(own: Boolean, palette: Palette): Int = if (own) palette.textOnOut else palette.pulseInk

    private fun drawContent(canvas: Canvas, bubble: BubbleLayout, current: MessageCellModel, palette: Palette) {
        val own = bubble.own
        val ink = textColor(own, palette)
        bubble.author?.let { line ->
            line.paint.color = bubble.authorColorKey?.let { AuthorTint.of(it) } ?: palette.primary
            drawLine(canvas, line)
        }
        bubble.forwarded?.let { line ->
            val color = if (own) withAlpha(palette.textOnOut, FORWARD_OUT_ALPHA) else palette.primary
            line.paint.color = color
            QwillIcon.FORWARD.draw(canvas, bubble.forwardIconLeft, bubble.forwardIconTop, px(FORWARD_ICON), color, iconPaint)
            drawLine(canvas, line)
        }
        bubble.quote?.let { drawQuote(canvas, it, own, palette) }
        bubble.stub?.let { stub ->
            val color = withAlpha(ink, STUB_ALPHA)
            val size = px(STUB_ICON)
            stub.icon.draw(canvas, stub.rect.left, stub.rect.centerY() - size / 2f, size, color, iconPaint)
            host.paints.body.color = color
            canvas.drawText(stub.label, 0, stub.label.length, stub.rect.left + size + px(STUB_GAP), stub.labelBaseline, host.paints.body)
        }
        bubble.text?.let { text ->
            host.paints.text.color = ink
            val save = canvas.save()
            canvas.translate(bubble.contentLeft, bubble.textTop)
            drawSearchHits(canvas, text, bubble, own, palette)
            pressedLink?.let { drawLinkPress(canvas, text, it, own, palette) }
            text.draw(canvas)
            drawUnderlines(canvas, text, bubble.links, own, palette)
            canvas.restoreToCount(save)
        }
        bubble.call?.let { drawCall(canvas, it, bubble, own, palette) }
        bubble.announcement?.let { drawAnnouncement(canvas, it, bubble, palette) }
        drawChips(canvas, bubble, own, palette)
        bubble.meta?.let { meta ->
            val color = when {
                bubble.kind == BubbleKind.ANNOUNCEMENT -> withAlpha(palette.pulseInk, IN_META_ALPHA)
                bubble.metaInline -> withAlpha(ink, INLINE_META_ALPHA)
                own -> withAlpha(palette.textOnOut, OUT_META_ALPHA)
                else -> withAlpha(palette.pulseInk, IN_META_ALPHA)
            }
            drawMeta(canvas, meta, color, current, palette)
        }
    }

    private fun drawLine(canvas: Canvas, line: TextLine) {
        canvas.drawText(line.text, 0, line.text.length, line.x, line.baseline, line.paint)
    }

    private fun drawQuote(canvas: Canvas, quote: QuoteLayout, own: Boolean, palette: Palette) {
        val bar = if (own) palette.textOnOut else palette.primary
        val flashing = pressedQuote || SystemClock.uptimeMillis() < quoteFlashUntil
        val base = if (own) OUT_QUOTE_BG else IN_QUOTE_BG
        fillPaint.shader = null
        fillPaint.color = withAlpha(if (own) FixedColors.lift else palette.primary, if (flashing) base * 2f else base)
        val radius = px(QUOTE_RADIUS)
        canvas.drawRoundRect(quote.rect, radius, radius, fillPaint)
        val save = canvas.save()
        canvas.clipRect(quote.rect.left, quote.rect.top, quote.rect.left + px(QUOTE_BAR), quote.rect.bottom)
        fillPaint.color = bar
        canvas.drawRoundRect(quote.rect, radius, radius, fillPaint)
        canvas.restoreToCount(save)
        val textLeft = quote.rect.left + px(QUOTE_BAR + QUOTE_PAD_X)
        val paints = host.paints
        paints.quoteName.color = bar
        canvas.drawText(quote.name, 0, quote.name.length, textLeft, quote.nameBaseline, paints.quoteName)
        paints.quoteText.color = if (own) withAlpha(palette.textOnOut, FORWARD_OUT_ALPHA) else palette.textSecondary
        canvas.drawText(quote.text, 0, quote.text.length, textLeft, quote.textBaseline, paints.quoteText)
        if (flashing && !pressedQuote) postInvalidateDelayed(QUOTE_FLASH_MS)
    }

    private fun drawSearchHits(canvas: Canvas, text: android.text.StaticLayout, bubble: BubbleLayout, own: Boolean, palette: Palette) {
        if (bubble.hits.isEmpty()) return
        hitPaint.color = if (own) palette.searchHitBgOut else palette.searchHitBg
        if (hitPaint.pathEffect == null) hitPaint.pathEffect = CornerPathEffect(px(HIT_RADIUS))
        for (hit in bubble.hits) {
            scratchPath.reset()
            text.getSelectionPath(hit.start, minOf(hit.end, text.text.length), scratchPath)
            canvas.drawPath(scratchPath, hitPaint)
        }
    }

    private fun drawLinkPress(canvas: Canvas, text: android.text.StaticLayout, link: LinkRange, own: Boolean, palette: Palette) {
        scratchPath.reset()
        text.getSelectionPath(link.start, link.end, scratchPath)
        linkPressPaint.color = withAlpha(if (own) palette.linkOut else palette.primary, LINK_PRESS_ALPHA)
        linkPressPaint.pathEffect = CornerPathEffect(px(LINK_PRESS_RADIUS))
        canvas.drawPath(scratchPath, linkPressPaint)
    }

    private fun drawUnderlines(canvas: Canvas, text: android.text.StaticLayout, links: List<LinkRange>, own: Boolean, palette: Palette) {
        if (links.isEmpty()) return
        fillPaint.shader = null
        fillPaint.color = if (own) palette.linkOut else palette.primary
        val thickness = px(UNDERLINE)
        val offset = px(UNDERLINE_OFFSET)
        for (link in links) {
            val first = text.getLineForOffset(link.start)
            val last = text.getLineForOffset(max(link.start, link.end - 1))
            for (line in first..last) {
                val lineStart = max(link.start, text.getLineStart(line))
                val lineEnd = minOf(link.end, text.getLineEnd(line))
                if (lineEnd <= lineStart) continue
                val x1 = text.getPrimaryHorizontal(lineStart)
                val x2 = if (lineEnd >= text.getLineEnd(line)) text.getLineRight(line) else text.getPrimaryHorizontal(lineEnd)
                val y = text.getLineBaseline(line) + offset
                canvas.drawRect(minOf(x1, x2), y, max(x1, x2), y + thickness, fillPaint)
            }
        }
    }

    private fun drawCall(canvas: Canvas, call: CallLayout, bubble: BubbleLayout, own: Boolean, palette: Palette) {
        val paints = host.paints
        paints.body.color = textColor(own, palette)
        canvas.drawText(call.label, 0, call.label.length, bubble.contentLeft, call.labelBaseline, paints.body)
        val secondary = if (own) withAlpha(palette.textOnOut, CALL_OUT_ALPHA) else palette.textSecondary
        val symbolSize = px(CALL_SYMBOL)
        var x = bubble.contentLeft
        call.symbol.draw(canvas, x, call.detailsCenter - symbolSize / 2f, symbolSize, if (call.failed) palette.danger else secondary, iconPaint)
        x += symbolSize + px(CALL_GAP)
        paints.caption.color = secondary
        val baseline = call.detailsCenter - (paints.caption.ascent() + paints.caption.descent()) / 2f
        canvas.drawText(call.time, x, baseline, paints.caption)
        call.duration?.let { canvas.drawText(it, x + call.timeWidth + px(CALL_GAP), baseline, paints.caption) }
        QwillIcon.PHONE.draw(canvas, call.phoneLeft, call.phoneTop, px(CALL_PHONE), if (own) palette.textOnOut else palette.primary, iconPaint)
    }

    private fun drawAnnouncement(canvas: Canvas, announcement: AnnouncementLayout, bubble: BubbleLayout, palette: Palette) {
        val paints = host.paints
        val border = px(BubbleGeometry.BORDER)
        val headerBottom = border + announcement.headerHeight
        fillPaint.shader = null
        fillPaint.color = palette.pulseBubbleBorder
        canvas.drawRect(border, headerBottom - border, bubble.bubbleWidth - border, headerBottom, fillPaint)
        val center = border + (announcement.headerHeight - border) / 2f
        val icon = px(ANN_ICON)
        QwillIcon.RETRY.draw(canvas, bubble.contentLeft, center - icon / 2f, icon, palette.primary, iconPaint)
        paints.captionBold.color = palette.primary
        val headerBaseline = center - (paints.captionBold.ascent() + paints.captionBold.descent()) / 2f
        canvas.drawText(announcement.headerText, bubble.contentLeft + icon + px(ANN_ICON_GAP), headerBaseline, paints.captionBold)
        announcement.title.paint.color = palette.pulseInk
        drawLine(canvas, announcement.title)
        announcement.subtitle?.let {
            it.paint.color = palette.textSecondary
            drawLine(canvas, it)
        }
        paints.body.color = palette.pulseInk
        for ((layout, top) in announcement.items) {
            val save = canvas.save()
            canvas.translate(bubble.contentLeft + px(ANN_ITEM_PAD), top)
            layout.draw(canvas)
            canvas.restoreToCount(save)
        }
        announcement.installed?.let {
            it.paint.color = palette.textSecondary
            drawLine(canvas, it)
        }
    }

    private fun drawChips(canvas: Canvas, bubble: BubbleLayout, own: Boolean, palette: Palette) {
        if (bubble.chips.isEmpty()) return
        val paints = host.paints
        val now = SystemClock.uptimeMillis()
        var animating = false
        for (chip in bubble.chips) {
            val r = chip.rect
            val bump = chipBumps[chip.emoji]
            var scale = 1f
            if (bump != null) {
                val duration = Motion.duration(Motion.REACTION)
                val progress = if (duration <= 0) 1f else (now - bump).toFloat() / duration
                if (progress >= 1f) {
                    chipBumps.remove(chip.emoji)
                } else {
                    scale = bumpScale(progress.coerceIn(0f, 1f))
                    animating = true
                }
            }
            val save = canvas.save()
            if (scale != 1f) canvas.scale(scale, scale, r.centerX(), r.centerY())
            val radius = r.height() / 2f
            fillPaint.shader = null
            fillPaint.color = palette.surface3
            canvas.drawRoundRect(r, radius, radius, fillPaint)
            if (chip.mine) {
                strokePaint.strokeWidth = px(BubbleGeometry.BORDER)
                strokePaint.color = palette.primary
                val half = px(BubbleGeometry.BORDER) / 2f
                rect.set(r.left + half, r.top + half, r.right - half, r.bottom - half)
                canvas.drawRoundRect(rect, radius - half, radius - half, strokePaint)
            }
            val emojiSize = px(BubbleGeometry.CHIP_EMOJI)
            val emojiLeft = r.left + px(BubbleGeometry.BORDER + BubbleGeometry.CHIP_PAD_X)
            var countLeft = emojiLeft + emojiSize + px(BubbleGeometry.CHIP_INNER_GAP)
            val entry = chip.entry
            if (entry != null) {
                rect.set(emojiLeft, r.centerY() - emojiSize / 2f, emojiLeft + emojiSize, r.centerY() + emojiSize / 2f)
                Emoji.draw(canvas, entry, rect, emojiPaint)
            } else {
                val fallback = paints.chipFallback
                fallback.color = palette.pulseInk
                val width = fallback.measureText(chip.emoji)
                canvas.drawText(chip.emoji, emojiLeft, r.centerY() - (fallback.ascent() + fallback.descent()) / 2f, fallback)
                countLeft = emojiLeft + max(emojiSize, width) + px(BubbleGeometry.CHIP_INNER_GAP)
            }
            paints.chipCount.color = if (chip.mine) palette.primary else palette.textSecondary
            val baseline = r.centerY() - (paints.chipCount.ascent() + paints.chipCount.descent()) / 2f
            canvas.drawText(chip.countText, countLeft, baseline, paints.chipCount)
            canvas.restoreToCount(save)
        }
        if (animating) postInvalidateOnAnimation()
    }

    private fun bumpScale(progress: Float): Float = if (progress < BUMP_PEAK_AT) {
        BUMP_PEAK * Motion.easeSpring.getInterpolation(progress / BUMP_PEAK_AT)
    } else {
        BUMP_PEAK + (1f - BUMP_PEAK) * Motion.easeSpring.getInterpolation((progress - BUMP_PEAK_AT) / (1f - BUMP_PEAK_AT))
    }

    private fun drawMeta(canvas: Canvas, meta: MetaLayout, baseColor: Int, current: MessageCellModel, palette: Palette) {
        val paints = host.paints
        var color = if (meta.failed) palette.danger else baseColor
        if (meta.sending) color = withAlpha(color, ((color ushr 24) / 255f) * PENDING_ALPHA)
        val center = meta.top + meta.height / 2f
        var x = meta.left
        if (meta.edited) {
            paints.metaEdited.color = color
            canvas.drawText(EDITED, x, center - (paints.metaEdited.ascent() + paints.metaEdited.descent()) / 2f, paints.metaEdited)
            x += meta.editedWidth + px(META_GAP)
        }
        paints.meta.color = color
        canvas.drawText(meta.label, x, center - (paints.meta.ascent() + paints.meta.descent()) / 2f, paints.meta)
        x += meta.labelWidth
        val icon = meta.icon ?: return
        x += px(META_GAP + META_ICON_GAP)
        val size = px(META_ICON)
        val shown = if (icon == QwillIcon.CHECK && current.read) QwillIcon.CHECK_DOUBLE else icon
        shown.draw(canvas, x, center - size / 2f, size, color, iconPaint)
    }

    private fun drawEmojiOnly(canvas: Canvas, bubble: BubbleLayout, current: MessageCellModel, palette: Palette) {
        val size = px(host.paints.scale.emojiOnly)
        val gap = px(BubbleGeometry.EMOJI_ONLY_GAP)
        var x = 0f
        for (entry in bubble.emoji) {
            rect.set(x, bubble.emojiTop, x + size, bubble.emojiTop + size)
            Emoji.draw(canvas, entry, rect, emojiPaint)
            x += size + gap
        }
        drawChips(canvas, bubble, false, palette)
        bubble.meta?.let { drawMeta(canvas, it, withAlpha(palette.pulseInk, IN_META_ALPHA), current, palette) }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val bubble = layout ?: return false
        val current = model ?: return false
        if (host.selectionActive) {
            clearPress()
            return false
        }
        val x = event.x - bubbleX - shiftX(current)
        val y = event.y - bubbleY
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                clearPress()
                downX = event.x
                downY = event.y
                val link = linkAt(bubble, x, y)
                if (link != null) {
                    pressedLink = link
                    invalidate()
                    return true
                }
                val quote = bubble.quote
                if (quote != null && !quote.deleted && quote.rect.contains(x, y)) {
                    pressedQuote = true
                    invalidate()
                    return true
                }
                if (current.canReact) {
                    val chip = bubble.chips.firstOrNull { hitChip(it.rect, x, y) }
                    if (chip != null) {
                        pressedChip = chip.emoji
                        return true
                    }
                }
                return false
            }
            MotionEvent.ACTION_MOVE -> {
                if (abs(event.x - downX) > touchSlop || abs(event.y - downY) > touchSlop) {
                    clearPress()
                    return false
                }
                return true
            }
            MotionEvent.ACTION_UP -> {
                val link = pressedLink
                val quote = pressedQuote
                val chip = pressedChip
                clearPress()
                when {
                    link != null -> {
                        playSoundEffect(android.view.SoundEffectConstants.CLICK)
                        host.onLinkClick(link.href)
                    }
                    quote -> {
                        quoteFlashUntil = SystemClock.uptimeMillis() + QUOTE_FLASH_MS
                        invalidate()
                        playSoundEffect(android.view.SoundEffectConstants.CLICK)
                        host.onQuoteClick(current)
                    }
                    chip != null -> host.onReactionClick(current, chip)
                    else -> return false
                }
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                clearPress()
                return false
            }
        }
        return false
    }

    private fun clearPress() {
        if (pressedLink == null && !pressedQuote && pressedChip == null) return
        pressedLink = null
        pressedQuote = false
        pressedChip = null
        invalidate()
    }

    private fun hitChip(chip: RectF, x: Float, y: Float): Boolean {
        val extra = max(0f, (px(TAP_MIN) - chip.height()) / 2f)
        return x >= chip.left && x <= chip.right && y >= chip.top - extra && y <= chip.bottom + extra
    }

    private fun linkAt(bubble: BubbleLayout, x: Float, y: Float): LinkRange? {
        val text = bubble.text ?: return null
        if (bubble.links.isEmpty()) return null
        val localX = x - bubble.contentLeft
        val localY = y - bubble.textTop
        if (localY < 0 || localY > text.height) return null
        val line = text.getLineForVertical(localY.toInt())
        if (localX < text.getLineLeft(line) || localX > text.getLineRight(line)) return null
        val offset = text.getOffsetForHorizontal(line, localX)
        return bubble.links.firstOrNull { offset >= it.start && offset < it.end }
    }

    private fun trackReactionBumps(previous: MessageCellModel?, next: MessageCellModel) {
        val reactions = next.row.message.reactions
        if (previous?.key != next.key || chipsKey != next.key) {
            chipsKey = next.key
            chipCounts.clear()
            chipBumps.clear()
            for (reaction in reactions) chipCounts[reaction.emoji] = reaction.userIds.size
            return
        }
        val now = SystemClock.uptimeMillis()
        val seen = HashSet<String>()
        for (reaction in reactions) {
            val count = reaction.userIds.size
            seen.add(reaction.emoji)
            val before = chipCounts[reaction.emoji] ?: 0
            if (count > before && Motion.animationsEnabled) chipBumps[reaction.emoji] = now
            chipCounts[reaction.emoji] = count
        }
        chipCounts.keys.retainAll(seen)
    }

    private fun updateDescription() {
        val current = model ?: return
        val message = current.row.message
        val parts = ArrayList<String>()
        if (!current.row.own) message.sender?.displayName?.let { parts.add(it) }
        val body = when {
            message.call != null -> com.qwill.app.calls.CallText.statusLabel(message.call, current.row.own)
            message.announcement != null -> BubbleLayouts.NEWS_TITLE
            else -> message.content.orEmpty()
        }
        if (body.isNotEmpty()) parts.add(body)
        parts.add(BubbleLayouts.timeOf(message.createdAt))
        if (current.row.own) {
            parts.add(
                when (current.status) {
                    SendStatus.SENDING -> "отправляется"
                    SendStatus.FAILED -> "не отправлено"
                    SendStatus.SENT -> if (current.read) "прочитано" else "отправлено"
                },
            )
        }
        contentDescription = parts.joinToString(", ")
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        val current = model
        if (host.selectionActive && current != null && SelectionRules.selectable(current.row.message)) {
            info.isCheckable = true
            info.isChecked = checked
            return
        }
        val bubble = layout ?: return
        val quote = bubble.quote
        if (quote != null && !quote.deleted) info.addAction(AccessibilityNodeInfo.AccessibilityAction(ACTION_QUOTE, "Перейти к цитате"))
        bubble.links.forEachIndexed { index, link ->
            info.addAction(AccessibilityNodeInfo.AccessibilityAction(ACTION_LINK_BASE + index, "Открыть ссылку ${link.href}"))
        }
    }

    override fun performAccessibilityAction(action: Int, arguments: Bundle?): Boolean {
        val bubble = layout
        val current = model
        if (bubble != null && current != null) {
            if (action == ACTION_QUOTE && bubble.quote != null) {
                host.onQuoteClick(current)
                return true
            }
            val index = action - ACTION_LINK_BASE
            if (index >= 0 && index < bubble.links.size) {
                host.onLinkClick(bubble.links[index].href)
                return true
            }
        }
        return super.performAccessibilityAction(action, arguments)
    }

    private fun px(dp: Float): Float = dp * resources.displayMetrics.density

    companion object {
        private const val OUT_ANGLE = 140f
        private val OUT_FROM = (217 shl 24) or (77 shl 16) or (141 shl 8) or 255
        private val OUT_TO = (204 shl 24) or (150 shl 16) or (88 shl 8) or 255
        private val OUT_BORDER = (89 shl 24) or (180 shl 16) or (200 shl 8) or 255
        private const val OUT_RIM = 0.25f
        private const val IN_RIM = 0.10f
        private const val RIM = 1f
        private const val FORWARD_ICON = 13f
        private const val FORWARD_OUT_ALPHA = 0.82f
        private const val STUB_ICON = 20f
        private const val STUB_GAP = 8f
        private const val STUB_ALPHA = 0.72f
        private const val QUOTE_RADIUS = 10f
        private const val QUOTE_BAR = 3f
        private const val QUOTE_PAD_X = 8f
        private const val IN_QUOTE_BG = 0.10f
        private const val OUT_QUOTE_BG = 0.16f
        private const val QUOTE_FLASH_MS = 120L
        private const val LINK_PRESS_ALPHA = 0.2f
        private const val LINK_PRESS_RADIUS = 4f
        private const val HIT_RADIUS = 4f
        private const val UNDERLINE = 1f
        private const val UNDERLINE_OFFSET = 2f
        private const val CALL_SYMBOL = 15f
        private const val CALL_GAP = 4f
        private const val CALL_PHONE = 22f
        private const val CALL_OUT_ALPHA = 0.78f
        private const val ANN_ICON = 15f
        private const val ANN_ICON_GAP = 8f
        private const val ANN_ITEM_PAD = 4f
        private const val IN_META_ALPHA = 0.4f
        private const val OUT_META_ALPHA = 0.85f
        private const val INLINE_META_ALPHA = 0.75f
        private const val PENDING_ALPHA = 0.7f
        private const val META_GAP = 3f
        private const val META_ICON = 15f
        private const val META_ICON_GAP = 1f
        private const val EDITED = "изм."
        private const val FLASH_HOLD = 0.55f
        private const val FLASH_RADIUS = 10f
        private const val CHECK_SHIFT = 35f
        private const val CHECK_LEFT = 8f
        private const val CHECK_BOTTOM = 8f
        private const val CHECK_SIZE = 21f
        private const val CHECK_RING = 2f
        private const val CHECK_ICON = 13f
        private const val TAP_MIN = 44f
        private const val BUMP_PEAK = 1.25f
        private const val BUMP_PEAK_AT = 0.6f
        private const val ACTION_QUOTE = 0x7f0a0001
        private const val ACTION_LINK_BASE = 0x7f0a0100
    }
}
