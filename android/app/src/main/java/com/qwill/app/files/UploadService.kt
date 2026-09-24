package com.qwill.app.files

import android.annotation.TargetApi
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import com.qwill.app.LaunchActivity

class UploadService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val count = intent?.getIntExtra(EXTRA_COUNT, 0) ?: 0
        if (count <= 0) {
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }
        val notification = build(this, count, intent?.getIntExtra(EXTRA_PERCENT, -1) ?: -1)
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        } catch (e: RuntimeException) {
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onTimeout(startId: Int, fgsType: Int) {
        stopForegroundCompat()
        stopSelf()
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= 24) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    companion object {
        private const val CHANNEL_ID = "uploads"
        private const val NOTIFICATION_ID = 7101
        private const val EXTRA_COUNT = "count"
        private const val EXTRA_PERCENT = "percent"
        private const val TITLE = "Отправка файлов"
        private const val CHANNEL_NAME = "Отправка файлов"

        @Volatile
        private var running = false

        fun update(context: Context, count: Int, percent: Int = -1) {
            if (count <= 0 && !running) return
            val intent = Intent(context, UploadService::class.java)
                .putExtra(EXTRA_COUNT, count)
                .putExtra(EXTRA_PERCENT, percent)
            try {
                if (count > 0 && !running && Build.VERSION.SDK_INT >= 26) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
                running = count > 0
            } catch (e: RuntimeException) {
                running = false
            }
        }

        private fun build(context: Context, count: Int, percent: Int): Notification {
            val open = PendingIntent.getActivity(
                context,
                0,
                Intent(context, LaunchActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0),
            )
            val text = if (count == 1) "Отправляется 1 файл" else "Отправляется файлов: $count"
            val builder = if (Build.VERSION.SDK_INT >= 26) {
                ensureChannel(context)
                Notification.Builder(context, CHANNEL_ID)
            } else {
                @Suppress("DEPRECATION")
                Notification.Builder(context)
            }
            return builder
                .setSmallIcon(android.R.drawable.stat_sys_upload)
                .setContentTitle(TITLE)
                .setContentText(text)
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setProgress(100, percent.coerceIn(0, 100), percent < 0)
                .build()
        }

        @TargetApi(26)
        private fun ensureChannel(context: Context) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (manager.getNotificationChannel(CHANNEL_ID) != null) return
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW))
        }
    }
}
