package com.qwill.app

import android.app.Activity
import android.app.Application
import android.os.Build
import android.os.Bundle
import com.qwill.app.auth.FileSessionStore
import com.qwill.app.auth.Session
import com.qwill.app.core.DispatchQueue
import com.qwill.app.core.MainQueue
import com.qwill.app.net.ApiClient
import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import com.qwill.app.net.HttpTransport
import com.qwill.app.net.NetworkMonitor
import java.io.File

class QwillApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val trust = ExtraRootTrust.systemPlus(resources.openRawResource(R.raw.isrg_root_x1))
        val userAgent = HttpClients.userAgent(BuildConfig.VERSION_NAME, Build.VERSION.RELEASE, Build.MANUFACTURER, Build.MODEL)
        val transport = HttpTransport(HttpClients.create(trust), BuildConfig.API_ORIGIN, userAgent)
        val sessionQueue = DispatchQueue("sessionQueue")

        session = Session(transport, FileSessionStore(File(filesDir, SESSION_FILE)), sessionQueue, MainQueue)
        api = ApiClient(transport, session, sessionQueue, MainQueue)
        session.start()

        NetworkMonitor(this) { session.onNetworkAvailable() }.start()
        registerActivityLifecycleCallbacks(ForegroundTracker { session.onForeground() })
    }

    private class ForegroundTracker(private val onForeground: () -> Unit) : ActivityLifecycleCallbacks {
        private var started = 0

        override fun onActivityStarted(activity: Activity) {
            started++
            if (started == 1) onForeground()
        }

        override fun onActivityStopped(activity: Activity) {
            started--
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

        override fun onActivityResumed(activity: Activity) {}

        override fun onActivityPaused(activity: Activity) {}

        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

        override fun onActivityDestroyed(activity: Activity) {}
    }

    companion object {
        private const val SESSION_FILE = "session.json"

        lateinit var session: Session
            private set

        lateinit var api: ApiClient
            private set
    }
}
