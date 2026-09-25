package com.qwill.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SharedAuthSyncTest {
    private val constants = File("../../shared/src/constants.ts").readText()
    private val auth = File("../../shared/src/auth.ts").readText()
    private val user = File("../../shared/src/user.ts").readText()

    private fun constant(name: String): Int {
        val match = Regex("export const $name = (\\d+);").find(constants)
            ?: error("constant $name not found in shared/src/constants.ts")
        return match.groupValues[1].toInt()
    }

    @Test
    fun numbersMatchShared() {
        assertEquals(constant("USERNAME_MIN_LENGTH"), AuthLimits.USERNAME_MIN_LENGTH)
        assertEquals(constant("USERNAME_MAX_LENGTH"), AuthLimits.USERNAME_MAX_LENGTH)
        assertEquals(constant("PASSWORD_MIN_LENGTH"), AuthLimits.PASSWORD_MIN_LENGTH)
        assertEquals(constant("PASSWORD_MAX_LENGTH"), AuthLimits.PASSWORD_MAX_LENGTH)
        assertEquals(constant("DISPLAY_NAME_MIN_LENGTH"), AuthLimits.DISPLAY_NAME_MIN_LENGTH)
        assertEquals(constant("DISPLAY_NAME_MAX_LENGTH"), AuthLimits.DISPLAY_NAME_MAX_LENGTH)
    }

    @Test
    fun usernamePatternSourceMatches() {
        val match = Regex("export const USERNAME_PATTERN = (/.*/);").find(constants)
            ?: error("USERNAME_PATTERN not found in shared/src/constants.ts")
        assertEquals("/^[a-z0-9_]+\$/", match.groupValues[1])
        assertEquals("^[a-z0-9_]+\$", AuthLimits.USERNAME_PATTERN.pattern)
    }

    @Test
    fun reservedUsernamesMatchShared() {
        val block = Regex("export const RESERVED_USERNAMES = \\[([\\s\\S]*?)] as const;").find(user)
            ?: error("RESERVED_USERNAMES not found in shared/src/user.ts")
        val names = Regex("'([a-z0-9_]+)'").findAll(block.groupValues[1]).map { it.groupValues[1] }.toSet()
        assertEquals(names, AuthLimits.RESERVED_USERNAMES)
    }

    @Test
    fun everyValidationTextAppearsInSharedAuth() {
        val substituted = auth
            .replace("\${USERNAME_MIN_LENGTH}", constant("USERNAME_MIN_LENGTH").toString())
            .replace("\${USERNAME_MAX_LENGTH}", constant("USERNAME_MAX_LENGTH").toString())
            .replace("\${PASSWORD_MIN_LENGTH}", constant("PASSWORD_MIN_LENGTH").toString())
            .replace("\${PASSWORD_MAX_LENGTH}", constant("PASSWORD_MAX_LENGTH").toString())
            .replace("\${DISPLAY_NAME_MAX_LENGTH}", constant("DISPLAY_NAME_MAX_LENGTH").toString())
        val texts = listOf(
            "Имя пользователя не короче ${AuthLimits.USERNAME_MIN_LENGTH} символов",
            "Имя пользователя не длиннее ${AuthLimits.USERNAME_MAX_LENGTH} символов",
            "Только латиница, цифры и подчёркивание",
            "Это имя пользователя занято сервисом",
            "Пароль не короче ${AuthLimits.PASSWORD_MIN_LENGTH} символов",
            "Пароль не длиннее ${AuthLimits.PASSWORD_MAX_LENGTH} символов",
            "Введите пароль",
            "Введите имя",
            "Имя не длиннее ${AuthLimits.DISPLAY_NAME_MAX_LENGTH} символов",
        )
        for (text in texts) assertTrue("текст «$text» не найден в shared/src/auth.ts", substituted.contains(text))
    }
}
