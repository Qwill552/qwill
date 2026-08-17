package com.qwill.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "QwillCall")
class CallPlugin : Plugin() {

    override fun load() {
        super.load()
        NativeCalls.registerAccount(context)
        CallRegistry.attach(this)
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        CallRegistry.detach(this)
    }

    @PluginMethod
    fun isNativeCallAvailable(call: PluginCall) {
        call.resolve(JSObject().put("available", NativeCalls.isSupported(context)))
    }

    @PluginMethod
    fun reportIncomingCall(call: PluginCall) {
        val callId = call.getString("callId")
        if (callId.isNullOrEmpty()) {
            call.reject("callId обязателен")
            return
        }
        NativeCalls.reportIncoming(
            context = context,
            callId = callId,
            callerName = call.getString("callerName").orEmpty(),
            callKind = call.getString("callKind").orEmpty(),
            showUi = true,
        )
        call.resolve()
    }

    @PluginMethod
    fun reportCallEnded(call: PluginCall) {
        val callId = call.getString("callId")
        if (callId.isNullOrEmpty()) {
            call.reject("callId обязателен")
            return
        }
        NativeCalls.reportEnded(context, callId)
        call.resolve()
    }

    @PluginMethod
    fun callConnected(call: PluginCall) {
        MainActivity.hideConnecting()
        call.resolve()
    }

    fun emitAction(action: CallRegistry.Action) {
        val payload = JSObject().put("callId", action.callId)
        notifyListeners(if (action.accepted) EVENT_ACCEPTED else EVENT_DECLINED, payload, true)
    }

    private companion object {
        const val EVENT_ACCEPTED = "callAccepted"
        const val EVENT_DECLINED = "callDeclined"
    }
}
