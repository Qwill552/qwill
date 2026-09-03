package com.qwill.app

import android.content.ActivityNotFoundException
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors

@CapacitorPlugin(name = "QwillFiles")
class FileDownloadPlugin : Plugin() {

    private val executor = Executors.newFixedThreadPool(2)

    @PluginMethod
    fun status(call: PluginCall) {
        val fileId = call.getString("fileId")
        val fileName = call.getString("fileName")
        if (fileId.isNullOrEmpty() || fileName.isNullOrEmpty()) {
            call.reject("fileId и fileName обязательны")
            return
        }
        call.resolve(JSObject().put("downloaded", FileDownloader.isDownloaded(context, fileId, fileName)))
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val fileId = call.getString("fileId")
        val fileName = call.getString("fileName")
        val url = call.getString("url")
        if (fileId.isNullOrEmpty() || fileName.isNullOrEmpty() || url.isNullOrEmpty()) {
            call.reject("fileId, fileName и url обязательны")
            return
        }

        executor.execute {
            try {
                FileDownloader.download(context, fileId, fileName, url) { received, total ->
                    notifyListeners(
                        EVENT_PROGRESS,
                        JSObject()
                            .put("fileId", fileId)
                            .put("receivedBytes", received.toDouble())
                            .put("totalBytes", total.toDouble()),
                        true
                    )
                }
                call.resolve()
            } catch (error: Exception) {
                call.reject(error.message ?: "Не удалось скачать файл")
            }
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val fileId = call.getString("fileId")
        if (fileId.isNullOrEmpty()) {
            call.reject("fileId обязателен")
            return
        }
        FileDownloader.cancel(fileId)
        call.resolve()
    }

    @PluginMethod
    fun open(call: PluginCall) {
        val fileId = call.getString("fileId")
        val fileName = call.getString("fileName")
        if (fileId.isNullOrEmpty() || fileName.isNullOrEmpty()) {
            call.reject("fileId и fileName обязательны")
            return
        }

        val intent = FileDownloader.openIntent(context, fileId, fileName, call.getString("mimeType"))
        if (intent == null) {
            call.resolve(JSObject().put("opened", false))
            return
        }

        try {
            context.startActivity(intent)
            call.resolve(JSObject().put("opened", true))
        } catch (missing: ActivityNotFoundException) {
            call.reject("Нет приложения, которое откроет этот файл")
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        executor.shutdownNow()
    }

    private companion object {
        const val EVENT_PROGRESS = "fileDownloadProgress"
    }
}
