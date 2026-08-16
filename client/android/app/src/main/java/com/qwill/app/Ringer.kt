package com.qwill.app

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

object Ringer {

    private val PATTERN = longArrayOf(0L, 900L, 1100L)

    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null

    @Synchronized
    fun start(context: Context) {
        stop()

        val audio = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        if (audio.ringerMode == AudioManager.RINGER_MODE_SILENT) return

        startVibration(context)
        if (audio.ringerMode != AudioManager.RINGER_MODE_NORMAL) return

        val uri = RingtoneManager.getActualDefaultRingtoneUri(context, RingtoneManager.TYPE_RINGTONE) ?: return
        player = runCatching {
            MediaPlayer().apply {
                setDataSource(context, uri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build(),
                )
                isLooping = true
                prepare()
                start()
            }
        }.getOrNull()
    }

    @Synchronized
    fun stop() {
        player?.runCatching {
            if (isPlaying) stop()
            release()
        }
        player = null
        vibrator?.cancel()
        vibrator = null
    }

    private fun startVibration(context: Context) {
        val device = resolveVibrator(context) ?: return
        if (!device.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            device.vibrate(VibrationEffect.createWaveform(PATTERN, 0))
        } else {
            @Suppress("DEPRECATION")
            device.vibrate(PATTERN, 0)
        }
        vibrator = device
    }

    private fun resolveVibrator(context: Context): Vibrator? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            return manager?.defaultVibrator
        }
        @Suppress("DEPRECATION")
        return context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
}
