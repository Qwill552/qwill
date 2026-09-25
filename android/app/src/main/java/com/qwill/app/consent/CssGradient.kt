package com.qwill.app.consent

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

class GradientLine(val x0: Float, val y0: Float, val x1: Float, val y1: Float)

class RadialShape(val centerX: Float, val centerY: Float, val radiusX: Float, val radiusY: Float)

object CssGradient {
    fun linear(angleDegrees: Float, width: Float, height: Float, left: Float = 0f, top: Float = 0f): GradientLine {
        val radians = Math.toRadians(angleDegrees.toDouble())
        val dx = sin(radians).toFloat()
        val dy = -cos(radians).toFloat()
        val length = abs(width * dx) + abs(height * dy)
        val cx = left + width / 2f
        val cy = top + height / 2f
        val half = length / 2f
        return GradientLine(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half)
    }

    fun circleFarthestCorner(width: Float, height: Float, atX: Float, atY: Float): RadialShape {
        val cx = width * atX
        val cy = height * atY
        val radius = max(
            max(hypot(cx, cy), hypot(width - cx, cy)),
            max(hypot(cx, height - cy), hypot(width - cx, height - cy)),
        )
        return RadialShape(cx, cy, radius, radius)
    }

    fun ellipseFarthestCorner(width: Float, height: Float, atX: Float, atY: Float): RadialShape {
        val cx = width * atX
        val cy = height * atY
        val sideX = max(cx, width - cx)
        val sideY = max(cy, height - cy)
        val scale = sqrt(2f)
        return RadialShape(cx, cy, sideX * scale, sideY * scale)
    }
}
