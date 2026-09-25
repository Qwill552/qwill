package com.qwill.app.chats

import com.qwill.app.calls.CallText
import com.qwill.app.model.AttachmentDto
import com.qwill.app.model.CallKind
import com.qwill.app.model.CallStatus
import com.qwill.app.model.ChatListItemDto
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.model.ChatType
import com.qwill.app.model.FileDto
import com.qwill.app.model.MessageAnnouncementDto
import com.qwill.app.model.MessageCallDto
import com.qwill.app.model.MessageDto
import com.qwill.app.ui.QwillIcon
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatPreviewTest {
    private val me = ChatMemberSummary("me", displayName = "Я")
    private val peer = ChatMemberSummary("peer", displayName = "Борис")

    private fun chat(last: MessageDto?, type: ChatType = ChatType.PRIVATE) =
        ChatListItemDto(id = "c", type = type, title = "Чат", lastMessage = last)

    private fun message(
        sender: ChatMemberSummary? = peer,
        content: String? = null,
        attachment: AttachmentDto? = null,
        call: MessageCallDto? = null,
        announcement: MessageAnnouncementDto? = null,
        deletedAt: String? = null,
    ) = MessageDto(id = 1, chatId = "c", sender = sender, content = content, attachment = attachment, call = call, announcement = announcement, deletedAt = deletedAt)

    private fun file(mime: String, name: String = "", peaks: List<Double>? = null) =
        AttachmentDto(id = "a", file = FileDto("f", mime), originalName = name, peaks = peaks)

    private fun call(status: CallStatus, started: String? = null, ended: String? = null) =
        MessageCallDto(id = "call", kind = CallKind.AUDIO, status = status, startedAt = started, endedAt = ended)

    @Test
    fun noMessages() {
        val preview = ChatPreview.of(chat(null), "me")
        assertEquals("Нет сообщений", preview.text)
        assertNull(preview.icon)
        assertEquals("", preview.author)
    }

    @Test
    fun textCollapsesWhitespaceLikeNowrap() {
        val preview = ChatPreview.of(chat(message(content = "  первая\n\nвторая\tтретья ")), "me")
        assertEquals("первая вторая третья", preview.text)
        assertNull(preview.icon)
    }

    @Test
    fun authorPrefixes() {
        assertEquals("Вы: ", ChatPreview.of(chat(message(sender = me, content = "x")), "me").author)
        assertEquals("", ChatPreview.of(chat(message(content = "x")), "me").author)
        assertEquals("Борис: ", ChatPreview.of(chat(message(content = "x"), ChatType.GROUP), "me").author)
        assertEquals("", ChatPreview.of(chat(message(sender = null, content = "x"), ChatType.GROUP), "me").author)
    }

    @Test
    fun attachmentsWithoutText() {
        assertPreview(message(attachment = file("audio/webm", peaks = listOf(0.1))), "Голосовое сообщение", QwillIcon.MIC)
        assertPreview(message(attachment = file("audio/mpeg")), "Голосовое сообщение", QwillIcon.MIC)
        assertPreview(message(attachment = file("image/jpeg")), "Фото", QwillIcon.CAMERA)
        assertPreview(message(attachment = file("video/mp4")), "Видео", QwillIcon.IMAGE)
        assertPreview(message(attachment = file("application/pdf", "отчёт.pdf")), "отчёт.pdf", QwillIcon.ATTACH)
        assertPreview(message(attachment = file("video/quicktime")), "Файл", QwillIcon.ATTACH)
    }

    @Test
    fun attachmentWithTextKeepsIconAndText() {
        assertPreview(message(content = "подпись", attachment = file("image/png")), "подпись", QwillIcon.CAMERA)
    }

    @Test
    fun announcement() {
        assertPreview(message(announcement = MessageAnnouncementDto("a1"), content = "ignored"), "Что нового в Qwill", null)
    }

    @Test
    fun callsFromBothSides() {
        val started = "2026-09-25T10:00:00.000Z"
        val ended = "2026-09-25T10:02:05.000Z"
        val answered = call(CallStatus.ENDED, started, ended)
        val outgoing = ChatPreview.of(chat(message(sender = me, call = answered)), "me")
        assertEquals("Исходящий звонок · 2:05", outgoing.text)
        assertEquals(QwillIcon.CALL_OUT, outgoing.icon)
        assertEquals("", outgoing.author)
        assertFalse(outgoing.failedCall)
        val incoming = ChatPreview.of(chat(message(call = answered), ChatType.GROUP), "me")
        assertEquals("Входящий звонок · 2:05", incoming.text)
        assertEquals(QwillIcon.CALL_IN, incoming.icon)
        assertEquals("", incoming.author)
    }

    @Test
    fun unansweredAndDeclinedCallsAreFailed() {
        val missed = ChatPreview.of(chat(message(call = call(CallStatus.MISSED))), "me")
        assertEquals("Пропущенный звонок", missed.text)
        assertTrue(missed.failedCall)
        assertEquals("Звонок без ответа", ChatPreview.of(chat(message(sender = me, call = call(CallStatus.MISSED))), "me").text)
        assertEquals("Отменённый звонок", ChatPreview.of(chat(message(sender = me, call = call(CallStatus.ENDED))), "me").text)
        val declinedOwn = ChatPreview.of(chat(message(sender = me, call = call(CallStatus.DECLINED))), "me")
        assertEquals("Звонок отклонён", declinedOwn.text)
        assertEquals(QwillIcon.CLOSE, declinedOwn.icon)
        assertTrue(declinedOwn.failedCall)
        assertEquals("Отклонённый звонок", ChatPreview.of(chat(message(call = call(CallStatus.DECLINED))), "me").text)
    }

    @Test
    fun deletedCallHasNoIconButKeepsText() {
        val preview = ChatPreview.of(chat(message(call = call(CallStatus.MISSED), deletedAt = "2026-09-25T10:00:00.000Z")), "me")
        assertNull(preview.icon)
        assertFalse(preview.failedCall)
        assertEquals("Пропущенный звонок", preview.text)
    }

    @Test
    fun callDurationFormats() {
        assertEquals("0:07", CallText.formatDuration(7_900))
        assertEquals("12:00", CallText.formatDuration(720_000))
        assertEquals("1:02:03", CallText.formatDuration(3_723_000))
        assertEquals("0:00", CallText.formatDuration(-5))
    }

    private fun assertPreview(last: MessageDto, text: String, icon: QwillIcon?) {
        val preview = ChatPreview.of(chat(last), "me")
        assertEquals(text, preview.text)
        assertEquals(icon, preview.icon)
    }
}
