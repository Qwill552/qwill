package com.qwill.app

import android.view.View
import android.view.animation.Interpolator
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Locale

private const val EASING_SAMPLES = 20

@CapacitorPlugin(name = "QwillKeyboard")
class KeyboardInsetsPlugin : Plugin() {

    private var running = 0
    private var lastImeInset = -1

    override fun load() {
        val view = bridge.webView ?: return
        val density = view.resources.displayMetrics.density

        ViewCompat.setWindowInsetsAnimationCallback(
            view,
            object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onPrepare(animation: WindowInsetsAnimationCompat) {
                    running += 1
                }

                override fun onStart(
                    animation: WindowInsetsAnimationCompat,
                    bounds: WindowInsetsAnimationCompat.BoundsCompat
                ): WindowInsetsAnimationCompat.BoundsCompat {
                    val appearing = ViewCompat.getRootWindowInsets(view)
                        ?.isVisible(WindowInsetsCompat.Type.ime()) == true
                    notifyListeners(
                        "keyboardInset",
                        JSObject()
                            .put("phase", "start")
                            .put("height", imeInset(view) / density)
                            .put("target", (if (appearing) bounds.upperBound.bottom else 0) / density)
                            .put("duration", animation.durationMillis)
                            .put("easing", easingOf(animation.interpolator))
                    )
                    return bounds
                }

                override fun onProgress(
                    insets: WindowInsetsCompat,
                    animations: MutableList<WindowInsetsAnimationCompat>
                ): WindowInsetsCompat = insets

                override fun onEnd(animation: WindowInsetsAnimationCompat) {
                    running = (running - 1).coerceAtLeast(0)
                    lastImeInset = imeInset(view)
                    notifyListeners(
                        "keyboardInset",
                        JSObject()
                            .put("phase", "end")
                            .put("height", lastImeInset / density)
                    )
                }
            }
        )

        ViewCompat.setOnApplyWindowInsetsListener(view) { _, insets ->
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            if (running == 0 && ime != lastImeInset) {
                lastImeInset = ime
                notifyListeners(
                    "keyboardInset",
                    JSObject()
                        .put("phase", "end")
                        .put("height", ime / density)
                )
            }
            insets
        }
    }

    private fun imeInset(view: View): Int =
        ViewCompat.getRootWindowInsets(view)?.getInsets(WindowInsetsCompat.Type.ime())?.bottom ?: 0

    /** Кривую системы не угадываем, а снимаем: значения интерполятора в точках уходят в CSS
     *  как `linear(...)`, и веб едет по той же кривой, что и сама клавиатура. */
    private fun easingOf(interpolator: Interpolator?): String {
        if (interpolator == null) return ""
        val points = (0..EASING_SAMPLES).joinToString(", ") { step ->
            String.format(Locale.US, "%.4f", interpolator.getInterpolation(step.toFloat() / EASING_SAMPLES))
        }
        return "linear($points)"
    }
}
