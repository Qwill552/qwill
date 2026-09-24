package com.qwill.app.realtime

import kotlinx.serialization.json.JsonElement

enum class ConnectionState {
    WaitingForNetwork,
    Connecting,
    Connected,
    Updating,
    Sleeping,
    Off,
}

fun interface ConnectionStateListener {
    fun onConnectionStateChanged(state: ConnectionState)
}

fun interface SocketConnectedListener {
    fun onSocketConnected(afterDrop: Boolean)
}

fun interface SocketEventListener<in T> {
    fun onSocketEvent(value: T)
}

fun interface SocketRawListener {
    fun onSocketEvent(name: String, body: JsonElement?)
}
