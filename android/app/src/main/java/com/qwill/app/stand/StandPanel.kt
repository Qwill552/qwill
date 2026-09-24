package com.qwill.app.stand

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

abstract class StandPanel(protected val context: Context) {
    private val texts = ArrayList<Pair<TextView, Boolean>>()
    private val fields = ArrayList<EditText>()
    private val buttons = ArrayList<Pair<TextView, Boolean>>()

    val view: LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        val pad = context.dpInt(Dimens.CARD_INSET)
        setPadding(pad, pad, pad, pad)
    }

    fun applyAppearance() {
        val palette = Theme.palette
        view.background = cardBackground(context)
        for ((text, secondary) in texts) {
            text.setTextColor(if (secondary) palette.textSecondary else palette.textPrimary)
        }
        for (field in fields) {
            field.setTextColor(palette.textPrimary)
            field.setHintTextColor(palette.textTertiary)
            field.background = GradientDrawable().apply {
                cornerRadius = context.dp(Dimens.RADIUS_MD)
                setColor(palette.surface3)
            }
            field.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.NAME))
        }
        for ((button, primary) in buttons) {
            button.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.META))
            button.setTextColor(if (primary) palette.textOnPrimary else palette.textPrimary)
            button.background = ripple(
                if (primary) palette.primary else palette.surface3,
                context.dp(Dimens.RADIUS_MD),
                withAlpha(if (primary) palette.textOnPrimary else palette.textPrimary, 0.16f),
            )
        }
        for ((text, _) in texts) text.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(scaleOf(text)))
    }

    protected fun label(value: String, scale: Float, weight: FontWeight, secondary: Boolean): TextView =
        TextView(context).apply {
            text = value
            typeface = Fonts.display(weight)
            includeFontPadding = false
            tag = scale
            texts.add(this to secondary)
        }

    protected fun field(hint: String, type: Int): EditText = EditText(context).apply {
        this.hint = hint
        inputType = type
        isSingleLine = true
        typeface = Fonts.display(FontWeight.REGULAR)
        val padX = context.dpInt(Dimens.SPACE_3)
        setPadding(padX, 0, padX, 0)
        fields.add(this)
    }

    protected fun button(value: String, primary: Boolean, onClick: () -> Unit): TextView = TextView(context).apply {
        text = value
        gravity = Gravity.CENTER
        typeface = Fonts.display(FontWeight.SEMIBOLD)
        isFocusable = true
        setOnClickListener { onClick() }
        buttons.add(this to primary)
    }

    protected fun pair(first: TextView, second: TextView): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(first, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
        addView(
            second,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply {
                leftMargin = context.dpInt(Dimens.SPACE_2)
            },
        )
    }

    protected fun rowParams(top: Float): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dpInt(top)
        }

    protected fun fieldParams(top: Float): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(Dimens.TAP_MIN)).apply {
            topMargin = context.dpInt(top)
        }

    private fun scaleOf(text: TextView): Float = text.tag as? Float ?: TextScale.CAPTION
}
