package com.qwill.app.net

import java.io.InputStream
import java.security.KeyStore
import java.security.cert.CertificateException
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

class ExtraRootTrust(
    private val system: X509TrustManager,
    private val extra: X509TrustManager,
) : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>, authType: String) {
        system.checkClientTrusted(chain, authType)
    }

    override fun checkServerTrusted(chain: Array<out X509Certificate>, authType: String) {
        try {
            system.checkServerTrusted(chain, authType)
        } catch (systemFailure: CertificateException) {
            try {
                extra.checkServerTrusted(chain, authType)
            } catch (extraFailure: CertificateException) {
                systemFailure.addSuppressed(extraFailure)
                throw systemFailure
            }
        }
    }

    override fun getAcceptedIssuers(): Array<X509Certificate> = system.acceptedIssuers + extra.acceptedIssuers

    companion object {
        fun systemPlus(extraRootPem: InputStream): ExtraRootTrust = ExtraRootTrust(trustManagerFor(null), fromPem(extraRootPem))

        fun fromPem(pem: InputStream): X509TrustManager {
            val certificate = pem.use { CertificateFactory.getInstance("X.509").generateCertificate(it) }
            val store = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
                load(null, null)
                setCertificateEntry("extra-root", certificate)
            }
            return trustManagerFor(store)
        }

        private fun trustManagerFor(store: KeyStore?): X509TrustManager {
            val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
            factory.init(store)
            return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
        }
    }
}
