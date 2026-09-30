package com.qwill.app.chat.calendar

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.Bundle
import android.text.TextPaint
import android.view.MotionEvent
import android.view.SoundEffectConstants
import android.view.View
import android.view.ViewConfiguration
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityNodeProvider
import com.qwill.app.QwillApplication
import com.qwill.app.files.ImageReceiver
import com.qwill.app.files.MediaKind
import com.qwill.app.files.MediaTier
import com.qwill.app.model.ChatCalendarDay
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.roundToInt

interface CalendarMonthHost {
    val chatId: String
    val data: ChatCalendarData
    val selectedDay: String?

    fun onPick(day: ChatCalendarDay)
}

class CalendarMonthView(context: Context, private val host: CalendarMonthHost) : View(context) {
    private val titlePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.SEMIBOLD)
        textAlign = Paint.Align.CENTER
    }
    private val numberPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textAlign = Paint.Align.CENTER }
    private val countPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Fonts.display(FontWeight.SEMIBOLD)
        textAlign = Paint.Align.CENTER
    }
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rect = RectF()
    private val receivers = ArrayList<ImageReceiver>()
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
    private var month = 0
    private var downDay = -1
    private var downX = 0f
    private var downY = 0f
    private var attached = false

    init {
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        isClickable = true
    }

    fun bind(index: Int) {
        month = index
        contentDescription = CalendarMonths.title(index)
        refresh()
        requestLayout()
    }

    fun refresh() {
        val count = CalendarMonths.dayCount(month)
        while (receivers.size < count) {
            val receiver = ImageReceiver(this, QwillApplication.files.images)
            receiver.fadeWithoutPlaceholder = true
            if (attached) receiver.onAttach()
            receivers.add(receiver)
        }
        val size = context.dp(CELL_H).roundToInt()
        for (day in 1..count) {
            val preview = host.data.days[CalendarMonths.dayKey(month, day)]?.preview
            val request = preview?.let { QwillApplication.files.request(it, host.chatId, MediaKind.PHOTO, MediaTier.THUMB) }
            receivers[day - 1].setImage(request, null, size, small = true)
        }
        for (day in count until receivers.size) receivers[day].setImage(null, null, 0, small = true)
        invalidate()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        attached = true
        for (receiver in receivers) receiver.onAttach()
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        attached = false
        for (receiver in receivers) receiver.onDetach()
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val rows = CalendarMonths.rows(month)
        val height = gridTop() + rows * context.dp(CELL_H) + (rows - 1) * context.dp(GAP)
        setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), ceil(height).toInt())
    }

    private fun titleSize(): Float = context.dp(Theme.textSize(TextScale.META))

    private fun gridTop(): Float = context.dp(MONTH_GAP) + titleSize() * TextScale.LINE_HEIGHT + context.dp(TITLE_GAP)

    private fun cellWidth(): Float = (width - (CalendarMonths.WEEK - 1) * context.dp(GAP)) / CalendarMonths.WEEK

    private fun cellRect(day: Int, target: RectF) {
        val slot = CalendarMonths.leadingBlanks(month) + day - 1
        val column = slot % CalendarMonths.WEEK
        val row = slot / CalendarMonths.WEEK
        val cell = cellWidth()
        val left = column * (cell + context.dp(GAP))
        val top = gridTop() + row * (context.dp(CELL_H) + context.dp(GAP))
        target.set(left, top, left + cell, top + context.dp(CELL_H))
    }

    override fun onDraw(canvas: Canvas) {
        val palette = Theme.palette
        titlePaint.textSize = titleSize()
        titlePaint.color = palette.textPrimary
        val titleTop = context.dp(MONTH_GAP)
        val titleLine = titleSize() * TextScale.LINE_HEIGHT
        canvas.drawText(CalendarMonths.title(month), width / 2f, titleTop + titleLine / 2f - (titlePaint.ascent() + titlePaint.descent()) / 2f, titlePaint)
        val loading = !host.data.isSettled(month)
        val save = if (loading) canvas.saveLayerAlpha(0f, gridTop(), width.toFloat(), height.toFloat(), (LOADING_ALPHA * 255).toInt()) else canvas.save()
        val count = CalendarMonths.dayCount(month)
        numberPaint.textSize = titleSize()
        countPaint.textSize = context.dp(COUNT_SIZE)
        val selected = host.selectedDay
        for (day in 1..count) {
            val key = CalendarMonths.dayKey(month, day)
            val info = host.data.days[key]
            cellRect(day, rect)
            val radius = minOf(rect.width(), rect.height()) / 2f
            val isSelected = info != null && key == selected
            val receiver = receivers[day - 1]
            var ink = palette.textTertiary
            if (info != null) {
                fillPaint.color = if (isSelected) palette.primary else palette.primarySoft
                canvas.drawRoundRect(rect, radius, radius, fillPaint)
                ink = if (isSelected) palette.textOnPrimary else palette.primary
                if (info.preview != null && receiver.hasImage) {
                    receiver.draw(canvas, rect, radius)
                    val shown = receiver.imageAlpha
                    fillPaint.color = withAlpha(palette.scrimTint, VEIL_ALPHA * shown)
                    canvas.drawRoundRect(rect, radius, radius, fillPaint)
                    if (shown >= 1f) ink = palette.textOnPrimary
                }
            }
            numberPaint.typeface = Fonts.display(if (info != null) FontWeight.BOLD else FontWeight.MEDIUM)
            numberPaint.color = ink
            val center = rect.centerY() - (numberPaint.ascent() + numberPaint.descent()) / 2f
            canvas.drawText(day.toString(), rect.centerX(), center, numberPaint)
            if (info != null) {
                countPaint.color = ink
                val label = if (info.count > MAX_COUNT) "$MAX_COUNT+" else info.count.toString()
                canvas.drawText(label, rect.centerX(), rect.bottom - context.dp(COUNT_BOTTOM) - countPaint.descent(), countPaint)
            }
        }
        canvas.restoreToCount(save)
    }

    private fun dayAt(x: Float, y: Float): Int {
        for (day in 1..CalendarMonths.dayCount(month)) {
            cellRect(day, rect)
            if (rect.contains(x, y)) return day
        }
        return -1
    }

    @Suppress("ClickableViewAccessibility")
    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                val day = dayAt(event.x, event.y)
                downDay = if (day > 0 && host.data.days[CalendarMonths.dayKey(month, day)] != null) day else -1
                return downDay > 0
            }
            MotionEvent.ACTION_MOVE -> {
                if (downDay > 0 && (abs(event.x - downX) > touchSlop || abs(event.y - downY) > touchSlop)) downDay = -1
                return true
            }
            MotionEvent.ACTION_UP -> {
                val day = downDay
                downDay = -1
                if (day > 0 && dayAt(event.x, event.y) == day) pick(day)
                return true
            }
            MotionEvent.ACTION_CANCEL -> downDay = -1
        }
        return true
    }

    private fun pick(day: Int) {
        val info = host.data.days[CalendarMonths.dayKey(month, day)] ?: return
        playSoundEffect(SoundEffectConstants.CLICK)
        host.onPick(info)
    }

    private fun describe(day: Int): String {
        val key = CalendarMonths.dayKey(month, day)
        val title = CalendarMonths.dayTitle(key)
        val info = host.data.days[key] ?: return title
        return "$title, сообщений: ${info.count}"
    }

    override fun getAccessibilityNodeProvider(): AccessibilityNodeProvider? = provider

    private val provider = object : AccessibilityNodeProvider() {
        private val bounds = Rect()
        private val location = IntArray(2)

        override fun createAccessibilityNodeInfo(virtualViewId: Int): AccessibilityNodeInfo? {
            if (virtualViewId == HOST_VIEW_ID) {
                val info = AccessibilityNodeInfo.obtain(this@CalendarMonthView)
                onInitializeAccessibilityNodeInfo(info)
                for (day in 1..CalendarMonths.dayCount(month)) info.addChild(this@CalendarMonthView, day)
                return info
            }
            if (virtualViewId < 1 || virtualViewId > CalendarMonths.dayCount(month)) return null
            val info = AccessibilityNodeInfo.obtain(this@CalendarMonthView, virtualViewId)
            info.setParent(this@CalendarMonthView)
            info.packageName = context.packageName
            info.className = "android.widget.Button"
            info.contentDescription = describe(virtualViewId)
            cellRect(virtualViewId, rect)
            rect.roundOut(bounds)
            @Suppress("DEPRECATION")
            info.setBoundsInParent(bounds)
            getLocationOnScreen(location)
            bounds.offset(location[0], location[1])
            info.setBoundsInScreen(bounds)
            info.isVisibleToUser = true
            val clickable = host.data.days[CalendarMonths.dayKey(month, virtualViewId)] != null
            info.isEnabled = clickable
            info.isClickable = clickable
            info.isSelected = CalendarMonths.dayKey(month, virtualViewId) == host.selectedDay
            if (clickable) info.addAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_CLICK)
            return info
        }

        override fun performAction(virtualViewId: Int, action: Int, arguments: Bundle?): Boolean {
            if (virtualViewId == HOST_VIEW_ID) return performAccessibilityAction(action, arguments)
            if (action != AccessibilityNodeInfo.ACTION_CLICK) return false
            if (host.data.days[CalendarMonths.dayKey(month, virtualViewId)] == null) return false
            pick(virtualViewId)
            sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_CLICKED)
            return true
        }
    }

    companion object {
        const val CELL_H = 44f
        const val GAP = 4f
        const val TITLE_GAP = 8f
        const val MONTH_GAP = 16f
        private const val COUNT_SIZE = 9f
        private const val COUNT_BOTTOM = 3f
        private const val MAX_COUNT = 99
        private const val VEIL_ALPHA = 0.4f
        private const val LOADING_ALPHA = 0.5f
    }
}
