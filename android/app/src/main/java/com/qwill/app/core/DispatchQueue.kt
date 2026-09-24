package com.qwill.app.core

import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch

class DispatchQueue(name: String) : Thread(name), TaskQueue {
    private val ready = CountDownLatch(1)

    @Volatile
    private var handler: Handler? = null

    init {
        start()
    }

    override fun run() {
        Looper.prepare()
        handler = Handler(Looper.myLooper()!!)
        ready.countDown()
        Looper.loop()
    }

    override fun post(task: Runnable) {
        awaitHandler().post(task)
    }

    override fun postDelayed(task: Runnable, delayMs: Long) {
        awaitHandler().postDelayed(task, delayMs)
    }

    override fun cancel(task: Runnable) {
        awaitHandler().removeCallbacks(task)
    }

    private fun awaitHandler(): Handler {
        handler?.let { return it }
        ready.await()
        return handler!!
    }
}
