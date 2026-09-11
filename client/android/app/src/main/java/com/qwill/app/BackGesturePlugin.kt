package com.qwill.app

import androidx.activity.BackEventCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "QwillBackGesture")
class BackGesturePlugin : Plugin() {

    override fun load() {
        super.load()
        BackGestureRegistry.attach(this)
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        BackGestureRegistry.detach(this)
    }

    @PluginMethod
    fun takeBackGesture(call: PluginCall) {
        BackGestureRegistry.take()
        call.resolve()
    }

    fun emitGesture(phase: String, progress: Float, touchY: Float, edge: Int) {
        val density = bridge?.webView?.resources?.displayMetrics?.density ?: 1f
        notifyListeners(
            "backGesture",
            JSObject()
                .put("phase", phase)
                .put("progress", progress.toDouble())
                .put("edge", if (edge == BackEventCompat.EDGE_RIGHT) "right" else "left")
                .put("touchY", (touchY / density).toDouble())
        )
    }
}
