package com.qwill.app.chat.dialogs

import android.content.Context
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.accessibility.AccessibilityEvent
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.net.ApiError
import com.qwill.app.ui.DialogCloseButton
import com.qwill.app.ui.QwillDialog
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

class ConfirmDialog(
    private val context: Context,
    private val host: FrameLayout,
    titleText: String,
    bodyText: String?,
    confirmText: String,
    private val danger: Boolean,
    private val onConfirm: (ConfirmDialog) -> Unit,
    private val onClosed: () -> Unit,
) {
    private val dialog = QwillDialog(context, host)
    private val title = TextView(context)
    private val close = DialogCloseButton(context)
    private val text = TextView(context)
    private val error = TextView(context)
    private val cancel = TextView(context)
    private val confirm = TextView(context)
    private var pending = false
    private var closed = false

    init {
        build(titleText, bodyText, confirmText)
        dialog.onCancelRequested = { requestClose() }
    }

    fun show() {
        dialog.attachTo(host)
        applyTheme()
        dialog.show()
        cancel.post { cancel.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED) }
    }

    fun requestClose() {
        if (pending || closed) return
        closed = true
        dialog.hide { dialog.detach() }
        onClosed()
    }

    fun dismissNow() {
        if (closed) return
        closed = true
        dialog.detach()
        onClosed()
    }

    fun setPending(value: Boolean) {
        pending = value
        for (button in listOf(cancel, confirm, close)) {
            button.isEnabled = !value
            button.alpha = if (value) DISABLED_ALPHA else 1f
        }
    }

    fun finish() {
        setPending(false)
        requestClose()
    }

    fun fail(message: String) {
        setPending(false)
        if (closed) return
        error.text = message
        error.visibility = View.VISIBLE
    }

    val isClosed: Boolean get() = closed

    fun applyTheme() {
        val palette = Theme.palette
        dialog.applyAppearance()
        title.setTextColor(palette.textPrimary)
        text.setTextColor(palette.textSecondary)
        error.setTextColor(palette.danger)
        error.background = context.roundRect(context.dp(Dimens.RADIUS_SM), palette.dangerSoft)
        cancel.setTextColor(palette.textSecondary)
        cancel.background = ripple(0, context.dp(PILL), palette.primarySoft)
        if (danger) {
            confirm.setTextColor(palette.danger)
            confirm.background = ripple(palette.dangerSoft, context.dp(PILL), withAlpha(palette.danger, 0.18f))
        } else {
            confirm.setTextColor(palette.textOnPrimary)
            confirm.background = ripple(palette.primary, context.dp(PILL), withAlpha(palette.textOnPrimary, 0.18f))
        }
        close.invalidate()
    }

    private fun build(titleText: String, bodyText: String?, confirmText: String) {
        val card = dialog.card
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        title.text = titleText
        title.typeface = Fonts.display(FontWeight.SEMIBOLD)
        title.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.SCREEN_TITLE))
        header.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        close.setOnClickListener { requestClose() }
        header.addView(close, LinearLayout.LayoutParams(context.dpInt(Dimens.TAP_MIN), context.dpInt(Dimens.TAP_MIN)).apply {
            rightMargin = -context.dpInt(CLOSE_OUTSET)
        })
        card.addView(header, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = -context.dpInt(CLOSE_OUTSET)
        })
        if (bodyText != null) {
            text.text = bodyText
            text.typeface = Fonts.message(FontWeight.REGULAR)
            text.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.META))
            card.addView(text, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = context.dpInt(Dimens.SPACE_4) - context.dpInt(CLOSE_OUTSET)
            })
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
        styleButton(confirm, confirmText)
        confirm.setOnClickListener { if (!pending && !closed) onConfirm(this) }
        val height = context.dpInt(Dimens.TAP_MIN)
        actions.addView(cancel, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, height))
        actions.addView(confirm, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, height).apply {
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

    private companion object {
        const val CANCEL = "Отмена"
        const val PILL = 22f
        const val CLOSE_OUTSET = 6f
        const val DISABLED_ALPHA = 0.6f
    }
}

object ChatDialogs {
    fun unpin(context: Context, host: FrameLayout, onUnpin: () -> Unit, onClosed: () -> Unit): ConfirmDialog = ConfirmDialog(
        context,
        host,
        "Открепить сообщение?",
        "Оно перестанет показываться сверху у всех в этом чате.",
        "Открепить",
        danger = false,
        onConfirm = { dialog ->
            onUnpin()
            dialog.finish()
        },
        onClosed = onClosed,
    )

    fun block(context: Context, host: FrameLayout, chatId: String, userId: String, username: String, onClosed: () -> Unit): ConfirmDialog = ConfirmDialog(
        context,
        host,
        "Заблокировать?",
        "Писать и звонить друг другу не сможет никто из вас: ни @$username вам, ни вы ему. Переписка остаётся на месте, и блокировку можно снять.",
        "Заблокировать",
        danger = true,
        onConfirm = { dialog ->
            dialog.setPending(true)
            QwillApplication.messages.setUserBlocked(chatId, userId, true) { failure ->
                if (dialog.isClosed) return@setUserBlocked
                if (failure == null) dialog.finish() else dialog.fail((failure as? ApiError)?.message?.takeIf { it.isNotBlank() } ?: BLOCK_FAILED)
            }
        },
        onClosed = onClosed,
    )

    fun deleteMessages(context: Context, host: FrameLayout, count: Int, onDelete: () -> Unit, onClosed: () -> Unit): ConfirmDialog = ConfirmDialog(
        context,
        host,
        if (count > 1) "Удалить сообщения?" else "Удалить это сообщение?",
        null,
        "Удалить",
        danger = true,
        onConfirm = { dialog ->
            onDelete()
            dialog.finish()
        },
        onClosed = onClosed,
    )

    private const val BLOCK_FAILED = "Не удалось заблокировать"
}
