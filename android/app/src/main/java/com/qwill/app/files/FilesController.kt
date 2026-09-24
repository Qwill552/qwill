package com.qwill.app.files

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import com.qwill.app.core.TaskQueue
import com.qwill.app.database.MessagesStorage
import com.qwill.app.model.AttachmentDto
import com.qwill.app.model.FileDto
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ThreadFactory
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong

class FilesController(
    private val context: Context,
    val dirs: MediaDirs,
    private val storage: MessagesStorage,
    private val storageQueue: TaskQueue,
    private val main: TaskQueue,
    http: FileHttp,
    fileQueue: TaskQueue,
    imageQueue: TaskQueue,
    memoryClassMb: Int,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    val preferences = DevicePreferences(context.getSharedPreferences(DevicePreferences.FILE_NAME, Context.MODE_PRIVATE))
    val index = MediaIndex(storage, storageQueue)
    val partials = PartialFiles(dirs, index, clock)
    private val transfers: ExecutorService = Executors.newCachedThreadPool(named("fileWorker"))
    private val streams: ExecutorService = Executors.newCachedThreadPool(named("videoStream"))
    private val writtenSinceCleanup = AtomicLong()
    val loader = FileLoader(http, partials, index, fileQueue, main, transfers, clock, onBytesWritten = ::noteWritten)
    val images = ImageLoader(loader, imageQueue, main, memoryClassMb)
    val uploader = FileUploader(http)
    val backend = FilesAttachmentBackend(dirs, uploader, index, clock)
    private val cleaner = MediaCleaner(dirs, partials::isOpen, clock)
    private var started = false
    private val cleanupTask = object : Runnable {
        override fun run() {
            cleanup {}
            main.postDelayed(this, CLEANUP_INTERVAL_MS)
        }
    }

    var lastCleanup: CleanupReport? = null
        private set

    init {
        storage.onRecreated = {
            dirs.wipeMedia()
            main.post { images.clear() }
        }
    }

    fun start() {
        if (started) return
        started = true
        storageQueue.post { dirs.ensure() }
        cleanup {}
        main.postDelayed(cleanupTask, CLEANUP_INTERVAL_MS)
    }

    fun stop() {
        started = false
        main.cancel(cleanupTask)
    }

    fun onSessionCleared(prepareQueue: TaskQueue) {
        stop()
        loader.clear()
        images.clear()
        prepareQueue.post {
            dirs.wipeMedia()
            dirs.wipeOutbox()
        }
    }

    fun onNetworkAvailable() {
        loader.onNetworkAvailable()
    }

    fun cancelRequestsForGuid(guid: Int) {
        loader.cancelRequestsForGuid(guid)
    }

    fun request(file: FileDto, chatId: String?, kind: MediaKind, tier: MediaTier): FileRequest =
        FileRequest(file.id, file.size, file.mimeType, chatId, kind, tier)

    fun shownRequest(attachment: AttachmentDto, chatId: String, density: Float, boxWidthDp: Float = FeedQuality.FEED_BUBBLE_WIDTH_DP): FileRequest {
        val shown = FeedQuality.shownInFeed(attachment, density, boxWidthDp)
        return request(shown.file, chatId, MediaTypes.kindOf(attachment), shown.tier)
    }

    fun originalRequest(attachment: AttachmentDto, chatId: String): FileRequest =
        request(attachment.file, chatId, MediaTypes.kindOf(attachment), MediaTier.FULL)

    fun avatarRequest(avatarUrl: String?): FileRequest? {
        val fileId = MediaTypes.fileIdFromUrl(avatarUrl) ?: return null
        return FileRequest(fileId, 0, null, null, MediaKind.AVATAR, MediaTier.AVATAR)
    }

    fun openVideo(request: FileRequest): VideoStream = VideoStream(loader, partials, index, request, streams, clock)

    fun networkKind(): NetworkKind {
        if (preferences.treatAsCellular()) return NetworkKind.CELLULAR
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return NetworkKind.CELLULAR
        if (Build.VERSION.SDK_INT < 23) {
            @Suppress("DEPRECATION")
            return if (manager.isActiveNetworkMetered) NetworkKind.CELLULAR else NetworkKind.WIFI
        }
        val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return NetworkKind.CELLULAR
        return if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)) NetworkKind.WIFI else NetworkKind.CELLULAR
    }

    fun dataSaverOn(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val manager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return false
        return manager.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
    }

    fun isCached(fileId: String, callback: (Boolean) -> Unit) {
        storageQueue.post {
            val row = storage.readMedia(fileId)
            val ready = row != null && row.complete && File(row.path).exists()
            main.post { callback(ready) }
        }
    }

    fun shouldAutoDownload(attachment: AttachmentDto, density: Float, boxWidthDp: Float, callback: (Boolean) -> Unit) {
        val kind = AutoDownload.kindOf(MediaTypes.categorize(attachment.file.mimeType, attachment.peaks))
        if (kind == null) {
            callback(true)
            return
        }
        val checked = FeedQuality.autoDownloadCheckFile(attachment, density, boxWidthDp)
        isCached(checked.id) { cached ->
            callback(
                AutoDownload.shouldAutoDownload(kind, networkKind(), checked.size, cached, dataSaverOn(), preferences.autoDownload()),
            )
        }
    }

    fun documentState(fileId: String, callback: (DocumentState) -> Unit) {
        loader.progressOf(fileId)?.let { (loaded, total) ->
            callback(DocumentState.Loading(if (total > 0) loaded.toFloat() / total else 0f))
            return
        }
        isCached(fileId) { ready -> callback(if (ready) DocumentState.Ready else DocumentState.NotLoaded) }
    }

    fun openDocument(fileId: String, originalName: String, mimeType: String, callback: (OpenResult) -> Unit) {
        storageQueue.post {
            val row = storage.readMedia(fileId)?.takeIf { it.complete && File(it.path).exists() }
            main.post {
                if (row == null) {
                    callback(OpenResult.NotLoaded)
                    return@post
                }
                val uri = QwillFileProvider.uriFor(context, File(row.path), originalName)
                val intent = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, MediaTypes.sanitizeMimeType(mimeType))
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                try {
                    context.startActivity(intent)
                    callback(OpenResult.Opened)
                } catch (e: ActivityNotFoundException) {
                    callback(OpenResult.NoApp)
                }
            }
        }
    }

    fun cleanup(done: (CleanupReport) -> Unit) {
        val settings = preferences.retention()
        storageQueue.post {
            if (!storage.isOpen) return@post
            val report = cleaner.run(storage, settings)
            main.post {
                lastCleanup = report
                done(report)
            }
        }
    }

    fun usage(callback: (StorageUsage) -> Unit) {
        storageQueue.post {
            val usage = cleaner.usage(storage)
            main.post { callback(usage) }
        }
    }

    fun clearSelected(selection: Set<StorageCell>, done: (Long) -> Unit) {
        storageQueue.post {
            val freed = cleaner.clear(storage, selection)
            main.post {
                images.clear()
                done(freed)
            }
        }
    }

    fun clearMedia(done: (Long) -> Unit) {
        loader.clear()
        storageQueue.post {
            val freed = cleaner.clearAll(storage)
            main.post {
                images.clear()
                done(freed)
            }
        }
    }

    fun wipeFiles(done: () -> Unit) {
        loader.clear()
        storageQueue.post {
            storage.clearMedia()
            dirs.wipeMedia()
            main.post {
                images.clear()
                done()
            }
        }
    }

    fun stats(callback: (FilesStats) -> Unit) {
        storageQueue.post {
            val rows = storage.readAllMedia()
            val temps = dirs.temp.listFiles().orEmpty().count { it.isFile }
            val usage = StorageUsage.of(rows.filter { it.complete })
            val partial = rows.filter { !it.complete }
            val stats = FilesStats(
                files = rows.count { it.complete },
                bytes = usage.total,
                byKind = usage.byKind,
                temps = temps,
                partialVideos = partial.size,
                partialBytes = partial.sumOf { it.size },
                budgetBytes = preferences.retention().budgetBytes,
                memoryBytes = images.memoryBytes,
                memoryBudgetBytes = images.memoryBudgetBytes,
            )
            main.post { callback(stats) }
        }
    }

    private fun noteWritten(bytes: Long) {
        if (preferences.retention().budgetBytes == null) return
        if (writtenSinceCleanup.addAndGet(bytes) < CLEANUP_STEP_BYTES) return
        writtenSinceCleanup.set(0)
        main.post { cleanup {} }
    }

    private fun named(prefix: String): ThreadFactory {
        val counter = AtomicInteger()
        return ThreadFactory { task -> Thread(task, "$prefix-${counter.incrementAndGet()}").apply { isDaemon = true } }
    }

    companion object {
        const val CLEANUP_INTERVAL_MS = DAY_MS
        const val CLEANUP_STEP_BYTES = 32L * 1024 * 1024
    }
}

sealed class DocumentState {
    object NotLoaded : DocumentState()

    class Loading(val share: Float) : DocumentState()

    object Ready : DocumentState()
}

enum class OpenResult { Opened, NotLoaded, NoApp }

data class FilesStats(
    val files: Int,
    val bytes: Long,
    val byKind: Map<MediaKind, Long>,
    val temps: Int,
    val partialVideos: Int,
    val partialBytes: Long,
    val budgetBytes: Long?,
    val memoryBytes: Int,
    val memoryBudgetBytes: Int,
)
