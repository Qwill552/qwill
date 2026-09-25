package com.qwill.app.ui

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import com.qwill.app.consent.CssGradient
import com.qwill.app.model.AvatarColor
import com.qwill.app.ui.theme.FixedColors
import kotlin.math.abs

class AvatarGradient(val from: Int, val to: Int)

object AvatarGradients {
    const val ANGLE = 140f

    val ALL: List<AvatarGradient> = listOf(
        AvatarGradient(FixedColors.avatarBlueFrom, FixedColors.avatarBlueTo),
        AvatarGradient(FixedColors.avatarVioletFrom, FixedColors.avatarVioletTo),
        AvatarGradient(FixedColors.avatarTealFrom, FixedColors.avatarTealTo),
        AvatarGradient(FixedColors.avatarOrangeFrom, FixedColors.avatarOrangeTo),
        AvatarGradient(FixedColors.avatarPinkFrom, FixedColors.avatarPinkTo),
        AvatarGradient(FixedColors.avatarGreenFrom, FixedColors.avatarGreenTo),
    )

    fun hash(key: String): Int {
        var hash = 0
        for (char in key) hash = hash * 31 + char.code
        return hash
    }

    fun indexFor(key: String): Int = abs(hash(key) % ALL.size)

    fun forKey(key: String): AvatarGradient = ALL[indexFor(key)]

    fun forColor(color: AvatarColor): AvatarGradient = ALL[color.ordinal]

    fun resolve(color: AvatarColor?, key: String): AvatarGradient = if (color != null) forColor(color) else forKey(key)
}

class AvatarDrawable {
    private val circlePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val letterPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = FixedColors.lift
        textAlign = Paint.Align.CENTER
    }
    private var gradient: AvatarGradient? = null
    private var shaderSize = -1f
    private var letter = ""

    fun set(label: String, color: AvatarColor?, key: String, typeface: Typeface) {
        letter = letterOf(label)
        val next = AvatarGradients.resolve(color, key)
        if (next !== gradient) {
            gradient = next
            shaderSize = -1f
        }
        letterPaint.typeface = typeface
    }

    fun draw(canvas: Canvas, left: Float, top: Float, size: Float) {
        val current = gradient ?: return
        if (shaderSize != size) {
            val line = CssGradient.linear(AvatarGradients.ANGLE, size, size)
            circlePaint.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, current.from, current.to, Shader.TileMode.CLAMP)
            shaderSize = size
        }
        val save = canvas.save()
        canvas.translate(left, top)
        val radius = size / 2f
        canvas.drawCircle(radius, radius, radius, circlePaint)
        if (letter.isNotEmpty()) {
            letterPaint.textSize = size * LETTER_SCALE
            val metrics = letterPaint.fontMetrics
            val baseline = radius - (metrics.ascent + metrics.descent) / 2f
            canvas.drawText(letter, radius, baseline, letterPaint)
        }
        canvas.restoreToCount(save)
    }

    companion object {
        const val LETTER_SCALE = 0.35f

        fun letterOf(label: String): String {
            if (label.isEmpty()) return ""
            val end = Character.charCount(label.codePointAt(0)).coerceAtMost(label.length)
            return label.substring(0, end).uppercase()
        }
    }
}
