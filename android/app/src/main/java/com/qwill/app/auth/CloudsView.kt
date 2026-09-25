package com.qwill.app.auth

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ArgbEvaluator
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.random.Random

private class CloudGeometry(
    val topPct: Float,
    val leftPct: Float,
    val w: Float,
    val h: Float,
    val beforeW: Float,
    val beforeH: Float,
    val beforeTop: Float,
    val beforeLeft: Float,
    val afterW: Float,
    val afterH: Float,
    val afterTop: Float,
    val afterRight: Float,
)

private val GEOMETRIES = listOf(
    CloudGeometry(0.20f, 0.15f, 160f, 50f, 70f, 70f, -30f, 20f, 90f, 90f, -45f, 25f),
    CloudGeometry(0.15f, 0.78f, 200f, 60f, 80f, 80f, -40f, 30f, 100f, 100f, -50f, 30f),
    CloudGeometry(0.68f, 0.05f, 220f, 70f, 90f, 90f, -45f, 40f, 110f, 110f, -55f, 40f),
    CloudGeometry(0.72f, 0.72f, 180f, 55f, 80f, 80f, -35f, 25f, 90f, 90f, -45f, 25f),
    CloudGeometry(0.45f, 0.25f, 120f, 40f, 50f, 50f, -25f, 15f, 60f, 60f, -30f, 20f),
)

private enum class CloudPhase { IDLE, POPPING, REFORMING }

private class CloudState(val geometry: CloudGeometry) {
    var leftDp = 0f
    var topDp = 0f
    var baseScale = 1f
    var phase = CloudPhase.IDLE
    var phaseStartNanos = 0L
}

class CloudsView(context: Context) : View(context) {
    private val states = GEOMETRIES.map { CloudState(it) }
    private val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val bodyRect = RectF()
    private val bodyPath = Path()
    private val hitPath = Path()
    private val random = Random(System.nanoTime())

    private var running = false
    private var lastFrameNanos = 0L
    private val frameCallback = object : Runnable {
        override fun run() {
            if (!running) return
            invalidate()
            postOnAnimationDelayed(this, FRAME_INTERVAL_MS)
        }
    }

    private var nightProgress = 0f
    private var nightAnimator: Animator? = null
    private val argb = ArgbEvaluator()

    private val restOpacity: Float get() = 1f - nightProgress * (1f - NIGHT_OPACITY)
    private val cloudColor: Int get() = argb.evaluate(nightProgress, FixedColors.authCloudDay, FixedColors.authCloudNight) as Int

    fun setNight(night: Boolean, animated: Boolean) {
        val target = if (night) 1f else 0f
        if (nightProgress == target && nightAnimator == null) return
        nightAnimator?.cancel()
        if (!animated || !Motion.animationsEnabled) {
            nightProgress = target
            invalidate()
            return
        }
        val anim = ValueAnimator.ofFloat(nightProgress, target)
        anim.duration = Motion.duration(COLOR_TRANSITION_MS)
        anim.addUpdateListener {
            nightProgress = it.animatedValue as Float
            invalidate()
        }
        anim.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (nightAnimator === animation) nightAnimator = null
            }
        })
        nightAnimator = anim
        anim.start()
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w <= 0 || h <= 0) return
        for (state in states) {
            state.leftDp = state.geometry.leftPct * w / resources.displayMetrics.density
            state.topDp = state.geometry.topPct * h / resources.displayMetrics.density
        }
    }

    fun setActive(active: Boolean) {
        if (active == running) return
        running = active
        if (active) {
            lastFrameNanos = System.nanoTime()
            postOnAnimation(frameCallback)
        } else {
            removeCallbacks(frameCallback)
        }
    }

    private var activeCloud: CloudState? = null

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.action) {
            MotionEvent.ACTION_DOWN -> {
                val cloud = hitTest(event.x, event.y) ?: return false
                activeCloud = cloud
                return true
            }
            MotionEvent.ACTION_UP -> {
                val cloud = activeCloud ?: return false
                activeCloud = null
                if (cloud.phase == CloudPhase.IDLE && hitTest(event.x, event.y) === cloud) pop(cloud)
                return true
            }
            MotionEvent.ACTION_CANCEL -> {
                activeCloud = null
                return true
            }
            else -> return activeCloud != null
        }
    }

    override fun onDraw(canvas: Canvas) {
        val density = resources.displayMetrics.density
        val now = System.nanoTime()
        for (state in states) {
            drawCloud(canvas, state, density, now)
        }
    }

    private fun hitTest(x: Float, y: Float): CloudState? {
        val density = resources.displayMetrics.density
        for (state in states.asReversed()) {
            if (state.phase != CloudPhase.IDLE) continue
            buildShape(state, density, System.nanoTime(), hitPath)
            val bounds = RectF()
            hitPath.computeBounds(bounds, true)
            if (!bounds.contains(x, y)) continue
            val region = android.graphics.Region()
            region.setPath(hitPath, android.graphics.Region(bounds.left.toInt(), bounds.top.toInt(), bounds.right.toInt(), bounds.bottom.toInt()))
            if (region.contains(x.toInt(), y.toInt())) return state
        }
        return null
    }

    private fun pop(state: CloudState) {
        state.phase = CloudPhase.POPPING
        state.phaseStartNanos = System.nanoTime()
        invalidate()
        val popMs = Motion.duration(POP_MS)
        postDelayed({ finishPop(state) }, popMs)
    }

    private fun finishPop(state: CloudState) {
        val scale = (MIN_BASE_SCALE + random.nextFloat() * BASE_SCALE_SPREAD)
        state.baseScale = (scale * 100).toInt() / 100f
        relocate(state)
        state.phase = CloudPhase.REFORMING
        state.phaseStartNanos = System.nanoTime()
        invalidate()
        val popMs = Motion.duration(POP_MS)
        postDelayed({
            if (state.phase == CloudPhase.REFORMING) state.phase = CloudPhase.IDLE
            invalidate()
        }, popMs)
    }

    private fun relocate(state: CloudState) {
        val density = resources.displayMetrics.density
        if (width <= 0 || height <= 0 || density <= 0f) return
        val sceneWDp = width / density
        val sceneHDp = height / density
        val g = state.geometry
        val centerXOffset = g.w / 2f * state.baseScale
        val centerYOffset = g.h / 2f * state.baseScale
        val crownReach = (g.h / 2f + CROWN_CLEARANCE_DP) * state.baseScale
        val minLeft = centerXOffset - g.w / 2f
        val maxLeft = sceneWDp - g.w / 2f - centerXOffset
        val minTop = crownReach - g.h / 2f
        val maxTop = sceneHDp - g.h / 2f - centerYOffset
        if (maxLeft < minLeft || maxTop < minTop) return

        val others = states.filter { it !== state && it.phase != CloudPhase.POPPING }
        var bestLeft = pickInRange(minLeft, maxLeft)
        var bestTop = pickInRange(minTop, maxTop)
        for (attempt in 0 until PLACEMENT_ATTEMPTS) {
            val left = pickInRange(minLeft, maxLeft)
            val top = pickInRange(minTop, maxTop)
            val cx = left + g.w / 2f
            val cy = top + g.h / 2f
            val clear = others.all { other ->
                val ocx = other.leftDp + other.geometry.w / 2f
                val ocy = other.topDp + other.geometry.h / 2f
                hypot((ocx - cx).toDouble(), (ocy - cy).toDouble()) >= MIN_DISTANCE_DP
            }
            bestLeft = left
            bestTop = top
            if (clear) break
        }
        state.leftDp = bestLeft
        state.topDp = bestTop
    }

    private fun pickInRange(min: Float, max: Float): Float {
        if (max <= min) return (min + max) / 2f
        return min + random.nextFloat() * (max - min)
    }

    private fun drawCloud(canvas: Canvas, state: CloudState, density: Float, now: Long) {
        buildShape(state, density, now, bodyPath)
        val opacity = opacityFor(state)
        bodyPaint.color = withAlpha(cloudColor, opacity)
        canvas.drawPath(bodyPath, bodyPaint)
    }

    private fun opacityFor(state: CloudState): Float = when (state.phase) {
        CloudPhase.IDLE -> restOpacity
        CloudPhase.POPPING -> {
            val f = elapsedFraction(state, POP_MS)
            popOpacity(f) * restOpacity
        }
        CloudPhase.REFORMING -> {
            val f = elapsedFraction(state, POP_MS)
            f.coerceIn(0f, 1f) * restOpacity
        }
    }

    private fun elapsedFraction(state: CloudState, durationMs: Long): Float {
        val duration = Motion.duration(durationMs)
        if (duration <= 0L) return 1f
        val elapsedMs = (System.nanoTime() - state.phaseStartNanos) / 1_000_000f
        return (elapsedMs / duration).coerceIn(0f, 1f)
    }

    private fun buildShape(state: CloudState, density: Float, now: Long, out: Path) {
        val g = state.geometry
        val scale = scaleFor(state)
        val leftPx = state.leftDp * density
        val topPx = state.topDp * density
        val cx = leftPx + g.w * density / 2f
        val cy = topPx + g.h * density / 2f

        out.reset()
        val bw = g.w * density
        val bh = g.h * density
        bodyRect.set(cx - bw / 2f * scale, cy - bh / 2f * scale, cx + bw / 2f * scale, cy + bh / 2f * scale)
        out.addRoundRect(bodyRect, context.dp(50f) * scale, context.dp(50f) * scale, Path.Direction.CW)

        val breathe = breatheOffset(state, now, left = true)
        addCircle(out, leftPx, topPx, g.beforeLeft, g.beforeTop, g.beforeW, g.beforeH, density, scale, breathe)
        val breatheR = breatheOffset(state, now, left = false)
        val afterLeft = g.w - g.afterRight - g.afterW
        addCircle(out, leftPx, topPx, afterLeft, g.afterTop, g.afterW, g.afterH, density, scale, breatheR)
    }

    private fun addCircle(
        out: Path,
        bodyLeftPx: Float,
        bodyTopPx: Float,
        localLeftDp: Float,
        localTopDp: Float,
        wDp: Float,
        hDp: Float,
        density: Float,
        scale: Float,
        breathe: FloatArray,
    ) {
        val w = wDp * density * scale * breathe[0]
        val h = hDp * density * scale * breathe[0]
        val cx = bodyLeftPx + (localLeftDp + wDp / 2f) * density * scale + breathe[1] * density
        val cy = bodyTopPx + (localTopDp + hDp / 2f) * density * scale + breathe[2] * density
        out.addOval(cx - w / 2f, cy - h / 2f, cx + w / 2f, cy + h / 2f, Path.Direction.CW)
    }

    private fun scaleFor(state: CloudState): Float = when (state.phase) {
        CloudPhase.IDLE -> state.baseScale
        CloudPhase.POPPING -> state.baseScale * popScale(elapsedFraction(state, POP_MS))
        CloudPhase.REFORMING -> {
            val f = elapsedFraction(state, POP_MS)
            state.baseScale * (REFORM_START_SCALE + (1f - REFORM_START_SCALE) * springEase(f))
        }
    }

    private fun breatheOffset(state: CloudState, now: Long, left: Boolean): FloatArray {
        if (!running) return floatArrayOf(1f, 0f, 0f)
        val periodMs = if (left) BREATHE_LEFT_MS else BREATHE_RIGHT_MS
        val phase = ((now / 1_000_000L) % periodMs).toFloat() / periodMs
        val scales = if (left) LEFT_SCALE_KEYFRAMES else RIGHT_SCALE_KEYFRAMES
        val dx = if (left) LEFT_DX_KEYFRAMES else RIGHT_DX_KEYFRAMES
        val dy = if (left) LEFT_DY_KEYFRAMES else RIGHT_DY_KEYFRAMES
        return floatArrayOf(keyframeValue(scales, phase), keyframeValue(dx, phase), keyframeValue(dy, phase))
    }

    private fun keyframeValue(values: FloatArray, phase: Float): Float {
        val stops = floatArrayOf(0f, 0.33f, 0.66f, 1f)
        for (i in 0 until stops.size - 1) {
            if (phase < stops[i + 1] || i == stops.size - 2) {
                val span = (stops[i + 1] - stops[i]).coerceAtLeast(0.0001f)
                val local = ((phase - stops[i]) / span).coerceIn(0f, 1f)
                val eased = easeInOut(local)
                return values[i] + (values[i + 1] - values[i]) * eased
            }
        }
        return values.last()
    }

    private fun easeInOut(t: Float): Float = 0.5f - 0.5f * cos(Math.PI.toFloat() * t)

    private fun popScale(f: Float): Float {
        val stops = floatArrayOf(0f, 0.12f, 0.26f, 0.42f, 0.62f, 0.74f, 0.86f, 0.94f, 1f)
        val values = floatArrayOf(1f, 1.09f, 1.13f, 1.16f, 1.17f, 1f, 0.62f, 0.25f, 0.05f)
        return piecewiseLinear(stops, values, f)
    }

    private fun popOpacity(f: Float): Float {
        val stops = floatArrayOf(0f, 0.86f, 1f)
        val values = floatArrayOf(1f, 1f, 0f)
        return piecewiseLinear(stops, values, f)
    }

    private fun piecewiseLinear(stops: FloatArray, values: FloatArray, f: Float): Float {
        for (i in 0 until stops.size - 1) {
            if (f <= stops[i + 1] || i == stops.size - 2) {
                val span = (stops[i + 1] - stops[i]).coerceAtLeast(0.0001f)
                val local = ((f - stops[i]) / span).coerceIn(0f, 1f)
                return values[i] + (values[i + 1] - values[i]) * local
            }
        }
        return values.last()
    }

    private fun springEase(f: Float): Float = 1f - (1f - f) * (1f - f)

    private companion object {
        const val FRAME_INTERVAL_MS = 16L
        const val POP_MS = 190L
        const val COLOR_TRANSITION_MS = 1000L
        const val NIGHT_OPACITY = 0.6f
        const val MIN_BASE_SCALE = 0.6f
        const val BASE_SCALE_SPREAD = 0.5f
        const val REFORM_START_SCALE = 0.35f
        const val MIN_DISTANCE_DP = 180f
        const val CROWN_CLEARANCE_DP = 60f
        const val PLACEMENT_ATTEMPTS = 50
        const val BREATHE_LEFT_MS = 8000L
        const val BREATHE_RIGHT_MS = 10000L
        val LEFT_SCALE_KEYFRAMES = floatArrayOf(1f, 1.05f, 0.95f, 1f)
        val LEFT_DX_KEYFRAMES = floatArrayOf(0f, 3f, -2f, 0f)
        val LEFT_DY_KEYFRAMES = floatArrayOf(0f, -2f, 3f, 0f)
        val RIGHT_SCALE_KEYFRAMES = floatArrayOf(1f, 0.95f, 1.05f, 1f)
        val RIGHT_DX_KEYFRAMES = floatArrayOf(0f, -3f, 2f, 0f)
        val RIGHT_DY_KEYFRAMES = floatArrayOf(0f, -2f, 3f, 0f)
    }
}
