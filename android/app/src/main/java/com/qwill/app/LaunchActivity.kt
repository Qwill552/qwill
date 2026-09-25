package com.qwill.app

import android.annotation.TargetApi
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import android.window.BackEvent
import android.window.OnBackAnimationCallback
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import com.qwill.app.auth.AuthScreen
import com.qwill.app.auth.SessionState
import com.qwill.app.auth.SessionStateListener
import com.qwill.app.consent.ConsentGateLayer
import com.qwill.app.consent.ConsentGateRule
import com.qwill.app.tabs.MainTabsScreen
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
    private lateinit var gate: ConsentGateLayer
    private var backCallback: OnBackInvokedCallback? = null
    private var backCallbackRegistered = false

    private val themeListener = ThemeListener {
        applyWindowTheme()
        stack.dispatchThemeChanged()
        gate.dispatchThemeChanged()
    }

    private val sessionListener = SessionStateListener { routeReactively(it) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Theme.init(this)
        Fonts.init(assets)
        Motion.refresh(this)
        SystemBars.edgeToEdge(window)

        val root = FrameLayout(this)
        stack = ScreenStack(this)
        gate = ConsentGateLayer(this, stack)
        root.addView(stack, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(gate, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        applyWindowTheme()
        SafeAreaTracker(root) {
            stack.safeArea = it
            gate.stack.safeArea = it
        }.attach()
        Theme.addListener(themeListener)

        stack.onBackStateChanged = ::updateBackCallback
        gate.onBackStateChanged = ::updateBackCallback
        val initialState = QwillApplication.session.state
        stack.setRoot(if (RootRouting.routeFor(initialState) == RootRoute.CHATS) MainTabsScreen() else authScreenFor(initialState))
        applyGate(initialState, initial = true)
        QwillApplication.session.addStateListener(sessionListener)
    }

    private fun routeReactively(state: SessionState) {
        applyGate(state, initial = false)
        if (RootRouting.routeFor(state) != RootRoute.AUTH) return
        val top = stack.top
        if (top is AuthScreen) return
        stack.resetTo(authScreenFor(state))
    }

    private fun applyGate(state: SessionState, initial: Boolean) {
        gate.apply(ConsentGateRule.decide(gate.shown, initial, state), ConsentGateRule.pendingOf(state))
    }

    private fun activeStack(): ScreenStack = if (gate.shown) gate.stack else stack

    private fun authScreenFor(state: SessionState): AuthScreen = AuthScreen((state as? SessionState.Banned)?.message)

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
        QwillApplication.session.removeStateListener(sessionListener)
        unregisterBackCallback()
        gate.stack.destroyAll()
        stack.destroyAll()
        super.onDestroy()
    }

    @Suppress("OVERRIDE_DEPRECATION", "GestureBackNavigation")
    override fun onBackPressed() {
        if (gate.shown) {
            if (!gate.stack.handleBack()) moveTaskToBack(true)
            return
        }
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
        val wanted = activeStack().canHandleBack()
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
        if (Build.VERSION.SDK_INT >= 34) return AnimatedBack(::activeStack)
        return OnBackInvokedCallback { activeStack().handleBack() }
    }

    @TargetApi(34)
    private class AnimatedBack(private val stack: () -> ScreenStack) : OnBackAnimationCallback {
        private var gestureStack: ScreenStack? = null

        override fun onBackStarted(backEvent: BackEvent) {
            val target = stack()
            gestureStack = target
            target.beginBackGesture()
        }

        override fun onBackProgressed(backEvent: BackEvent) {
            gestureStack?.updateBackGesture(backEvent.progress)
        }

        override fun onBackCancelled() {
            gestureStack?.cancelBackGesture()
            gestureStack = null
        }

        override fun onBackInvoked() {
            val target = gestureStack ?: stack()
            gestureStack = null
            target.commitBackGesture()
        }
    }
}
