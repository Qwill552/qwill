package com.qwill.app.stand

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.RectF
import android.net.Uri
import android.provider.OpenableColumns
import android.text.InputType
import android.text.TextUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.core.MainQueue
import com.qwill.app.files.CleanupReport
import com.qwill.app.files.FileLoadListener
import com.qwill.app.files.FilePriority
import com.qwill.app.files.FileSource
import com.qwill.app.files.FileSubscription
import com.qwill.app.files.ImageReceiver
import com.qwill.app.files.MediaKind
import com.qwill.app.files.MediaTypes
import com.qwill.app.files.OpenResult
import com.qwill.app.messenger.AttachmentInput
import com.qwill.app.messenger.FeedListener
import com.qwill.app.messenger.FeedUpdate
import com.qwill.app.messenger.SendCallback
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiException
import com.qwill.app.ui.ActivityResults
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.concurrent.thread

class FilesPanel(context: Context, private val guid: Int) : StandPanel(context) {
    private val statsLine: TextView
    private val chatId: EditText
    private val percent: EditText
    private val attachmentsList: LinearLayout
    private val selectedLine: TextView
    private val preview: PreviewView
    private val cellularToggle: TextView
    private val journalView: TextView
    private val journal = ArrayDeque<String>()
    private val clockFormat = SimpleDateFormat("HH:mm:ss", Locale.ROOT)
    private val lastShare = HashMap<String, Int>()
    private val feedListener = FeedListener { onFeed(it) }
    private var selected: MessageDto? = null
    private var original: FileSubscription? = null
    private var originalStartedAt = 0L

    init {
        view.addView(label("Файлы", TextScale.SCREEN_TITLE, FontWeight.SEMIBOLD, secondary = false))
        statsLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = true)
        view.addView(statsLine, rowParams(Dimens.SPACE_1))

        chatId = field("chatId", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
        view.addView(chatId, fieldParams(Dimens.SPACE_3))
        view.addView(
            pair(
                button("Вложения чата", primary = true) { showAttachments() },
                button("Уборка сейчас", primary = false) { cleanup() },
            ),
            fieldParams(Dimens.SPACE_2),
        )
        attachmentsList = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        view.addView(attachmentsList, rowParams(Dimens.SPACE_1))

        selectedLine = label("вложение не выбрано", TextScale.CAPTION, FontWeight.MEDIUM, secondary = true)
        view.addView(selectedLine, rowParams(Dimens.SPACE_3))
        preview = PreviewView(context)
        view.addView(preview, LinearLayout.LayoutParams(context.dpInt(PREVIEW_DP), context.dpInt(PREVIEW_DP)).apply { topMargin = context.dpInt(Dimens.SPACE_2) })
        view.addView(
            pair(
                button("Оригинал", primary = true) { loadOriginal() },
                button("Отмена", primary = false) { cancelOriginal() },
            ),
            fieldParams(Dimens.SPACE_2),
        )
        percent = field("Видео: с какого %", InputType.TYPE_CLASS_NUMBER).apply { setText("50") }
        view.addView(percent, fieldParams(Dimens.SPACE_2))
        view.addView(
            pair(
                button("Видео: прочитать", primary = false) { readVideo() },
                button("Открыть", primary = false) { openDocument() },
            ),
            fieldParams(Dimens.SPACE_2),
        )
        view.addView(
            pair(
                button("Отправить фото/видео", primary = true) { pick(PICK_MEDIA, "image/*", arrayOf("image/*", "video/*")) },
                button("Отправить файл", primary = true) { pick(PICK_FILE, "*/*", null) },
            ),
            fieldParams(Dimens.SPACE_2),
        )
        cellularToggle = button("", primary = false) { toggleCellular() }
        view.addView(
            pair(
                cellularToggle,
                button("Стереть файлы", primary = false) { wipe() },
            ),
            fieldParams(Dimens.SPACE_2),
        )

        view.addView(label("Журнал файлов", TextScale.CAPTION, FontWeight.MEDIUM, secondary = true), rowParams(Dimens.SPACE_4))
        journalView = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = false)
        view.addView(journalView, rowParams(Dimens.SPACE_2))
        showCellular()
    }

    fun attach() {
        QwillApplication.messages.addFeedListener(feedListener)
        ActivityResults.register(PICK_MEDIA) { code, data -> onPicked(code, data) }
        ActivityResults.register(PICK_FILE) { code, data -> onPicked(code, data) }
        showStats()
    }

    fun detach() {
        QwillApplication.messages.removeFeedListener(feedListener)
        ActivityResults.unregister(PICK_MEDIA)
        ActivityResults.unregister(PICK_FILE)
        original?.let { QwillApplication.files.loader.cancel(it) }
        original = null
    }

    override fun applyAppearance() {
        super.applyAppearance()
        preview.invalidate()
    }

    private fun showAttachments() {
        val id = currentChat() ?: return record("сначала chatId")
        QwillApplication.messages.recentAttachments(id, ATTACHMENTS_SHOWN) { messages ->
            attachmentsList.removeAllViews()
            if (messages.isEmpty()) attachmentsList.addView(row("вложений в базе нет"))
            for (message in messages) {
                val attachment = message.attachment ?: continue
                val line = row("${attachment.originalName} · ${MediaTypes.kindOf(attachment).key} · ${kb(attachment.file.size)} КБ")
                attachmentsList.addView(line)
                QwillApplication.files.isCached(attachment.file.id) { onDisk ->
                    line.text = "${line.text} · ${if (onDisk) "на диске" else "нет"}"
                }
                line.setOnClickListener { select(message) }
            }
        }
    }

    private fun select(message: MessageDto) {
        val attachment = message.attachment ?: return
        selected = message
        val files = QwillApplication.files
        val density = context.resources.displayMetrics.density
        val request = files.shownRequest(attachment, message.chatId, density, PREVIEW_DP)
        selectedLine.text = "${attachment.originalName} · копия ${request.tier.key}"
        val started = System.currentTimeMillis()
        preview.show(request, attachment.blurhash, context.dpInt(PREVIEW_DP)) { source ->
            record("показ ${attachment.originalName}: ${sourceName(source)} за ${System.currentTimeMillis() - started} мс")
        }
        files.shouldAutoDownload(attachment, density, PREVIEW_DP) { allowed ->
            record("автозагрузка (${files.networkKind().name.lowercase(Locale.ROOT)}): ${if (allowed) "да" else "нет"}")
        }
    }

    private fun loadOriginal() {
        val message = selected ?: return record("выберите вложение")
        val attachment = message.attachment ?: return
        val loader = QwillApplication.files.loader
        original?.let { loader.cancel(it) }
        originalStartedAt = System.currentTimeMillis()
        val request = QwillApplication.files.originalRequest(attachment, message.chatId)
        var lastPercent = -1
        original = loader.load(
            request,
            FilePriority.HIGH,
            guid,
            object : FileLoadListener {
                override fun onReady(file: File, source: FileSource) {
                    original = null
                    record("оригинал: ${sourceName(source)}, ${kb(file.length())} КБ за ${System.currentTimeMillis() - originalStartedAt} мс")
                    showStats()
                }

                override fun onResumed(fromByte: Long) {
                    record(if (fromByte > 0) "докачка с байта $fromByte" else "загрузка с начала")
                }

                override fun onProgress(loaded: Long, total: Long) {
                    val value = if (total > 0) (loaded * 100 / total).toInt() else 0
                    if (value / PROGRESS_STEP == lastPercent / PROGRESS_STEP) return
                    lastPercent = value
                    record("оригинал: $value% ($loaded байт)")
                }

                override fun onFailed(error: ApiException) {
                    original = null
                    record("оригинал: ${error.message}")
                }
            },
            manual = true,
        )
    }

    private fun cancelOriginal() {
        val message = selected ?: return
        val attachment = message.attachment ?: return
        original = null
        QwillApplication.files.loader.cancelManual(attachment.file.id)
        record("оригинал отменён")
    }

    private fun readVideo() {
        val message = selected ?: return record("выберите вложение")
        val attachment = message.attachment ?: return
        if (MediaTypes.kindOf(attachment) != MediaKind.VIDEO) return record("это не видео")
        val share = percent.text.toString().toIntOrNull()?.coerceIn(0, MAX_PERCENT) ?: 0
        val files = QwillApplication.files
        val request = files.originalRequest(attachment, message.chatId)
        thread(name = "standVideoRead") {
            val stream = files.openVideo(request)
            val line = try {
                stream.open()
                val length = stream.length()
                val position = length * share / MAX_PERCENT
                val buffer = ByteArray(VIDEO_READ_BYTES)
                val started = System.currentTimeMillis()
                var read = 0
                var source: FileSource? = null
                while (read < buffer.size) {
                    val count = stream.read(position + read, buffer, read, buffer.size - read)
                    if (count <= 0) break
                    if (source == null) source = stream.lastSource
                    read += count
                }
                "видео с $share%: $read байт, ${sourceName(source)}, ${System.currentTimeMillis() - started} мс, диапазонов ${stream.rangesCount()}"
            } catch (e: IOException) {
                "видео: ${e.message}"
            } finally {
                stream.close()
            }
            MainQueue.post {
                record(line)
                showStats()
            }
        }
    }

    private fun openDocument() {
        val message = selected ?: return record("выберите вложение")
        val attachment = message.attachment ?: return
        QwillApplication.files.openDocument(attachment.file.id, attachment.originalName, attachment.file.mimeType) { result ->
            record(
                when (result) {
                    OpenResult.Opened -> "открыто: ${attachment.originalName}"
                    OpenResult.NotLoaded -> "сначала «Оригинал»"
                    OpenResult.NoApp -> "нечем открыть"
                },
            )
        }
    }

    private fun pick(requestCode: Int, type: String, types: Array<String>?) {
        if (currentChat() == null) return record("сначала chatId")
        val activity = context as? Activity ?: return
        val intent = Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type)
        if (types != null) intent.putExtra(Intent.EXTRA_MIME_TYPES, types)
        @Suppress("DEPRECATION")
        activity.startActivityForResult(intent, requestCode)
    }

    private fun onPicked(resultCode: Int, data: Intent?) {
        val uri = data?.data
        if (resultCode != Activity.RESULT_OK || uri == null) return record("выбор отменён")
        val id = currentChat() ?: return record("сначала chatId")
        val resolver = context.contentResolver
        val name = displayName(uri) ?: uri.lastPathSegment ?: "file"
        val input = AttachmentInput(name, resolver.getType(uri)) {
            resolver.openInputStream(uri) ?: throw IOException("файл не открылся")
        }
        record("отправка $name")
        QwillApplication.messages.sendMedia(
            id,
            input,
            callback = object : SendCallback {
                override fun onQueued(message: MessageDto) {
                    record("в очереди: ${message.clientId?.take(CLIENT_ID_CHARS)}")
                    showStats()
                }

                override fun onNotSaved(error: Exception) {
                    record("не сохранено: ${error.message}")
                }
            },
        )
    }

    private fun displayName(uri: Uri): String? = try {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    } catch (e: RuntimeException) {
        null
    }

    private fun onFeed(update: FeedUpdate) {
        when (update) {
            is FeedUpdate.UploadProgress -> {
                val value = (update.share * 100).toInt()
                val previous = lastShare[update.clientId] ?: -1
                if (value / PROGRESS_STEP == previous / PROGRESS_STEP) return
                lastShare[update.clientId] = value
                record("выгрузка ${update.clientId.take(CLIENT_ID_CHARS)}: $value%")
            }
            is FeedUpdate.LocalAttachmentChanged -> {
                val local = update.local
                val state = when {
                    local.failed -> "не отправлено" + (local.error?.let { ": $it" } ?: "")
                    local.sha256 != null -> "хэш посчитан"
                    local.prepared -> "подготовлено ${local.width ?: "-"}×${local.height ?: "-"}"
                    else -> "скопировано ${kb(local.size)} КБ"
                }
                record("вложение ${update.clientId.take(CLIENT_ID_CHARS)}: $state")
            }
            is FeedUpdate.Sent -> if (update.message.attachment != null) {
                lastShare.remove(update.clientId)
                record("отправлено ${update.message.attachment.originalName}")
                showStats()
            }
            is FeedUpdate.Discarded -> record("отменено ${update.clientId.take(CLIENT_ID_CHARS)}")
            else -> {}
        }
    }

    private fun cleanup() {
        QwillApplication.files.cleanup { report -> describe(report) }
    }

    private fun describe(report: CleanupReport) {
        for (row in report.expired) record("уборка, срок: ${row.fileId.take(CLIENT_ID_CHARS)} ${row.kind.key} ${kb(row.size)} КБ")
        for (row in report.overBudget) record("уборка, бюджет: ${row.fileId.take(CLIENT_ID_CHARS)} ${row.tier.key} ${kb(row.size)} КБ")
        record("уборка: удалено ${report.expired.size + report.overBudget.size}, ${kb(report.removedBytes)} КБ, без файла ${report.missing}, лишних ${report.strayFiles}")
        showStats()
    }

    private fun wipe() {
        QwillApplication.files.wipeFiles {
            record("файлы стёрты")
            showStats()
        }
    }

    private fun toggleCellular() {
        val prefs = QwillApplication.files.preferences
        prefs.setTreatAsCellular(!prefs.treatAsCellular())
        showCellular()
    }

    private fun showCellular() {
        val on = QwillApplication.files.preferences.treatAsCellular()
        cellularToggle.text = if (on) "Сеть: мобильная (вкл)" else "Считать сеть мобильной"
    }

    private fun showStats() {
        QwillApplication.messages.stats { messages ->
            QwillApplication.files.stats { stats ->
                val kinds = stats.byKind.entries.filter { it.value > 0 }.joinToString(", ") { "${it.key.key} ${kb(it.value)}" }
                val budget = stats.budgetBytes?.let { "${kb(it)} КБ" } ?: "без потолка"
                statsLine.text = "файлов ${stats.files}, ${kb(stats.bytes)} КБ ($kinds) · недокачано ${stats.temps} · " +
                    "видео по кускам ${stats.partialVideos} (${kb(stats.partialBytes)} КБ) · в очереди вложений ${messages.unsentAttachments} · " +
                    "бюджет $budget · память ${kb(stats.memoryBytes.toLong())}/${kb(stats.memoryBudgetBytes.toLong())} КБ"
            }
        }
    }

    private fun row(value: String): TextView = TextView(context).apply {
        text = value
        typeface = Fonts.display(FontWeight.REGULAR)
        includeFontPadding = false
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.END
        gravity = Gravity.CENTER_VERTICAL
        minHeight = context.dpInt(Dimens.TAP_MIN)
        isFocusable = true
        setTextColor(Theme.palette.textPrimary)
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.CAPTION))
    }

    private fun currentChat(): String? = chatId.text.toString().trim().ifEmpty { null }

    private fun record(line: String) {
        journal.addFirst("${clockFormat.format(Date())} $line")
        while (journal.size > JOURNAL_SIZE) journal.removeLast()
        journalView.text = journal.joinToString("\n")
    }

    private fun sourceName(source: FileSource?): String = when (source) {
        FileSource.MEMORY -> "память"
        FileSource.DISK -> "диск"
        FileSource.NETWORK -> "сеть"
        null -> "—"
    }

    private fun kb(bytes: Long): Long = bytes / BYTES_IN_KB

    private class PreviewView(context: Context) : View(context) {
        private val receiver = ImageReceiver(this, QwillApplication.files.images)
        private val rect = RectF()
        private var onShown: ((FileSource) -> Unit)? = null
        private var reported = false

        fun show(request: com.qwill.app.files.FileRequest, blurhash: String?, widthPx: Int, done: (FileSource) -> Unit) {
            onShown = done
            reported = false
            receiver.setImage(request, blurhash, widthPx)
            invalidate()
        }

        override fun onAttachedToWindow() {
            super.onAttachedToWindow()
            receiver.onAttach()
        }

        override fun onDetachedFromWindow() {
            receiver.onDetach()
            super.onDetachedFromWindow()
        }

        override fun onDraw(canvas: Canvas) {
            rect.set(0f, 0f, width.toFloat(), height.toFloat())
            receiver.draw(canvas, rect, context.dp(Dimens.RADIUS_MD))
            val source = receiver.lastSource
            if (!reported && receiver.hasImage && source != null) {
                reported = true
                onShown?.invoke(source)
            }
        }
    }

    private companion object {
        const val PICK_MEDIA = 7201
        const val PICK_FILE = 7202
        const val PREVIEW_DP = 220f
        const val ATTACHMENTS_SHOWN = 20
        const val JOURNAL_SIZE = 40
        const val CLIENT_ID_CHARS = 8
        const val BYTES_IN_KB = 1024L
        const val PROGRESS_STEP = 10
        const val MAX_PERCENT = 100
        const val VIDEO_READ_BYTES = 64 * 1024
    }
}
