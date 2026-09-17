package com.qwill.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "QwillDeepLink")
class DeepLinkPlugin : Plugin() {

    override fun load() {
        super.load()
        DeepLinkRegistry.attach(this)
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        DeepLinkRegistry.detach(this)
    }

    fun emitLink(path: String) {
        notifyListeners("deepLink", JSObject().put("path", path), true)
    }
}
