package com.qwill.app.ui.wheel

import com.qwill.app.consent.CubicBezier
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.pow

class WheelFling(val durationMs: Float, val distance: Float)

object WheelScroller {
    const val ALPHA = 800f
    private const val START_TENSION = 0.4f
    private const val END_TENSION = 1f - START_TENSION
    private const val NB_SAMPLES = 100
    private const val VISCOUS_FLUID_SCALE = 8f
    private const val DECELERATE_POWER = 5
    private val DECELERATION_RATE = (ln(0.75) / ln(0.9)).toFloat()
    private val VISCOUS_FLUID_NORMALIZE = 1f / rawViscousFluid(1f)
    private val EDGE_CURVE = CubicBezier(0f, 0.5f, 0.5f, 1f)

    val SPLINE: FloatArray = buildSpline()

    fun flingOf(velocity: Float): WheelFling {
        val speed = abs(velocity)
        if (speed < 1f) return WheelFling(0f, 0f)
        val l = ln(START_TENSION * speed / ALPHA)
        val durationMs = 1000f * exp(l / (DECELERATION_RATE - 1f))
        val distance = ALPHA * exp(DECELERATION_RATE / (DECELERATION_RATE - 1f) * l)
        return WheelFling(durationMs, if (velocity < 0f) -distance else distance)
    }

    fun flingProgress(progress: Float): Float {
        if (progress <= 0f) return 0f
        if (progress >= 1f) return 1f
        val index = floor(NB_SAMPLES * progress).toInt()
        val tInf = index.toFloat() / NB_SAMPLES
        val tSup = (index + 1).toFloat() / NB_SAMPLES
        val dInf = SPLINE[index]
        val dSup = SPLINE[index + 1]
        return dInf + (progress - tInf) / (tSup - tInf) * (dSup - dInf)
    }

    fun viscousFluid(progress: Float): Float = rawViscousFluid(progress) * VISCOUS_FLUID_NORMALIZE

    fun decelerate(progress: Float): Float = 1f - (1f - progress).pow(DECELERATE_POWER)

    fun edgeFalloff(progress: Float): Float = EDGE_CURVE.valueAt(progress.coerceIn(0f, 1f))

    private fun rawViscousFluid(input: Float): Float {
        var x = input * VISCOUS_FLUID_SCALE
        if (x < 1f) {
            x -= 1f - exp(-x)
        } else {
            val start = 0.36787944117f
            x = 1f - exp(1f - x)
            x = start + x * (1f - start)
        }
        return x
    }

    private fun buildSpline(): FloatArray {
        val spline = FloatArray(NB_SAMPLES + 1)
        var xMin = 0f
        for (i in 0..NB_SAMPLES) {
            val t = i.toFloat() / NB_SAMPLES
            var xMax = 1f
            var x: Float
            var coef: Float
            while (true) {
                x = xMin + (xMax - xMin) / 2f
                coef = 3f * x * (1f - x)
                val tx = coef * ((1f - x) * START_TENSION + x * END_TENSION) + x * x * x
                if (abs(tx - t) < 1e-5f) break
                if (tx > t) xMax = x else xMin = x
            }
            spline[i] = coef + x * x * x
        }
        spline[NB_SAMPLES] = 1f
        return spline
    }
}
