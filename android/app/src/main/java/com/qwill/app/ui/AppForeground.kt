package com.qwill.app.ui

fun interface ForegroundListener {
    fun onForegroundChanged(active: Boolean)
}

object AppForeground {
    var active: Boolean = true
        private set

    private val listeners = ArrayList<ForegroundListener>()

    fun set(value: Boolean) {
        if (value == active) return
        active = value
        for (listener in listeners.toList()) listener.onForegroundChanged(value)
    }

    fun addListener(listener: ForegroundListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: ForegroundListener) {
        listeners.remove(listener)
    }
}
