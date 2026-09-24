package com.qwill.app.files

import com.qwill.app.auth.ExecutorQueue
import com.qwill.app.auth.LiveToken
import com.qwill.app.database.MessagesStorage
import com.qwill.app.database.openStorage
import com.qwill.app.net.ApiException
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockWebServer
import java.io.File
import java.nio.file.Files
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class FakeTokens : AccessTokens {
    val rejected = CopyOnWriteArrayList<String?>()

    @Volatile
    var current = "t1"

    override fun token(rejected: String?): LiveToken {
        if (rejected != null) {
            this.rejected.add(rejected)
            current = "t2"
        }
        return LiveToken.Ready(current, rejected != null)
    }
}

class FilesEnv(val server: MockWebServer, timings: FileLoaderTimings = FileLoaderTimings(retryFirstMs = 20, retryMaxMs = 40)) {
    val root: File = Files.createTempDirectory("qwill-files").toFile()
    val storage: MessagesStorage = openStorage()
    val storageQueue = ExecutorQueue()
    val fileQueue = ExecutorQueue()
    val main = ExecutorQueue()
    val dirs = MediaDirs(File(root, "cache"), File(root, "files")).also { it.ensure() }
    val index = MediaIndex(storage, storageQueue)
    val partials = PartialFiles(dirs, index, System::currentTimeMillis)
    val tokens = FakeTokens()
    val http = FileHttp(OkHttpClient(), server.url("/").toString().trimEnd('/'), "test", tokens) {}
    private val workers = Executors.newCachedThreadPool()
    val loader = FileLoader(http, partials, index, fileQueue, main, workers, System::currentTimeMillis, timings)

    fun close() {
        workers.shutdownNow()
        storageQueue.shutdown()
        fileQueue.shutdown()
        main.shutdown()
        root.deleteRecursively()
    }
}

class RecordingListener : FileLoadListener {
    private val done = CountDownLatch(1)

    @Volatile
    var file: File? = null

    @Volatile
    var source: FileSource? = null

    @Volatile
    var error: ApiException? = null

    val resumedFrom = CopyOnWriteArrayList<Long>()

    override fun onReady(file: File, source: FileSource) {
        this.file = file
        this.source = source
        done.countDown()
    }

    override fun onResumed(fromByte: Long) {
        resumedFrom.add(fromByte)
    }

    override fun onFailed(error: ApiException) {
        this.error = error
        done.countDown()
    }

    fun await(seconds: Long = 10): Boolean = done.await(seconds, TimeUnit.SECONDS)
}

fun bytes(size: Int, seed: Int = 7): ByteArray = ByteArray(size) { ((it * 31 + seed) and 0xFF).toByte() }

fun waitUntil(timeoutMs: Long = 5_000, condition: () -> Boolean): Boolean {
    val until = System.currentTimeMillis() + timeoutMs
    while (System.currentTimeMillis() < until) {
        if (condition()) return true
        Thread.sleep(10)
    }
    return condition()
}
