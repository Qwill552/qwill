package com.qwill.app.chat.top

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.TextPaint
import android.text.TextUtils
import android.view.MotionEvent
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import com.qwill.app.QwillApplication
import com.qwill.app.core.plural
import com.qwill.app.files.ImageReceiver
import com.qwill.app.model.CallDto
import com.qwill.app.ui.AvatarDrawable
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.max

class GroupCallBannerView(context: Context, private val onJoin: () -> Unit) : View(context) {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val labelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = Fonts.display(FontWeight.SEMIBOLD) }
    private val rect = RectF()
    private val avatars = List(AVATAR_LIMIT) { AvatarDrawable() }
    private val images = List(AVATAR_LIMIT) { ImageReceiver(this, QwillApplication.files.images) }
    private var shownAvatars = 0
    private var count = 0
    private var joinPressed = false
    private var attached = false

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
    }

    fun setCall(call: CallDto) {
        val active = call.activeParticipants
        count = active.size
        shownAvatars = minOf(AVATAR_LIMIT, active.size)
        for (index in 0 until AVATAR_LIMIT) {
            val user = active.getOrNull(index)?.user
            if (user == null) {
                images[index].setImage(null, null, 0, small = true)
                continue
            }
            avatars[index].set(user.displayName.ifEmpty { "?" }, user.avatarColor, user.id, Fonts.message(FontWeight.BOLD))
            images[index].setImage(QwillApplication.files.avatarRequest(user.avatarUrl), null, context.dpInt(AVATAR), small = true)
        }
        contentDescription = "Идёт звонок, $count ${plural(count, "участник", "участника", "участников")}"
        invalidate()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), context.dpInt(ChatTopLayout.CALL_BANNER))
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attached = true
        for (image in images) image.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        attached = false
        for (image in images) image.onDetach()
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        val hairline = context.dp(BORDER)
        val radius = height / 2f
        fillPaint.color = palette.cardBg
        rect.set(0f, 0f, width.toFloat(), height.toFloat())
        canvas.drawRoundRect(rect, radius, radius, fillPaint)
        strokePaint.strokeWidth = hairline
        strokePaint.color = palette.cardBorder
        rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
        canvas.drawRoundRect(rect, radius - hairline / 2f, radius - hairline / 2f, strokePaint)
        val ring = context.dp(RING)
        val size = context.dp(AVATAR)
        val step = size + ring * 2 - context.dp(OVERLAP)
        var x = hairline + context.dp(PAD_LEFT)
        val cy = height / 2f
        for (index in 0 until shownAvatars) {
            val boxLeft = x + index * step
            fillPaint.color = palette.cardBg
            canvas.drawCircle(boxLeft + ring + size / 2f, cy, size / 2f + ring, fillPaint)
            val left = boxLeft + ring
            val top = cy - size / 2f
            avatars[index].draw(canvas, left, top, size)
            rect.set(left, top, left + size, top + size)
            images[index].draw(canvas, rect, size / 2f)
        }
        if (shownAvatars > 0) x += step * (shownAvatars - 1) + size + ring * 2 + context.dp(GAP)
        val join = context.dp(JOIN)
        val joinRight = width - hairline - context.dp(PAD)
        val joinLeft = joinRight - join
        labelPaint.textSize = context.dp(Theme.textSize(TextScale.META))
        labelPaint.color = palette.textPrimary
        val room = max(0f, joinLeft - context.dp(GAP) - x)
        val label = TextUtils.ellipsize("Идёт звонок · $count", labelPaint, room, TextUtils.TruncateAt.END)
        canvas.drawText(label, 0, label.length, x, cy - (labelPaint.ascent() + labelPaint.descent()) / 2f, labelPaint)
        fillPaint.color = palette.online
        canvas.drawCircle(joinLeft + join / 2f, cy, join / 2f, fillPaint)
        if (joinPressed) {
            fillPaint.color = withAlpha(palette.textOnPrimary, PRESSED_ALPHA)
            canvas.drawCircle(joinLeft + join / 2f, cy, join / 2f, fillPaint)
        }
        val icon = context.dp(JOIN_ICON)
        QwillIcon.PHONE.draw(canvas, joinLeft + (join - icon) / 2f, cy - icon / 2f, icon, palette.textOnPrimary, iconPaint)
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        val joinLeft = width - context.dp(BORDER + PAD + JOIN)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> setJoinPressed(event.x >= joinLeft)
            MotionEvent.ACTION_MOVE -> if (joinPressed && (event.x < joinLeft - context.dp(SLOP) || event.y < -context.dp(SLOP) || event.y > height + context.dp(SLOP))) setJoinPressed(false)
            MotionEvent.ACTION_UP -> {
                if (joinPressed) {
                    playSoundEffect(android.view.SoundEffectConstants.CLICK)
                    onJoin()
                }
                setJoinPressed(false)
            }
            MotionEvent.ACTION_CANCEL -> setJoinPressed(false)
        }
        return true
    }

    private fun setJoinPressed(value: Boolean) {
        if (joinPressed == value) return
        joinPressed = value
        invalidate()
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.addAction(AccessibilityNodeInfo.AccessibilityAction(AccessibilityNodeInfo.ACTION_CLICK, "Присоединиться к звонку"))
    }

    override fun performAccessibilityAction(action: Int, arguments: android.os.Bundle?): Boolean {
        if (action == AccessibilityNodeInfo.ACTION_CLICK) {
            onJoin()
            return true
        }
        return super.performAccessibilityAction(action, arguments)
    }

    private companion object {
        const val AVATAR_LIMIT = 4
        const val AVATAR = 28f
        const val RING = 2f
        const val OVERLAP = 10f
        const val BORDER = 1f
        const val PAD = 8f
        const val PAD_LEFT = 12f
        const val GAP = 8f
        const val JOIN = 44f
        const val JOIN_ICON = 20f
        const val PRESSED_ALPHA = 0.18f
        const val SLOP = 12f
    }
}
