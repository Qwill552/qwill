package com.qwill.app.stand

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt

internal fun cardBackground(context: Context): GradientDrawable = GradientDrawable().apply {
    cornerRadius = context.dp(Dimens.CARD_RADIUS)
    setColor(Theme.palette.cardBg)
    setStroke(context.dpInt(Dimens.HAIRLINE), Theme.palette.cardBorder)
}

internal fun ripple(fill: Int, radius: Float, rippleColor: Int): RippleDrawable {
    val shape = GradientDrawable().apply {
        cornerRadius = radius
        setColor(fill)
    }
    val mask = GradientDrawable().apply {
        cornerRadius = radius
        setColor(FixedColors.lift)
    }
    return RippleDrawable(ColorStateList.valueOf(rippleColor), shape, mask)
}
