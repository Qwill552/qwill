package com.qwill.app.net

import okhttp3.Request
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.IOException
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLHandshakeException
import javax.net.ssl.X509TrustManager

class ExtraRootTrustTest {
    private object EmptySystemRoots : X509TrustManager {
        override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) {
            throw CertificateException("системных корней нет")
        }

        override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
            throw CertificateException("системных корней нет")
        }

        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    private fun isrgRootX1(): X509TrustManager =
        File("src/main/res/raw/isrg_root_x1.pem").inputStream().let { ExtraRootTrust.fromPem(it) }

    private fun health(trust: X509TrustManager): Int {
        val client = HttpClients.create(trust)
        val request = Request.Builder().url("https://dev.qwill.mooo.com/api/health").build()
        return client.newCall(request).execute().use { it.code }
    }

    @Test
    fun devServerIsTrustedThroughBundledRootAlone() {
        assertEquals(200, health(ExtraRootTrust(EmptySystemRoots, isrgRootX1())))
    }

    @Test
    fun withoutBundledRootHandshakeFails() {
        val failure = runCatching { health(ExtraRootTrust(EmptySystemRoots, EmptySystemRoots)) }.exceptionOrNull()
        assertTrue(failure is SSLHandshakeException || failure is IOException)
    }
}
