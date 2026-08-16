package com.qwill.app

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.O)
class QwillConnection(
    private val context: Context,
    private val callId: String,
    private val callerName: String,
    private val callKind: String,
    private val showsOwnUi: Boolean,
) : Connection() {

    init {
        connectionProperties = PROPERTY_SELF_MANAGED
        audioModeIsVoip = true
    }

    override fun onShowIncomingCallUi() {
        if (!showsOwnUi) return
        CallNotifications.showIncoming(context, callId, callerName, callKind)
        Ringer.start(context)
    }

    override fun onAnswer() {
        Ringer.stop()
        CallNotifications.cancel(context)
        setActive()
        IncomingCallActivity.resolve(context, callId, accepted = true)
    }

    override fun onReject() {
        settle(DisconnectCause(DisconnectCause.REJECTED))
        IncomingCallActivity.resolve(context, callId, accepted = false)
    }

    override fun onDisconnect() {
        settle(DisconnectCause(DisconnectCause.LOCAL))
        IncomingCallActivity.resolve(context, callId, accepted = false)
    }

    override fun onAbort() {
        settle(DisconnectCause(DisconnectCause.CANCELED))
    }

    fun finishRemotely() {
        settle(DisconnectCause(DisconnectCause.REMOTE))
        IncomingCallActivity.dismiss(callId)
    }

    private fun settle(cause: DisconnectCause) {
        Ringer.stop()
        CallNotifications.cancel(context)
        CallRegistry.take(callId)
        setDisconnected(cause)
        destroy()
    }
}

class CallConnectionService : ConnectionService() {

    @RequiresApi(Build.VERSION_CODES.O)
    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ): Connection? {
        val payload = request?.extras?.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS) ?: Bundle()
        val callId = payload.getString(NativeCalls.EXTRA_CALL_ID).orEmpty()
        if (callId.isEmpty()) return null

        val callerName = payload.getString(NativeCalls.EXTRA_CALLER_NAME)
            ?.takeIf { it.isNotBlank() }
            ?: getString(R.string.call_unknown_caller)
        val callKind = payload.getString(NativeCalls.EXTRA_CALL_KIND).orEmpty()
        val showUi = payload.getBoolean(NativeCalls.EXTRA_SHOW_UI)

        val connection = QwillConnection(applicationContext, callId, callerName, callKind, showUi)
        connection.setAddress(Uri.fromParts("qwill", callId, null), TelecomManager.PRESENTATION_ALLOWED)
        connection.setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
        connection.setRinging()

        CallRegistry.put(callId, connection)
        return connection
    }

    override fun onCreateIncomingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ) {
        val payload = request?.extras?.getBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS) ?: Bundle()
        val callId = payload.getString(NativeCalls.EXTRA_CALL_ID).orEmpty()
        Ringer.stop()
        CallNotifications.cancel(applicationContext)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) CallRegistry.take(callId)
    }
}
