package com.qwill.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors

@CapacitorPlugin(name = "QwillApkUpdate")
class ApkUpdatePlugin : Plugin() {

    private val executor = Executors.newSingleThreadExecutor()

    @PluginMethod
    fun canInstall(call: PluginCall) {
        call.resolve(JSObject().put("granted", ApkUpdater.canInstall(context)))
    }

    @PluginMethod
    fun openInstallPermissionSettings(call: PluginCall) {
        val intent = ApkUpdater.installPermissionIntent(context)
        if (intent == null) {
            call.resolve(JSObject().put("opened", false))
            return
        }
        context.startActivity(intent)
        call.resolve(JSObject().put("opened", true))
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url")
        val sha256 = call.getString("sha256")
        if (url.isNullOrEmpty() || sha256.isNullOrEmpty()) {
            call.reject("url и sha256 обязательны")
            return
        }
        val sizeBytes = call.getDouble("sizeBytes")?.toLong() ?: 0L

        executor.execute {
            try {
                ApkUpdater.download(context, url, sha256, sizeBytes) { received, total ->
                    notifyListeners(
                        EVENT_PROGRESS,
                        JSObject()
                            .put("receivedBytes", received.toDouble())
                            .put("totalBytes", total.toDouble()),
                        true
                    )
                }
                call.resolve()
            } catch (error: Exception) {
                call.reject(error.message ?: "Не удалось скачать обновление")
            }
        }
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        ApkUpdater.cancel()
        call.resolve()
    }

    @PluginMethod
    fun discard(call: PluginCall) {
        ApkUpdater.discard(context)
        call.resolve()
    }

    @PluginMethod
    fun install(call: PluginCall) {
        if (!ApkUpdater.canInstall(context)) {
            call.reject("Установка из неизвестных источников не разрешена")
            return
        }
        val intent = ApkUpdater.installIntent(context)
        if (intent == null) {
            call.reject("Файл обновления не найден")
            return
        }
        context.startActivity(intent)
        call.resolve()
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        executor.shutdownNow()
    }

    private companion object {
        const val EVENT_PROGRESS = "apkDownloadProgress"
    }
}
