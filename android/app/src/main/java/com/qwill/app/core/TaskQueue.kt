package com.qwill.app.core

interface TaskQueue {
    fun post(task: Runnable)

    fun postDelayed(task: Runnable, delayMs: Long)

    fun cancel(task: Runnable)
}
