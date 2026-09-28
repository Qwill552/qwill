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
    fun searchRowFollowsFirstRow() {
        assertEquals(0, SearchShift.shift(firstTop = 147, paddingTop = 147, itemCount = 5, slot = 147))
        assertEquals(40, SearchShift.shift(firstTop = 107, paddingTop = 147, itemCount = 5, slot = 147))
        assertEquals(147, SearchShift.shift(firstTop = -300, paddingTop = 147, itemCount = 5, slot = 147))
        assertEquals(147, SearchShift.shift(firstTop = null, paddingTop = 147, itemCount = 5, slot = 147))
        assertEquals(0, SearchShift.shift(firstTop = null, paddingTop = 147, itemCount = 0, slot = 147))
        assertEquals(0, SearchShift.shift(firstTop = 200, paddingTop = 147, itemCount = 5, slot = 147))
        assertFalse(SearchShift.collapsed(145, 147))
        assertTrue(SearchShift.collapsed(147, 147))
        assertEquals(0.5f, SearchShift.alpha(50, 100), 0.0001f)
    }
}
