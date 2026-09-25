package com.qwill.app.ui

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.annotation.TargetApi
import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Region
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.PixelCopy
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import com.qwill.app.ui.theme.Motion
import kotlin.math.hypot
import kotlin.math.max

class ThemeReveal(private val activity: Activity) {
    private var overlay: RevealView? = null
    private var animator: ValueAnimator? = null
    private var pendingCapture = false
    private var generation = 0

    val isRunning: Boolean get() = overlay != null || pendingCapture

    fun run(windowX: Float, windowY: Float, growNewTheme: Boolean, mutate: () -> Unit) {
        finishNow()
        val decor = activity.window.decorView as? ViewGroup
        if (decor == null || !Motion.animationsEnabled || decor.width == 0 || decor.height == 0) {
            mutate()
            return
        }
        val token = ++generation
        pendingCapture = true
        capture(decor) { snapshot ->
            if (token != generation) {
                snapshot?.recycle()
                return@capture
            }
            pendingCapture = false
            if (snapshot == null) {
                mutate()
                return@capture
            }
            start(decor, snapshot, windowX, windowY, growNewTheme)
            mutate()
        }
    }

    fun finishNow() {
        generation++
        pendingCapture = false
        animator?.cancel()
        animator = null
        removeOverlay()
    }

    private fun start(decor: ViewGroup, snapshot: Bitmap, x: Float, y: Float, grow: Boolean) {
        val maxRadius = farthestCorner(decor.width.toFloat(), decor.height.toFloat(), x, y)
        val view = RevealView(activity, snapshot, x, y, grow)
        view.radius = if (grow) 0f else maxRadius
        decor.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        overlay = view
        val from = if (grow) 0f else maxRadius
        val to = if (grow) maxRadius else 0f
        animator = ValueAnimator.ofFloat(from, to).apply {
            duration = DURATION_MS
            interpolator = CURVE
            addUpdateListener {
                view.radius = it.animatedValue as Float
                view.invalidate()
            }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (animator !== animation) return
                    animator = null
                    removeOverlay()
                }
            })
            start()
        }
    }

    private fun removeOverlay() {
        val view = overlay ?: return
        overlay = null
        (view.parent as? ViewGroup)?.removeView(view)
        view.release()
    }

    private fun capture(decor: View, done: (Bitmap?) -> Unit) {
        val bitmap = try {
            Bitmap.createBitmap(decor.width, decor.height, Bitmap.Config.ARGB_8888)
        } catch (e: OutOfMemoryError) {
            done(null)
            return
        }
        if (Build.VERSION.SDK_INT >= 26 && decor.isHardwareAccelerated) {
            captureWindow(bitmap, done)
            return
        }
        decor.draw(Canvas(bitmap))
        done(bitmap)
    }

    @TargetApi(26)
    private fun captureWindow(bitmap: Bitmap, done: (Bitmap?) -> Unit) {
        try {
            PixelCopy.request(activity.window, bitmap, { result ->
                if (result == PixelCopy.SUCCESS) {
                    done(bitmap)
                } else {
                    bitmap.recycle()
                    done(null)
                }
            }, Handler(Looper.getMainLooper()))
        } catch (e: IllegalArgumentException) {
            bitmap.recycle()
            done(null)
        }
    }

    private class RevealView(
        activity: Activity,
        private var snapshot: Bitmap?,
        private val centerX: Float,
        private val centerY: Float,
        private val grow: Boolean,
    ) : View(activity) {
        private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
        private val circle = Path()
        var radius = 0f

        init {
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        }

        fun release() {
            snapshot?.recycle()
            snapshot = null
        }

        override fun onDraw(canvas: Canvas) {
            val bitmap = snapshot ?: return
            circle.reset()
            circle.addCircle(centerX, centerY, max(0f, radius), Path.Direction.CW)
            val save = canvas.save()
            if (grow) clipOut(canvas) else canvas.clipPath(circle)
            canvas.drawBitmap(bitmap, 0f, 0f, paint)
            canvas.restoreToCount(save)
        }

        private fun clipOut(canvas: Canvas) {
            if (Build.VERSION.SDK_INT >= 26) {
                canvas.clipOutPath(circle)
            } else {
                @Suppress("DEPRECATION")
                canvas.clipPath(circle, Region.Op.DIFFERENCE)
            }
        }
    }

    companion object {
        const val DURATION_MS = 650L
        val CURVE = PathInterpolator(0.22f, 1f, 0.36f, 1f)

        fun farthestCorner(width: Float, height: Float, x: Float, y: Float): Float = max(
            max(hypot(x, y), hypot(width - x, y)),
            max(hypot(x, height - y), hypot(width - x, height - y)),
        )
    }
}
