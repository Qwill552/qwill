package com.qwill.app.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RippleDrawable
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt

fun ripple(fill: Int, radius: Float, rippleColor: Int, strokeColor: Int = 0, strokeWidth: Int = 0): RippleDrawable {
    val shape = GradientDrawable().apply {
        cornerRadius = radius
        setColor(fill)
        if (strokeColor != 0) setStroke(strokeWidth, strokeColor)
    }
    val mask = GradientDrawable().apply {
        cornerRadius = radius
        setColor(FixedColors.lift)
    }
    return RippleDrawable(ColorStateList.valueOf(rippleColor), shape, mask)
}

fun Context.roundRect(radius: Float, fill: Int, strokeColor: Int = 0, strokeWidthPx: Int = 0): GradientDrawable = GradientDrawable().apply {
    cornerRadius = radius
    setColor(fill)
    if (strokeColor != 0) setStroke(strokeWidthPx, strokeColor)
}

fun Context.fieldBackground(radiusDp: Float, fill: Int, borderColor: Int, ringColor: Int = 0): Drawable {
    val base = GradientDrawable().apply {
        cornerRadius = dp(radiusDp)
        setColor(fill)
        setStroke(dpInt(1f), borderColor)
    }
    if (ringColor == 0) return base
    val ring = GradientDrawable().apply {
        cornerRadius = dp(radiusDp) + dp(3f)
        setColor(ringColor)
    }
    val layer = LayerDrawable(arrayOf(ring, base))
    val inset = dpInt(3f)
    layer.setLayerInset(1, inset, inset, inset, inset)
    return layer
}
