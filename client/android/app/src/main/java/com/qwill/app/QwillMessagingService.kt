package com.qwill.app

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

class QwillMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        PushNotificationsPlugin.onNewToken(token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val callId = data["callId"]

        if (data["kind"] == "call" && !callId.isNullOrEmpty()) {
            val started = NativeCalls.reportIncoming(
                context = applicationContext,
                callId = callId,
                callerName = data["callerName"].orEmpty(),
                callKind = data["callKind"].orEmpty(),
                showUi = true,
            )
            if (started) return
        }

        super.onMessageReceived(message)
        PushNotificationsPlugin.sendRemoteMessage(message)
    }
}
