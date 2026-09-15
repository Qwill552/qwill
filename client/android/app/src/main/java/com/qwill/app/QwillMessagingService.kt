package com.qwill.app

import androidx.core.app.NotificationManagerCompat
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

private const val FCM_NOTIFICATION_ID = 0

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

        if (data["kind"] == "call-ended" && !callId.isNullOrEmpty()) {
            NativeCalls.reportEnded(applicationContext, callId)
            return
        }

        val chatId = data["chatId"]
        if (data["kind"] == "read" && !chatId.isNullOrEmpty()) {
            NotificationManagerCompat.from(applicationContext).cancel(chatId, FCM_NOTIFICATION_ID)
            return
        }

        super.onMessageReceived(message)
        PushNotificationsPlugin.sendRemoteMessage(message)
    }
}
