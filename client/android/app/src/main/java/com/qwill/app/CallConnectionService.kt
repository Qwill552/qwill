package com.qwill.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
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

    private val timeoutHandler = Handler(Looper.getMainLooper())
    private val timeoutRunnable = Runnable { finishRemotely() }
    private val offlineRunnable = Runnable { if (!hasInternet()) finishRemotely() }

    private val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            timeoutHandler.removeCallbacks(offlineRunnable)
        }

        override fun onLost(network: Network) {
            timeoutHandler.removeCallbacks(offlineRunnable)
            timeoutHandler.postDelayed(offlineRunnable, OFFLINE_GRACE_MS)
        }
    }

    private var watching = false

    init {
        connectionProperties = PROPERTY_SELF_MANAGED
        audioModeIsVoip = true
    }

    override fun onShowIncomingCallUi() {
        if (!showsOwnUi) return
        CallNotifications.showIncoming(context, callId, callerName, callKind)
        Ringer.start(context)
        timeoutHandler.postDelayed(timeoutRunnable, SELF_TIMEOUT_MS)
        startWatchingNetwork()
    }

    override fun onAnswer() {
        stopWatching()
        Ringer.stop()
        CallNotifications.cancel(context)
        setActive()
        IncomingCallActivity.openApp(context, callId, callerName)
    }

    override fun onReject() {
        CallDecline.send(context, callId)
        CallRegistry.notifyIfAttached(CallRegistry.Action(callId, accepted = false))
        settle(DisconnectCause(DisconnectCause.REJECTED))
        IncomingCallActivity.dismiss(callId)
    }

    override fun onDisconnect() {
        CallDecline.send(context, callId)
        CallRegistry.notifyIfAttached(CallRegistry.Action(callId, accepted = false))
        settle(DisconnectCause(DisconnectCause.LOCAL))
        IncomingCallActivity.dismiss(callId)
    }

    override fun onAbort() {
        settle(DisconnectCause(DisconnectCause.CANCELED))
    }

    fun finishRemotely() {
        settle(DisconnectCause(DisconnectCause.REMOTE))
        IncomingCallActivity.dismiss(callId)
    }

    private fun settle(cause: DisconnectCause) {
        stopWatching()
        Ringer.stop()
        CallNotifications.cancel(context)
        CallRegistry.take(callId)
        setDisconnected(cause)
        destroy()
    }

    private fun startWatchingNetwork() {
        val manager = connectivity
        if (watching || manager == null) return
        watching = runCatching { manager.registerDefaultNetworkCallback(networkCallback) }.isSuccess
        if (watching && !hasInternet()) timeoutHandler.postDelayed(offlineRunnable, OFFLINE_GRACE_MS)
    }

    private fun stopWatching() {
        timeoutHandler.removeCallbacks(timeoutRunnable)
        timeoutHandler.removeCallbacks(offlineRunnable)
        if (!watching) return
        watching = false
        runCatching { connectivity?.unregisterNetworkCallback(networkCallback) }
    }

    private fun hasInternet(): Boolean {
        val manager = connectivity ?: return false
        val active = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(active) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private companion object {
        const val SELF_TIMEOUT_MS = 55_000L
        const val OFFLINE_GRACE_MS = 2_000L
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
