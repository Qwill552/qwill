package com.qwill.app.ui

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Region
import android.os.Build
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.view.ViewTreeObserver
import android.view.accessibility.AccessibilityEvent
import android.view.animation.Interpolator
import android.widget.FrameLayout
import android.widget.TextView
import com.qwill.app.ui.glass.GlassView
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.BackGestureOverlay
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Glass
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max

class QwillSheet(private val context: Context, private val host: FrameLayout, titleText: String) : BackGestureOverlay {
    val root = FrameLayout(context)
    val body = FrameLayout(context)
    var onClosed: (() -> Unit)? = null

    private val scrim = GlassView(context, host, Glass.SHEET_BLUR, Glass.SHEET_SATURATION, tracksSource = false)
    private val title = TextView(context)
    private val header = Header(context)
    private val frame = Frame(context)
    private var animator: ValueAnimator? = null
    private var offset = 0f
    private var backActive = false
    private var backHeight = 0f
    private var closing = false

    var isClosed = false
        private set

    init {
        root.clipChildren = false
        root.addView(scrim, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        scrim.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        scrim.setOnClickListener { requestClose() }
        title.text = titleText
        title.typeface = Fonts.display(FontWeight.SEMIBOLD)
        title.isSingleLine = true
        title.ellipsize = TextUtils.TruncateAt.END
        title.includeFontPadding = false
        val side = context.dpInt(Dimens.SPACE_4)
        title.setPadding(side, 0, side, context.dpInt(Dimens.SPACE_2))
        header.addView(title, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dpInt(GRIP_H)
        })
        body.setPadding(side, 0, side, side)
        frame.addView(header)
        frame.addView(body)
        if (Build.VERSION.SDK_INT >= 28) frame.accessibilityPaneTitle = titleText
        root.addView(frame, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
    }

    fun show() {
        if (root.parent == null) host.addView(root, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        applyTheme()
        title.post { title.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED) }
        if (!Motion.animationsEnabled) {
            scrim.alpha = 1f
            return
        }
        scrim.alpha = 0f
        frame.alpha = 0f
        frame.viewTreeObserver.addOnPreDrawListener(object : ViewTreeObserver.OnPreDrawListener {
            override fun onPreDraw(): Boolean {
                frame.viewTreeObserver.removeOnPreDrawListener(this)
                frame.alpha = 1f
                if (closing || isClosed) return true
                val height = frame.height.toFloat()
                setOffset(height)
                run(Motion.MENU, Motion.easeScreen, height, 0f, 0f, 1f) {}
                return true
            }
        })
    }

    fun requestClose() {
        if (closing || isClosed) return
        closing = true
        backActive = false
        if (!Motion.animationsEnabled || frame.height == 0) {
            finish()
            return
        }
        run(Motion.CLOSE, Motion.easeClose, offset, frame.height.toFloat(), scrim.alpha, 0f) { finish() }
    }

    fun dismissNow() {
        if (isClosed) return
        closing = true
        animator?.cancel()
        animator = null
        finish()
    }

    fun applyTheme() {
        val palette = Theme.palette
        scrim.tint = palette.scrimBg
        title.setTextColor(palette.textPrimary)
        title.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.SCREEN_TITLE))
        frame.refresh()
        header.invalidate()
    }

    fun setSafeArea(area: SafeArea) {
        frame.safeTop = area.top
        frame.setPadding(area.left, 0, area.right, area.bottom)
        frame.requestLayout()
    }

    override fun begin() {
        if (closing || isClosed) return
        animator?.cancel()
        animator = null
        backHeight = frame.height.toFloat()
        backActive = true
    }

    override fun progress(value: Float) {
        if (!backActive) return
        setOffset(backHeight * value.coerceIn(0f, 1f) * BACK_TRAVEL)
    }

    override fun cancel() {
        if (!backActive) return
        backActive = false
        settle()
    }

    override fun commit() {
        if (!backActive) {
            requestClose()
            return
        }
        backActive = false
        flingClose(0f)
    }

    private fun settle() {
        if (closing || isClosed) return
        if (!Motion.animationsEnabled) {
            setOffset(0f)
            return
        }
        run(Motion.MENU, Motion.easeScreen, offset, 0f, scrim.alpha, 1f) {}
    }

    private fun flingClose(velocityPxPerMs: Float) {
        if (closing || isClosed) return
        closing = true
        val height = frame.height.toFloat()
        if (!Motion.animationsEnabled || height <= 0f) {
            finish()
            return
        }
        val remaining = max(0f, height - offset)
        val speed = max(context.dp(CLOSE_MIN_SPEED), abs(velocityPxPerMs))
        val duration = (remaining / speed).toLong().coerceIn(CLOSE_MIN_MS, CLOSE_MAX_MS)
        run(duration, Motion.easeClose, offset, height, scrim.alpha, 0f, raw = true) { finish() }
    }

    private fun run(
        durationMs: Long,
        curve: Interpolator,
        fromOffset: Float,
        toOffset: Float,
        fromScrim: Float,
        toScrim: Float,
        raw: Boolean = false,
        end: () -> Unit,
    ) {
        animator?.cancel()
        val next = ValueAnimator.ofFloat(0f, 1f)
        next.duration = if (raw) durationMs else Motion.duration(durationMs)
        next.interpolator = curve
        next.addUpdateListener {
            val p = it.animatedValue as Float
            setOffset(fromOffset + (toOffset - fromOffset) * p)
            scrim.alpha = fromScrim + (toScrim - fromScrim) * p
        }
        next.addListener(object : AnimatorListenerAdapter() {
            private var cancelled = false

            override fun onAnimationCancel(animation: Animator) {
                cancelled = true
            }

            override fun onAnimationEnd(animation: Animator) {
                if (animator === animation) animator = null
                if (!cancelled) end()
            }
        })
        animator = next
        next.start()
    }

    private fun setOffset(value: Float) {
        offset = value
        frame.translationY = value
    }

    private fun finish() {
        if (isClosed) return
        isClosed = true
        closing = true
        (root.parent as? ViewGroup)?.removeView(root)
        onClosed?.invoke()
    }

    private inner class Header(context: Context) : FrameLayout(context) {
        private val gripPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rect = RectF()
        private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop
        private var tracker: VelocityTracker? = null
        private var startY = 0f
        private var startOffset = 0f
        private var dragging = false

        init {
            setWillNotDraw(false)
        }

        override fun onDraw(canvas: Canvas) {
            val width = context.dp(GRIP_W)
            val height = context.dp(GRIP_BAR)
            val top = (context.dp(GRIP_H) - height) / 2f
            rect.set((this.width - width) / 2f, top, (this.width + width) / 2f, top + height)
            gripPaint.color = withAlpha(Theme.palette.textSecondary, GRIP_ALPHA)
            canvas.drawRoundRect(rect, height / 2f, height / 2f, gripPaint)
        }

        @Suppress("ClickableViewAccessibility")
        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (closing || isClosed) return false
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    animator?.cancel()
                    animator = null
                    startY = event.rawY
                    startOffset = offset
                    dragging = false
                    tracker?.recycle()
                    tracker = VelocityTracker.obtain().also { track(it, event) }
                    return true
                }
                MotionEvent.ACTION_MOVE -> {
                    tracker?.let { track(it, event) }
                    if (!dragging) {
                        if (abs(event.rawY - startY) <= touchSlop) return true
                        dragging = true
                        startY = event.rawY
                        startOffset = offset
                    }
                    setOffset(max(0f, startOffset + event.rawY - startY))
                    return true
                }
                MotionEvent.ACTION_UP -> {
                    val velocity = tracker?.let {
                        track(it, event)
                        it.computeCurrentVelocity(1)
                        it.yVelocity
                    } ?: 0f
                    release()
                    val height = frame.height.toFloat()
                    if (velocity > context.dp(FLING_SPEED) || offset > height * CLOSE_SHARE) {
                        flingClose(velocity)
                    } else if (offset > 0f) {
                        settle()
                    }
                    return true
                }
                MotionEvent.ACTION_CANCEL -> {
                    release()
                    if (offset > 0f) settle()
                    return true
                }
            }
            return true
        }

        private fun track(tracker: VelocityTracker, event: MotionEvent) {
            val copy = MotionEvent.obtain(event)
            copy.setLocation(event.rawX, event.rawY)
            tracker.addMovement(copy)
            copy.recycle()
        }

        private fun release() {
            dragging = false
            tracker?.recycle()
            tracker = null
        }
    }

    private inner class Frame(context: Context) : ViewGroup(context) {
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val borderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        private val shape = Path()
        private val border = Path()
        private val rect = RectF()
        private var shapeKey = ""
        private var shadow: Bitmap? = null
        private var shadowKey = ""
        var safeTop = 0

        init {
            setWillNotDraw(false)
            isClickable = true
            clipChildren = false
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        }

        fun refresh() {
            shadowKey = ""
            invalidate()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val width = MeasureSpec.getSize(widthMeasureSpec)
            val available = MeasureSpec.getSize(heightMeasureSpec)
            val maxHeight = max(0, available - safeTop - context.dpInt(TOP_SPACE))
            val inner = max(0, width - paddingLeft - paddingRight)
            header.measure(MeasureSpec.makeMeasureSpec(inner, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
            val bodyMax = max(0, maxHeight - header.measuredHeight - paddingBottom)
            body.measure(MeasureSpec.makeMeasureSpec(inner, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(bodyMax, MeasureSpec.AT_MOST))
            setMeasuredDimension(width, header.measuredHeight + body.measuredHeight + paddingBottom)
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            header.layout(paddingLeft, 0, paddingLeft + header.measuredWidth, header.measuredHeight)
            body.layout(paddingLeft, header.measuredHeight, paddingLeft + body.measuredWidth, header.measuredHeight + body.measuredHeight)
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            val radius = context.dp(Dimens.RADIUS_CARD)
            val hairline = context.dp(Dimens.HAIRLINE)
            val key = "$width:$height"
            if (key != shapeKey) {
                shapeKey = key
                rect.set(0f, 0f, width.toFloat(), height.toFloat())
                shape.reset()
                shape.addRoundRect(rect, floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f), Path.Direction.CW)
                val half = hairline / 2f
                border.reset()
                border.moveTo(half, radius)
                rect.set(half, half, half + (radius - half) * 2f, half + (radius - half) * 2f)
                border.arcTo(rect, 180f, 90f)
                border.lineTo(width - radius, half)
                rect.set(width - half - (radius - half) * 2f, half, width - half, half + (radius - half) * 2f)
                border.arcTo(rect, 270f, 90f)
            }
            drawShadow(canvas, palette.isDark)
            fillPaint.color = palette.sheetBg
            canvas.drawPath(shape, fillPaint)
            borderPaint.strokeWidth = hairline
            borderPaint.color = palette.sheetBorder
            canvas.drawPath(border, borderPaint)
        }

        private fun drawShadow(canvas: Canvas, dark: Boolean) {
            val reach = context.dp(SHADOW_BLUR)
            val key = "$width:$height:$dark"
            var bitmap = shadow
            if (bitmap == null || key != shadowKey) {
                bitmap?.recycle()
                val bw = ceil((width + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
                val bh = ceil((height + reach * 2) * SHADOW_SCALE).toInt().coerceAtLeast(1)
                bitmap = Bitmap.createBitmap(bw, bh, Bitmap.Config.ALPHA_8)
                val sigma = reach / 2f * SHADOW_SCALE
                val blur = max(0.5f, (sigma - 0.5f) / 0.57735f)
                val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = FixedColors.lift
                    maskFilter = BlurMaskFilter(blur, BlurMaskFilter.Blur.NORMAL)
                }
                val corner = context.dp(Dimens.RADIUS_CARD) * SHADOW_SCALE
                val core = RectF(reach * SHADOW_SCALE, reach * SHADOW_SCALE, (reach + width) * SHADOW_SCALE, (reach + height) * SHADOW_SCALE)
                Canvas(bitmap).drawRoundRect(core, corner, corner, paint)
                shadow = bitmap
                shadowKey = key
            }
            shadowPaint.color = if (dark) withAlpha(Color.BLACK, DARK_ALPHA) else withAlpha(LIGHT_SHADOW, LIGHT_ALPHA)
            val y = context.dp(SHADOW_Y)
            val save = canvas.save()
            if (Build.VERSION.SDK_INT >= 26) {
                canvas.clipOutPath(shape)
            } else {
                @Suppress("DEPRECATION")
                canvas.clipPath(shape, Region.Op.DIFFERENCE)
            }
            rect.set(-reach, -reach + y, width + reach, height + reach + y)
            canvas.drawBitmap(bitmap, null, rect, shadowPaint)
            canvas.restoreToCount(save)
        }
    }

    private companion object {
        const val GRIP_H = 28f
        const val GRIP_W = 36f
        const val GRIP_BAR = 4f
        const val GRIP_ALPHA = 0.4f
        const val TOP_SPACE = 68f
        const val CLOSE_SHARE = 0.4f
        const val FLING_SPEED = 0.6f
        const val BACK_TRAVEL = 0.35f
        const val CLOSE_MIN_SPEED = 1.2f
        const val CLOSE_MIN_MS = 120L
        const val CLOSE_MAX_MS = 320L
        const val SHADOW_Y = 10f
        const val SHADOW_BLUR = 34f
        const val SHADOW_SCALE = 0.25f
        const val LIGHT_ALPHA = 0.14f
        const val DARK_ALPHA = 0.46f
        val LIGHT_SHADOW = Color.rgb(20, 24, 35)
    }
}
