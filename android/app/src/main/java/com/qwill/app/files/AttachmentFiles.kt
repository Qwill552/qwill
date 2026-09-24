package com.qwill.app.files

import com.qwill.app.database.MediaRow
import com.qwill.app.messenger.AttachmentBackend
import com.qwill.app.messenger.AttachmentInput
import com.qwill.app.model.LocalAttachment
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

object NoAttachments : AttachmentBackend {
    override fun outboxDir(clientId: String): File = File(System.getProperty("java.io.tmpdir"), "qwill-outbox/$clientId")

    override fun copyIn(input: AttachmentInput, target: File): Long = throw IOException("вложения недоступны")

    override fun prepare(local: LocalAttachment, dir: File): PreparedMedia = PreparedMedia(null, null, null, null, null)

    override fun sha256(file: File, slot: CallSlot): String = throw IOException("вложения недоступны")

    override fun upload(file: File, mimeType: String, originalName: String, sha256: String, slot: CallSlot, onProgress: (Long, Long) -> Unit): UploadedFile =
        throw IOException("вложения недоступны")

    override fun adopt(fileId: String, file: File, mimeType: String, chatId: String, local: LocalAttachment, tier: MediaTier) {}

    override fun deleteOutbox(clientId: String) {}
}

class FilesAttachmentBackend(
    private val dirs: MediaDirs,
    private val uploader: FileUploader,
    private val index: MediaIndex,
    private val clock: () -> Long,
) : AttachmentBackend {
    override fun outboxDir(clientId: String): File = dirs.outboxDir(clientId)

    override fun copyIn(input: AttachmentInput, target: File): Long {
        target.parentFile?.mkdirs()
        val part = File(target.path + ".part")
        var total = 0L
        input.open().use { source ->
            FileOutputStream(part).use { out ->
                val buffer = ByteArray(COPY_BUFFER_BYTES)
                while (true) {
                    val read = source.read(buffer)
                    if (read < 0) break
                    out.write(buffer, 0, read)
                    total += read
                }
                out.fd.sync()
            }
        }
        if (!part.renameTo(target)) throw IOException("не удалось сохранить копию файла")
        return total
    }

    override fun prepare(local: LocalAttachment, dir: File): PreparedMedia {
        val source = File(dir, local.source)
        return when {
            !local.peaks.isNullOrEmpty() -> PreparedMedia(null, null, null, null, null)
            local.mimeType.startsWith("image/") -> MediaTasks.preparePhoto(source, dir)
            MediaTypes.isPlayableVideo(local.mimeType) -> MediaTasks.prepareVideo(source, dir)
            else -> PreparedMedia(null, null, null, null, null)
        }
    }

    override fun sha256(file: File, slot: CallSlot): String = MediaTasks.sha256(file) { slot.cancelled }

    override fun upload(file: File, mimeType: String, originalName: String, sha256: String, slot: CallSlot, onProgress: (Long, Long) -> Unit): UploadedFile =
        uploader.upload(file, mimeType, originalName, FileUploader.PURPOSE_MESSAGE, sha256, slot, onProgress)

    override fun adopt(fileId: String, file: File, mimeType: String, chatId: String, local: LocalAttachment, tier: MediaTier) {
        if (!file.exists()) return
        val target = dirs.finalFile(fileId, mimeType)
        target.parentFile?.mkdirs()
        if (!file.renameTo(target)) {
            try {
                file.copyTo(target, overwrite = true)
            } catch (e: IOException) {
                return
            }
        }
        val row = MediaRow(
            fileId = fileId,
            chatId = chatId,
            kind = MediaTypes.kindOf(local.mimeType, local.peaks),
            tier = tier,
            size = target.length(),
            totalSize = target.length(),
            complete = true,
            lastUsedAt = clock(),
            path = target.path,
        )
        index.await(Unit) { it.putMedia(row) }
    }

    override fun deleteOutbox(clientId: String) {
        dirs.outboxDir(clientId).deleteRecursively()
    }

    private companion object {
        const val COPY_BUFFER_BYTES = 256 * 1024
    }
}
