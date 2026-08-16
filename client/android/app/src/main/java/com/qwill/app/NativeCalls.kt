package com.qwill.app

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager

object NativeCalls {

    const val EXTRA_CALL_ID = "com.qwill.app.extra.CALL_ID"
    const val EXTRA_CALLER_NAME = "com.qwill.app.extra.CALLER_NAME"
    const val EXTRA_CALL_KIND = "com.qwill.app.extra.CALL_KIND"
    const val EXTRA_SHOW_UI = "com.qwill.app.extra.SHOW_UI"
    const val EXTRA_ACCEPTED = "com.qwill.app.extra.ACCEPTED"

    const val KIND_VIDEO = "VIDEO"

    private const val ACCOUNT_ID = "qwill-self-managed"
    private const val ADDRESS_SCHEME = "qwill"

    fun isSupported(context: Context): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && telecom(context) != null

    fun registerAccount(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = telecom(context) ?: return
        val account = PhoneAccount.builder(handle(context), context.getString(R.string.call_phone_account))
            .setCapabilities(PhoneAccount.CAPABILITY_SELF_MANAGED)
            .build()
        runCatching { manager.registerPhoneAccount(account) }
    }

    @SuppressLint("MissingPermission")
    fun reportIncoming(
        context: Context,
        callId: String,
        callerName: String,
        callKind: String,
        showUi: Boolean,
    ): Boolean {
        if (callId.isEmpty() || !isSupported(context)) return false
        if (CallRegistry.isKnown(callId)) return true

        registerAccount(context)
        val manager = telecom(context) ?: return false

        val payload = Bundle().apply {
            putString(EXTRA_CALL_ID, callId)
            putString(EXTRA_CALLER_NAME, callerName)
            putString(EXTRA_CALL_KIND, callKind)
            putBoolean(EXTRA_SHOW_UI, showUi)
        }
        val extras = Bundle().apply {
            putParcelable(TelecomManager.EXTRA_INCOMING_CALL_ADDRESS, Uri.fromParts(ADDRESS_SCHEME, callId, null))
            putBundle(TelecomManager.EXTRA_INCOMING_CALL_EXTRAS, payload)
        }

        return runCatching {
            manager.addNewIncomingCall(handle(context), extras)
            true
        }.getOrDefault(false)
    }

    fun reportEnded(context: Context, callId: String) {
        Ringer.stop()
        CallNotifications.cancel(context)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        CallRegistry.take(callId)?.finishRemotely()
    }

    fun answer(callId: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        CallRegistry.peek(callId)?.onAnswer()
    }

    fun reject(callId: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        CallRegistry.peek(callId)?.onReject()
    }

    private fun telecom(context: Context): TelecomManager? =
        context.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager

    private fun handle(context: Context): PhoneAccountHandle =
        PhoneAccountHandle(ComponentName(context, CallConnectionService::class.java), ACCOUNT_ID)
}
