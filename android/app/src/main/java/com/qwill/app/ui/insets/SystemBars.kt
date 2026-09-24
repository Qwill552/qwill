package com.qwill.app.ui.insets

import android.graphics.Color
import android.os.Build
import android.view.View
import android.view.Window
import android.view.WindowInsetsController
import android.view.WindowManager

object SystemBars {
    private val LEGACY_BAR_SCRIM = Color.argb(0x33, 0, 0, 0)

    @Suppress("DEPRECATION")
    fun edgeToEdge(window: Window) {
        window.clearFlags(
            WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS or WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION,
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
        if (Build.VERSION.SDK_INT >= 30) {
            window.setDecorFitsSystemWindows(false)
        }
        if (Build.VERSION.SDK_INT >= 28) {
            val attributes = window.attributes
            attributes.layoutInDisplayCutoutMode = if (Build.VERSION.SDK_INT >= 30) {
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
            } else {
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            window.attributes = attributes
        }
        if (Build.VERSION.SDK_INT >= 29) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
    }

    @Suppress("DEPRECATION")
    fun applyAppearance(window: Window, dark: Boolean) {
        if (Build.VERSION.SDK_INT < 35) {
            window.statusBarColor = if (!dark && Build.VERSION.SDK_INT < 23) LEGACY_BAR_SCRIM else Color.TRANSPARENT
            window.navigationBarColor = if (!dark && Build.VERSION.SDK_INT < 26) LEGACY_BAR_SCRIM else Color.TRANSPARENT
        }
        if (Build.VERSION.SDK_INT >= 30) {
            val controller = window.insetsController ?: return
            val mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
            controller.setSystemBarsAppearance(if (dark) 0 else mask, mask)
            return
        }
        var flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        if (!dark && Build.VERSION.SDK_INT >= 23) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        if (!dark && Build.VERSION.SDK_INT >= 26) flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        window.decorView.systemUiVisibility = flags
    }
}
