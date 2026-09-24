package com.qwill.app.net

import okhttp3.Call
import java.util.concurrent.atomic.AtomicInteger

class RequestHandle internal constructor(val guid: Int) {
    @Volatile
    var cancelled = false
        private set

    private var call: Call? = null

    internal fun attach(call: Call) {
        synchronized(this) {
            this.call = call
            if (cancelled) call.cancel()
        }
    }

    internal fun cancel() {
        synchronized(this) {
            cancelled = true
            call?.cancel()
        }
    }
}

object RequestGuid {
    const val NONE = 0

    private val next = AtomicInteger(1)

    fun next(): Int = next.getAndIncrement()
}
