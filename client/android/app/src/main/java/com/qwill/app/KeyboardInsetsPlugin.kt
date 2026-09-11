package com.qwill.app

import android.view.View
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
                override fun onStart(
                    animation: WindowInsetsAnimationCompat,
                    bounds: WindowInsetsAnimationCompat.BoundsCompat
                ): WindowInsetsAnimationCompat.BoundsCompat {
                    val appearing = ViewCompat.getRootWindowInsets(view)
                        ?.isVisible(WindowInsetsCompat.Type.ime()) == true
                    emit(imeInset(view), if (appearing) bounds.upperBound.bottom else 0, density, "start")
                    return bounds
                }

                override fun onProgress(
                    insets: WindowInsetsCompat,
                    animations: MutableList<WindowInsetsAnimationCompat>
                ): WindowInsetsCompat {
                    val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
                    emit(ime, ime, density, "move")
                    return insets
                }

                override fun onEnd(animation: WindowInsetsAnimationCompat) {
                    val ime = imeInset(view)
                    emit(ime, ime, density, "end")
                }
            }
        )
    }

    private fun imeInset(view: View): Int =
        ViewCompat.getRootWindowInsets(view)?.getInsets(WindowInsetsCompat.Type.ime())?.bottom ?: 0

    private fun emit(height: Int, target: Int, density: Float, phase: String) {
        notifyListeners(
            "keyboardInset",
            JSObject()
                .put("height", height / density)
                .put("target", target / density)
                .put("phase", phase)
        )
    }
}
