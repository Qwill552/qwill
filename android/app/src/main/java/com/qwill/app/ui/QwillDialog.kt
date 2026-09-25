package com.qwill.app.ui

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Context
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import com.qwill.app.ui.glass.GlassView
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.Glass
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt

class QwillDialog(private val context: Context, sourceForBlur: View) {
    val root: FrameLayout = FrameLayout(context)
    val card: LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        val pad = context.dpInt(Dimens.SPACE_4)
        setPadding(pad, pad, pad, pad)
    }

    var onCancelRequested: (() -> Unit)? = null

    private val glassScrim = GlassView(context, sourceForBlur, blurDp = Glass.SCRIM_BLUR, saturation = Glass.SHEET_SATURATION)
    private val scroll: ScrollView
    private var animator: Animator? = null

    init {
        root.addView(glassScrim, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        scroll = ScrollView(context).apply {
            isClickable = true
            isFocusable = true
            clipToPadding = false
        }
        scroll.addView(card, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val cardWidth = context.dpInt(CARD_MAX_WIDTH)
        val sidePad = context.dpInt(Dimens.SPACE_4)
        root.addView(
            scroll,
            FrameLayout.LayoutParams(cardWidth, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER).apply {
                leftMargin = sidePad
                rightMargin = sidePad
                topMargin = sidePad
                bottomMargin = sidePad
            },
        )
        root.setOnClickListener { onCancelRequested?.invoke() }
        root.isClickable = true
        root.isFocusable = true
    }

    val maxHeightPx: Int get() = (root.height * MAX_HEIGHT_FRACTION).toInt()

    fun applyAppearance() {
        val palette = Theme.palette
        glassScrim.tint = palette.scrimBg
        card.background = android.graphics.drawable.GradientDrawable().apply {
            cornerRadius = context.dp(Dimens.RADIUS_CARD)
            setColor(palette.sheetBg)
        }
    }

    fun attachTo(parent: FrameLayout) {
        if (root.parent != null) return
        parent.addView(root, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    fun detach() {
        (root.parent as? ViewGroup)?.removeView(root)
    }

    fun show(animated: Boolean = true) {
        animator?.cancel()
        if (!animated || !Motion.animationsEnabled) {
            root.alpha = 1f
            scroll.alpha = 1f
            scroll.scaleX = 1f
            scroll.scaleY = 1f
            return
        }
        root.alpha = 0f
        scroll.alpha = 0f
        scroll.scaleX = APPEAR_SCALE
        scroll.scaleY = APPEAR_SCALE
        val set = AnimatorSet()
        set.playTogether(
            ObjectAnimator.ofFloat(root, View.ALPHA, 0f, 1f),
            ObjectAnimator.ofFloat(scroll, View.ALPHA, 0f, 1f),
            ObjectAnimator.ofFloat(scroll, View.SCALE_X, APPEAR_SCALE, 1f),
            ObjectAnimator.ofFloat(scroll, View.SCALE_Y, APPEAR_SCALE, 1f),
        )
        set.duration = Motion.duration(Motion.MENU)
        set.interpolator = Motion.easeScreen
        animator = set
        set.start()
    }

    fun hide(animated: Boolean = true, onEnd: () -> Unit) {
        animator?.cancel()
        if (!animated || !Motion.animationsEnabled) {
            onEnd()
            return
        }
        val set = AnimatorSet()
        set.playTogether(
            ObjectAnimator.ofFloat(root, View.ALPHA, root.alpha, 0f),
            ObjectAnimator.ofFloat(scroll, View.ALPHA, scroll.alpha, 0f),
            ObjectAnimator.ofFloat(scroll, View.SCALE_X, scroll.scaleX, APPEAR_SCALE),
            ObjectAnimator.ofFloat(scroll, View.SCALE_Y, scroll.scaleY, APPEAR_SCALE),
        )
        set.duration = Motion.duration(Motion.CLOSE)
        set.interpolator = Motion.easeClose
        set.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (animator !== animation) return
                animator = null
                onEnd()
            }
        })
        animator = set
        set.start()
    }

    private companion object {
        const val CARD_MAX_WIDTH = 420f
        const val MAX_HEIGHT_FRACTION = 0.85
        const val APPEAR_SCALE = 0.94f
    }
}
