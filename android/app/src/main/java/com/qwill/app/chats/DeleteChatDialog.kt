package com.qwill.app.chats

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatType
import com.qwill.app.net.ApiError
import com.qwill.app.ui.QwillDialog
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.QwillSwitch
import com.qwill.app.ui.ripple
import com.qwill.app.ui.roundRect
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class DeleteChatDialog(
    private val context: Context,
    private val host: FrameLayout,
    private val chat: ChatListItemDto,
    private val onClosed: () -> Unit,
) {
    private val dialog = QwillDialog(context, host)
    private val title = TextView(context)
    private val close = CloseButton(context)
    private val text = TextView(context)
    private val switchLabel = TextView(context)
    private val switch = QwillSwitch(context)
    private val error = TextView(context)
    private val cancel = TextView(context)
    private val delete = TextView(context)
    private val withSwitch = chat.type == ChatType.PRIVATE && chat.otherMember != null
    private var pending = false
    private var closed = false

    init {
        buildContent()
        dialog.onCancelRequested = { requestClose() }
    }

    fun show() {
        dialog.attachTo(host)
        applyTheme()
        dialog.show()
        cancel.post { cancel.sendAccessibilityEvent(android.view.accessibility.AccessibilityEvent.TYPE_VIEW_FOCUSED) }
    }

    fun requestClose() {
        if (pending || closed) return
        closed = true
        dialog.hide { dialog.detach() }
        onClosed()
    }

    fun applyTheme() {
        val palette = Theme.palette
        dialog.applyAppearance()
        title.setTextColor(palette.textPrimary)
        text.setTextColor(palette.textSecondary)
        switchLabel.setTextColor(palette.textPrimary)
        error.setTextColor(palette.danger)
        error.background = context.roundRect(context.dp(Dimens.RADIUS_SM), palette.dangerSoft)
        cancel.setTextColor(palette.textSecondary)
        cancel.background = ripple(0, context.dp(PILL), palette.primarySoft)
        delete.setTextColor(palette.danger)
        delete.background = ripple(palette.dangerSoft, context.dp(PILL), withAlpha(palette.danger, 0.18f))
        close.invalidate()
        switch.invalidate()
    }

    private fun buildContent() {
        val card = dialog.card
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        title.text = TITLE
        title.typeface = Fonts.display(FontWeight.SEMIBOLD)
        title.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.SCREEN_TITLE))
        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        close.setOnClickListener { requestClose() }
        header.addView(close, LinearLayout.LayoutParams(context.dpInt(Dimens.TAP_MIN), context.dpInt(Dimens.TAP_MIN)).apply {
            rightMargin = -context.dpInt(CLOSE_OUTSET)
        })
        card.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = context.dpInt(Dimens.SPACE_4) - context.dpInt(CLOSE_OUTSET)
            topMargin = -context.dpInt(CLOSE_OUTSET)
        })

        val member = chat.otherMember
        text.text = if (member != null) "Переписка с @${member.username} будет удалена." else "Переписка «${chat.title}» будет удалена."
        text.typeface = Fonts.message(FontWeight.REGULAR)
        text.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.META))
        card.addView(text, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = context.dpInt(Dimens.SPACE_4)
        })

        if (withSwitch && member != null) {
            val row = LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                isClickable = true
                setOnClickListener { if (!pending) switch.toggle() }
            }
            switchLabel.text = "Удалить также у @${member.username}"
            switchLabel.typeface = Fonts.message(FontWeight.REGULAR)
            switchLabel.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.META))
            switchLabel.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            row.addView(switchLabel, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = context.dpInt(Dimens.SPACE_3)
            })
            switch.contentDescription = switchLabel.text
            row.addView(switch)
            card.addView(row, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        }

        error.typeface = Fonts.message(FontWeight.REGULAR)
        error.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.CAPTION))
        val padX = context.dpInt(Dimens.SPACE_3)
        val padY = context.dpInt(Dimens.SPACE_2)
        error.setPadding(padX, padY, padX, padY)
        error.visibility = View.GONE
        error.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        card.addView(error, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dpInt(Dimens.SPACE_3)
        })

        val actions = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
        }
        styleButton(cancel, CANCEL)
        cancel.setOnClickListener { requestClose() }
        styleButton(delete, DELETE)
        delete.setOnClickListener { submit() }
        val height = context.dpInt(Dimens.TAP_MIN)
        actions.addView(cancel, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, height))
        actions.addView(delete, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, height).apply {
            leftMargin = context.dpInt(Dimens.SPACE_2)
        })
        card.addView(actions, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dpInt(Dimens.SPACE_4)
        })
    }

    private fun styleButton(button: TextView, label: String) {
        button.text = label
        button.gravity = Gravity.CENTER
        button.typeface = Fonts.message(FontWeight.SEMIBOLD)
        button.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.META))
        val pad = context.dpInt(Dimens.SPACE_4)
        button.setPadding(pad, 0, pad, 0)
        button.isFocusable = true
        button.maxLines = 1
        button.ellipsize = TextUtils.TruncateAt.END
    }

    private fun submit() {
        if (pending) return
        setPending(true)
        error.visibility = View.GONE
        QwillApplication.messages.deleteChat(chat.id, withSwitch && switch.isChecked) { failure ->
            if (closed) return@deleteChat
            if (failure == null) {
                setPending(false)
                requestClose()
                return@deleteChat
            }
            setPending(false)
            error.text = (failure as? ApiError)?.message?.takeIf { it.isNotBlank() } ?: FAILED
            error.visibility = View.VISIBLE
        }
    }

    private fun setPending(value: Boolean) {
        pending = value
        for (button in listOf(cancel, delete)) {
            button.isEnabled = !value
            button.alpha = if (value) DISABLED_ALPHA else 1f
        }
        switch.isEnabled = !value
    }

    private class CloseButton(context: Context) : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

        init {
            isClickable = true
            isFocusable = true
            contentDescription = "Закрыть"
        }

        override fun setPressed(pressed: Boolean) {
            super.setPressed(pressed)
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            if (isPressed) {
                paint.style = Paint.Style.FILL
                paint.color = palette.primarySoft
                canvas.drawCircle(width / 2f, height / 2f, context.dp(VISUAL) / 2f, paint)
            }
            val size = context.dp(ICON)
            QwillIcon.CLOSE.draw(canvas, (width - size) / 2f, (height - size) / 2f, size, palette.textSecondary, paint)
        }

        override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(info)
            info.className = "android.widget.Button"
        }

        private companion object {
            const val VISUAL = 32f
            const val ICON = 18f
        }
    }

    private companion object {
        const val TITLE = "Удалить чат?"
        const val CANCEL = "Отмена"
        const val DELETE = "Удалить"
        const val FAILED = "Не удалось удалить чат"
        const val PILL = 22f
        const val CLOSE_OUTSET = 6f
        const val DISABLED_ALPHA = 0.6f
    }
}
