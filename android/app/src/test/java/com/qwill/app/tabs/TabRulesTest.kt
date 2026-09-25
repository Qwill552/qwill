package com.qwill.app.tabs

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TabRulesTest {
    @Test
    fun directionFollowsTabOrder() {
        assertEquals(TabTransition.FORWARD, TabRules.transition(MainTab.CHATS, MainTab.CONTACTS))
        assertEquals(TabTransition.FORWARD, TabRules.transition(MainTab.CONTACTS, MainTab.PROFILE))
        assertEquals(TabTransition.BACK, TabRules.transition(MainTab.PROFILE, MainTab.SETTINGS))
        assertEquals(TabTransition.BACK, TabRules.transition(MainTab.SETTINGS, MainTab.CHATS))
        assertEquals(TabTransition.NONE, TabRules.transition(MainTab.CHATS, MainTab.CHATS))
    }

    @Test
    fun tabOrderAndLabels() {
        assertEquals(listOf("Сообщения", "Контакты", "Настройки", "Профиль"), MainTab.entries.map { it.label })
    }

    @Test
    fun backGoesToChatsFromAnyOtherTab() {
        assertTrue(TabRules.interceptsBack(MainTab.CONTACTS, pageIntercepts = false))
        assertTrue(TabRules.interceptsBack(MainTab.PROFILE, pageIntercepts = false))
        assertFalse(TabRules.interceptsBack(MainTab.CHATS, pageIntercepts = false))
        assertTrue(TabRules.interceptsBack(MainTab.CHATS, pageIntercepts = true))
        assertEquals(MainTab.CHATS, TabRules.backTarget(MainTab.SETTINGS, pageHandled = false))
        assertNull(TabRules.backTarget(MainTab.SETTINGS, pageHandled = true))
        assertNull(TabRules.backTarget(MainTab.CHATS, pageHandled = false))
    }

    @Test
    fun searchRowCollapsesPast26AndReturnsBelow8() {
        assertFalse(SearchCollapse.next(false, 0f))
        assertFalse(SearchCollapse.next(false, 26f))
        assertTrue(SearchCollapse.next(false, 26.5f))
        assertTrue(SearchCollapse.next(true, 20f))
        assertTrue(SearchCollapse.next(true, 8f))
        assertFalse(SearchCollapse.next(true, 7.9f))
        assertFalse(SearchCollapse.next(false, 20f))
    }
}
