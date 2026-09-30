package com.qwill.app.chat.search

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
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.QwillApplication
import com.qwill.app.chat.DayLabel
import com.qwill.app.chats.EmptyStateView
import com.qwill.app.core.IsoTime
import com.qwill.app.emoji.Emoji
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.MessageDto
import com.qwill.app.search.Highlight
import com.qwill.app.search.PressableView
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.QwillIcon
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

class ChatSearchListView(context: Context) : FrameLayout(context) {
    var onSelect: ((Int) -> Unit)? = null
    var onLoadMore: (() -> Unit)? = null
    var onReveal: ((Float) -> Unit)? = null
    var onScrolledBy: ((Int) -> Unit)? = null

    val list = RecyclerView(context)
    private val empty = EmptyStateView(context)
    private val searching = TextView(context)
    private val adapter = Adapter()
    private val maskPaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
    private var maskKey = -1f
    private var results: List<MessageDto> = emptyList()
    private var query = ""
    private var current = 0
    private var loadingMore = false
    private var myId: String? = null
    private var reveal = 0f
    private var revealTarget = false
    private var headerBottom = 0f
    private var animator: ValueAnimator? = null

    val revealed: Float get() = reveal

    val opening: Boolean get() = revealTarget

    init {
        setWillNotDraw(false)
        visibility = View.GONE
        isClickable = true
        list.layoutManager = LinearLayoutManager(context)
        list.adapter = adapter
        list.itemAnimator = null
        list.clipToPadding = false
        list.overScrollMode = View.OVER_SCROLL_NEVER
        list.isVerticalScrollBarEnabled = false
        list.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                onScrolledBy?.invoke(dy)
                checkLoadMore()
            }
        })
        addView(list, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        empty.setTexts("Ничего не нашлось", "Попробуйте другой запрос")
        empty.visibility = View.GONE
        addView(empty, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP))
        searching.text = ChatSearchText.SEARCHING
        searching.gravity = Gravity.CENTER
        searching.typeface = Fonts.display(FontWeight.REGULAR)
        searching.setTextSize(TypedValue.COMPLEX_UNIT_DIP, HINT_SIZE)
        searching.visibility = View.GONE
        addView(searching, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT, Gravity.TOP))
        applyTheme()
    }

    fun setInsets(top: Int, bottom: Int) {
        headerBottom = top.toFloat()
        list.setPadding(0, top, 0, bottom)
        (empty.layoutParams as LayoutParams).topMargin = top + context.dpInt(EMPTY_TOP)
        (searching.layoutParams as LayoutParams).topMargin = top + context.dpInt(EMPTY_TOP)
        empty.requestLayout()
        searching.requestLayout()
    }

    fun setData(next: List<MessageDto>, filter: String, index: Int, loading: Boolean, more: Boolean, me: String?) {
        val previous = results
        val previousIndex = current
        val appended = previous.isNotEmpty() && next.size > previous.size && next.subList(0, previous.size) == previous && filter == query
        val footerBefore = loadingMore && previous.isNotEmpty()
        results = next
        query = filter
        current = index
        loadingMore = more
        myId = me
        val footerAfter = loadingMore && next.isNotEmpty()
        when {
            appended -> {
                if (footerBefore) adapter.notifyItemRemoved(previous.size)
                adapter.notifyItemRangeInserted(previous.size, next.size - previous.size)
                if (footerAfter) adapter.notifyItemInserted(next.size)
                if (previousIndex != index) {
                    changedRow(previousIndex)
                    changedRow(index)
                }
            }
            previous === next || previous == next -> {
                if (footerBefore != footerAfter) {
                    if (footerAfter) adapter.notifyItemInserted(next.size) else adapter.notifyItemRemoved(next.size)
                }
                if (previousIndex != index) {
                    changedRow(previousIndex)
                    changedRow(index)
                }
            }
            else -> adapter.notifyDataSetChanged()
        }
        empty.visibility = if (next.isEmpty() && !loading) View.VISIBLE else View.GONE
        searching.visibility = if (next.isEmpty() && loading) View.VISIBLE else View.GONE
        if (!appended && previous != next) list.scrollToPosition(0)
    }

    private fun changedRow(position: Int) {
        if (position in results.indices) adapter.notifyItemChanged(position)
    }

    override fun onInterceptTouchEvent(ev: android.view.MotionEvent): Boolean = !revealTarget || super.onInterceptTouchEvent(ev)

    fun applyTheme() {
        val palette = Theme.palette
        empty.applyTheme()
        searching.setTextColor(palette.textSecondary)
        adapter.notifyDataSetChanged()
        invalidate()
    }

    fun setOpen(open: Boolean, animated: Boolean) {
        if (open == revealTarget) return
        revealTarget = open
        isClickable = open
        animator?.cancel()
        animator = null
        if (open) {
            visibility = View.VISIBLE
            list.scrollToPosition(maxOf(0, current - SCROLL_CONTEXT))
        }
        val target = if (open) 1f else 0f
        if (!animated || !Motion.animationsEnabled) {
            setReveal(target)
            if (!open) visibility = View.GONE
            return
        }
        val next = ValueAnimator.ofFloat(reveal, target)
        next.duration = Motion.duration(if (open) Motion.SCREEN else Motion.CLOSE)
        next.interpolator = if (open) Motion.easeScreen else Motion.easeClose
        next.addUpdateListener { setReveal(it.animatedValue as Float) }
        next.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (animator === animation) animator = null
                if (!cancelled && !open) visibility = View.GONE
            }
        })
        animator = next
        next.start()
    }

    private fun setReveal(value: Float) {
        reveal = value
        invalidate()
        onReveal?.invoke(value)
    }

    private fun checkLoadMore() {
        if (results.isEmpty()) return
        val remaining = list.computeVerticalScrollRange() - list.computeVerticalScrollOffset() - list.computeVerticalScrollExtent()
        if (remaining < context.dp(LOAD_AHEAD)) onLoadMore?.invoke()
    }

    override fun draw(canvas: Canvas) {
        if (reveal >= 1f || width == 0 || height == 0) {
            super.draw(canvas)
            return
        }
        if (reveal <= 0f) return
        val feather = context.dp(FEATHER)
        val edge = headerBottom + (height + feather - headerBottom) * reveal
        if (maskKey != edge) {
            maskKey = edge
            maskPaint.shader = LinearGradient(0f, edge - feather, 0f, edge, Color.BLACK, Color.TRANSPARENT, Shader.TileMode.CLAMP)
        }
        val save = canvas.saveLayer(0f, 0f, width.toFloat(), height.toFloat(), null)
        super.draw(canvas)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), maskPaint)
        canvas.restoreToCount(save)
    }

    override fun onDraw(canvas: Canvas) {
        canvas.drawColor(Theme.palette.bg)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
        animator = null
        reveal = if (revealTarget) 1f else 0f
        visibility = if (revealTarget) View.VISIBLE else View.GONE
    }

    private inner class Adapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun getItemCount(): Int = results.size + if (loadingMore && results.isNotEmpty()) 1 else 0

        override fun getItemViewType(position: Int): Int = if (position < results.size) TYPE_ROW else TYPE_FOOTER

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            val view: View = if (viewType == TYPE_ROW) {
                ChatSearchRowView(parent.context)
            } else {
                TextView(parent.context).apply {
                    text = ChatSearchText.SEARCHING
                    gravity = Gravity.CENTER
                    typeface = Fonts.display(FontWeight.REGULAR)
                    setTextSize(TypedValue.COMPLEX_UNIT_DIP, HINT_SIZE)
                    val pad = context.dpInt(FOOTER_PAD)
                    setPadding(pad, pad, pad, pad)
                }
            }
            view.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            return object : RecyclerView.ViewHolder(view) {}
        }

        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            val view = holder.itemView
            if (view is ChatSearchRowView) {
                val message = results[position]
                view.bind(message, query, message.sender?.id == myId && myId != null, position == current)
                view.onTap = { onSelect?.invoke(position) }
            } else if (view is TextView) {
                view.setTextColor(Theme.palette.textSecondary)
            }
        }
    }

    private companion object {
        const val TYPE_ROW = 0
        const val TYPE_FOOTER = 1
        const val FEATHER = 28f
        const val LOAD_AHEAD = 600f
        const val HINT_SIZE = 14f
        const val EMPTY_TOP = 32f
        const val FOOTER_PAD = 16f
        const val SCROLL_CONTEXT = 2
    }
}

class ChatSearchRowView(context: Context) : PressableView(context) {
    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.MEDIUM)
        textSize = context.dp(NAME_SIZE)
    }
    private val datePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = context.dp(DATE_SIZE)
    }
    private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = context.dp(TEXT_SIZE)
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)
    private var message: MessageDto? = null
    private var query = ""
    private var own = false
    private var active = false
    private var date = ""
    private var name: CharSequence = ""
    private var snippet: StaticLayout? = null
    private var laidOutWidth = -1
    private var laidOutDark: Boolean? = null

    override val pressScale: Float get() = 1f
    override val pressBgMs: Long get() = Motion.TAB
    override val pressScaleMs: Long get() = Motion.MENU

    fun bind(next: MessageDto, filter: String, mine: Boolean, current: Boolean) {
        message = next
        query = filter
        own = mine
        active = current
        val sender = next.sender
        avatar.set(sender?.displayName?.ifEmpty { null } ?: FALLBACK, sender?.avatarColor, sender?.id ?: next.id.toString(), Fonts.message(FontWeight.BOLD))
        image.setImage(QwillApplication.files.avatarRequest(sender?.avatarUrl), null, context.dp(AVATAR).roundToInt(), small = true)
        date = IsoTime.parse(next.createdAt)?.let { DayLabel.attachmentDateTime(it) }.orEmpty()
        contentDescription = listOf(senderName(next), date, previewOf(next)).filter { it.isNotEmpty() }.joinToString(", ")
        isSelected = current
        laidOutWidth = -1
        invalidate()
    }

    private fun senderName(message: MessageDto): String = message.sender?.displayName?.ifEmpty { null } ?: DELETED

    private fun previewOf(message: MessageDto): String {
        val content = message.content
        if (!content.isNullOrEmpty()) return content.replace('\n', ' ')
        return if (message.attachment != null) ATTACHMENT else MESSAGE
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val lines = namePaint.fontMetrics.let { it.descent - it.ascent } + context.dp(LINE_GAP) + textPaint.fontMetrics.let { it.descent - it.ascent }
        val height = max(context.dp(MIN_H), max(context.dp(AVATAR), lines) + context.dp(PAD_Y * 2))
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), ceil(height).toInt())
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
    }

    private fun textLeft(): Float = context.dp(PAD_X + AVATAR + GAP)

    private fun layoutText() {
        val current = message ?: return
        val palette = Theme.palette
        laidOutWidth = width
        laidOutDark = palette.isDark
        val room = max(0f, width - textLeft() - context.dp(PAD_X))
        var nameRoom = room - datePaint.measureText(date) - context.dp(NAME_GAP)
        if (own) nameRoom -= context.dp(CHECK + NAME_GAP)
        name = TextUtils.ellipsize(Emoji.replace(senderName(current), context.dp(NAME_EMOJI)), namePaint, max(0f, nameRoom), TextUtils.TruncateAt.END)
        val preview = previewOf(current)
        textPaint.color = palette.textSecondary
        val text = Emoji.replace(preview, context.dp(TEXT_EMOJI))
        val highlighted = if (current.content.isNullOrEmpty()) text else Highlight.apply(text, query, palette.primary, Fonts.message(FontWeight.SEMIBOLD))
        val shown = TextUtils.ellipsize(highlighted, textPaint, room, TextUtils.TruncateAt.END)
        snippet = singleLine(shown, textPaint)
    }

    private fun singleLine(text: CharSequence, paint: TextPaint): StaticLayout {
        val width = ceil(max(1f, Layout.getDesiredWidth(text, paint))).toInt()
        if (Build.VERSION.SDK_INT >= 23) {
            return StaticLayout.Builder.obtain(text, 0, text.length, paint, width).setMaxLines(1).setIncludePad(false).build()
        }
        @Suppress("DEPRECATION")
        return StaticLayout(text, paint, width, Layout.Alignment.ALIGN_NORMAL, 1f, 0f, false)
    }

    override fun onDraw(canvas: Canvas) {
        if (message == null) return
        val palette = Theme.palette
        if (laidOutWidth != width || laidOutDark != palette.isDark) layoutText()
        if (active) {
            fillPaint.color = withAlpha(palette.primary, ACTIVE_BG)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fillPaint)
        }
        if (pressBg > 0f || isFocused) {
            fillPaint.color = withAlpha(palette.pulseInk, if (isFocused) FOCUS_BG else PRESS_BG * pressBg)
            canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), fillPaint)
        }
        val size = context.dp(AVATAR)
        val left = context.dp(PAD_X)
        val top = (height - size) / 2f
        avatar.draw(canvas, left, top, size)
        rect.set(left, top, left + size, top + size)
        image.draw(canvas, rect, size / 2f)
        val textLeft = textLeft()
        val nameLine = namePaint.fontMetrics.let { it.descent - it.ascent }
        val textLine = textPaint.fontMetrics.let { it.descent - it.ascent }
        val blockTop = (height - nameLine - context.dp(LINE_GAP) - textLine) / 2f
        val nameBaseline = blockTop - namePaint.fontMetrics.ascent
        namePaint.color = palette.pulseInk
        canvas.drawText(name, 0, name.length, textLeft, nameBaseline, namePaint)
        var x = textLeft + namePaint.measureText(name, 0, name.length)
        if (own) {
            x += context.dp(NAME_GAP)
            val check = context.dp(CHECK)
            QwillIcon.CHECK.draw(canvas, x, blockTop + (nameLine - check) / 2f, check, palette.textTertiary, iconPaint)
        }
        datePaint.color = palette.textSecondary
        canvas.drawText(date, width - context.dp(PAD_X) - datePaint.measureText(date), nameBaseline, datePaint)
        val layout = snippet ?: return
        val save = canvas.save()
        canvas.translate(textLeft, blockTop + nameLine + context.dp(LINE_GAP))
        layout.draw(canvas)
        canvas.restoreToCount(save)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.isSelected = active
    }

    private companion object {
        const val MIN_H = 60f
        const val PAD_X = 16f
        const val PAD_Y = 8f
        const val AVATAR = 44f
        const val GAP = 13f
        const val NAME_SIZE = 15f
        const val DATE_SIZE = 12f
        const val TEXT_SIZE = 14f
        const val NAME_EMOJI = 18f
        const val TEXT_EMOJI = 17f
        const val LINE_GAP = 2f
        const val NAME_GAP = 8f
        const val CHECK = 15f
        const val ACTIVE_BG = 0.12f
        const val PRESS_BG = 0.06f
        const val FOCUS_BG = 0.08f
        const val FALLBACK = "?"
        const val DELETED = "Удалённый аккаунт"
        const val ATTACHMENT = "Вложение"
        const val MESSAGE = "Сообщение"
    }
}
