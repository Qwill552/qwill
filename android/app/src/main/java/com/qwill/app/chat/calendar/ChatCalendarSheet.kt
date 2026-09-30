package com.qwill.app.chat.calendar

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.TextPaint
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.qwill.app.QwillApplication
import com.qwill.app.chat.ChatRequests
import com.qwill.app.model.ChatCalendarDay
import com.qwill.app.net.ApiResult
import com.qwill.app.ui.QwillSheet
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import java.util.TimeZone

class ChatCalendarSheet(
    private val context: Context,
    host: FrameLayout,
    override val chatId: String,
    private val filter: CalendarFilter,
    anchorDay: String,
    override val selectedDay: String?,
    private val guid: Int,
    private val pickDay: (ChatCalendarDay) -> Unit,
    onClosed: () -> Unit,
) : CalendarMonthHost {
    val sheet = QwillSheet(context, host, "Календарь")
    override val data = ChatCalendarData(
        { from, to, done ->
            QwillApplication.api.send(ChatRequests.calendar(chatId, from, to, filter, TimeZone.getDefault().id), guid) { result ->
                done((result as? ApiResult.Success)?.value)
            }
        },
    ) { onDataChanged() }

    private val anchor = CalendarMonths.indexOfKey(anchorDay)
    private var earliest = anchor - WINDOW_STEP + 1
    private var latest = anchor
    private val weekdays = WeekdaysView(context)
    private val failure = TextView(context)
    private val list = RecyclerView(context)
    private val adapter = MonthsAdapter()
    private var picked = false

    init {
        sheet.onClosed = onClosed
        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        column.addView(weekdays, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val frame = FrameLayout(context)
        list.layoutManager = LinearLayoutManager(context, RecyclerView.VERTICAL, true)
        list.adapter = adapter
        list.itemAnimator = null
        list.overScrollMode = View.OVER_SCROLL_NEVER
        list.isVerticalScrollBarEnabled = false
        list.clipToPadding = false
        list.setPadding(0, 0, 0, context.dpInt(Dimens.SPACE_4))
        list.addOnScrollListener(object : RecyclerView.OnScrollListener() {
            override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                checkEdges()
            }
        })
        frame.addView(list, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        failure.text = "Не удалось загрузить календарь"
        failure.gravity = Gravity.CENTER
        failure.typeface = Fonts.display(FontWeight.REGULAR)
        val pad = context.dpInt(Dimens.SPACE_4)
        failure.setPadding(0, pad, 0, pad)
        failure.visibility = View.GONE
        frame.addView(failure, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))
        column.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        sheet.body.setPadding(pad, 0, pad, 0)
        sheet.body.addView(column, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        applyTheme()
        data.ensure(earliest, latest)
    }

    fun show() {
        sheet.show()
    }

    fun requestClose() {
        sheet.requestClose()
    }

    fun dismissNow() {
        sheet.dismissNow()
    }

    fun setSafeArea(area: SafeArea) {
        sheet.setSafeArea(area)
    }

    fun applyTheme() {
        val palette = Theme.palette
        sheet.applyTheme()
        failure.setTextColor(palette.textSecondary)
        failure.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.META))
        weekdays.requestLayout()
        weekdays.invalidate()
        for (index in 0 until list.childCount) {
            list.getChildAt(index).requestLayout()
            list.getChildAt(index).invalidate()
        }
    }

    override fun onPick(day: ChatCalendarDay) {
        if (picked) return
        picked = true
        sheet.requestClose()
        pickDay(day)
    }

    private fun floor(): Int? = data.minDate?.let { CalendarMonths.indexOfKey(it) }

    private fun ceiling(): Int? = data.maxDate?.let { CalendarMonths.indexOfKey(it) }

    private fun onDataChanged() {
        failure.visibility = if (data.status == CalendarStatus.ERROR && data.days.isEmpty()) View.VISIBLE else View.GONE
        for (index in 0 until list.childCount) (list.getChildAt(index) as? CalendarMonthView)?.refresh()
        list.post { checkEdges() }
    }

    private fun checkEdges() {
        val manager = list.layoutManager as LinearLayoutManager
        val oldest = manager.findLastVisibleItemPosition()
        val newest = manager.findFirstVisibleItemPosition()
        if (oldest == RecyclerView.NO_POSITION || newest == RecyclerView.NO_POSITION) return
        val floor = floor()
        if (adapter.itemCount - 1 - oldest < EDGE_MONTHS && (floor == null || earliest > floor)) {
            val next = if (floor == null) earliest - WINDOW_STEP else maxOf(floor, earliest - WINDOW_STEP)
            val added = earliest - next
            if (added > 0) {
                val before = adapter.itemCount
                earliest = next
                adapter.notifyItemRangeInserted(before, added)
                data.ensure(earliest, latest)
            }
        }
        val ceiling = ceiling()
        if (newest < EDGE_MONTHS && ceiling != null && latest < ceiling) {
            val next = minOf(ceiling, latest + WINDOW_STEP)
            val added = next - latest
            if (added > 0) {
                latest = next
                adapter.notifyItemRangeInserted(0, added)
                data.ensure(earliest, latest)
            }
        }
    }

    private inner class MonthsAdapter : RecyclerView.Adapter<RecyclerView.ViewHolder>() {
        override fun getItemCount(): Int = latest - earliest + 1

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
            val view = CalendarMonthView(context, this@ChatCalendarSheet)
            view.layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            return object : RecyclerView.ViewHolder(view) {}
        }

        override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
            (holder.itemView as CalendarMonthView).bind(latest - position)
        }
    }

    private class WeekdaysView(context: Context) : View(context) {
        private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Fonts.display(FontWeight.BOLD)
            textAlign = Paint.Align.CENTER
        }
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        private val rect = RectF()

        init {
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            textPaint.textSize = context.dp(Theme.textSize(TextScale.CAPTION))
            val line = textPaint.textSize * TextScale.LINE_HEIGHT
            setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), (line + context.dp(PAD_Y * 2)).toInt())
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            val hairline = context.dp(Dimens.HAIRLINE)
            rect.set(hairline / 2f, hairline / 2f, width - hairline / 2f, height - hairline / 2f)
            val radius = rect.height() / 2f
            fillPaint.color = palette.cardBg
            canvas.drawRoundRect(rect, radius, radius, fillPaint)
            strokePaint.strokeWidth = hairline
            strokePaint.color = palette.cardBorder
            canvas.drawRoundRect(rect, radius, radius, strokePaint)
            textPaint.textSize = context.dp(Theme.textSize(TextScale.CAPTION))
            textPaint.color = palette.textSecondary
            val pad = context.dp(PAD_X)
            val column = (width - pad * 2) / CalendarMonths.WEEK
            val baseline = height / 2f - (textPaint.ascent() + textPaint.descent()) / 2f
            for ((index, label) in CalendarMonths.WEEKDAYS.withIndex()) {
                canvas.drawText(label, pad + column * (index + 0.5f), baseline, textPaint)
            }
        }

        private companion object {
            const val PAD_X = 4f
            const val PAD_Y = 8f
        }
    }

    private companion object {
        const val WINDOW_STEP = 3
        const val EDGE_MONTHS = 1
    }
}
