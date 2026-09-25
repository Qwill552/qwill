package com.qwill.app

import com.qwill.app.auth.SessionState
import com.qwill.app.model.AvatarColor
import com.qwill.app.model.PublicUser
import com.qwill.app.model.UserRole
import org.junit.Assert.assertEquals
import org.junit.Test

class RootRouteTest {
    private val user = PublicUser(
        id = "u1",
        username = "user",
        displayName = "User",
        avatarUrl = null,
        avatarColor = AvatarColor.BLUE,
        theme = "",
        createdAt = "",
        lastSeenAt = "",
        role = UserRole.USER,
        cardDisabled = false,
        pendingConsent = null,
    )

    @Test
    fun anonymousGoesToAuth() {
        assertEquals(RootRoute.AUTH, RootRouting.routeFor(SessionState.Anonymous))
    }

    @Test
    fun bannedGoesToAuth() {
        assertEquals(RootRoute.AUTH, RootRouting.routeFor(SessionState.Banned("заблокирован")))
    }

    @Test
    fun restoringGoesToChats() {
        assertEquals(RootRoute.CHATS, RootRouting.routeFor(SessionState.Restoring))
    }

    @Test
    fun authenticatedGoesToChatsRegardlessOfConfirmed() {
        assertEquals(RootRoute.CHATS, RootRouting.routeFor(SessionState.Authenticated(user, confirmed = false)))
        assertEquals(RootRoute.CHATS, RootRouting.routeFor(SessionState.Authenticated(user, confirmed = true)))
    }

    @Test
    fun ipBannedGoesToChats() {
        assertEquals(RootRoute.CHATS, RootRouting.routeFor(SessionState.IpBanned(user)))
        assertEquals(RootRoute.CHATS, RootRouting.routeFor(SessionState.IpBanned(null)))
    }
}
