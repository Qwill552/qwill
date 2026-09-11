package com.qwill.app

import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "QwillKeyboard")
class KeyboardInsetsPlugin : Plugin() {

    override fun load() {
        val view = bridge.webView ?: return
        val density = view.resources.displayMetrics.density

        ViewCompat.setWindowInsetsAnimationCallback(
            view,
            object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onProgress(
                    insets: WindowInsetsCompat,
                    animations: MutableList<WindowInsetsAnimationCompat>
                ): WindowInsetsCompat {
                    publish(insets, density, false)
                    return insets
                }

                override fun onEnd(animation: WindowInsetsAnimationCompat) {
                    val insets = ViewCompat.getRootWindowInsets(view) ?: return
                    publish(insets, density, true)
                }
            }
        )
    }

    private fun publish(insets: WindowInsetsCompat, density: Float, settled: Boolean) {
        val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
        notifyListeners(
            "keyboardInset",
            JSObject().put("height", ime / density).put("settled", settled)
        )
    }
}
