package com.qwill.app.consent

import com.qwill.app.auth.SessionState
import com.qwill.app.model.PendingConsentDto
import com.qwill.app.model.PublicUser
import org.junit.Assert.assertEquals
import org.junit.Test

class ConsentGateRuleTest {
    private fun user(consent: PendingConsentDto?) = PublicUser(id = "u1", username = "tester", displayName = "Tester", pendingConsent = consent)

    private val both = PendingConsentDto(terms = true, privacy = true)

    @Test
    fun savedUserWithFlagShowsGateFromTheFirstFrame() {
        assertEquals(GateChange.SHOW_INSTANT, ConsentGateRule.decide(false, true, SessionState.Authenticated(user(both), confirmed = false)))
    }

    @Test
    fun flagArrivingMidSessionFadesIn() {
        assertEquals(GateChange.SHOW_ANIMATED, ConsentGateRule.decide(false, false, SessionState.Authenticated(user(both), confirmed = true)))
        assertEquals(GateChange.NONE, ConsentGateRule.decide(true, false, SessionState.Authenticated(user(both), confirmed = true)))
    }

    @Test
    fun flagClearedElsewhereFadesOut() {
        assertEquals(GateChange.HIDE_ANIMATED, ConsentGateRule.decide(true, false, SessionState.Authenticated(user(null), confirmed = true)))
        assertEquals(GateChange.NONE, ConsentGateRule.decide(false, false, SessionState.Authenticated(user(null), confirmed = true)))
    }

    @Test
    fun lostSessionDropsGateInstantly() {
        assertEquals(GateChange.HIDE_INSTANT, ConsentGateRule.decide(true, false, SessionState.Anonymous))
        assertEquals(GateChange.HIDE_INSTANT, ConsentGateRule.decide(true, false, SessionState.Banned("x")))
    }

    @Test
    fun ipBanKeepsGateWhileFlagIsUp() {
        assertEquals(GateChange.NONE, ConsentGateRule.decide(true, false, SessionState.IpBanned(user(both))))
        assertEquals(GateChange.NONE, ConsentGateRule.decide(true, false, SessionState.IpBanned(null)))
        assertEquals(GateChange.SHOW_INSTANT, ConsentGateRule.decide(false, true, SessionState.IpBanned(user(both))))
    }

    @Test
    fun emptyFlagIsNotAGate() {
        val none = PendingConsentDto(terms = false, privacy = false)
        assertEquals(GateChange.NONE, ConsentGateRule.decide(false, true, SessionState.Authenticated(user(none), confirmed = true)))
    }
}
