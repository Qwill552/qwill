package com.qwill.app

import android.app.Activity
import android.app.ActivityManager
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
import com.qwill.app.emoji.Emoji
import com.qwill.app.files.FileHttp
import com.qwill.app.files.FilesController
import com.qwill.app.files.MediaDirs
import com.qwill.app.files.SessionAccessTokens
import com.qwill.app.files.UploadService
import com.qwill.app.messenger.FeedUpdate
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
import com.qwill.app.ui.AppForeground
import java.io.File
import java.util.concurrent.Executors

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
        val storageQueue = DispatchQueue("storageQueue")
        val mediaTaskQueue = DispatchQueue("mediaTaskQueue").apply { priority = Thread.MIN_PRIORITY }
        val fileHttp = FileHttp(
            httpClient,
            BuildConfig.API_ORIGIN,
            userAgent,
            SessionAccessTokens(session::liveAccessToken),
            session::reportIpBanned,
        )
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val imageQueue = DispatchQueue("imageQueue")
        Emoji.init(assets, imageQueue, MainQueue)
        files = FilesController(
            context = this,
            dirs = MediaDirs(cacheDir, filesDir),
            storage = storage,
            storageQueue = storageQueue,
            main = MainQueue,
            http = fileHttp,
            fileQueue = DispatchQueue("fileQueue"),
            imageQueue = imageQueue,
            memoryClassMb = activityManager.memoryClass,
        )
        var uploadPercent = -1
        messages = MessagesController(
            storage = storage,
            storageQueue = storageQueue,
            main = MainQueue,
            transport = ApiMessagesTransport(api, socket),
            me = { (session.state as? SessionState.Authenticated)?.user },
            seedPresence = presence::seedAll,
            setUpdating = socket::setUpdating,
            holdSocket = { socket.hold()::release },
            dataSaver = ::isDataSaverOn,
            attachments = files.backend,
            prepareQueue = mediaTaskQueue,
            uploadWorkers = Executors.newFixedThreadPool(UPLOAD_SLOTS),
            onUploadsChanged = { count ->
                if (count == 0) uploadPercent = -1
                UploadService.update(this, count, uploadPercent)
            },
        ).also { it.attach(socket) }
        messages.addFeedListener { update ->
            if (update !is FeedUpdate.UploadProgress) return@addFeedListener
            val percent = (update.share * 100).toInt()
            if (percent == uploadPercent) return@addFeedListener
            uploadPercent = percent
            UploadService.update(this, messages.activeUploads, percent)
        }

        session.addStateListener {
            socket.onSessionState(it)
            messages.onSessionState(it)
            if (it is SessionState.Authenticated) files.start()
        }
        session.addClearedListener {
            socket.onSessionCleared()
            presence.clear()
            typing.clear()
            messages.onSessionCleared()
            files.onSessionCleared(mediaTaskQueue)
            UploadService.update(this, 0)
        }
        messages.onSessionState(session.state)
        if (session.state is SessionState.Authenticated) files.start()
        session.start()

        val network = NetworkMonitor(
            this,
            object : NetworkMonitor.Listener {
                override fun onNetworkAvailable() {
                    session.onNetworkAvailable()
                    socket.onNetworkAvailable()
                    files.onNetworkAvailable()
                    MainQueue.post { messages.onNetworkAvailable() }
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
                    AppForeground.set(true)
                },
                onBackground = {
                    socket.onBackground()
                    AppForeground.set(false)
                },
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
        private const val UPLOAD_SLOTS = 2

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

        lateinit var files: FilesController
            private set
    }
}
