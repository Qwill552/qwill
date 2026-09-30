package com.qwill.app.chat.calendar

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.chat.ChatRequests
import com.qwill.app.chat.JumpOutcome
import com.qwill.app.core.MainQueue
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
import com.qwill.app.ui.wheel.WheelPicker
import java.util.Calendar
import java.util.TimeZone

class DatePickerSheet(
    private val context: Context,
    host: FrameLayout,
    private val chatId: String,
    private val guid: Int,
    private val jump: (Long, (JumpOutcome) -> Unit) -> Unit,
    onClosed: () -> Unit,
) {
    val sheet = QwillSheet(context, host, "Выбрать дату")
    private val today = DateParts.of(Calendar.getInstance())
    private var minDate: DateParts? = null
    private var wanted = today
    private var jumping = false
    private val dayWheel = WheelPicker(context, "День")
    private val monthWheel = WheelPicker(context, "Месяц")
    private val yearWheel = WheelPicker(context, "Год")
    private val error = TextView(context)
    private val button = FrameLayout(context)
    private val label = TextView(context)
    private val spinner = ProgressBar(context)
    private val showSpinner = Runnable { setWaiting(true) }

    init {
        sheet.onClosed = {
            MainQueue.cancel(showSpinner)
            onClosed()
        }
        val side = context.dpInt(Dimens.SPACE_4)
        sheet.body.setPadding(0, 0, 0, side)
        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, context.dpInt(ROW_TOP), 0, context.dpInt(ROW_BOTTOM))
        }
        dayWheel.textOffsetDp = DAY_OFFSET
        monthWheel.textOffsetDp = MONTH_OFFSET
        yearWheel.textOffsetDp = YEAR_OFFSET
        dayWheel.format = { it.toString() }
        monthWheel.format = { CalendarMonths.MONTH_NAMES.getOrElse(it) { "" } }
        yearWheel.format = { it.toString() }
        dayWheel.onChange = { day -> update(wanted.copy(day = day)) }
        monthWheel.onChange = { month -> update(wanted.copy(month = month)) }
        yearWheel.onChange = { year -> update(wanted.copy(year = year)) }
        row.addView(dayWheel, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, DAY_WEIGHT))
        row.addView(monthWheel, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, MONTH_WEIGHT))
        row.addView(yearWheel, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, YEAR_WEIGHT))
        column.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        error.text = JUMP_FAILED
        error.gravity = Gravity.CENTER
        error.typeface = Fonts.display(FontWeight.REGULAR)
        error.visibility = View.GONE
        column.addView(error, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            leftMargin = side
            rightMargin = side
            bottomMargin = context.dpInt(Dimens.SPACE_2)
        })
        label.text = "Перейти к дате"
        label.gravity = Gravity.CENTER
        label.typeface = Fonts.display(FontWeight.SEMIBOLD)
        button.addView(label, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        spinner.isIndeterminate = true
        spinner.visibility = View.GONE
        val spin = context.dpInt(SPINNER)
        button.addView(spinner, FrameLayout.LayoutParams(spin, spin, Gravity.CENTER))
        button.isClickable = true
        button.isFocusable = true
        button.contentDescription = "Перейти к дате"
        button.setOnClickListener { go() }
        column.addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(BUTTON_H)).apply {
            leftMargin = side
            rightMargin = side
            bottomMargin = context.dpInt(Dimens.SPACE_1)
        })
        sheet.body.addView(column, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        applyTheme()
        render()
        val key = today.key
        QwillApplication.api.send(ChatRequests.calendar(chatId, key, key, CalendarFilter.ALL, TimeZone.getDefault().id), guid) { result ->
            val min = (result as? ApiResult.Success)?.value?.minDate
            minDate = if (min != null) DateParts.ofKey(min) else today
            render()
        }
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
        error.setTextColor(palette.danger)
        error.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.CAPTION))
        label.setTextColor(palette.textOnPrimary)
        label.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.fontSize.base)
        button.background = GradientDrawable().apply {
            cornerRadius = context.dp(Dimens.RADIUS_SM)
            setColor(palette.primary)
        }
        spinner.indeterminateTintList = ColorStateList.valueOf(palette.textOnPrimary)
        for (wheel in listOf(dayWheel, monthWheel, yearWheel)) wheel.refresh()
    }

    private fun floor(): DateParts = minDate ?: DateParts(today.year - LOADING_YEARS_BACK, 0, 1)

    private fun update(next: DateParts) {
        wanted = next
        render()
    }

    private fun render() {
        val resolved = DateBounds.resolve(wanted, floor(), today)
        dayWheel.setRange(resolved.days.first, resolved.days.last)
        monthWheel.setRange(resolved.months.first, resolved.months.last)
        yearWheel.setRange(resolved.years.first, resolved.years.last)
        dayWheel.setValue(resolved.parts.day)
        monthWheel.setValue(resolved.parts.month)
        yearWheel.setValue(resolved.parts.year)
        val enabled = minDate != null && !jumping
        button.isEnabled = enabled
        button.alpha = if (enabled) 1f else DISABLED_ALPHA
    }

    private fun go() {
        if (minDate == null || jumping) return
        val target = DateBounds.resolve(wanted, floor(), today).parts
        jumping = true
        error.visibility = View.GONE
        render()
        MainQueue.postDelayed(showSpinner, SPINNER_DELAY_MS)
        QwillApplication.api.send(ChatRequests.messageAtDate(chatId, target.key, TimeZone.getDefault().id), guid) { result ->
            if (sheet.isClosed) return@send
            if (result !is ApiResult.Success) {
                finishJump(failed = true)
                return@send
            }
            val messageId = result.value.messageId
            if (messageId == null) {
                finishJump(failed = false)
                sheet.requestClose()
                return@send
            }
            jump(messageId) { outcome -> onJumped(outcome) }
        }
    }

    private fun onJumped(outcome: JumpOutcome) {
        if (sheet.isClosed) return
        val failed = outcome == JumpOutcome.FAILED
        finishJump(failed)
        if (!failed) sheet.requestClose()
    }

    private fun finishJump(failed: Boolean) {
        MainQueue.cancel(showSpinner)
        setWaiting(false)
        jumping = false
        error.visibility = if (failed) View.VISIBLE else View.GONE
        render()
    }

    private fun setWaiting(waiting: Boolean) {
        spinner.visibility = if (waiting) View.VISIBLE else View.GONE
        label.visibility = if (waiting) View.INVISIBLE else View.VISIBLE
    }

    private companion object {
        const val JUMP_FAILED = "Не удалось перейти к дате"
        const val LOADING_YEARS_BACK = 20
        const val SPINNER_DELAY_MS = 1000L
        const val SPINNER = 20f
        const val BUTTON_H = 48f
        const val ROW_TOP = 4f
        const val ROW_BOTTOM = 12f
        const val DAY_WEIGHT = 0.25f
        const val MONTH_WEIGHT = 0.5f
        const val YEAR_WEIGHT = 0.25f
        const val DAY_OFFSET = 10f
        const val MONTH_OFFSET = -10f
        const val YEAR_OFFSET = -24f
        const val DISABLED_ALPHA = 0.5f
    }
}
