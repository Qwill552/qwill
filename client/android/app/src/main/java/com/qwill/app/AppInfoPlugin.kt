package com.qwill.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "QwillAppInfo")
class AppInfoPlugin : Plugin() {

    @Suppress("DEPRECATION")
    @PluginMethod
    fun getAppInfo(call: PluginCall) {
        val packageInfo = context.packageManager.getPackageInfo(context.packageName, 0)
        call.resolve(
            JSObject()
                .put("versionCode", packageInfo.versionCode)
                .put("versionName", packageInfo.versionName)
        )
    }
}
