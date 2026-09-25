package com.qwill.app.calls

import com.qwill.app.core.IsoTime
import com.qwill.app.model.CallStatus
import com.qwill.app.model.MessageCallDto
import com.qwill.app.ui.QwillIcon
import java.util.Locale

object CallText {
    fun isUnanswered(call: MessageCallDto): Boolean = call.startedAt == null

    fun isFailed(call: MessageCallDto): Boolean = isUnanswered(call) || call.status == CallStatus.DECLINED

    fun statusLabel(call: MessageCallDto, own: Boolean): String {
        if (call.status == CallStatus.DECLINED) return if (own) "Звонок отклонён" else "Отклонённый звонок"
        if (isUnanswered(call)) {
            if (!own) return "Пропущенный звонок"
            return if (call.status == CallStatus.MISSED) "Звонок без ответа" else "Отменённый звонок"
        }
        return if (own) "Исходящий звонок" else "Входящий звонок"
    }

    fun symbol(call: MessageCallDto, own: Boolean): QwillIcon = when {
        call.status == CallStatus.DECLINED -> QwillIcon.CLOSE
        own -> QwillIcon.CALL_OUT
        else -> QwillIcon.CALL_IN
    }

    fun formatDuration(ms: Long): String {
        val totalSeconds = maxOf(0L, ms / 1000)
        val hours = totalSeconds / 3600
        val minutes = (totalSeconds % 3600) / 60
        val seconds = totalSeconds % 60
        if (hours > 0) return String.format(Locale.ROOT, "%d:%02d:%02d", hours, minutes, seconds)
        return String.format(Locale.ROOT, "%d:%02d", minutes, seconds)
    }

    fun durationText(call: MessageCallDto): String? {
        val started = IsoTime.parse(call.startedAt) ?: return null
        val ended = IsoTime.parse(call.endedAt) ?: return null
        return formatDuration(ended - started)
    }

    fun preview(call: MessageCallDto, own: Boolean): String {
        val label = statusLabel(call, own)
        val duration = durationText(call) ?: return label
        return "$label · $duration"
    }
}
