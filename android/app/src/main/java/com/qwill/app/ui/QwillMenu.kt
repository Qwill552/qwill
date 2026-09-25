package com.qwill.app.ui

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.os.Build
import android.text.TextPaint
import android.text.TextUtils
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.LinearLayout
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

class QwillMenuItem(
    val label: String,
    val icon: QwillIcon? = null,
    val danger: Boolean = false,
    val muted: Boolean = false,
    val keepOpen: Boolean = false,
    val action: (View) -> Unit,
)

class QwillMenu(private val host: FrameLayout) {
    private val context: Context = host.context
    private val scrim = View(context).apply {
        isClickable = true
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        setOnClickListener { close() }
    }
    private val frame = ShadowFrame(context)
    private val plate = Plate(context)
    private var animator: ValueAnimator? = null
    private var closing = false
    private var dropUp = false
    private var openLeft = false

    var onClosed: (() -> Unit)? = null

    val isShowing: Boolean get() = scrim.parent != null

    init {
        frame.addView(plate)
    }

    fun show(anchor: RectF, items: List<QwillMenuItem>, safeArea: SafeArea) {
        dismissNow()
        closing = false
        setItems(items)
        applyTheme()
        host.addView(scrim, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        host.addView(frame, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        place(anchor, safeArea)
        open()
    }

    fun setItems(items: List<QwillMenuItem>) {
        val focused = plate.findFocus() != null
        plate.removeAllViews()
        for (item in items) {
            plate.addView(ItemView(context, item) { view -> select(item, view) })
        }
        if (focused) plate.getChildAt(0)?.requestFocus()
    }

    fun applyTheme() {
        frame.invalidate()
        plate.invalidate()
        for (index in 0 until plate.childCount) plate.getChildAt(index).invalidate()
    }

    fun close(animated: Boolean = true) {
        if (!isShowing || closing) return
        closing = true
        animator?.cancel()
        if (!animated || !Motion.animationsEnabled) {
            dismissNow()
            return
        }
        val from = plate.progress
        animator = ValueAnimator.ofFloat(from, 0f).apply {
            duration = (Motion.duration(Motion.CLOSE) * from).toLong().coerceAtLeast(1L)
            interpolator = Motion.easeClose
            addUpdateListener { applyProgress(it.animatedValue as Float) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (animator !== animation) return
                    animator = null
                    dismissNow()
                }
            })
            start()
        }
    }

    fun dismissNow() {
        animator?.cancel()
        animator = null
        val wasShowing = isShowing
        (scrim.parent as? ViewGroup)?.removeView(scrim)
        (frame.parent as? ViewGroup)?.removeView(frame)
        plate.interactive = true
        if (wasShowing) onClosed?.invoke()
    }

    private fun select(item: QwillMenuItem, view: View) {
        if (!plate.interactive || closing) return
        item.action(view)
        if (!item.keepOpen) close()
    }

    private fun place(anchor: RectF, safeArea: SafeArea) {
        val hostWidth = host.width
        val hostHeight = host.height
        val edge = context.dp(EDGE)
        val gap = context.dp(GAP)
        val maxWidth = min(context.dp(MAX_WIDTH), hostWidth - context.dp(SIDE_ROOM)).toInt()
        val minWidth = min(context.dpInt(MIN_WIDTH), maxWidth)
        val natural = plate.naturalWidth()
        val width = natural.coerceIn(minWidth, maxWidth)
        plate.measure(
            View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
            View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
        )
        val height = plate.measuredHeight
        val minY = safeArea.top.toFloat()
        val maxY = (hostHeight - safeArea.bottom).toFloat()
        val spaceBelow = maxY - anchor.bottom
        val spaceAbove = anchor.top - minY
        dropUp = spaceBelow < height + gap + edge && spaceAbove > spaceBelow
        val top = if (dropUp) max(minY + edge, anchor.top - height - gap) else min(anchor.bottom + gap, maxY - height - edge)
        openLeft = anchor.left + width + edge > hostWidth
        val left = if (openLeft) max(edge, anchor.right - width) else min(anchor.left, hostWidth - width - edge)
        plate.layoutParams = FrameLayout.LayoutParams(width, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            leftMargin = left.toInt()
            topMargin = top.toInt()
        }
        plate.pivotX = if (openLeft) width.toFloat() else 0f
        plate.pivotY = if (dropUp) height.toFloat() else 0f
    }

    private fun open() {
        plate.interactive = false
        if (!Motion.animationsEnabled) {
            applyProgress(1f)
            plate.interactive = true
            return
        }
        applyProgress(0f)
        animator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = Motion.duration(OPEN_MS)
            interpolator = OPEN_CURVE
            addUpdateListener { applyProgress(it.animatedValue as Float) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (animator !== animation) return
                    animator = null
                    applyProgress(1f)
                    plate.interactive = true
                }
            })
            start()
        }
    }

    private fun applyProgress(value: Float) {
        plate.progress = value
        val scale = START_SCALE + (1f - START_SCALE) * value
        plate.scaleX = scale
        plate.scaleY = scale
        plate.translationY = -context.dp(START_SHIFT) * (1f - value)
        plate.alpha = value.coerceIn(0f, 1f)
        frame.shadowAlpha = plate.alpha
    }

    private class ShadowFrame(context: Context) : FrameLayout(context) {
        private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val shadowRect = RectF()
        var shadowAlpha = 1f
            set(value) {
                field = value
                invalidate()
            }

        init {
            setWillNotDraw(false)
            clipChildren = false
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }

        override fun onDraw(canvas: Canvas) {
            if (Build.VERSION.SDK_INT < 28 && isHardwareAccelerated) return
            val plate = getChildAt(0) ?: return
            val spread = context.dp(SHADOW_SPREAD)
            shadowRect.set(plate.left + spread, plate.top + spread, plate.right - spread, plate.bottom - spread)
            if (shadowRect.width() <= 0f || shadowRect.height() <= 0f) return
            val palette = Theme.palette
            shadowPaint.color = palette.pulseDock
            shadowPaint.alpha = (255 * shadowAlpha).toInt()
            shadowPaint.setShadowLayer(context.dp(SHADOW_BLUR_RADIUS), 0f, context.dp(SHADOW_OFFSET_Y), withAlpha(FixedColors.menuShadow, 0.7f * shadowAlpha))
            val radius = max(0f, context.dp(PLATE_RADIUS) - spread)
            val save = canvas.save()
            canvas.translate(plate.translationX, plate.translationY)
            canvas.scale(plate.scaleX, plate.scaleY, plate.left + plate.pivotX, plate.top + plate.pivotY)
            canvas.drawRoundRect(shadowRect, radius, radius, shadowPaint)
            canvas.restoreToCount(save)
        }
    }

    private class Plate(context: Context) : LinearLayout(context) {
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
        private val bounds = RectF()
        var progress = 1f
        var interactive = true

        init {
            orientation = VERTICAL
            val pad = context.dpInt(PLATE_PAD)
            setPadding(pad, pad, pad, pad)
            setWillNotDraw(false)
        }

        fun naturalWidth(): Int {
            var widest = 0
            for (index in 0 until childCount) widest = max(widest, (getChildAt(index) as ItemView).naturalWidth())
            return widest + paddingLeft + paddingRight
        }

        override fun onInterceptTouchEvent(ev: MotionEvent): Boolean = !interactive || super.onInterceptTouchEvent(ev)

        override fun onTouchEvent(event: MotionEvent): Boolean = true

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            val radius = context.dp(PLATE_RADIUS)
            val hairline = context.dp(1f)
            bounds.set(0f, 0f, width.toFloat(), height.toFloat())
            fillPaint.color = palette.pulseDock
            canvas.drawRoundRect(bounds, radius, radius, fillPaint)
            bounds.inset(hairline / 2f, hairline / 2f)
            strokePaint.strokeWidth = hairline
            strokePaint.color = withAlpha(palette.pulseGlass, BORDER_ALPHA)
            canvas.drawRoundRect(bounds, radius, radius, strokePaint)
            val save = canvas.save()
            canvas.clipRect(0f, 0f, width.toFloat(), hairline * 2f)
            bounds.set(hairline, hairline * 1.5f, width - hairline, height.toFloat())
            strokePaint.color = withAlpha(palette.pulseGlass, HIGHLIGHT_ALPHA)
            canvas.drawRoundRect(bounds, radius - hairline, radius - hairline, strokePaint)
            canvas.restoreToCount(save)
        }
    }

    private class ItemView(context: Context, private val item: QwillMenuItem, private val onSelect: (View) -> Unit) : View(context) {
        private val textPaint = TextPaint(Paint.ANTI_ALIAS_FLAG)
        private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val bgPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val bounds = RectF()
        private var shown: CharSequence = ""

        init {
            isClickable = true
            isFocusable = true
            contentDescription = item.label
            setOnClickListener { onSelect(it) }
            textPaint.typeface = Fonts.message(FontWeight.MEDIUM)
            textPaint.textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, LABEL_SIZE, resources.displayMetrics)
        }

        fun naturalWidth(): Int {
            val icon = if (item.icon != null) context.dp(ICON_SIZE) + context.dp(ICON_GAP) else 0f
            return ceil(context.dp(ITEM_PAD_X) * 2 + icon + textPaint.measureText(item.label)).toInt()
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val lineHeight = textPaint.fontMetrics.let { it.descent - it.ascent }
            val height = max(context.dp(ITEM_MIN_H), lineHeight + context.dp(ITEM_PAD_Y) * 2)
            setMeasuredDimension(View.MeasureSpec.getSize(widthMeasureSpec), ceil(height).toInt())
        }

        override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
            super.onSizeChanged(w, h, oldw, oldh)
            val icon = if (item.icon != null) context.dp(ICON_SIZE) + context.dp(ICON_GAP) else 0f
            val room = w - context.dp(ITEM_PAD_X) * 2 - icon
            shown = TextUtils.ellipsize(item.label, textPaint, max(0f, room), TextUtils.TruncateAt.END)
        }

        override fun setPressed(pressed: Boolean) {
            super.setPressed(pressed)
            invalidate()
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            val color = when {
                item.danger -> FixedColors.menuDanger
                item.muted -> palette.textSecondary
                else -> palette.pulseInk
            }
            if (isPressed || isFocused) {
                bgPaint.color = if (item.danger) withAlpha(FixedColors.menuDanger, DANGER_PRESS_ALPHA) else withAlpha(palette.pulseGlass, PRESS_ALPHA)
                bounds.set(0f, 0f, width.toFloat(), height.toFloat())
                val radius = context.dp(ITEM_RADIUS)
                canvas.drawRoundRect(bounds, radius, radius, bgPaint)
            }
            var x = context.dp(ITEM_PAD_X)
            val icon = item.icon
            if (icon != null) {
                val size = context.dp(ICON_SIZE)
                icon.draw(canvas, x, (height - size) / 2f, size, color, iconPaint)
                x += size + context.dp(ICON_GAP)
            }
            textPaint.color = color
            val metrics = textPaint.fontMetrics
            val baseline = height / 2f - (metrics.ascent + metrics.descent) / 2f
            canvas.drawText(shown, 0, shown.length, x, baseline, textPaint)
        }

        override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(info)
            info.className = "android.widget.Button"
        }
    }

    private companion object {
        const val GAP = 6f
        const val EDGE = 8f
        const val MIN_WIDTH = 198f
        const val MAX_WIDTH = 280f
        const val SIDE_ROOM = 32f
        const val PLATE_PAD = 6f
        const val PLATE_RADIUS = 18f
        const val ITEM_MIN_H = 44f
        const val ITEM_PAD_X = 12f
        const val ITEM_PAD_Y = 11f
        const val ITEM_RADIUS = 13f
        const val ICON_SIZE = 22f
        const val ICON_GAP = 13f
        const val LABEL_SIZE = 14.5f
        const val BORDER_ALPHA = 0.14f
        const val HIGHLIGHT_ALPHA = 0.16f
        const val PRESS_ALPHA = 0.09f
        const val DANGER_PRESS_ALPHA = 0.12f
        const val OPEN_MS = 280L
        const val START_SCALE = 0.92f
        const val START_SHIFT = 10f
        const val SHADOW_SPREAD = 18f
        const val SHADOW_OFFSET_Y = 24f
        const val SHADOW_BLUR_RADIUS = 44f
        val OPEN_CURVE = PathInterpolator(0.34f, 1.4f, 0.5f, 1f)
    }
}
