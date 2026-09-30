package com.qwill.app.chat.search

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.QwillApplication
import com.qwill.app.chat.bottom.DockCapsule
import com.qwill.app.emoji.Emoji
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.GroupMemberDTO
import com.qwill.app.search.Highlight
import com.qwill.app.search.PressableView
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.glass.SharedBlur
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class MemberSuggestionsView(context: Context) : FrameLayout(context) {
    var onPick: ((GroupMemberDTO) -> Unit)? = null
    var screenHeight = 0
    var baseShift = 0f
        set(value) {
            if (field == value) return
            field = value
            translationY = value + context.dp(RISE) * (1f - shown)
        }

    private val capsule = DockCapsule(this, RADIUS)
    private val list = RecyclerView(context)
    private val adapter = Adapter()
    private var members: List<GroupMemberDTO> = emptyList()
    private var query = ""
    private var target = false
    private var shown = 0f
    private var animator: ValueAnimator? = null

    var blur: SharedBlur?
        get() = capsule.blur
        set(value) {
            capsule.blur = value
        }

    init {
        setWillNotDraw(false)
        clipChildren = false
        list.layoutManager = LinearLayoutManager(context)
        list.adapter = adapter
        list.itemAnimator = null
        list.overScrollMode = View.OVER_SCROLL_NEVER
        list.isVerticalScrollBarEnabled = false
        addView(list, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        visibility = View.GONE
        alpha = 0f
    }

    fun setMembers(next: List<GroupMemberDTO>, filter: String, show: Boolean, animated: Boolean) {
        val changed = next != members || filter != query
        members = next
        query = filter
        if (changed) {
            adapter.notifyDataSetChanged()
            list.scrollToPosition(0)
            requestLayout()
        }
        setVisible(show && next.isNotEmpty(), animated)
    }

    fun refresh() {
        adapter.notifyDataSetChanged()
        invalidate()
    }

    private fun setVisible(show: Boolean, animated: Boolean) {
        if (show == target) return
        target = show
        animator?.cancel()
        animator = null
        if (show) visibility = View.VISIBLE
        val to = if (show) 1f else 0f
        if (!animated || !Motion.animationsEnabled || !isShown && !show) {
            apply(to)
            return
        }
        animator = ValueAnimator.ofFloat(shown, to).apply {
            duration = Motion.duration(if (show) Motion.MENU else Motion.CLOSE)
            interpolator = if (show) Motion.easeScreen else Motion.easeClose
            addUpdateListener { apply(it.animatedValue as Float) }
            addListener(object : android.animation.AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: android.animation.Animator) {
                    if (animator === animation) animator = null
                }
            })
            start()
        }
    }

    private fun apply(value: Float) {
        shown = value
        alpha = value
        translationY = baseShift + context.dp(RISE) * (1f - value)
        if (value <= 0f && !target) visibility = View.GONE
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val row = context.dp(ROW)
        val cap = min(row * VISIBLE_ROWS, screenHeight * SCREEN_SHARE)
        val height = min(cap, row * members.size).coerceAtLeast(0f).roundToInt()
        super.onMeasure(widthMeasureSpec, MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY))
    }

    override fun dispatchDraw(canvas: Canvas) {
        capsule.draw(canvas)
        val save = canvas.save()
        capsule.clip(canvas)
        super.dispatchDraw(canvas)
        canvas.restoreToCount(save)
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        animator?.cancel()
        animator = null
        apply(if (target) 1f else 0f)
    }

    private inner class Adapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun getItemCount(): Int = members.size

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            val row = MemberRowView(parent.context)
            row.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dp(ROW).roundToInt())
            return object : RecyclerView.ViewHolder(row) {}
        }

        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            val member = members[position]
            val row = holder.itemView as MemberRowView
            row.bind(member, query)
            row.onTap = { onPick?.invoke(member) }
        }
    }

    companion object {
        private const val RADIUS = 20f
        private const val ROW = 48f
        private const val VISIBLE_ROWS = 3.5f
        private const val SCREEN_SHARE = 0.22f
        private const val RISE = 8f
    }
}

class MemberRowView(context: Context) : PressableView(context) {
    private val namePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.MEDIUM)
        textSize = context.dp(NAME_SIZE)
    }
    private val handlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.message(FontWeight.REGULAR)
        textSize = context.dp(HANDLE_SIZE)
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val avatar = AvatarDrawable()
    private val image = ImageReceiver(this, QwillApplication.files.images)
    private var member: GroupMemberDTO? = null
    private var query = ""
    private var nameLayout: StaticLayout? = null
    private var handleText: CharSequence = ""
    private var laidOutWidth = -1

    override val pressScale: Float get() = 1f
    override val pressBgMs: Long get() = Motion.TAB
    override val pressScaleMs: Long get() = Motion.MENU

    fun bind(next: GroupMemberDTO, filter: String) {
        member = next
        query = filter
        avatar.set(next.displayName.ifEmpty { next.username }, next.avatarColor, next.userId, Fonts.message(FontWeight.BOLD))
        image.setImage(QwillApplication.files.avatarRequest(next.avatarUrl), null, context.dp(AVATAR).roundToInt(), small = true)
        contentDescription = "${next.displayName}, @${next.username}"
        laidOutWidth = -1
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        image.onDetach()
    }

    private fun layoutText() {
        val current = member ?: return
        laidOutWidth = width
        val palette = Theme.palette
        namePaint.color = palette.pulseInk
        handlePaint.color = withAlpha(palette.pulseInk, SOFT_ALPHA)
        val left = context.dp(PAD_X + AVATAR + GAP)
        val room = max(0f, width - left - context.dp(PAD_X))
        val name = Highlight.apply(Emoji.replace(current.displayName, context.dp(NAME_EMOJI)), query, palette.primary, Fonts.message(FontWeight.SEMIBOLD))
        val nameShown = TextUtils.ellipsize(name, namePaint, room * NAME_SHARE, TextUtils.TruncateAt.END)
        nameLayout = singleLine(nameShown, namePaint)
        val nameWidth = nameLayout?.getLineWidth(0) ?: 0f
        val handleRoom = max(0f, room - nameWidth - context.dp(HANDLE_GAP))
        handleText = TextUtils.ellipsize("@${current.username}", handlePaint, handleRoom, TextUtils.TruncateAt.END)
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
        if (member == null) return
        if (laidOutWidth != width) layoutText()
        val palette = Theme.palette
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
        val name = nameLayout ?: return
        val textLeft = left + size + context.dp(GAP)
        val nameTop = (height - name.height) / 2f
        val save = canvas.save()
        canvas.translate(textLeft, nameTop)
        name.draw(canvas)
        canvas.restoreToCount(save)
        handlePaint.color = withAlpha(palette.pulseInk, SOFT_ALPHA)
        val baseline = nameTop + name.getLineBaseline(0)
        canvas.drawText(handleText, 0, handleText.length, textLeft + name.getLineWidth(0) + context.dp(HANDLE_GAP), baseline, handlePaint)
    }

    private companion object {
        const val PAD_X = 12f
        const val AVATAR = 32f
        const val GAP = 12f
        const val NAME_SIZE = 15f
        const val NAME_EMOJI = 18f
        const val HANDLE_SIZE = 12.5f
        const val HANDLE_GAP = 6f
        const val NAME_SHARE = 0.7f
        const val SOFT_ALPHA = 0.45f
        const val PRESS_BG = 0.06f
        const val FOCUS_BG = 0.08f
    }
}
