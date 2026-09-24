package com.qwill.app

import android.app.Activity
import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import com.qwill.app.auth.FileSessionStore
import com.qwill.app.auth.Session
import com.qwill.app.auth.SessionState
import com.qwill.app.core.DispatchQueue
import com.qwill.app.core.MainQueue
import com.qwill.app.database.MessagesStorage
import com.qwill.app.database.NativeSqlDatabase
import com.qwill.app.messenger.ApiMessagesTransport
import com.qwill.app.messenger.MessagesController
import com.qwill.app.net.ApiClient
import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import com.qwill.app.net.HttpTransport
import com.qwill.app.net.NetworkMonitor
import com.qwill.app.realtime.Presence
import com.qwill.app.realtime.SocketConnection
import com.qwill.app.realtime.TypingStore
import java.io.File

class QwillApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val trust = ExtraRootTrust.systemPlus(resources.openRawResource(R.raw.isrg_root_x1))
        val userAgent = HttpClients.userAgent(BuildConfig.VERSION_NAME, Build.VERSION.RELEASE, Build.MANUFACTURER, Build.MODEL)
        val httpClient = HttpClients.create(trust)
        val transport = HttpTransport(httpClient, BuildConfig.API_ORIGIN, userAgent)
        val sessionQueue = DispatchQueue("sessionQueue")

        session = Session(transport, FileSessionStore(File(filesDir, SESSION_FILE)), sessionQueue, MainQueue)
        api = ApiClient(transport, session, sessionQueue, MainQueue)
        socket = SocketConnection(
            httpClient,
            BuildConfig.API_ORIGIN,
            userAgent,
            session::liveAccessToken,
            session::reportIpBanned,
            DispatchQueue("socketQueue"),
            MainQueue,
        )
        presence = Presence(MainQueue).also { it.attach(socket) }
        typing = TypingStore(MainQueue, { (session.state as? SessionState.Authenticated)?.user?.id }).also { it.attach(socket) }
        val storage = MessagesStorage(File(filesDir, MessagesStorage.FILE_NAME), NativeSqlDatabase.OPENER) { Log.w(STORAGE_TAG, it) }
        messages = MessagesController(
            storage = storage,
            storageQueue = DispatchQueue("storageQueue"),
            main = MainQueue,
            transport = ApiMessagesTransport(api, socket),
            me = { (session.state as? SessionState.Authenticated)?.user },
            seedPresence = presence::seed,
            setUpdating = socket::setUpdating,
            holdSocket = { socket.hold()::release },
            dataSaver = ::isDataSaverOn,
        ).also { it.attach(socket) }

        session.addStateListener {
            socket.onSessionState(it)
            messages.onSessionState(it)
        }
        session.addClearedListener {
            socket.onSessionCleared()
            presence.clear()
            typing.clear()
            messages.onSessionCleared()
        }
        messages.onSessionState(session.state)
        session.start()

        val network = NetworkMonitor(
            this,
            object : NetworkMonitor.Listener {
                override fun onNetworkAvailable() {
                    session.onNetworkAvailable()
                    socket.onNetworkAvailable()
                }

                override fun onNetworkLost() {
                    socket.onNetworkLost()
                }
            },
        ).start()
        socket.start(session.state, network)

        registerActivityLifecycleCallbacks(
            ForegroundTracker(
                onForeground = {
                    session.onForeground()
                    socket.onForeground()
                },
                onBackground = { socket.onBackground() },
            ),
        )
    }

    private fun isDataSaverOn(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val connectivity = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        return connectivity.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
    }

    private class ForegroundTracker(
        private val onForeground: () -> Unit,
        private val onBackground: () -> Unit,
    ) : ActivityLifecycleCallbacks {
        private var started = 0

        override fun onActivityStarted(activity: Activity) {
            started++
            if (started == 1) onForeground()
        }

        override fun onActivityStopped(activity: Activity) {
            started--
            if (started == 0) onBackground()
        }

        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

        override fun onActivityResumed(activity: Activity) {}

        override fun onActivityPaused(activity: Activity) {}

        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

        override fun onActivityDestroyed(activity: Activity) {}
    }

    companion object {
        private const val SESSION_FILE = "session.json"
        private const val STORAGE_TAG = "QwillStorage"

        lateinit var session: Session
            private set

        lateinit var api: ApiClient
            private set

        lateinit var socket: SocketConnection
            private set

        lateinit var presence: Presence
            private set

        lateinit var typing: TypingStore
            private set

        lateinit var messages: MessagesController
            private set
    }
}
