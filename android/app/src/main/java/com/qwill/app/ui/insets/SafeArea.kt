package com.qwill.app.ui.insets

import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import kotlin.math.max

data class SafeArea(
    val top: Int,
    val bottom: Int,
    val left: Int,
    val right: Int,
    val keyboard: Int,
) {
    companion object {
        val NONE = SafeArea(0, 0, 0, 0, 0)
    }
}

class SafeAreaTracker(private val root: View, private val onChange: (SafeArea) -> Unit) {
    private var current = SafeArea.NONE
    private var heldBottom = -1
    private var keyboardMoving = false

    fun attach() {
        root.setOnApplyWindowInsetsListener { _, insets ->
            publish(read(insets))
            insets
        }
        if (Build.VERSION.SDK_INT >= 30) trackKeyboardMotion()
        root.requestApplyInsets()
    }

    private fun publish(raw: RawInsets) {
        if (heldBottom < 0 || (raw.keyboard == 0 && !keyboardMoving)) heldBottom = raw.bottom
        val next = SafeArea(raw.top, heldBottom, raw.left, raw.right, raw.keyboard)
        if (next == current) return
        current = next
        onChange(next)
    }

    private fun trackKeyboardMotion() {
        if (Build.VERSION.SDK_INT < 30) return
        root.setWindowInsetsAnimationCallback(
            object : WindowInsetsAnimation.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onPrepare(animation: WindowInsetsAnimation) {
                    if (animation.typeMask and WindowInsets.Type.ime() != 0) keyboardMoving = true
                }

                override fun onProgress(
                    insets: WindowInsets,
                    runningAnimations: MutableList<WindowInsetsAnimation>,
                ): WindowInsets = insets

                override fun onEnd(animation: WindowInsetsAnimation) {
                    if (animation.typeMask and WindowInsets.Type.ime() == 0) return
                    keyboardMoving = false
                    root.requestApplyInsets()
                }
            },
        )
    }

    private class RawInsets(val top: Int, val bottom: Int, val left: Int, val right: Int, val keyboard: Int)

    private fun read(insets: WindowInsets): RawInsets {
        if (Build.VERSION.SDK_INT >= 30) {
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            val ime = insets.getInsets(WindowInsets.Type.ime())
            return RawInsets(bars.top, bars.bottom, bars.left, bars.right, ime.bottom)
        }
        return readLegacy(insets)
    }

    @Suppress("DEPRECATION")
    private fun readLegacy(insets: WindowInsets): RawInsets {
        var top = insets.systemWindowInsetTop
        var left = insets.systemWindowInsetLeft
        var right = insets.systemWindowInsetRight
        val stableBottom = insets.stableInsetBottom
        val windowBottom = insets.systemWindowInsetBottom
        var bottom = stableBottom
        val keyboard = if (windowBottom > stableBottom) windowBottom else 0
        if (Build.VERSION.SDK_INT >= 28) {
            val cutout = insets.displayCutout
            if (cutout != null) {
                top = max(top, cutout.safeInsetTop)
                left = max(left, cutout.safeInsetLeft)
                right = max(right, cutout.safeInsetRight)
                bottom = max(bottom, cutout.safeInsetBottom)
            }
        }
        return RawInsets(top, bottom, left, right, keyboard)
    }
}
