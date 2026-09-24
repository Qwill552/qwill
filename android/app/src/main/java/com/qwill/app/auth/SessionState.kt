package com.qwill.app.auth

import com.qwill.app.model.PublicUser
import com.qwill.app.net.ApiException

sealed class SessionState {
    object Anonymous : SessionState()

    object Restoring : SessionState()

    data class Authenticated(val user: PublicUser, val confirmed: Boolean) : SessionState()

    data class IpBanned(val user: PublicUser?) : SessionState()

    data class Banned(val message: String) : SessionState()
}

fun interface SessionStateListener {
    fun onSessionStateChanged(state: SessionState)
}

fun interface SessionClearedListener {
    fun onSessionCleared()
}

sealed class LiveToken {
    class Ready(val token: String, val refreshed: Boolean) : LiveToken()

    class Failed(val error: ApiException) : LiveToken()
}
