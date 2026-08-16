package com.qwill.app

import android.content.Context
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

object CallDecline {

    private const val TIMEOUT_MS = 10_000

    private val executor = Executors.newSingleThreadExecutor()

    fun send(context: Context, callId: String) {
        if (callId.isEmpty()) return
        val endpoint = "${context.getString(R.string.qwill_api_base)}/api/calls/decline"

        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            if (token.isNullOrEmpty()) return@addOnSuccessListener
            executor.execute { post(endpoint, callId, token) }
        }
    }

    private fun post(endpoint: String, callId: String, token: String) {
        val body = JSONObject().put("callId", callId).put("fcmToken", token).toString()

        runCatching {
            val connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = TIMEOUT_MS
                readTimeout = TIMEOUT_MS
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            try {
                OutputStreamWriter(connection.outputStream, Charsets.UTF_8).use { it.write(body) }
                connection.responseCode
            } finally {
                connection.disconnect()
            }
        }
    }
}
