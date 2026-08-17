package com.qwill.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

object ApkUpdater {

    private const val UPDATES_DIR = "updates"
    private const val APK_NAME = "update.apk"
    private const val BUFFER_SIZE = 64 * 1024
    private const val CONNECT_TIMEOUT_MS = 20_000
    private const val READ_TIMEOUT_MS = 60_000

    class DownloadFailed(message: String) : Exception(message)

    private val cancelled = AtomicBoolean(false)

    fun canInstall(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }

    fun installPermissionIntent(context: Context): Intent? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        } else {
            null
        }

    fun cancel() {
        cancelled.set(true)
    }

    fun discard(context: Context) {
        apkFile(context).delete()
    }

    fun download(
        context: Context,
        url: String,
        expectedSha256: String,
        expectedSize: Long,
        onProgress: (Long, Long) -> Unit
    ): File {
        cancelled.set(false)
        val target = apkFile(context)
        target.parentFile?.mkdirs()
        target.delete()

        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            requestMethod = "GET"
        }

        val digest = MessageDigest.getInstance("SHA-256")
        var received = 0L

        try {
            if (connection.responseCode !in 200..299) {
                throw DownloadFailed("Сервер ответил ${connection.responseCode}")
            }
            val total = if (expectedSize > 0) expectedSize else connection.contentLengthLong

            connection.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        if (cancelled.get()) throw DownloadFailed("Загрузка отменена")
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        received += read
                        onProgress(received, total)
                    }
                }
            }
        } catch (error: Exception) {
            target.delete()
            throw error
        } finally {
            connection.disconnect()
        }

        if (expectedSize > 0 && received != expectedSize) {
            target.delete()
            throw DownloadFailed("Файл скачан не полностью")
        }

        val actual = digest.digest().joinToString("") { "%02x".format(it) }
        if (!actual.equals(expectedSha256, ignoreCase = true)) {
            target.delete()
            throw DownloadFailed("Контрольная сумма не совпала")
        }

        return target
    }

    fun installIntent(context: Context): Intent? {
        val file = apkFile(context)
        if (!file.exists()) return null

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private fun apkFile(context: Context): File =
        File(File(context.getExternalFilesDir(null), UPDATES_DIR), APK_NAME)
}
