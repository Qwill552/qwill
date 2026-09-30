package com.qwill.app.ui

import android.graphics.Canvas
import android.text.TextPaint

class CharDiffText {
    var text = ""
        private set
    private var previous = ""
    private var head = 0
    private var tail = 0
    private var rising = true
    var progress = 1f

    val animating: Boolean get() = progress < 1f

    fun set(next: String, up: Boolean): Boolean {
        if (next == text) return false
        previous = text
        text = next
        rising = up
        val limit = minOf(previous.length, text.length)
        head = 0
        while (head < limit && previous[head] == text[head]) head++
        tail = 0
        while (tail < limit - head && previous[previous.length - 1 - tail] == text[text.length - 1 - tail]) tail++
        return true
    }

    fun width(paint: TextPaint): Float = paint.measureText(text)

    fun draw(canvas: Canvas, x: Float, baseline: Float, shift: Float, paint: TextPaint) {
        drawAligned(canvas, x, x, baseline, shift, paint)
    }

    fun drawCentered(canvas: Canvas, center: Float, baseline: Float, shift: Float, paint: TextPaint) {
        val now = center - paint.measureText(text) / 2f
        val before = center - paint.measureText(previous) / 2f
        drawAligned(canvas, before, now, baseline, shift, paint)
    }

    private fun drawAligned(canvas: Canvas, beforeX: Float, nowX: Float, baseline: Float, shift: Float, paint: TextPaint) {
        if (progress >= 1f) {
            canvas.drawText(text, nowX, baseline, paint)
            return
        }
        val baseAlpha = paint.alpha
        val p = progress.coerceIn(0f, 1f)
        val x = beforeX + (nowX - beforeX) * p
        val direction = if (rising) 1f else -1f
        val headText = text.substring(0, head)
        val headWidth = paint.measureText(headText)
        canvas.drawText(headText, x, baseline, paint)
        val newMiddle = text.substring(head, text.length - tail)
        val oldMiddle = previous.substring(head, previous.length - tail)
        val newMiddleWidth = paint.measureText(newMiddle)
        val oldMiddleWidth = paint.measureText(oldMiddle)
        paint.alpha = (baseAlpha * (1f - p)).toInt()
        canvas.drawText(oldMiddle, x + headWidth, baseline - direction * shift * p, paint)
        paint.alpha = (baseAlpha * p).toInt()
        canvas.drawText(newMiddle, x + headWidth, baseline + direction * shift * (1f - p), paint)
        paint.alpha = baseAlpha
        val tailText = text.substring(text.length - tail)
        val tailX = x + headWidth + oldMiddleWidth + (newMiddleWidth - oldMiddleWidth) * p
        canvas.drawText(tailText, tailX, baseline, paint)
    }
}
