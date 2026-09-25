package com.qwill.app.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import com.qwill.app.R
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.Theme

object ServiceLogo {
    private const val PADDING_SHARE = 0.1875f
    private var light: Bitmap? = null
    private var dark: Bitmap? = null
    private var mark: Bitmap? = null
    private val rect = RectF()

    fun draw(canvas: Canvas, context: Context, left: Float, top: Float, size: Float, paint: Paint) {
        val resources = context.resources
        val background = if (Theme.isDark) {
            dark ?: BitmapFactory.decodeResource(resources, R.drawable.logo_bg_dark).also { dark = it }
        } else {
            light ?: BitmapFactory.decodeResource(resources, R.drawable.logo_bg_light).also { light = it }
        }
        val foreground = mark ?: BitmapFactory.decodeResource(resources, R.drawable.logo_mark).also { mark = it }
        rect.set(left, top, left + size, top + size)
        canvas.drawBitmap(background, null, rect, paint)
        val inset = size * PADDING_SHARE
        rect.inset(inset, inset)
        canvas.drawBitmap(foreground, null, rect, paint)
    }
}

object OfficialMark {
    private const val CHECK_SHARE = 0.66f

    fun draw(canvas: Canvas, left: Float, centerY: Float, size: Float, fill: Paint, icon: Paint) {
        fill.shader = null
        fill.color = Theme.palette.primary
        canvas.drawCircle(left + size / 2f, centerY, size / 2f, fill)
        val check = Math.round(size * CHECK_SHARE).toFloat()
        QwillIcon.CHECK.draw(canvas, left + (size - check) / 2f, centerY - check / 2f, check, FixedColors.lift, icon)
    }
}
