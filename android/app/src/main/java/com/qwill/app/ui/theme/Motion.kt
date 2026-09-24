package com.qwill.app.ui.theme

import android.content.Context
import android.provider.Settings
import android.view.animation.Interpolator
import android.view.animation.PathInterpolator

object Motion {
    const val SCREEN = 280L
    const val MENU = 200L
    const val CLOSE = 160L
    const val THEME = 400L
    const val TAB = 120L
    const val CHECK = 140L
    const val ICON = 150L
    const val REACTION = 320L
    const val DISSOLVE = 700L
    const val PRESS = 320L
    const val SCROLLBAR = 220L
    const val PULSE = 1000L
    const val FLASH = 1500L
    const val MEDIA_FADE = 220L
    const val NOTIFY_HIDE = 4000L
    const val WHEEL_SETTLE = 800L
    const val WHEEL_STEP = 300L
    const val CLOUD_POP = 190L

    val easeScreen: Interpolator = PathInterpolator(0.2f, 0.9f, 0.25f, 1f)
    val easeClose: Interpolator = PathInterpolator(0.42f, 0f, 1f, 1f)
    val easeSpring: Interpolator = PathInterpolator(0.2f, 1.5f, 0.4f, 1f)

    const val SYSTEM_BACK_NUDGE_DP = 56f
    const val SYSTEM_BACK_LAZY_START = 0.015f

    var animationsEnabled: Boolean = true
        private set

    fun refresh(context: Context) {
        val scale = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        animationsEnabled = scale != 0f
    }

    fun duration(ms: Long): Long = if (animationsEnabled) ms else 0L
}
