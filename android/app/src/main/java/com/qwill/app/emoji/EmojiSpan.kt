package com.qwill.app.emoji

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.text.style.ReplacementSpan
import kotlin.math.ceil

class EmojiSpan(val entry: EmojiEntry, private val sizePx: Float) : ReplacementSpan() {
    private val target = RectF()
    private val bitmapPaint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)

    override fun getSize(paint: Paint, text: CharSequence?, start: Int, end: Int, fm: Paint.FontMetricsInt?): Int {
        if (fm != null) paint.getFontMetricsInt(fm)
        return ceil(sizePx).toInt()
    }

    override fun draw(
        canvas: Canvas,
        text: CharSequence?,
        start: Int,
        end: Int,
        x: Float,
        top: Int,
        y: Int,
        bottom: Int,
        paint: Paint,
    ) {
        val centerY = y - paint.textSize * X_HEIGHT_HALF
        target.set(x, centerY - sizePx / 2f, x + sizePx, centerY + sizePx / 2f)
        bitmapPaint.alpha = 255
        Emoji.draw(canvas, entry, target, bitmapPaint)
    }

    private companion object {
        const val X_HEIGHT_HALF = 0.273f
    }
}
