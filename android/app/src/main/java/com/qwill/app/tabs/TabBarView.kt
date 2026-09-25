package com.qwill.app.tabs

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.text.TextPaint
import android.util.TypedValue
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityNodeInfo
import android.view.animation.PathInterpolator
import androidx.core.graphics.PathParser
import com.qwill.app.consent.CssGradient
import com.qwill.app.ui.QwillSwitch
import com.qwill.app.ui.glass.GlassView
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.roundToInt

class TabBarView(context: Context, source: View, private val onTabClick: (MainTab) -> Unit) : ViewGroup(context) {
    private val glass = GlassView(context, source, BLUR, SATURATION)
    private val items = MainTab.entries.map { TabItemView(context, it) }
    private val capsule = RectF()
    private val bottomHighlight = Path()
    private val highlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
    private val shadowRect = RectF()
    private var shadow: Bitmap? = null
    private var shadowFor = -1f
    private var safeArea = SafeArea.NONE
    private var hideAnimator: ValueAnimator? = null
    private var hiddenTarget = false

    init {
        setWillNotDraw(false)
        clipChildren = false
        importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        glass.importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO
        addView(glass)
        for (item in items) {
            item.setOnClickListener { onTabClick(item.tab) }
            addView(item)
        }
        applyTheme()
    }

    val capsuleHeight: Int get() = ceil(context.dp(BORDER) * 2 + context.dp(PAD_TOP) + context.dp(PAD_BOTTOM) + items.first().contentHeight()).toInt()

    fun setSafeArea(area: SafeArea) {
        if (area == safeArea) return
        safeArea = area
        requestLayout()
    }

    fun setSelected(tab: MainTab, animated: Boolean) {
        for (item in items) item.setActive(item.tab == tab, animated)
    }

    fun setUnread(count: Int) {
        items.first { it.tab == MainTab.CHATS }.setUnread(count)
    }

    fun setHidden(hidden: Boolean, animated: Boolean) {
        if (hidden == hiddenTarget) return
        hiddenTarget = hidden
        hideAnimator?.cancel()
        hideAnimator = null
        val travel = capsuleHeight * HIDE_SHIFT
        val from = if (visibility == VISIBLE) alpha else 0f
        val to = if (hidden) 0f else 1f
        if (!animated || !Motion.animationsEnabled || !isAttachedToWindow) {
            applyHide(to, travel)
            visibility = if (hidden) GONE else VISIBLE
            return
        }
        visibility = VISIBLE
        applyHide(from, travel)
        hideAnimator = ValueAnimator.ofFloat(from, to).apply {
            duration = Motion.duration(HIDE_MS)
            interpolator = HIDE_CURVE
            addUpdateListener { applyHide(it.animatedValue as Float, travel) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    if (hideAnimator !== animation) return
                    hideAnimator = null
                    if (hiddenTarget) visibility = GONE
                }
            })
            start()
        }
    }

    fun applyTheme() {
        val palette = Theme.palette
        glass.cornerRadius = context.dp(RADIUS)
        glass.tint = withAlpha(palette.pulseDock, TINT_ALPHA)
        glass.borderColor = withAlpha(palette.pulseGlass, BORDER_ALPHA)
        glass.highlightColor = withAlpha(palette.pulseGlass, HIGHLIGHT_TOP_ALPHA)
        for (item in items) item.onThemeChanged()
        invalidate()
    }

    private fun applyHide(shown: Float, travel: Float) {
        alpha = shown
        translationY = travel * (1f - shown)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (hiddenTarget) return false
        if (event.actionMasked == MotionEvent.ACTION_DOWN && !capsule.contains(event.x, event.y)) return false
        return super.dispatchTouchEvent(event)
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val width = MeasureSpec.getSize(widthMeasureSpec)
        val height = ceil(context.dp(SHADOW_ROOM_TOP)).toInt() + capsuleHeight + ceil(context.dp(EDGE)).toInt() + safeArea.bottom
        val capsuleWidth = max(0, width - (context.dp(EDGE) * 2).roundToInt() - safeArea.left - safeArea.right)
        glass.measure(MeasureSpec.makeMeasureSpec(capsuleWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(capsuleHeight, MeasureSpec.EXACTLY))
        val inner = max(0, capsuleWidth - ((context.dp(BORDER) + context.dp(PAD_X)) * 2).roundToInt())
        val itemWidth = inner / items.size
        for (item in items) item.measure(MeasureSpec.makeMeasureSpec(itemWidth, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(capsuleHeight, MeasureSpec.EXACTLY))
        setMeasuredDimension(width, height)
    }

    override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
        val left = (context.dp(EDGE)).roundToInt() + safeArea.left
        val top = ceil(context.dp(SHADOW_ROOM_TOP)).toInt()
        glass.layout(left, top, left + glass.measuredWidth, top + glass.measuredHeight)
        capsule.set(left.toFloat(), top.toFloat(), (left + glass.measuredWidth).toFloat(), (top + glass.measuredHeight).toFloat())
        val inset = ((context.dp(BORDER) + context.dp(PAD_X))).roundToInt()
        val inner = glass.measuredWidth - inset * 2
        val itemWidth = if (items.isEmpty()) 0 else inner / items.size
        var x = left + inset + (inner - itemWidth * items.size) / 2
        for (item in items) {
            item.layout(x, top, x + itemWidth, top + capsuleHeight)
            x += itemWidth
        }
        buildBottomHighlight()
    }

    override fun onDraw(canvas: Canvas) {
        if (capsule.isEmpty) return
        val bitmap = shadowBitmap()
        val spread = context.dp(SHADOW_SPREAD)
        val reach = context.dp(SHADOW_BLUR)
        shadowRect.set(capsule.left + spread - reach, capsule.top + spread - reach + context.dp(SHADOW_Y), capsule.right - spread + reach, capsule.bottom - spread + reach + context.dp(SHADOW_Y))
        shadowPaint.color = FixedColors.tabShadow
        canvas.drawBitmap(bitmap, null, shadowRect, shadowPaint)
    }

    override fun dispatchDraw(canvas: Canvas) {
        val count = childCount
        if (count == 0) return
        drawChild(canvas, glass, drawingTime)
        highlightPaint.color = withAlpha(Theme.palette.pulseGlass, HIGHLIGHT_BOTTOM_ALPHA)
        canvas.drawPath(bottomHighlight, highlightPaint)
        for (item in items) drawChild(canvas, item, drawingTime)
    }

    override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
        super.onInitializeAccessibilityNodeInfo(info)
        info.className = "android.widget.TabWidget"
    }

    private fun buildBottomHighlight() {
        val radius = context.dp(RADIUS)
        val hairline = context.dp(BORDER)
        val outer = Path().apply { addRoundRect(capsule, radius, radius, Path.Direction.CW) }
        val lifted = RectF(capsule)
        lifted.offset(0f, -hairline)
        val shifted = Path().apply { addRoundRect(lifted, radius, radius, Path.Direction.CW) }
        bottomHighlight.reset()
        bottomHighlight.op(outer, shifted, Path.Op.DIFFERENCE)
    }

    private fun shadowBitmap(): Bitmap {
        val width = capsule.width()
        val existing = shadow
        if (existing != null && shadowFor == width) return existing
        existing?.recycle()
        val scale = SHADOW_SCALE
        val spread = context.dp(SHADOW_SPREAD)
        val reach = context.dp(SHADOW_BLUR)
        val coreWidth = max(1f, width - spread * 2)
        val coreHeight = max(1f, capsule.height() - spread * 2)
        val bitmapWidth = ceil((coreWidth + reach * 2) * scale).toInt().coerceAtLeast(1)
        val bitmapHeight = ceil((coreHeight + reach * 2) * scale).toInt().coerceAtLeast(1)
        val result = Bitmap.createBitmap(bitmapWidth, bitmapHeight, Bitmap.Config.ALPHA_8)
        val sigma = reach / 2f * scale
        val radius = max(0.5f, (sigma - 0.5f) / 0.57735f)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = FixedColors.lift
            maskFilter = BlurMaskFilter(radius, BlurMaskFilter.Blur.NORMAL)
        }
        val corner = max(0f, context.dp(RADIUS) - spread) * scale
        val core = RectF(reach * scale, reach * scale, (reach + coreWidth) * scale, (reach + coreHeight) * scale)
        Canvas(result).drawRoundRect(core, corner, corner, paint)
        shadow = result
        shadowFor = width
        return result
    }

    override fun onDetachedFromWindow() {
        super.onDetachedFromWindow()
        hideAnimator?.cancel()
        hideAnimator = null
        visibility = if (hiddenTarget) GONE else VISIBLE
        applyHide(if (hiddenTarget) 0f else 1f, capsuleHeight * HIDE_SHIFT)
    }

    private class TabItemView(context: Context, val tab: MainTab) : View(context) {
        private val icon: Path = PathParser.createPathFromPathData(TAB_ICON_PATH.getValue(tab))
        private val iconPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            strokeWidth = ICON_STROKE
        }
        private val labelPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Fonts.message(FontWeight.MEDIUM)
            textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, LABEL_SIZE, context.resources.displayMetrics)
            letterSpacing = LABEL_TRACKING_PX / LABEL_SIZE
            textAlign = Paint.Align.CENTER
        }
        private val badgePaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Fonts.message(FontWeight.BOLD)
            textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, BADGE_TEXT, context.resources.displayMetrics)
            fontFeatureSettings = "'tnum' 1"
            textAlign = Paint.Align.CENTER
            color = FixedColors.lift
        }
        private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
        private val badgeFill = Paint(Paint.ANTI_ALIAS_FLAG)
        private val rect = RectF()
        private var colorProgress = 0f
        private var scaleProgress = 0f
        private var colorAnimator: ValueAnimator? = null
        private var scaleAnimator: ValueAnimator? = null
        private var active = false
        private var unread = 0
        private var badgeText = ""
        private var badgeShaderWidth = -1f

        init {
            isClickable = true
            isFocusable = true
            updateDescription()
        }

        fun contentHeight(): Float {
            val metrics = labelPaint.fontMetrics
            return context.dp(ICON) + context.dp(LABEL_GAP) + (metrics.descent - metrics.ascent)
        }

        fun setActive(value: Boolean, animated: Boolean) {
            if (value == active) return
            active = value
            updateDescription()
            val target = if (value) 1f else 0f
            colorAnimator?.cancel()
            scaleAnimator?.cancel()
            if (!animated || !Motion.animationsEnabled || !isAttachedToWindow) {
                colorProgress = target
                scaleProgress = target
                invalidate()
                return
            }
            colorAnimator = animate(colorProgress, target, COLOR_MS, COLOR_CURVE) { colorProgress = it }
            scaleAnimator = animate(scaleProgress, target, SCALE_MS, SCALE_CURVE) { scaleProgress = it }
        }

        fun setUnread(count: Int) {
            if (count == unread) return
            unread = count
            badgeText = when {
                count <= 0 -> ""
                count > MAX_BADGE -> "$MAX_BADGE+"
                else -> count.toString()
            }
            updateDescription()
            invalidate()
        }

        fun onThemeChanged() {
            invalidate()
        }

        private fun animate(from: Float, to: Float, ms: Long, curve: PathInterpolator, apply: (Float) -> Unit): ValueAnimator =
            ValueAnimator.ofFloat(from, to).apply {
                duration = Motion.duration(ms)
                interpolator = curve
                addUpdateListener {
                    apply(it.animatedValue as Float)
                    invalidate()
                }
                start()
            }

        private fun updateDescription() {
            contentDescription = if (unread > 0) "${tab.label}, непрочитанных: $unread" else tab.label
        }

        override fun onDetachedFromWindow() {
            super.onDetachedFromWindow()
            colorAnimator?.cancel()
            scaleAnimator?.cancel()
            val target = if (active) 1f else 0f
            colorProgress = target
            scaleProgress = target
        }

        override fun onDraw(canvas: Canvas) {
            val palette = Theme.palette
            val color = QwillSwitch.blend(withAlpha(palette.pulseInk, INK_ALPHA), FixedColors.tabActive, colorProgress)
            if (isFocused) {
                fillPaint.shader = null
                fillPaint.color = withAlpha(palette.pulseGlass, FOCUS_ALPHA)
                rect.set(0f, context.dp(FOCUS_INSET), width.toFloat(), height - context.dp(FOCUS_INSET))
                canvas.drawRoundRect(rect, context.dp(FOCUS_RADIUS), context.dp(FOCUS_RADIUS), fillPaint)
            }
            val size = context.dp(ICON)
            val iconLeft = (width - size) / 2f
            val iconTop = context.dp(BORDER) + context.dp(PAD_TOP)
            val scale = 1f + (ACTIVE_SCALE - 1f) * scaleProgress
            val save = canvas.save()
            canvas.translate(iconLeft + size / 2f, iconTop + size / 2f)
            canvas.scale(scale, scale)
            canvas.translate(-size / 2f, -size / 2f)
            canvas.scale(size / ICON_GRID, size / ICON_GRID)
            iconPaint.color = color
            canvas.drawPath(icon, iconPaint)
            canvas.restoreToCount(save)
            val metrics = labelPaint.fontMetrics
            labelPaint.color = color
            canvas.drawText(tab.label, width / 2f, iconTop + size + context.dp(LABEL_GAP) - metrics.ascent, labelPaint)
            if (badgeText.isNotEmpty()) drawBadge(canvas, iconLeft + size, iconTop)
        }

        private fun drawBadge(canvas: Canvas, iconRight: Float, iconTop: Float) {
            val palette = Theme.palette
            val height = context.dp(BADGE_H)
            val ring = context.dp(BADGE_RING)
            val width = max(context.dp(BADGE_MIN_W), badgePaint.measureText(badgeText) + context.dp(BADGE_PAD) * 2 + ring * 2)
            val right = iconRight + context.dp(BADGE_RIGHT)
            val top = iconTop - context.dp(BADGE_TOP)
            rect.set(right - width, top, right, top + height)
            fillPaint.shader = null
            fillPaint.color = palette.pulseDock
            canvas.drawRoundRect(rect, height / 2f, height / 2f, fillPaint)
            rect.inset(ring, ring)
            if (badgeShaderWidth != rect.width()) {
                val line = CssGradient.linear(BADGE_ANGLE, rect.width(), rect.height())
                badgeFill.shader = LinearGradient(line.x0, line.y0, line.x1, line.y1, FixedColors.badgeFrom, FixedColors.badgeTo, Shader.TileMode.CLAMP)
                badgeShaderWidth = rect.width()
            }
            val inner = rect.height() / 2f
            val save = canvas.save()
            canvas.translate(rect.left, rect.top)
            rect.offsetTo(0f, 0f)
            canvas.drawRoundRect(rect, inner, inner, badgeFill)
            canvas.restoreToCount(save)
            val textMetrics = badgePaint.fontMetrics
            canvas.drawText(badgeText, right - width / 2f, top + height / 2f - (textMetrics.ascent + textMetrics.descent) / 2f, badgePaint)
        }

        override fun onInitializeAccessibilityNodeInfo(info: AccessibilityNodeInfo) {
            super.onInitializeAccessibilityNodeInfo(info)
            info.className = "android.app.ActionBar\$Tab"
            info.isSelected = active
        }
    }

    private companion object {
        const val EDGE = 26f
        const val RADIUS = 30f
        const val BORDER = 1f
        const val PAD_TOP = 9f
        const val PAD_BOTTOM = 10f
        const val PAD_X = 6f
        const val BLUR = 16f
        const val SATURATION = 2.0f
        const val TINT_ALPHA = 0.5f
        const val BORDER_ALPHA = 0.12f
        const val HIGHLIGHT_TOP_ALPHA = 0.18f
        const val HIGHLIGHT_BOTTOM_ALPHA = 0.05f
        const val SHADOW_ROOM_TOP = 10f
        const val SHADOW_Y = 22f
        const val SHADOW_BLUR = 50f
        const val SHADOW_SPREAD = 20f
        const val SHADOW_SCALE = 0.25f
        const val HIDE_SHIFT = 1.2f
        const val HIDE_MS = 200L
        val HIDE_CURVE = PathInterpolator(0.2f, 0.9f, 0.25f, 1f)

        const val ICON = 25f
        const val ICON_GRID = 20f
        const val ICON_STROKE = 1.6f
        const val LABEL_GAP = 3f
        const val LABEL_SIZE = 10.5f
        const val LABEL_TRACKING_PX = 0.1f
        const val INK_ALPHA = 0.42f
        const val ACTIVE_SCALE = 1.06f
        const val COLOR_MS = 220L
        const val SCALE_MS = 300L
        val COLOR_CURVE = PathInterpolator(0.25f, 0.1f, 0.25f, 1f)
        val SCALE_CURVE = PathInterpolator(0.34f, 1.56f, 0.64f, 1f)
        const val FOCUS_ALPHA = 0.1f
        const val FOCUS_INSET = 4f
        const val FOCUS_RADIUS = 18f

        const val BADGE_H = 16f
        const val BADGE_MIN_W = 16f
        const val BADGE_PAD = 4f
        const val BADGE_RING = 2f
        const val BADGE_TEXT = 10f
        const val BADGE_TOP = 4f
        const val BADGE_RIGHT = 8f
        const val BADGE_ANGLE = 140f
        const val MAX_BADGE = 99

        val TAB_ICON_PATH = mapOf(
            MainTab.CHATS to "M4 4.5h12a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1 -1.5 1.5H9l-4 3v-3H4A1.5 1.5 0 0 1 2.5 12V6A1.5 1.5 0 0 1 4 4.5z",
            MainTab.CONTACTS to "M10 3.6a3 3 0 1 1 0 6 3 3 0 0 1 0 -6zM4.4 16.4c.5-3 2.7-4.6 5.6-4.6s5.1 1.6 5.6 4.6",
            MainTab.SETTINGS to "M3 6.5h1.5M7.5 6.5h9.5M3 13.5h6.5M12.5 13.5h4.5M6 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0 -3zM11 12a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0 -3z",
            MainTab.PROFILE to "M10 3.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0 -13.2zM10 7.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0 -4.4zM5.7 15.3c.8-1.7 2.3-2.6 4.3-2.6s3.5.9 4.3 2.6",
        )
    }
}
