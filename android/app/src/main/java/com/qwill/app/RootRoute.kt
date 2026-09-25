package com.qwill.app

import com.qwill.app.auth.SessionState

enum class RootRoute {
    AUTH,
    CHATS,
}

object RootRouting {
    fun routeFor(state: SessionState): RootRoute = when (state) {
        is SessionState.Anonymous -> RootRoute.AUTH
        is SessionState.Banned -> RootRoute.AUTH
        is SessionState.Restoring -> RootRoute.CHATS
        is SessionState.Authenticated -> RootRoute.CHATS
        is SessionState.IpBanned -> RootRoute.CHATS
    }
}
