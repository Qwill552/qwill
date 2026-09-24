package com.qwill.app

import android.annotation.TargetApi
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.qwill.app.stand.StandScreen
import com.qwill.app.ui.ActivityResults
import com.qwill.app.ui.insets.SafeAreaTracker
import com.qwill.app.ui.insets.SystemBars
import com.qwill.app.ui.stack.ScreenStack
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.ThemeListener

class LaunchActivity : Activity() {
    private lateinit var stack: ScreenStack
    private var backCallback: OnBackInvokedCallback? = null
    private var backCallbackRegistered = false

    private val themeListener = ThemeListener {
        applyWindowTheme()
        stack.dispatchThemeChanged()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Theme.init(this)
        Fonts.init(assets)
        Motion.refresh(this)
        SystemBars.edgeToEdge(window)

        stack = ScreenStack(this)
        setContentView(stack)
        applyWindowTheme()
        SafeAreaTracker(stack) { stack.safeArea = it }.attach()
        Theme.addListener(themeListener)

        stack.onBackStateChanged = ::updateBackCallback
        stack.setRoot(StandScreen(1))
    }

    override fun onResume() {
        super.onResume()
        Motion.refresh(this)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (ActivityResults.dispatch(requestCode, resultCode, data)) return
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        Theme.onConfigurationChanged(newConfig)
    }

    override fun onDestroy() {
        Theme.removeListener(themeListener)
        unregisterBackCallback()
        stack.destroyAll()
        super.onDestroy()
    }

    @Suppress("OVERRIDE_DEPRECATION", "GestureBackNavigation")
    override fun onBackPressed() {
        if (stack.handleBack()) return
        @Suppress("DEPRECATION")
        super.onBackPressed()
    }

    private fun applyWindowTheme() {
        window.setBackgroundDrawable(ColorDrawable(Theme.palette.bg))
        SystemBars.applyAppearance(window, Theme.isDark)
    }

    private fun updateBackCallback() {
        if (Build.VERSION.SDK_INT < 33) return
        val wanted = stack.canHandleBack()
        if (wanted == backCallbackRegistered) return
        if (wanted) {
            val callback = backCallback ?: createBackCallback().also { backCallback = it }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
            backCallbackRegistered = true
        } else {
            unregisterBackCallback()
        }
    }

    private fun unregisterBackCallback() {
        if (Build.VERSION.SDK_INT < 33 || !backCallbackRegistered) return
        backCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
        backCallbackRegistered = false
    }

    private fun createBackCallback(): OnBackInvokedCallback {
        if (Build.VERSION.SDK_INT >= 34) return AnimatedBack(stack)
        return OnBackInvokedCallback { stack.handleBack() }
    }

    @TargetApi(34)
    private class AnimatedBack(private val stack: ScreenStack) : OnBackAnimationCallback {
        override fun onBackStarted(backEvent: BackEvent) {
            stack.beginBackGesture()
        }

        override fun onBackProgressed(backEvent: BackEvent) {
            stack.updateBackGesture(backEvent.progress)
        }

        override fun onBackCancelled() {
            stack.cancelBackGesture()
        }

        override fun onBackInvoked() {
            stack.commitBackGesture()
        }
    }
}
