package com.qwill.app

object DeepLinkRegistry {

    private var plugin: DeepLinkPlugin? = null
    private var pending: String? = null

    fun attach(target: DeepLinkPlugin) {
        val path = synchronized(this) {
            plugin = target
            pending.also { pending = null }
        }
        if (path != null) target.emitLink(path)
    }

    fun detach(target: DeepLinkPlugin) {
        synchronized(this) { if (plugin === target) plugin = null }
    }

    fun publish(path: String) {
        val target = synchronized(this) {
            if (plugin == null) pending = path
            plugin
        }
        target?.emitLink(path)
    }
}
