package com.qwill.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import kotlin.math.min

class LetterAvatarView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    var letter: String = ""
        set(value) {
            field = value
            invalidate()
        }

    private val circlePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        circlePaint.shader = LinearGradient(
            0f,
            0f,
            w.toFloat(),
            h.toFloat(),
            Color.parseColor("#4d8dff"),
            Color.parseColor("#a05aff"),
            Shader.TileMode.CLAMP,
        )
        textPaint.textSize = min(w, h) * 0.42f
    }

    override fun onDraw(canvas: Canvas) {
        val radius = min(width, height) / 2f
        canvas.drawCircle(width / 2f, height / 2f, radius, circlePaint)
        if (letter.isEmpty()) return
        val baseline = height / 2f - (textPaint.descent() + textPaint.ascent()) / 2f
        canvas.drawText(letter, width / 2f, baseline, textPaint)
    }
}
