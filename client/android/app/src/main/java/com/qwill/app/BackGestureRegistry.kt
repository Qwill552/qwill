package com.qwill.app

import androidx.activity.BackEventCompat

object BackGestureRegistry {

    @Volatile
    private var webOwnsGesture = false

    private var plugin: BackGesturePlugin? = null

    fun attach(target: BackGesturePlugin) {
        synchronized(this) { plugin = target }
    }

    fun detach(target: BackGesturePlugin) {
        synchronized(this) { if (plugin === target) plugin = null }
    }

    fun take() {
        webOwnsGesture = true
    }

    fun release(): Boolean {
        val owned = webOwnsGesture
        webOwnsGesture = false
        return owned
    }

    fun publish(phase: String, event: BackEventCompat) {
        target()?.emitGesture(phase, event.progress, event.touchY, event.swipeEdge)
    }

    fun publish(phase: String) {
        target()?.emitGesture(phase, 0f, 0f, BackEventCompat.EDGE_LEFT)
    }

    private fun target(): BackGesturePlugin? = synchronized(this) { plugin }
}
