package com.qwill.app.auth

import android.content.Context
import android.text.SpannableString
import android.text.Spanned
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import com.qwill.app.ui.ripple
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class ConsentContent(private val context: Context, card: LinearLayout, onLegalLink: (String) -> Unit) {
    var onConfirm: (() -> Unit)? = null
    var onCancel: (() -> Unit)? = null
    var pending: Boolean = false
        private set

    private val titleView: TextView
    private val warningView: TextView
    private val fineView: TextView
    private val errorView: TextView
    private val cancelButton: TextView
    private val confirmButton: TextView
    private val confirmProgress: ProgressBar

    init {
        titleView = TextView(context).apply {
            text = "Внимание"
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 20f)
        }
        card.addView(titleView, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_3) })

        warningView = TextView(context).apply {
            text = "Администрация сайта предоставляет только техническую площадку и не несет " +
                "ответственности за действия, сообщения или возможный обман со стороны других " +
                "пользователей. Регистрируясь, вы берете эти риски на себя."
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f)
        }
        card.addView(warningView, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_3) })

        fineView = TextView(context).apply {
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f)
            movementMethod = LinkMovementMethod.getInstance()
            highlightColor = 0
        }
        buildFineText(onLegalLink)
        card.addView(fineView, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_3) })

        errorView = TextView(context).apply {
            gravity = Gravity.CENTER
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 13f)
            visibility = View.GONE
        }
        card.addView(errorView, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_3) })

        val actions = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        cancelButton = TextView(context).apply {
            text = "Отмена"
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            isFocusable = true
            setOnClickListener { if (!pending) onCancel?.invoke() }
        }
        val buttonHeight = context.dpInt(Dimens.COMPOSER_MIN_H)
        actions.addView(cancelButton, LinearLayout.LayoutParams(0, buttonHeight, 1f))

        val confirmBox = android.widget.FrameLayout(context)
        confirmButton = TextView(context).apply {
            text = "Зарегистрироваться"
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            isFocusable = true
            setOnClickListener { if (!pending) onConfirm?.invoke() }
        }
        confirmProgress = ProgressBar(context).apply { visibility = View.GONE }
        confirmBox.addView(confirmButton, android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        confirmBox.addView(confirmProgress, android.widget.FrameLayout.LayoutParams(context.dpInt(22f), context.dpInt(22f), Gravity.CENTER))
        actions.addView(
            confirmBox,
            LinearLayout.LayoutParams(0, buttonHeight, 1f).apply { leftMargin = context.dpInt(Dimens.SPACE_2) },
        )
        card.addView(actions, wrap())
    }

    fun setPending(value: Boolean) {
        pending = value
        cancelButton.alpha = if (value) 0.6f else 1f
        confirmButton.alpha = if (value) 0.6f else 1f
        confirmButton.visibility = if (value) View.INVISIBLE else View.VISIBLE
        confirmProgress.visibility = if (value) View.VISIBLE else View.GONE
    }

    fun setError(message: String?) {
        if (message == null) {
            errorView.visibility = View.GONE
            return
        }
        errorView.text = message
        errorView.visibility = View.VISIBLE
    }

    fun applyAppearance() {
        val palette = Theme.palette
        titleView.setTextColor(palette.textPrimary)
        warningView.setTextColor(palette.textSecondary)
        buildFineText(lastLinkHandler ?: {})
        errorView.setTextColor(palette.danger)
        cancelButton.setTextColor(palette.textPrimary)
        cancelButton.background = ripple(0, context.dp(Dimens.RADIUS_MD), withAlpha(palette.textPrimary, 0.12f))
        confirmButton.setTextColor(palette.textOnPrimary)
        confirmButton.background = ripple(palette.primary, context.dp(Dimens.RADIUS_MD), withAlpha(palette.textOnPrimary, 0.24f))
        confirmProgress.indeterminateTintList = android.content.res.ColorStateList.valueOf(palette.textOnPrimary)
    }

    private var lastLinkHandler: ((String) -> Unit)? = null

    private fun buildFineText(onLegalLink: (String) -> Unit) {
        lastLinkHandler = onLegalLink
        val prefix = "Нажимая «Зарегистрироваться», вы подтверждаете, что вам исполнилось 18 лет, а также что вы ознакомились и согласны с "
        val terms = "Пользовательским соглашением"
        val middle = " и "
        val privacy = "Политикой обработки персональных данных"
        val suffix = "."
        val full = prefix + terms + middle + privacy + suffix
        val spannable = SpannableString(full)
        val primary = Theme.palette.primary
        val termsStart = prefix.length
        val termsEnd = termsStart + terms.length
        val privacyStart = termsEnd + middle.length
        val privacyEnd = privacyStart + privacy.length
        spannable.setSpan(link(primary) { onLegalLink("terms") }, termsStart, termsEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        spannable.setSpan(link(primary) { onLegalLink("privacy") }, privacyStart, privacyEnd, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        fineView.setTextColor(Theme.palette.textSecondary)
        fineView.text = spannable
    }

    private fun link(color: Int, action: () -> Unit): ClickableSpan = object : ClickableSpan() {
        override fun onClick(widget: View) {
            action()
        }

        override fun updateDrawState(ds: android.text.TextPaint) {
            ds.color = color
            ds.isUnderlineText = true
        }
    }

    private fun wrap(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
}
