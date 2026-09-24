package com.qwill.app.net

import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.X509TrustManager

object HttpClients {
    private const val CONNECT_TIMEOUT_S = 10L
    private const val READ_TIMEOUT_S = 20L

    fun create(trust: X509TrustManager): OkHttpClient {
        val tls = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
        return OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_S, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_S, TimeUnit.SECONDS)
            .sslSocketFactory(tls.socketFactory, trust)
            .build()
    }

    fun userAgent(versionName: String, release: String, manufacturer: String, model: String): String {
        val device = if (model.startsWith(manufacturer, ignoreCase = true)) model else "$manufacturer $model"
        return ascii("Qwill/$versionName (Android $release; $device) native")
    }

    private fun ascii(value: String): String = value.map { if (it in ' '..'~') it else '?' }.joinToString("")
}
