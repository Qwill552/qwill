package com.qwill.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap

object FileDownloader {

    private const val DOWNLOADS_DIR = "downloads"
    private const val BUFFER_SIZE = 64 * 1024
    private const val CONNECT_TIMEOUT_MS = 20_000
    private const val READ_TIMEOUT_MS = 60_000

    class DownloadFailed(message: String) : Exception(message)

    private val cancelled = ConcurrentHashMap.newKeySet<String>()

    fun storedFile(context: Context, fileId: String, fileName: String): File =
        File(File(File(context.getExternalFilesDir(null), DOWNLOADS_DIR), safeName(fileId)), safeName(fileName))

    fun isDownloaded(context: Context, fileId: String, fileName: String): Boolean {
        val file = storedFile(context, fileId, fileName)
        return file.exists() && file.length() > 0
    }

    fun cancel(fileId: String) {
        cancelled.add(fileId)
    }

    fun download(
        context: Context,
        fileId: String,
        fileName: String,
        url: String,
        onProgress: (Long, Long) -> Unit
    ): File {
        cancelled.remove(fileId)
        val target = storedFile(context, fileId, fileName)
        target.parentFile?.mkdirs()
        val partial = File(target.parentFile, "${target.name}.part")
        partial.delete()

        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            requestMethod = "GET"
        }

        var received = 0L

        try {
            if (connection.responseCode !in 200..299) {
                throw DownloadFailed("Сервер ответил ${connection.responseCode}")
            }
            val total = connection.contentLengthLong

            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        if (cancelled.contains(fileId)) throw DownloadFailed("Загрузка отменена")
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        received += read
                        onProgress(received, total)
                    }
                }
            }
        } catch (error: Exception) {
            partial.delete()
            throw error
        } finally {
            connection.disconnect()
            cancelled.remove(fileId)
        }

        target.delete()
        if (!partial.renameTo(target)) {
            partial.delete()
            throw DownloadFailed("Не удалось сохранить файл")
        }
        return target
    }

    fun openIntent(context: Context, fileId: String, fileName: String, mimeType: String?): Intent? {
        val file = storedFile(context, fileId, fileName)
        if (!file.exists()) return null

        val uri: Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, if (mimeType.isNullOrEmpty()) "*/*" else mimeType)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun safeName(raw: String): String =
        raw.trim().replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_").ifEmpty { "file" }
}
