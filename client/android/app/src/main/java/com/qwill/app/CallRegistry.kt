package com.qwill.app

object CallRegistry {

    data class Action(val callId: String, val accepted: Boolean)

    private val connections = LinkedHashMap<String, QwillConnection>()
    private val queued = ArrayDeque<Action>()
    private var plugin: CallPlugin? = null

    @Synchronized
    fun put(callId: String, connection: QwillConnection) {
        connections[callId] = connection
    }

    @Synchronized
    fun peek(callId: String): QwillConnection? = connections[callId]

    @Synchronized
    fun take(callId: String): QwillConnection? = connections.remove(callId)

    @Synchronized
    fun isKnown(callId: String): Boolean = connections.containsKey(callId)

    fun attach(target: CallPlugin) {
        val pending: List<Action>
        synchronized(this) {
            plugin = target
            pending = queued.toList()
            queued.clear()
        }
        pending.forEach(target::emitAction)
    }

    @Synchronized
    fun detach(target: CallPlugin) {
        if (plugin === target) plugin = null
    }

    fun publish(action: Action) {
        val target: CallPlugin?
        synchronized(this) {
            target = plugin
            if (target == null) queued.addLast(action)
        }
        target?.emitAction(action)
    }

    /** Отклонение до сервера доходит своим каналом, вебу оно нужно только чтобы убрать
     *  свой экран, — копить его для будущего запуска приложения незачем и вредно. */
    fun notifyIfAttached(action: Action) {
        val target: CallPlugin?
        synchronized(this) {
            target = plugin
        }
        target?.emitAction(action)
    }
}
