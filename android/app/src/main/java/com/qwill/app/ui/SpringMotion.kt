package com.qwill.app.ui

import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

class SpringMotion(stiffness: Float, dampingRatio: Float, mass: Float = 1f) {
    private val omega0 = sqrt(stiffness / mass)
    private val zetaOmega0 = dampingRatio * omega0
    private val omegaD = omega0 * sqrt((1f - dampingRatio * dampingRatio).coerceAtLeast(1e-6f))

    fun valueAt(t: Float, x0: Float, v0: Float): Float {
        if (t <= 0f) return x0
        val decay = exp(-zetaOmega0 * t)
        return decay * (x0 * cos(omegaD * t) + ((v0 + zetaOmega0 * x0) / omegaD) * sin(omegaD * t))
    }

    fun settleDurationMs(x0: Float, v0: Float, epsilon: Float): Long {
        val envelopePeak = sqrt(x0 * x0 + ((v0 + zetaOmega0 * x0) / omegaD).let { it * it })
        if (envelopePeak <= epsilon) return 0L
        val t = -kotlin.math.ln(epsilon / envelopePeak) / zetaOmega0
        return (t * 1000f).toLong().coerceAtLeast(0L)
    }
}
