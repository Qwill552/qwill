package com.qwill.app.files

import com.qwill.app.model.FileDto
import com.qwill.app.model.InitUploadInput
import com.qwill.app.model.InitUploadResponse
import com.qwill.app.model.UploadChunkResponse
import com.qwill.app.model.UploadOffsetMismatch
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile

class UploadedFile(val file: FileDto, val sha256: String)

class FileUploader(
    private val http: FileHttp,
    private val sleep: (Long, CallSlot) -> Unit = ::cancellableSleep,
) {
    fun upload(
        source: File,
        mimeType: String,
        originalName: String,
        purpose: String,
        sha256: String,
        slot: CallSlot,
        onProgress: (Long, Long) -> Unit = { _, _ -> },
    ): UploadedFile {
        val size = source.length()
        var restarts = 0
        while (true) {
            val init = withRateLimit(slot) { initUpload(InitUploadInput(sha256, size, mimeType, originalName, purpose), slot) }
            if (init.status == STATUS_EXISTS) {
                val file = init.file ?: throw ApiError.unreadable(200)
                onProgress(size, size)
                return UploadedFile(file, sha256)
            }
            val sessionId = init.sessionId ?: throw ApiError.unreadable(200)
            val chunkSize = if (init.chunkSize > 0) init.chunkSize else DEFAULT_CHUNK_BYTES
            try {
                return UploadedFile(sendChunks(source, size, sessionId, init.receivedBytes, chunkSize, slot, onProgress), sha256)
            } catch (e: ApiError) {
                if (e.code != ErrorCode.UPLOAD_SESSION_NOT_FOUND || ++restarts > MAX_RESTARTS) throw e
            }
        }
    }

    private fun sendChunks(
        source: File,
        size: Long,
        sessionId: String,
        received: Long,
        chunkSize: Long,
        slot: CallSlot,
        onProgress: (Long, Long) -> Unit,
    ): FileDto {
        var offset = received
        var stuck = 0
        onProgress(offset, size)
        RandomAccessFile(source, "r").use { file ->
            while (true) {
                if (slot.cancelled) throw CancelledTransfer()
                val length = minOf(chunkSize, size - offset).toInt().coerceAtLeast(0)
                val bytes = ByteArray(length)
                file.seek(offset)
                file.readFully(bytes)
                val sentAt = offset
                val result = withRateLimit(slot) { sendChunk(sessionId, sentAt, bytes, slot) }
                stuck = if (result.receivedBytes == offset) stuck + 1 else 0
                if (stuck > MAX_STUCK) throw ApiError(0, ErrorCode.INTERNAL, OUT_OF_SYNC)
                offset = result.receivedBytes
                onProgress(offset, size)
                if (result.done) return result.file ?: throw ApiError(0, ErrorCode.INTERNAL, NO_FILE)
            }
        }
    }

    private fun initUpload(input: InitUploadInput, slot: CallSlot): InitUploadResponse {
        val body = ApiJson.encodeToString(InitUploadInput.serializer(), input).toRequestBody(JSON)
        return http.execute(UPLOAD_PATH, slot) { it.post(body) }.use { response ->
            if (!response.isSuccessful) throw http.readError(response)
            parse(response) { ApiJson.decodeFromString(InitUploadResponse.serializer(), it) }
        }
    }

    private fun sendChunk(sessionId: String, offset: Long, bytes: ByteArray, slot: CallSlot): UploadChunkResponse {
        val body = bytes.toRequestBody(OCTET_STREAM)
        return http.execute("$UPLOAD_PATH/$sessionId", slot) {
            it.patch(body).header(UPLOAD_OFFSET_HEADER, offset.toString())
        }.use { response ->
            when {
                response.code == FileHttp.HTTP_CONFLICT -> {
                    val text = readText(response)
                    val mismatch = try {
                        ApiJson.decodeFromString(UploadOffsetMismatch.serializer(), text)
                    } catch (e: IllegalArgumentException) {
                        UploadOffsetMismatch()
                    }
                    val resync = mismatch.receivedBytes ?: throw ApiError(response.code, ErrorCode.UPLOAD_OFFSET_MISMATCH, OUT_OF_SYNC)
                    UploadChunkResponse(receivedBytes = resync, done = false)
                }
                !response.isSuccessful -> throw http.readError(response)
                else -> parse(response) { ApiJson.decodeFromString(UploadChunkResponse.serializer(), it) }
            }
        }
    }

    private fun <T> withRateLimit(slot: CallSlot, run: () -> T): T {
        var attempt = 0
        while (true) {
            try {
                return run()
            } catch (e: ApiError) {
                if (e.status != FileHttp.HTTP_TOO_MANY_REQUESTS || attempt + 1 >= RATE_LIMIT_ATTEMPTS) throw e
                sleep(RATE_LIMIT_BASE_DELAY_MS shl attempt, slot)
                attempt++
            }
        }
    }

    private fun <T> parse(response: Response, read: (String) -> T): T {
        val text = readText(response)
        return try {
            read(text)
        } catch (e: IllegalArgumentException) {
            throw ApiError.unreadable(response.code)
        }
    }

    private fun readText(response: Response): String = try {
        response.body?.string().orEmpty()
    } catch (e: IOException) {
        throw NetworkError(e)
    }

    companion object {
        const val UPLOAD_PATH = "/api/files/upload"
        const val UPLOAD_OFFSET_HEADER = "x-upload-offset"
        const val PURPOSE_MESSAGE = "message"
        const val PURPOSE_AVATAR = "avatar"
        const val RATE_LIMIT_BASE_DELAY_MS = 1_500L
        const val RATE_LIMIT_ATTEMPTS = 4
        private const val STATUS_EXISTS = "exists"
        private const val MAX_STUCK = 3
        private const val MAX_RESTARTS = 3
        private const val DEFAULT_CHUNK_BYTES = 5L * 1024 * 1024
        private const val OUT_OF_SYNC = "Не удаётся синхронизировать загрузку с сервером"
        private const val NO_FILE = "Сервер не вернул файл по завершении загрузки"
        private val JSON = "application/json; charset=utf-8".toMediaType()
        private val OCTET_STREAM = "application/octet-stream".toMediaType()

        fun cancellableSleep(ms: Long, slot: CallSlot) {
            val until = System.currentTimeMillis() + ms
            while (!slot.cancelled) {
                val left = until - System.currentTimeMillis()
                if (left <= 0) return
                try {
                    Thread.sleep(minOf(left, 200))
                } catch (e: InterruptedException) {
                    throw CancelledTransfer()
                }
            }
            throw CancelledTransfer()
        }
    }
}
