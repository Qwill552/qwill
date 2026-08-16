package com.qwill.app

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object CallNotifications {

    private const val CHANNEL_ID = "qwill_calls"
    private const val NOTIFICATION_ID = 4711

    @SuppressLint("MissingPermission")
    fun showIncoming(context: Context, callId: String, callerName: String, callKind: String) {
        ensureChannel(context)

        val statusRes =
            if (callKind == NativeCalls.KIND_VIDEO) R.string.call_incoming_video else R.string.call_incoming_audio

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_call)
            .setContentTitle(callerName)
            .setContentText(context.getString(statusRes))
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(screenIntent(context, callId, callerName, callKind, answerNow = false), true)
            .addAction(R.drawable.ic_call, context.getString(R.string.call_decline), declineIntent(context, callId))
            .addAction(
                R.drawable.ic_call,
                context.getString(R.string.call_accept),
                screenIntent(context, callId, callerName, callKind, answerNow = true),
            )
            .build()

        runCatching { NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification) }
    }

    fun cancel(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            context.getString(R.string.call_channel_name),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.call_channel_description)
            setSound(null, null)
            enableVibration(false)
            lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
        }
        manager.createNotificationChannel(channel)
    }

    private fun screenIntent(
        context: Context,
        callId: String,
        callerName: String,
        callKind: String,
        answerNow: Boolean,
    ): PendingIntent {
        val intent = IncomingCallActivity.intent(context, callId, callerName, callKind, answerNow)
        return PendingIntent.getActivity(
            context,
            if (answerNow) 2 else 1,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun declineIntent(context: Context, callId: String): PendingIntent {
        val intent = Intent(context, CallActionReceiver::class.java).apply {
            action = CallActionReceiver.ACTION_DECLINE
            putExtra(NativeCalls.EXTRA_CALL_ID, callId)
        }
        return PendingIntent.getBroadcast(
            context,
            3,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }
}

class CallActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_DECLINE) return
        val callId = intent.getStringExtra(NativeCalls.EXTRA_CALL_ID) ?: return
        NativeCalls.reject(callId)
    }

    companion object {
        const val ACTION_DECLINE = "com.qwill.app.action.DECLINE_CALL"
    }
}
