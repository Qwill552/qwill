package com.qwill.app.auth

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ArgbEvaluator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.Shader
import android.view.View
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.min

private val STAR_SPOTS = listOf(
    floatArrayOf(0.15f, 0.25f, 2f), floatArrayOf(0.75f, 0.15f, 3f), floatArrayOf(0.85f, 0.45f, 2f),
    floatArrayOf(0.30f, 0.60f, 1f), floatArrayOf(0.50f, 0.10f, 2f), floatArrayOf(0.10f, 0.80f, 1f),
    floatArrayOf(0.90f, 0.80f, 2.5f), floatArrayOf(0.60f, 0.70f, 1.5f), floatArrayOf(0.20f, 0.45f, 1.5f),
    floatArrayOf(0.45f, 0.85f, 2f), floatArrayOf(0.80f, 0.25f, 1f), floatArrayOf(0.35f, 0.15f, 2.5f),
)

class SkyBackdropView(context: Context) : View(context) {
    var nightProgress: Float = 0f
        private set(value) {
            field = value
            invalidate()
        }

    private val bgPaint = Paint()
    private val starPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val argb = ArgbEvaluator()
    private var transitionAnimator: Animator? = null

    fun setNight(night: Boolean, animated: Boolean) {
        val target = if (night) 1f else 0f
        if (nightProgress == target && transitionAnimator == null) return
        transitionAnimator?.cancel()
        if (!animated || !Motion.animationsEnabled) {
            nightProgress = target
            return
        }
        val anim = ValueAnimator.ofFloat(nightProgress, target)
        anim.duration = Motion.duration(BG_TRANSITION_MS)
        anim.addUpdateListener { nightProgress = it.animatedValue as Float }
        anim.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (transitionAnimator === animation) transitionAnimator = null
            }
        })
        transitionAnimator = anim
        anim.start()
    }

    override fun onDraw(canvas: Canvas) {
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 0f || h <= 0f) return
        if (nightProgress <= 0f) {
            bgPaint.shader = null
            bgPaint.color = FixedColors.authSkyDay
        } else if (nightProgress >= 1f) {
            bgPaint.shader = nightGradient(h)
        } else {
            val day = FixedColors.authSkyDay
            bgPaint.shader = null
            bgPaint.color = argb.evaluate(nightProgress, day, FixedColors.authSkyNightMid) as Int
        }
        canvas.drawRect(0f, 0f, w, h, bgPaint)

        if (nightProgress <= 0f) return
        starPaint.color = withAlpha(FixedColors.authStar, nightProgress)
        for (spot in STAR_SPOTS) {
            canvas.drawCircle(spot[0] * w, spot[1] * h, context.dp(spot[2]), starPaint)
        }
    }

    private fun nightGradient(h: Float): LinearGradient = LinearGradient(
        0f, 0f, 0f, h,
        intArrayOf(FixedColors.authSkyNightTop, FixedColors.authSkyNightMid, FixedColors.authSkyNightBottom),
        floatArrayOf(0f, 0.65f, 1f),
        Shader.TileMode.CLAMP,
    )

    private companion object {
        const val BG_TRANSITION_MS = 1000L
    }
}

class CelestialView(context: Context) : View(context) {
    var nightProgress: Float = 0f
        private set

    private var rotationDeg = 0f
    private var rotating = false
    private var rotateAnimator: ValueAnimator? = null
    private var transitionAnimator: Animator? = null

    private val sunPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val sunGlowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rayPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val moonPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val moonPath = Path()
    private val moonCutout = Path()
    private val moonCrescent = Path()

    private var visible = false
    private var appActive = true

    fun setNight(night: Boolean, animated: Boolean) {
        val target = if (night) 1f else 0f
        if (nightProgress == target && transitionAnimator == null) return
        transitionAnimator?.cancel()
        if (!animated || !Motion.animationsEnabled) {
            nightProgress = target
            invalidate()
            updateRotationState()
            return
        }
        val start = nightProgress
        val anim = ValueAnimator.ofFloat(start, target)
        anim.duration = Motion.duration(TRANSITION_MS)
        anim.interpolator = Motion.easeScreen
        anim.addUpdateListener {
            nightProgress = it.animatedValue as Float
            invalidate()
        }
        anim.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (transitionAnimator !== animation) return
                transitionAnimator = null
            }
        })
        transitionAnimator = anim
        anim.start()
    }

    fun setSceneActive(active: Boolean) {
        if (appActive == active) return
        appActive = active
        updateRotationState()
    }

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        visible = true
        updateRotationState()
    }

    override fun onDetachedFromWindow() {
        visible = false
        updateRotationState()
        super.onDetachedFromWindow()
    }

    private fun updateRotationState() {
        val shouldRotate = visible && appActive && Motion.animationsEnabled
        if (shouldRotate == rotating) return
        rotating = shouldRotate
        if (shouldRotate) {
            val remaining = ((1f - (rotationDeg % 360f) / 360f) * RAY_SPIN_MS).toLong().coerceAtLeast(1)
            val anim = ValueAnimator.ofFloat(rotationDeg, rotationDeg + 360f - rotationDeg % 360f)
            anim.duration = remaining
            anim.interpolator = android.view.animation.LinearInterpolator()
            anim.addUpdateListener {
                rotationDeg = it.animatedValue as Float
                invalidate()
            }
            anim.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (rotateAnimator !== animation) return
                    rotationDeg %= 360f
                    if (rotating) startFullSpin()
                }
            })
            rotateAnimator = anim
            anim.start()
        } else {
            rotateAnimator?.cancel()
            rotateAnimator = null
        }
    }

    private fun startFullSpin() {
        val anim = ValueAnimator.ofFloat(0f, 360f)
        anim.duration = RAY_SPIN_MS
        anim.interpolator = android.view.animation.LinearInterpolator()
        anim.addUpdateListener {
            rotationDeg = it.animatedValue as Float
            invalidate()
        }
        rotateAnimator = anim
        anim.start()
    }

    override fun onDraw(canvas: Canvas) {
        val cx = width / 2f
        val cy = context.dp(SUN_CENTER_OFFSET_DP)
        drawMoon(canvas, cx, cy)
        drawSun(canvas, cx, cy)
    }

    private fun drawSun(canvas: Canvas, cx: Float, cy: Float) {
        val opacity = 1f - nightProgress
        if (opacity <= 0f) return
        val dx = context.dp(SUN_EXIT_DX_DP) * nightProgress
        val dy = context.dp(SUN_EXIT_DY_DP) * nightProgress
        val sx = cx + dx
        val sy = cy + dy
        val discRadius = context.dp(SUN_DISC_DP) / 2f
        canvas.save()
        canvas.translate(sx, sy)
        canvas.rotate(rotationDeg)
        rayPaint.color = withAlpha(FixedColors.authSun, opacity)
        rayPaint.shader = null
        val rayLen = context.dp(SUN_RAY_LEN_DP)
        val rayW = context.dp(SUN_RAY_W_DP)
        val stub = rayLen * SUN_RAY_SOLID_FRACTION
        for (angle in intArrayOf(0, 45, 90, 135)) {
            canvas.save()
            canvas.rotate(angle.toFloat())
            canvas.drawRoundRect(-rayLen / 2f, -rayW / 2f, -rayLen / 2f + stub, rayW / 2f, rayW / 2f, rayW / 2f, rayPaint)
            canvas.drawRoundRect(rayLen / 2f - stub, -rayW / 2f, rayLen / 2f, rayW / 2f, rayW / 2f, rayW / 2f, rayPaint)
            canvas.restore()
        }
        canvas.restore()

        sunGlowPaint.shader = RadialGradient(
            sx, sy, discRadius * SUN_GLOW_REACH,
            withAlpha(FixedColors.authSunGlow, opacity), withAlpha(FixedColors.authSunGlow, 0f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(sx, sy, discRadius * SUN_GLOW_REACH, sunGlowPaint)
        sunPaint.color = withAlpha(FixedColors.authSun, opacity)
        canvas.drawCircle(sx, sy, discRadius, sunPaint)
    }

    private fun drawMoon(canvas: Canvas, cx: Float, cy: Float) {
        val opacity = nightProgress
        if (opacity <= 0f) return
        val dx = context.dp(MOON_ENTER_DX_DP) * (1f - nightProgress) * -1f
        val dy = context.dp(MOON_ENTER_DY_DP) * (1f - nightProgress)
        val mx = cx + dx
        val my = cy + dy
        val radius = context.dp(MOON_DIAMETER_DP) / 2f
        val shiftX = context.dp(MOON_SHADOW_DX_DP)
        val shiftY = context.dp(MOON_SHADOW_DY_DP)

        moonPath.reset()
        moonPath.addCircle(mx, my, radius, Path.Direction.CW)
        moonCutout.reset()
        moonCutout.addCircle(mx + shiftX, my + shiftY, radius, Path.Direction.CW)
        moonCrescent.reset()
        moonCrescent.op(moonPath, moonCutout, Path.Op.DIFFERENCE)

        moonPaint.color = withAlpha(FixedColors.authStar, opacity)
        canvas.drawPath(moonCrescent, moonPaint)
    }

    private companion object {
        const val RAY_SPIN_MS = 20_000L
        const val TRANSITION_MS = 1000L
        const val SUN_CENTER_OFFSET_DP = -370f
        const val SUN_DISC_DP = 100f
        const val SUN_RAY_LEN_DP = 180f
        const val SUN_RAY_W_DP = 6f
        const val SUN_RAY_SOLID_FRACTION = 0.18f
        const val SUN_GLOW_REACH = 1.5f
        const val SUN_EXIT_DX_DP = 300f
        const val SUN_EXIT_DY_DP = 150f
        const val MOON_DIAMETER_DP = 90f
        const val MOON_ENTER_DX_DP = 300f
        const val MOON_ENTER_DY_DP = 150f
        const val MOON_SHADOW_DX_DP = -18f
        const val MOON_SHADOW_DY_DP = 12f
    }
}
