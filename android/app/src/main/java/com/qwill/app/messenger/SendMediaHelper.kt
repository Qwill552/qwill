package com.qwill.app.messenger

import com.qwill.app.core.TaskQueue
import com.qwill.app.database.MessagesStorage
import com.qwill.app.database.UnsentMessage
import com.qwill.app.files.CallSlot
import com.qwill.app.files.CancelledTransfer
import com.qwill.app.files.MediaTier
import com.qwill.app.files.MediaTypes
import com.qwill.app.files.PreparedMedia
import com.qwill.app.files.UploadedFile
import com.qwill.app.model.ChatMemberSummary
import com.qwill.app.model.LocalAttachment
import com.qwill.app.model.MessageAttachmentInput
import com.qwill.app.model.MessageDto
import com.qwill.app.model.MessageReplyPreviewDto
import com.qwill.app.model.MessageSendPayload
import com.qwill.app.model.MessageType
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executor

class AttachmentInput(
    val originalName: String,
    val mimeType: String?,
    val open: () -> InputStream,
)

interface AttachmentBackend {
    fun outboxDir(clientId: String): File

    fun copyIn(input: AttachmentInput, target: File): Long

    fun prepare(local: LocalAttachment, dir: File): PreparedMedia

    fun sha256(file: File, slot: CallSlot): String

    fun upload(file: File, mimeType: String, originalName: String, sha256: String, slot: CallSlot, onProgress: (Long, Long) -> Unit): UploadedFile

    fun adopt(fileId: String, file: File, mimeType: String, chatId: String, local: LocalAttachment, tier: MediaTier)

    fun deleteOutbox(clientId: String)
}

data class MediaSendTimings(
    val maxAttempts: Int = 8,
    val progressIntervalMs: Long = 100,
    val retryFirstMs: Long = 2_000,
    val retryMaxMs: Long = 60_000,
)

class SendMediaHelper internal constructor(
    private val storage: MessagesStorage,
    private val storageQueue: TaskQueue,
    private val main: TaskQueue,
    private val transport: MessagesTransport,
    private val backend: AttachmentBackend,
    private val prepareQueue: TaskQueue,
    private val workers: Executor,
    private val holdSocket: () -> () -> Unit,
    private val localTime: () -> Long,
    private val isoTime: (Long) -> String,
    private val clock: () -> Long,
    private val guid: Int,
    private val host: SendMessagesHelper.Host,
    private val timings: MediaSendTimings = MediaSendTimings(),
    private val onActiveChanged: (Int) -> Unit = {},
) {
    private class Job(val chatId: String, val clientId: String) {
        val slot = CallSlot()
        var lastProgressAt = 0L
        var retryDelayMs = 0L
    }

    private val jobs = ConcurrentHashMap<String, Job>()
    private val retryTasks = HashMap<String, Runnable>()
    private var release: (() -> Unit)? = null

    val activeCount: Int get() = jobs.size

    fun sendMedia(
        chatId: String,
        input: AttachmentInput,
        caption: String?,
        sender: ChatMemberSummary?,
        replyTo: MessageDto?,
        albumId: String?,
        duration: Int?,
        peaks: List<Double>?,
        callback: SendCallback?,
    ) {
        val epoch = host.epoch
        val clientId = UUID.randomUUID().toString()
        val createdAt = localTime()
        prepareQueue.post {
            val dir = backend.outboxDir(clientId)
            val copied = try {
                dir.mkdirs()
                val target = File(dir, SOURCE_NAME)
                val size = backend.copyIn(input, target)
                if (size <= 0) throw IOException("пустой файл")
                size
            } catch (e: Exception) {
                backend.deleteOutbox(clientId)
                main.post { if (epoch == host.epoch) callback?.onNotSaved(e) }
                return@post
            }
            val local = LocalAttachment(
                source = SOURCE_NAME,
                originalName = input.originalName.ifBlank { SOURCE_NAME },
                mimeType = MediaTypes.mimeTypeOf(input.mimeType, input.originalName),
                size = copied,
                duration = duration,
                peaks = peaks,
                albumId = albumId,
            )
            val message = MessageDto(
                id = -createdAt,
                chatId = chatId,
                clientId = clientId,
                albumId = albumId,
                sender = sender,
                type = MessageType.MEDIA,
                content = caption?.takeIf { it.isNotBlank() },
                replyToId = replyTo?.id,
                replyTo = replyTo?.let { replyPreview(it) },
                createdAt = isoTime(createdAt),
            )
            storageQueue.post {
                val error = try {
                    storage.insertUnsent(message, createdAt, local)
                    null
                } catch (e: Exception) {
                    e
                }
                main.post {
                    if (epoch != host.epoch) return@post
                    if (error != null) {
                        prepareQueue.post { backend.deleteOutbox(clientId) }
                        callback?.onNotSaved(error)
                        return@post
                    }
                    host.notify(FeedUpdate.Pending(chatId, message))
                    host.notify(FeedUpdate.LocalAttachmentChanged(chatId, clientId, local, dir))
                    callback?.onQueued(message)
                    launch(chatId, clientId, local)
                }
            }
        }
    }

    fun drain() {
        val epoch = host.epoch
        storageQueue.post {
            val rows = storage.readUnsent().filter { it.local != null && it.local.failed.not() }
            val due = ArrayList<Pair<UnsentMessage, Int>>()
            for (row in rows) {
                val clientId = row.message.clientId ?: continue
                if (isRunning(clientId)) continue
                due.add(row to storage.bumpAttempts(clientId))
            }
            main.post {
                if (epoch != host.epoch) return@post
                for ((row, attempts) in due) {
                    val clientId = row.message.clientId ?: continue
                    val local = row.local ?: continue
                    if (attempts > timings.maxAttempts) markFailed(row.message.chatId, clientId, local, null) else launch(row.message.chatId, clientId, local)
                }
            }
        }
    }

    fun retry(chatId: String, clientId: String) {
        if (jobs.containsKey(clientId)) return
        val epoch = host.epoch
        storageQueue.post {
            val row = storage.readUnsentByClient(clientId)
            val local = row?.local?.copy(failed = false, error = null)
            if (local != null) {
                storage.updateLocalAttachment(clientId, local)
                storage.resetAttempts(clientId)
            }
            main.post {
                if (epoch != host.epoch || local == null) return@post
                host.notify(FeedUpdate.LocalAttachmentChanged(chatId, clientId, local, backend.outboxDir(clientId)))
                launch(chatId, clientId, local)
            }
        }
    }

    fun cancel(chatId: String, clientId: String) {
        stopJob(clientId)
        val epoch = host.epoch
        storageQueue.post {
            storage.removeUnsent(clientId)
            prepareQueue.post { backend.deleteOutbox(clientId) }
            main.post { if (epoch == host.epoch) host.notify(FeedUpdate.Discarded(chatId, clientId)) }
        }
    }

    fun onChatRemoved(chatId: String, clientIds: List<String>) {
        for (job in jobs.values.filter { it.chatId == chatId }) stopJob(job.clientId)
        for (clientId in clientIds) stopJob(clientId)
        prepareQueue.post { for (clientId in clientIds) backend.deleteOutbox(clientId) }
    }

    fun clear() {
        for (clientId in ArrayList(jobs.keys)) stopJob(clientId)
        for (task in retryTasks.values) main.cancel(task)
        retryTasks.clear()
        updateHold()
    }

    fun isRunning(clientId: String): Boolean = jobs.containsKey(clientId)

    private fun launch(chatId: String, clientId: String, local: LocalAttachment) {
        if (jobs.containsKey(clientId)) return
        retryTasks.remove(clientId)?.let { main.cancel(it) }
        val job = Job(chatId, clientId)
        jobs[clientId] = job
        updateHold()
        val epoch = host.epoch
        workers.execute { runUpload(job, local, epoch) }
    }

    private fun runUpload(job: Job, initial: LocalAttachment, epoch: Int) {
        val dir = backend.outboxDir(job.clientId)
        var local = initial
        try {
            if (!local.prepared) {
                val prepared = backend.prepare(local, dir)
                local = local.copy(
                    prepared = true,
                    width = prepared.width ?: local.width,
                    height = prepared.height ?: local.height,
                    duration = local.duration ?: prepared.durationMs,
                    thumb = prepared.thumb?.name,
                    preview = prepared.preview?.name,
                )
                save(job, local, epoch)
            }
            if (job.slot.cancelled) throw CancelledTransfer()
            val source = File(dir, local.source)
            if (!source.exists()) throw IOException("файл для отправки пропал")
            if (local.sha256 == null) {
                local = local.copy(sha256 = backend.sha256(source, job.slot))
                save(job, local, epoch)
            }
            val thumb = local.thumb?.let { name ->
                val file = File(dir, name)
                val sha = local.thumbSha256 ?: backend.sha256(file, job.slot).also {
                    local = local.copy(thumbSha256 = it)
                    save(job, local, epoch)
                }
                backend.upload(file, JPEG, name, sha, job.slot) { _, _ -> } to file
            }
            val preview = local.preview?.let { name ->
                val file = File(dir, name)
                val sha = local.previewSha256 ?: backend.sha256(file, job.slot).also {
                    local = local.copy(previewSha256 = it)
                    save(job, local, epoch)
                }
                backend.upload(file, JPEG, name, sha, job.slot) { _, _ -> } to file
            }
            val uploaded = backend.upload(source, local.mimeType, local.originalName, local.sha256!!, job.slot) { loaded, total ->
                reportProgress(job, loaded, total, epoch)
            }
            val ready = local
            main.post { if (epoch == host.epoch) send(job, ready, uploaded, thumb, preview) }
        } catch (e: CancelledTransfer) {
            main.post { finishJob(job) }
        } catch (e: ApiException) {
            main.post {
                finishJob(job)
                if (epoch != host.epoch || job.slot.cancelled) return@post
                if (isTransient(e)) scheduleRetry(job, local) else markFailed(job.chatId, job.clientId, local, e.message)
            }
        } catch (e: IOException) {
            main.post {
                finishJob(job)
                if (epoch == host.epoch && !job.slot.cancelled) markFailed(job.chatId, job.clientId, local, e.message ?: UPLOAD_FAILED)
            }
        } catch (e: RuntimeException) {
            main.post {
                finishJob(job)
                if (epoch == host.epoch && !job.slot.cancelled) markFailed(job.chatId, job.clientId, local, UPLOAD_FAILED)
            }
        }
    }

    private fun send(job: Job, local: LocalAttachment, uploaded: UploadedFile, thumb: Pair<UploadedFile, File>?, preview: Pair<UploadedFile, File>?) {
        if (job.slot.cancelled) {
            finishJob(job)
            return
        }
        val epoch = host.epoch
        storageQueue.post {
            val row = storage.readUnsentByClient(job.clientId)
            main.post {
                if (epoch != host.epoch) return@post
                val message = row?.message
                if (message == null || job.slot.cancelled) {
                    finishJob(job)
                    return@post
                }
                val payload = MessageSendPayload(
                    chatId = job.chatId,
                    clientId = job.clientId,
                    content = message.content,
                    replyToId = message.replyToId,
                    attachment = MessageAttachmentInput(
                        fileId = uploaded.file.id,
                        sha256 = uploaded.sha256,
                        thumbnailFileId = thumb?.first?.file?.id,
                        thumbnailSha256 = thumb?.first?.sha256,
                        previewFileId = preview?.first?.file?.id,
                        previewSha256 = preview?.first?.sha256,
                        originalName = local.originalName,
                        width = local.width?.takeIf { it > 0 },
                        height = local.height?.takeIf { it > 0 },
                        duration = local.duration?.takeIf { it > 0 },
                        peaks = local.peaks?.takeIf { it.isNotEmpty() },
                    ),
                    albumId = local.albumId,
                )
                transport.sendMessage(payload, guid) { result ->
                    if (epoch != host.epoch) return@sendMessage
                    when (result) {
                        is ApiResult.Success -> onAccepted(job, local, result.value, uploaded, thumb, preview)
                        is ApiResult.Failure -> {
                            finishJob(job)
                            onSendRejected(job, local, result.error)
                        }
                    }
                }
            }
        }
    }

    private fun onAccepted(
        job: Job,
        local: LocalAttachment,
        message: MessageDto,
        uploaded: UploadedFile,
        thumb: Pair<UploadedFile, File>?,
        preview: Pair<UploadedFile, File>?,
    ) {
        val epoch = host.epoch
        val dir = backend.outboxDir(job.clientId)
        prepareQueue.post {
            backend.adopt(uploaded.file.id, File(dir, local.source), local.mimeType, job.chatId, local, MediaTier.FULL)
            thumb?.let { backend.adopt(it.first.file.id, it.second, JPEG, job.chatId, local, MediaTier.THUMB) }
            preview?.let { backend.adopt(it.first.file.id, it.second, JPEG, job.chatId, local, MediaTier.THUMB) }
            backend.deleteOutbox(job.clientId)
            storageQueue.post {
                storage.confirmUnsent(job.clientId, message)
                main.post {
                    finishJob(job)
                    if (epoch == host.epoch) host.onMessageSent(job.clientId, message)
                }
            }
        }
    }

    private fun onSendRejected(job: Job, local: LocalAttachment, error: ApiException) {
        when {
            isTransient(error) -> scheduleRetry(job, local)
            error is ApiError && error.code == ErrorCode.BLOCKED -> {
                markFailed(job.chatId, job.clientId, local, null)
                host.reloadChat(job.chatId)
            }
            else -> markFailed(job.chatId, job.clientId, local, error.message)
        }
    }

    private fun scheduleRetry(job: Job, local: LocalAttachment) {
        val clientId = job.clientId
        val previous = retryTasks.remove(clientId)
        previous?.let { main.cancel(it) }
        val delay = if (job.retryDelayMs == 0L) timings.retryFirstMs else minOf(job.retryDelayMs * 2, timings.retryMaxMs)
        val task = Runnable {
            retryTasks.remove(clientId)
            launchRetry(job.chatId, clientId, local, delay)
        }
        retryTasks[clientId] = task
        main.postDelayed(task, delay)
    }

    fun onNetworkAvailable() {
        val due = HashMap(retryTasks)
        retryTasks.clear()
        for ((_, task) in due) {
            main.cancel(task)
            task.run()
        }
    }

    private fun launchRetry(chatId: String, clientId: String, fallback: LocalAttachment, previousDelay: Long) {
        val epoch = host.epoch
        storageQueue.post {
            val row = storage.readUnsentByClient(clientId)
            main.post {
                if (epoch != host.epoch) return@post
                val local = row?.local ?: return@post
                if (local.failed || jobs.containsKey(clientId)) return@post
                launch(chatId, clientId, local.takeIf { it.prepared } ?: fallback)
                jobs[clientId]?.retryDelayMs = previousDelay
            }
        }
    }

    private fun markFailed(chatId: String, clientId: String, local: LocalAttachment, reason: String?) {
        val failed = local.copy(failed = true, error = reason)
        val epoch = host.epoch
        storageQueue.post {
            storage.updateLocalAttachment(clientId, failed)
            main.post {
                if (epoch == host.epoch) host.notify(FeedUpdate.LocalAttachmentChanged(chatId, clientId, failed, backend.outboxDir(clientId)))
            }
        }
    }

    private fun save(job: Job, local: LocalAttachment, epoch: Int) {
        storageQueue.post { storage.updateLocalAttachment(job.clientId, local) }
        main.post {
            if (epoch == host.epoch) host.notify(FeedUpdate.LocalAttachmentChanged(job.chatId, job.clientId, local, backend.outboxDir(job.clientId)))
        }
    }

    private fun reportProgress(job: Job, loaded: Long, total: Long, epoch: Int) {
        val now = clock()
        if (loaded < total && now - job.lastProgressAt < timings.progressIntervalMs) return
        job.lastProgressAt = now
        val share = if (total > 0) loaded.toFloat() / total else 0f
        main.post { if (epoch == host.epoch) host.notify(FeedUpdate.UploadProgress(job.chatId, job.clientId, share)) }
    }

    private fun stopJob(clientId: String) {
        val job = jobs.remove(clientId)
        job?.slot?.cancel()
        retryTasks.remove(clientId)?.let { main.cancel(it) }
        updateHold()
    }

    private fun finishJob(job: Job) {
        if (jobs.remove(job.clientId, job)) updateHold()
    }

    private fun updateHold() {
        if (jobs.isEmpty()) {
            release?.invoke()
            release = null
        } else if (release == null) {
            release = holdSocket()
        }
        onActiveChanged(jobs.size)
    }

    private fun isTransient(error: ApiException): Boolean =
        error is NetworkError || error is NoResponseError ||
            (error is ApiError && (error.code == ErrorCode.RATE_LIMITED || error.code == ErrorCode.IP_BANNED))

    private fun replyPreview(target: MessageDto): MessageReplyPreviewDto = MessageReplyPreviewDto(
        id = target.id,
        senderName = target.sender?.displayName ?: DELETED_ACCOUNT,
        content = if (target.deletedAt != null) null else target.content,
        hasAttachment = target.deletedAt == null && target.attachment != null,
        deletedAt = target.deletedAt,
    )

    companion object {
        const val SOURCE_NAME = "source"
        private const val JPEG = "image/jpeg"
        private const val DELETED_ACCOUNT = "Удалённый аккаунт"
        private const val UPLOAD_FAILED = "Не удалось загрузить файл"
    }
}
