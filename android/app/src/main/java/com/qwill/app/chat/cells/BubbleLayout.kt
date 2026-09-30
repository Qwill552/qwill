package com.qwill.app.chat.cells

import android.content.Context
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.CharacterStyle
import android.text.style.LineHeightSpan
import android.text.style.UpdateAppearance
import com.qwill.app.calls.CallText
import com.qwill.app.chat.DayLabel
import com.qwill.app.chat.LinkRange
import com.qwill.app.chat.TextLinks
import com.qwill.app.core.IsoTime
import com.qwill.app.emoji.Emoji
import com.qwill.app.emoji.EmojiEntry
import com.qwill.app.files.AttachmentCategory
import com.qwill.app.files.MediaTypes
import com.qwill.app.model.LocalAttachment
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageType
import com.qwill.app.search.Highlight
import com.qwill.app.search.HighlightRange
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Theme
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

enum class BubbleKind { TEXT, EMOJI, CALL, ANNOUNCEMENT }

enum class SendStatus { SENT, SENDING, FAILED }

class BubbleInput(
    val message: MessageDto,
    val own: Boolean,
    val showAuthor: Boolean,
    val status: SendStatus,
    val myId: String?,
    val rowWidth: Int,
    val versionCode: Int,
    val local: LocalAttachment? = null,
    val highlight: String? = null,
)

class LinkColorSpan(private val own: Boolean) : CharacterStyle(), UpdateAppearance {
    override fun updateDrawState(paint: TextPaint) {
        val palette = Theme.palette
        paint.color = if (own) palette.linkOut else palette.primary
    }
}

class SearchHitSpan(private val own: Boolean) : CharacterStyle(), UpdateAppearance {
    override fun updateDrawState(paint: TextPaint) {
        val palette = Theme.palette
        paint.color = if (own) palette.searchHitInkOut else palette.searchHitInk
    }
}

class ExactLineHeight(private val height: Int) : LineHeightSpan {
    override fun chooseHeight(text: CharSequence, start: Int, end: Int, spanstartv: Int, lineHeight: Int, fm: Paint.FontMetricsInt) {
        val content = fm.descent - fm.ascent
        val extra = height - content
        val above = extra / 2
        fm.ascent -= above
        fm.descent += extra - above
        fm.top = fm.ascent
        fm.bottom = fm.descent
    }
}

class TextLine(val text: CharSequence, val x: Float, val baseline: Float, val paint: TextPaint)

class MetaLayout(
    val edited: Boolean,
    val label: String,
    val icon: QwillIcon?,
    val failed: Boolean,
    val sending: Boolean,
    val width: Float,
    val height: Float,
    val editedWidth: Float,
    val labelWidth: Float,
) {
    var left = 0f
    var top = 0f
}

class ChipLayout(val emoji: String, val entry: EmojiEntry?, val count: Int, val mine: Boolean, val countText: String, val countWidth: Float) {
    val rect = RectF()
}

class QuoteLayout(val targetId: Long, val deleted: Boolean, val name: CharSequence, val text: CharSequence) {
    val rect = RectF()
    var nameBaseline = 0f
    var textBaseline = 0f
}

class StubLayout(val icon: QwillIcon, val label: CharSequence) {
    val rect = RectF()
    var labelBaseline = 0f
}

class CallLayout(
    val label: CharSequence,
    val symbol: QwillIcon,
    val failed: Boolean,
    val time: String,
    val duration: String?,
    val timeWidth: Float,
) {
    var labelBaseline = 0f
    var detailsCenter = 0f
    var phoneLeft = 0f
    var phoneTop = 0f
}

class AnnouncementLayout(
    val headerText: String,
    val headerHeight: Float,
    val title: TextLine,
    val subtitle: TextLine?,
    val items: List<Pair<StaticLayout, Float>>,
    val installed: TextLine?,
)

class BubbleLayout(
    val kind: BubbleKind,
    val own: Boolean,
    val bubbleWidth: Float,
    val bubbleHeight: Float,
    val contentLeft: Float,
    val author: TextLine?,
    val authorColorKey: String?,
    val forwarded: TextLine?,
    val forwardIconLeft: Float,
    val forwardIconTop: Float,
    val quote: QuoteLayout?,
    val stub: StubLayout?,
    val text: StaticLayout?,
    val textTop: Float,
    val links: List<LinkRange>,
    val emoji: List<EmojiEntry>,
    val emojiTop: Float,
    val chips: List<ChipLayout>,
    val meta: MetaLayout?,
    val metaInline: Boolean,
    val call: CallLayout?,
    val announcement: AnnouncementLayout?,
    val hits: List<HighlightRange> = emptyList(),
) {
    val hasBubble: Boolean get() = kind != BubbleKind.EMOJI
}

class BubblePaints(private val context: Context) {
    val density: Float get() = context.resources.displayMetrics.density
    var scale = BubbleScale(Theme.fontSize.base)
        private set

    val text = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val author = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val forwarded = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val quoteName = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val quoteText = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val meta = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val metaEdited = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val chipCount = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val chipFallback = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val body = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val caption = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val captionBold = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val bodyBold = TextPaint(Paint.ANTI_ALIAS_FLAG)
    val subtitle = TextPaint(Paint.ANTI_ALIAS_FLAG)
    private var appliedBase = -1f
    private var appliedDensity = -1f

    fun update() {
        val base = Theme.fontSize.base
        if (base == appliedBase && density == appliedDensity) return
        appliedBase = base
        appliedDensity = density
        scale = BubbleScale(base)
        val s = scale
        setup(text, Fonts.message(FontWeight.REGULAR), s.text)
        text.fontFeatureSettings = Fonts.MESSAGE_FEATURES
        setup(author, Fonts.display(FontWeight.SEMIBOLD), s.author)
        setup(forwarded, Fonts.display(FontWeight.REGULAR), s.author)
        forwarded.textSkewX = ITALIC_SKEW
        setup(quoteName, Fonts.display(FontWeight.SEMIBOLD), s.caption)
        setup(quoteText, Fonts.display(FontWeight.REGULAR), s.caption)
        setup(meta, Fonts.display(FontWeight.REGULAR), s.meta)
        setup(metaEdited, Fonts.display(FontWeight.REGULAR), s.meta)
        metaEdited.textSkewX = ITALIC_SKEW
        setup(chipCount, Fonts.display(FontWeight.SEMIBOLD), s.meta)
        chipCount.fontFeatureSettings = "'tnum' 1"
        setup(chipFallback, Fonts.display(FontWeight.REGULAR), BubbleGeometry.CHIP_EMOJI * CHIP_FALLBACK_SHARE)
        setup(body, Fonts.display(FontWeight.REGULAR), s.text)
        setup(bodyBold, Fonts.display(FontWeight.SEMIBOLD), s.text)
        setup(caption, Fonts.display(FontWeight.REGULAR), s.caption)
        setup(captionBold, Fonts.display(FontWeight.SEMIBOLD), s.caption)
        setup(subtitle, Fonts.display(FontWeight.REGULAR), s.meta2)
    }

    fun px(dp: Float): Float = dp * density

    private fun setup(paint: TextPaint, typeface: android.graphics.Typeface, sizeDp: Float) {
        paint.typeface = typeface
        paint.textSize = sizeDp * density
    }

    companion object {
        const val ITALIC_SKEW = -0.22f
        const val CHIP_FALLBACK_SHARE = 0.9f
    }
}

object BubbleLayouts {
    private const val FORWARD_ICON = 13f
    private const val FORWARD_GAP = 4f
    private const val BLOCK_GAP = 2f
    private const val QUOTE_PAD_Y = 3f
    private const val QUOTE_PAD_X = 8f
    private const val QUOTE_BAR = 3f
    private const val QUOTE_GAP = 1f
    private const val QUOTE_BOTTOM = 4f
    private const val STUB_H = 36f
    private const val STUB_ICON = 20f
    private const val STUB_GAP = 8f
    private const val STUB_BOTTOM = 4f
    private const val META_GAP = 3f
    private const val META_ICON = 15f
    private const val META_ICON_GAP = 1f
    private const val CALL_GAP = 16f
    private const val CALL_MIN_H = 34f
    private const val CALL_PHONE = 22f
    private const val CALL_SYMBOL = 15f
    private const val CALL_DETAILS_GAP = 4f
    private const val CALL_BODY_GAP = 2f
    private const val ANN_MIN_W = 258f
    private const val ANN_HEADER_PAD_Y = 7f
    private const val ANN_HEADER_ICON = 15f
    private const val ANN_HEADER_GAP = 8f
    private const val ANN_GAP = 4f
    private const val ANN_ITEM_GAP = 2f
    private const val ANN_ITEM_PAD = 4f
    private const val ANN_META_ROW = 13f
    const val NEWS_TITLE = "Что нового в Qwill"

    fun build(input: BubbleInput, paints: BubblePaints): BubbleLayout {
        paints.update()
        val message = input.message
        return when {
            message.announcement != null && message.deletedAt == null -> announcement(input, paints)
            message.type == MessageType.CALL && message.call != null && message.deletedAt == null -> call(input, paints)
            else -> emojiOnly(input, paints) ?: text(input, paints)
        }
    }

    fun metaFor(message: MessageDto, own: Boolean, status: SendStatus, paints: BubblePaints, showIcon: Boolean = own): MetaLayout {
        val edited = message.editedAt != null
        val failed = status == SendStatus.FAILED
        val label = if (failed) "не отправлено" else timeOf(message.createdAt)
        val icon = when {
            !showIcon || failed -> null
            status == SendStatus.SENDING -> QwillIcon.CLOCK
            else -> QwillIcon.CHECK
        }
        val editedWidth = if (edited) paints.metaEdited.measureText(EDITED) else 0f
        val labelWidth = paints.meta.measureText(label)
        var width = labelWidth
        if (edited) width += editedWidth + paints.px(META_GAP)
        if (icon != null) width += paints.px(META_GAP + META_ICON_GAP + META_ICON)
        val height = max(if (icon != null) paints.px(META_ICON) else 0f, paints.px(paints.scale.meta))
        return MetaLayout(edited, label, icon, failed, status == SendStatus.SENDING, width, height, editedWidth, labelWidth)
    }

    fun timeOf(iso: String): String = IsoTime.parse(iso)?.let { DayLabel.hourMinute(it) }.orEmpty()

    private fun emojiOnly(input: BubbleInput, paints: BubblePaints): BubbleLayout? {
        val message = input.message
        if (input.showAuthor || message.forwardedFrom != null || message.replyTo != null || message.attachment != null || message.deletedAt != null) return null
        if (input.local != null) return null
        val entries = BubbleGeometry.emojiOnly(message.content, Emoji.matcher) ?: return null
        val size = paints.px(paints.scale.emojiOnly)
        val gap = paints.px(BubbleGeometry.EMOJI_ONLY_GAP)
        val meta = metaFor(message, input.own, input.status, paints)
        val rowWidth = entries.size * (size + gap) + meta.width + paints.px(BubbleGeometry.META_GAP)
        val maxWidth = BubbleGeometry.maxBubbleWidth(input.rowWidth.toFloat())
        meta.left = rowWidth - meta.width
        meta.top = size - meta.height
        val chips = chipsOf(input, paints)
        var width = min(maxWidth, rowWidth)
        var height = size
        if (chips.isNotEmpty()) {
            val widths = FloatArray(chips.size) { chipWidth(chips[it], paints) }
            val flow = BubbleGeometry.flowChips(widths, maxWidth, paints.px(BubbleGeometry.CHIP_GAP), paints.px(BubbleGeometry.CHIP_H))
            val top = height + paints.px(BubbleGeometry.CHIP_TOP)
            placeChips(chips, flow, 0f, top, widths, paints)
            width = min(maxWidth, max(width, flow.width))
            height = top + flow.height
        }
        return BubbleLayout(
            kind = BubbleKind.EMOJI,
            own = input.own,
            bubbleWidth = width,
            bubbleHeight = height,
            contentLeft = 0f,
            author = null,
            authorColorKey = null,
            forwarded = null,
            forwardIconLeft = 0f,
            forwardIconTop = 0f,
            quote = null,
            stub = null,
            text = null,
            textTop = 0f,
            links = emptyList(),
            emoji = entries,
            emojiTop = 0f,
            chips = chips,
            meta = meta,
            metaInline = false,
            call = null,
            announcement = null,
        )
    }

    private fun text(input: BubbleInput, paints: BubblePaints): BubbleLayout {
        val message = input.message
        val scale = paints.scale
        val inset = paints.px(BubbleGeometry.PAD_X + BubbleGeometry.BORDER)
        val maxContent = BubbleGeometry.maxContentWidth(input.rowWidth.toFloat(), paints.density)
        val contentLeft = inset
        var natural = 0f

        val senderName = message.sender?.displayName.orEmpty()
        val showAuthor = input.showAuthor && message.sender != null
        val authorWidth = if (showAuthor) paints.author.measureText(senderName) else 0f
        natural = max(natural, authorWidth)

        val forwardLabel = message.forwardedFrom?.let { "Переслано от ${it.senderName}" }
        val forwardWidth = forwardLabel?.let { paints.px(FORWARD_ICON + FORWARD_GAP) + paints.forwarded.measureText(it) } ?: 0f
        natural = max(natural, forwardWidth)

        val reply = message.replyTo
        val replyText = reply?.let {
            when {
                it.deletedAt != null -> "Сообщение удалено"
                !it.content.isNullOrEmpty() -> it.content
                it.hasAttachment -> "Вложение"
                else -> ""
            }
        }
        val quoteChrome = paints.px(QUOTE_BAR + QUOTE_PAD_X * 2)
        if (reply != null) {
            val quoteWidth = quoteChrome + max(paints.quoteName.measureText(reply.senderName), paints.quoteText.measureText(singleLine(replyText.orEmpty())))
            natural = max(natural, quoteWidth)
        }

        val content = message.content.orEmpty()
        val hasText = content.isNotEmpty()
        val stubInfo = stubOf(message, input)
        val chips = chipsOf(input, paints)
        val meta = metaFor(message, input.own, input.status, paints)
        val metaInReactions = chips.isNotEmpty()
        val metaInStub = stubInfo != null && !hasText && !metaInReactions

        val stubLabelWidth = stubInfo?.let { paints.body.measureText(it.second) } ?: 0f
        if (stubInfo != null) {
            var stubWidth = paints.px(STUB_ICON + STUB_GAP) + stubLabelWidth
            if (metaInStub) stubWidth += paints.px(BubbleGeometry.META_GAP) + meta.width
            natural = max(natural, stubWidth)
        }

        var textLayout: StaticLayout? = null
        var textHeight = 0f
        var textWidth = 0f
        var lastLineWidth = 0f
        val links = if (hasText) TextLinks.ranges(content) else emptyList()
        val query = input.highlight
        val hits = if (hasText && !query.isNullOrBlank()) Highlight.ranges(content, query) else emptyList()
        if (hasText || stubInfo == null) {
            val layoutWidth = max(1, maxContent.toInt())
            val layout = textLayoutOf(content, links, hits, input.own, paints, layoutWidth)
            textLayout = layout
            val lines = layout.lineCount
            textHeight = layout.height.toFloat()
            for (line in 0 until lines) textWidth = max(textWidth, layout.getLineMax(line))
            lastLineWidth = if (content.isEmpty() || content.endsWith("\n")) 0f else layout.getLineWidth(lines - 1)
        }

        var extraLine = 0f
        if (textLayout != null && !metaInReactions) {
            val fit = BubbleGeometry.placeMeta(lastLineWidth, textWidth, meta.width, maxContent, paints.px(BubbleGeometry.META_GAP))
            natural = max(natural, fit.contentWidth)
            if (fit.extraLine) extraLine = paints.px(scale.line)
        } else if (textLayout != null) {
            natural = max(natural, textWidth)
        }

        var chipWidths = FloatArray(0)
        var reactionFit: ReactionRowFit? = null
        if (metaInReactions) {
            chipWidths = FloatArray(chips.size) { chipWidth(chips[it], paints) }
            val fit = BubbleGeometry.reactionRow(
                chipWidths,
                natural,
                meta.width,
                maxContent,
                paints.px(BubbleGeometry.CHIP_GAP),
                paints.px(BubbleGeometry.CHIP_H),
                paints.px(BubbleGeometry.REACTION_META_GAP),
                paints.px(BubbleGeometry.CHIP_TOP),
            )
            reactionFit = fit
            natural = max(natural, fit.contentWidth)
        }

        val contentWidth = min(maxContent, max(natural, 0f))
        var y = paints.px(BubbleGeometry.BORDER + BubbleGeometry.PAD_TOP)

        var author: TextLine? = null
        if (showAuthor) {
            val line = paints.px(scale.lineOf(scale.author))
            val shown = TextUtils.ellipsize(senderName, paints.author, contentWidth, TextUtils.TruncateAt.END)
            author = TextLine(shown, contentLeft, baselineIn(y, line, paints.author), paints.author)
            y += line + paints.px(BLOCK_GAP)
        }

        var forwarded: TextLine? = null
        var forwardIconLeft = 0f
        var forwardIconTop = 0f
        if (forwardLabel != null) {
            val line = paints.px(scale.lineOf(scale.author))
            val room = contentWidth - paints.px(FORWARD_ICON + FORWARD_GAP)
            val shown = TextUtils.ellipsize(forwardLabel, paints.forwarded, max(0f, room), TextUtils.TruncateAt.END)
            forwardIconLeft = contentLeft
            forwardIconTop = y + (line - paints.px(FORWARD_ICON)) / 2f
            forwarded = TextLine(shown, contentLeft + paints.px(FORWARD_ICON + FORWARD_GAP), baselineIn(y, line, paints.forwarded), paints.forwarded)
            y += line + paints.px(BLOCK_GAP)
        }

        var quote: QuoteLayout? = null
        if (reply != null) {
            val line = paints.px(scale.lineOf(scale.caption))
            val room = max(0f, contentWidth - quoteChrome)
            val name = TextUtils.ellipsize(reply.senderName, paints.quoteName, room, TextUtils.TruncateAt.END)
            val body = TextUtils.ellipsize(singleLine(replyText.orEmpty()), paints.quoteText, room, TextUtils.TruncateAt.END)
            val layout = QuoteLayout(reply.id, reply.deletedAt != null, name, body)
            val height = paints.px(QUOTE_PAD_Y * 2 + QUOTE_GAP) + line * 2
            layout.rect.set(contentLeft, y, contentLeft + contentWidth, y + height)
            val top = y + paints.px(QUOTE_PAD_Y)
            layout.nameBaseline = baselineIn(top, line, paints.quoteName)
            layout.textBaseline = baselineIn(top + line + paints.px(QUOTE_GAP), line, paints.quoteText)
            quote = layout
            y += height + paints.px(QUOTE_BOTTOM)
        }

        var stub: StubLayout? = null
        if (stubInfo != null) {
            val height = paints.px(STUB_H)
            var room = contentWidth - paints.px(STUB_ICON + STUB_GAP)
            if (metaInStub) room -= paints.px(BubbleGeometry.META_GAP) + meta.width
            val label = TextUtils.ellipsize(stubInfo.second, paints.body, max(0f, room), TextUtils.TruncateAt.END)
            val layout = StubLayout(stubInfo.first, label)
            layout.rect.set(contentLeft, y, contentLeft + contentWidth, y + height)
            layout.labelBaseline = y + height / 2f - (paints.body.ascent() + paints.body.descent()) / 2f
            stub = layout
            if (metaInStub) {
                meta.left = contentLeft + contentWidth - meta.width
                meta.top = y + (height - meta.height) / 2f
            }
            y += height
            if (textLayout != null) y += paints.px(STUB_BOTTOM)
        }

        val textTop = y
        if (textLayout != null) {
            y += textHeight + extraLine
            if (!metaInReactions) {
                meta.left = contentLeft + contentWidth - meta.width
                meta.top = y - meta.height
            }
        }

        if (reactionFit != null) {
            val rowTop = y
            placeChips(chips, reactionFit.flow, contentLeft, rowTop + paints.px(BubbleGeometry.CHIP_TOP), chipWidths, paints)
            y += reactionFit.chipsHeight
            meta.left = contentLeft + contentWidth - meta.width
            val metaBottom = y - (paints.px(BubbleGeometry.CHIP_H) - paints.px(scale.meta)) / 2f
            meta.top = metaBottom - meta.height
        }

        y += paints.px(BubbleGeometry.PAD_BOTTOM + BubbleGeometry.BORDER)
        val width = contentWidth + inset * 2
        return BubbleLayout(
            kind = BubbleKind.TEXT,
            own = input.own,
            bubbleWidth = width,
            bubbleHeight = y,
            contentLeft = contentLeft,
            author = author,
            authorColorKey = message.sender?.id,
            forwarded = forwarded,
            forwardIconLeft = forwardIconLeft,
            forwardIconTop = forwardIconTop,
            quote = quote,
            stub = stub,
            text = textLayout,
            textTop = textTop,
            links = links,
            emoji = emptyList(),
            emojiTop = 0f,
            chips = chips,
            meta = meta,
            metaInline = metaInReactions,
            call = null,
            announcement = null,
            hits = hits,
        )
    }

    private fun call(input: BubbleInput, paints: BubblePaints): BubbleLayout {
        val message = input.message
        val scale = paints.scale
        val callDto = message.call!!
        val inset = paints.px(BubbleGeometry.PAD_X + BubbleGeometry.BORDER)
        val maxContent = BubbleGeometry.maxContentWidth(input.rowWidth.toFloat(), paints.density)
        val label = CallText.statusLabel(callDto, input.own)
        val time = timeOf(message.createdAt)
        val duration = CallText.durationText(callDto)?.let { "· $it" }
        val timeWidth = paints.caption.measureText(time)
        var detailsWidth = paints.px(CALL_SYMBOL + CALL_DETAILS_GAP) + timeWidth
        if (duration != null) detailsWidth += paints.px(CALL_DETAILS_GAP) + paints.caption.measureText(duration)
        val bodyWidth = max(paints.body.measureText(label), detailsWidth)
        var natural = bodyWidth + paints.px(CALL_GAP + CALL_PHONE)
        val chips = chipsOf(input, paints)
        val chipWidths = FloatArray(chips.size) { chipWidth(chips[it], paints) }
        if (chips.isNotEmpty()) natural = max(natural, BubbleGeometry.singleLineWidth(chipWidths, paints.px(BubbleGeometry.CHIP_GAP)))
        val contentWidth = min(maxContent, natural)
        val labelLine = paints.px(scale.line)
        val detailsLine = max(paints.px(CALL_SYMBOL), paints.px(scale.lineOf(scale.caption)))
        val bodyHeight = labelLine + paints.px(CALL_BODY_GAP) + detailsLine
        val recordHeight = max(paints.px(CALL_MIN_H), bodyHeight)
        val top = paints.px(BubbleGeometry.BORDER + BubbleGeometry.PAD_TOP)
        val bodyTop = top + (recordHeight - bodyHeight) / 2f
        val room = contentWidth - paints.px(CALL_GAP + CALL_PHONE)
        val layout = CallLayout(
            label = TextUtils.ellipsize(label, paints.body, max(0f, room), TextUtils.TruncateAt.END),
            symbol = CallText.symbol(callDto, input.own),
            failed = CallText.isFailed(callDto),
            time = time,
            duration = duration,
            timeWidth = timeWidth,
        )
        layout.labelBaseline = baselineIn(bodyTop, labelLine, paints.body)
        layout.detailsCenter = bodyTop + labelLine + paints.px(CALL_BODY_GAP) + detailsLine / 2f
        layout.phoneLeft = inset + contentWidth - paints.px(CALL_PHONE)
        layout.phoneTop = top + (recordHeight - paints.px(CALL_PHONE)) / 2f
        var y = top + recordHeight
        if (chips.isNotEmpty()) {
            val flow = BubbleGeometry.flowChips(chipWidths, contentWidth, paints.px(BubbleGeometry.CHIP_GAP), paints.px(BubbleGeometry.CHIP_H))
            placeChips(chips, flow, inset, y + paints.px(BubbleGeometry.CHIP_TOP), chipWidths, paints)
            y += paints.px(BubbleGeometry.CHIP_TOP) + flow.height
        }
        y += paints.px(BubbleGeometry.PAD_BOTTOM + BubbleGeometry.BORDER)
        return BubbleLayout(
            kind = BubbleKind.CALL,
            own = input.own,
            bubbleWidth = contentWidth + inset * 2,
            bubbleHeight = y,
            contentLeft = inset,
            author = null,
            authorColorKey = null,
            forwarded = null,
            forwardIconLeft = 0f,
            forwardIconTop = 0f,
            quote = null,
            stub = null,
            text = null,
            textTop = 0f,
            links = emptyList(),
            emoji = emptyList(),
            emojiTop = 0f,
            chips = chips,
            meta = null,
            metaInline = false,
            call = layout,
            announcement = null,
        )
    }

    private fun announcement(input: BubbleInput, paints: BubblePaints): BubbleLayout {
        val message = input.message
        val scale = paints.scale
        val dto = message.announcement!!
        val inset = paints.px(BubbleGeometry.PAD_X + BubbleGeometry.BORDER)
        val maxContent = BubbleGeometry.maxContentWidth(input.rowWidth.toFloat(), paints.density)
        val version = dto.androidVersionName
        val headerText = if (version == null) NEWS_TITLE else "Версия $version"
        val titleText = if (version == null) NEWS_TITLE else "Новое обновление ($version)!"
        val code = dto.androidVersionCode
        val installed = code != null && input.versionCode >= code
        val meta = metaFor(message, own = false, status = SendStatus.SENT, paints = paints, showIcon = false)
        var natural = paints.px(ANN_HEADER_ICON + ANN_HEADER_GAP) + paints.captionBold.measureText(headerText)
        natural = max(natural, paints.bodyBold.measureText(titleText))
        if (dto.changelog.isNotEmpty()) natural = max(natural, paints.subtitle.measureText(SUBTITLE))
        val itemTexts = dto.changelog.map { "— $it" }
        for (item in itemTexts) natural = max(natural, paints.px(ANN_ITEM_PAD) + paints.body.measureText(item))
        if (installed) natural = max(natural, paints.caption.measureText(INSTALLED))
        natural = max(natural, meta.width)
        val contentWidth = min(maxContent, max(natural, min(paints.px(ANN_MIN_W), maxContent)))
        val border = paints.px(BubbleGeometry.BORDER)
        val headerLine = paints.px(scale.lineOf(scale.caption))
        val headerHeight = paints.px(ANN_HEADER_PAD_Y * 2) + headerLine + border
        var y = border + headerHeight + paints.px(ANN_GAP * 2)
        val titleLine = paints.px(scale.line)
        val title = TextLine(
            TextUtils.ellipsize(titleText, paints.bodyBold, contentWidth, TextUtils.TruncateAt.END),
            inset,
            baselineIn(y, titleLine, paints.bodyBold),
            paints.bodyBold,
        )
        y += titleLine
        var subtitle: TextLine? = null
        val items = ArrayList<Pair<StaticLayout, Float>>()
        if (itemTexts.isNotEmpty()) {
            y += paints.px(ANN_GAP)
            val line = paints.px(scale.lineOf(scale.meta2))
            subtitle = TextLine(SUBTITLE, inset, baselineIn(y, line, paints.subtitle), paints.subtitle)
            y += line + paints.px(ANN_GAP)
            val itemWidth = max(1, (contentWidth - paints.px(ANN_ITEM_PAD)).toInt())
            itemTexts.forEachIndexed { index, item ->
                if (index > 0) y += paints.px(ANN_ITEM_GAP)
                val layout = multiline(item, paints.body, itemWidth, paints.px(scale.line))
                items.add(layout to y)
                y += layout.height
            }
        }
        var installedLine: TextLine? = null
        if (installed) {
            y += paints.px(ANN_GAP * 2)
            val line = paints.px(scale.lineOf(scale.caption))
            installedLine = TextLine(INSTALLED, inset, baselineIn(y, line, paints.caption), paints.caption)
            y += line
        }
        y += paints.px(ANN_GAP)
        val metaRow = paints.px(ANN_META_ROW)
        meta.left = inset + contentWidth - meta.width
        meta.top = y + metaRow - meta.height
        y += metaRow
        val chips = chipsOf(input, paints)
        if (chips.isNotEmpty()) {
            val widths = FloatArray(chips.size) { chipWidth(chips[it], paints) }
            val flow = BubbleGeometry.flowChips(widths, contentWidth, paints.px(BubbleGeometry.CHIP_GAP), paints.px(BubbleGeometry.CHIP_H))
            placeChips(chips, flow, inset, y + paints.px(BubbleGeometry.CHIP_TOP), widths, paints)
            y += paints.px(BubbleGeometry.CHIP_TOP) + flow.height
        }
        y += paints.px(BubbleGeometry.PAD_BOTTOM + BubbleGeometry.BORDER)
        return BubbleLayout(
            kind = BubbleKind.ANNOUNCEMENT,
            own = false,
            bubbleWidth = contentWidth + inset * 2,
            bubbleHeight = y,
            contentLeft = inset,
            author = null,
            authorColorKey = null,
            forwarded = null,
            forwardIconLeft = 0f,
            forwardIconTop = 0f,
            quote = null,
            stub = null,
            text = null,
            textTop = 0f,
            links = emptyList(),
            emoji = emptyList(),
            emojiTop = 0f,
            chips = chips,
            meta = meta,
            metaInline = false,
            call = null,
            announcement = AnnouncementLayout(headerText, headerHeight, title, subtitle, items, installedLine),
        )
    }

    private fun stubOf(message: MessageDto, input: BubbleInput): Pair<QwillIcon, String>? {
        val local = input.local
        if (local != null) return iconOf(local.mimeType, local.peaks) to SENDING
        val attachment = message.attachment ?: return null
        return when (MediaTypes.categorize(attachment.file.mimeType, attachment.peaks)) {
            AttachmentCategory.PHOTO, AttachmentCategory.GIF -> QwillIcon.IMAGE to "Фото"
            AttachmentCategory.VIDEO -> QwillIcon.VIDEO to "Видео"
            AttachmentCategory.VOICE -> QwillIcon.MIC to "Голосовое сообщение"
            AttachmentCategory.AUDIO, AttachmentCategory.FILE -> QwillIcon.FILE to attachment.originalName.ifEmpty { "Файл" }
        }
    }

    private fun iconOf(mimeType: String, peaks: List<Double>?): QwillIcon = when (MediaTypes.categorize(mimeType, peaks)) {
        AttachmentCategory.PHOTO, AttachmentCategory.GIF -> QwillIcon.IMAGE
        AttachmentCategory.VIDEO -> QwillIcon.VIDEO
        AttachmentCategory.VOICE -> QwillIcon.MIC
        AttachmentCategory.AUDIO, AttachmentCategory.FILE -> QwillIcon.FILE
    }

    private fun chipsOf(input: BubbleInput, paints: BubblePaints): List<ChipLayout> {
        val message = input.message
        if (message.reactions.isEmpty() || message.id <= 0) return emptyList()
        val matcher = Emoji.matcher
        return message.reactions.filter { it.userIds.isNotEmpty() }.map { reaction ->
            val entry = matcher?.find(reaction.emoji)?.firstOrNull()?.takeIf { it.start == 0 && it.end == reaction.emoji.length }?.entry
            val count = reaction.userIds.size
            val countText = count.toString()
            ChipLayout(reaction.emoji, entry, count, input.myId != null && input.myId in reaction.userIds, countText, paints.chipCount.measureText(countText))
        }
    }

    private fun chipWidth(chip: ChipLayout, paints: BubblePaints): Float {
        val emojiWidth = if (chip.entry != null) paints.px(BubbleGeometry.CHIP_EMOJI) else max(paints.px(BubbleGeometry.CHIP_EMOJI), paints.chipFallback.measureText(chip.emoji))
        return paints.px(BubbleGeometry.BORDER * 2 + BubbleGeometry.CHIP_PAD_X * 2 + BubbleGeometry.CHIP_INNER_GAP) + emojiWidth + chip.countWidth
    }

    private fun placeChips(chips: List<ChipLayout>, flow: ChipFlow, left: Float, top: Float, widths: FloatArray, paints: BubblePaints) {
        val height = paints.px(BubbleGeometry.CHIP_H)
        for (index in chips.indices) {
            val x = left + flow.xs[index]
            val y = top + flow.ys[index]
            chips[index].rect.set(x, y, x + widths[index], y + height)
        }
    }

    private fun textLayoutOf(
        content: String,
        links: List<LinkRange>,
        hits: List<HighlightRange>,
        own: Boolean,
        paints: BubblePaints,
        width: Int,
    ): StaticLayout {
        val scale = paints.scale
        val replaced = Emoji.replace(content, paints.px(scale.emojiInline))
        val spannable = SpannableString(replaced)
        for (link in links) spannable.setSpan(LinkColorSpan(own), link.start, link.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        for (hit in hits) {
            val end = minOf(hit.end, spannable.length)
            if (hit.start < end) spannable.setSpan(SearchHitSpan(own), hit.start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        }
        spannable.setSpan(ExactLineHeight(ceil(paints.px(scale.line)).toInt()), 0, spannable.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
        return build(spannable, paints.text, width)
    }

    private fun multiline(text: String, paint: TextPaint, width: Int, lineHeight: Float): StaticLayout {
        val spannable = SpannableString(Emoji.replace(text, lineHeight))
        spannable.setSpan(ExactLineHeight(ceil(lineHeight).toInt()), 0, spannable.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
        return build(spannable, paint, width)
    }

    private fun build(text: CharSequence, paint: TextPaint, width: Int): StaticLayout {
        if (Build.VERSION.SDK_INT >= 23) {
            val builder = StaticLayout.Builder.obtain(text, 0, text.length, paint, width)
                .setIncludePad(false)
            if (Build.VERSION.SDK_INT >= 28) builder.setUseLineSpacingFromFallbacks(false)
            return builder.build()
        }
        @Suppress("DEPRECATION")
        return StaticLayout(text, paint, width, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false)
    }

    private fun singleLine(text: String): String = text.replace('\n', ' ')

    fun baselineIn(top: Float, lineHeight: Float, paint: Paint): Float {
        val ascent = paint.ascent()
        val descent = paint.descent()
        return top + (lineHeight - (descent - ascent)) / 2f - ascent
    }

    private const val EDITED = "изм."
    private const val SENDING = "Отправка…"
    private const val SUBTITLE = "Что изменилось:"
    private const val INSTALLED = "Уже установлено"
}
