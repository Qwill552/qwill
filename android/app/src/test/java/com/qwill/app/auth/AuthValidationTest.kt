package com.qwill.app.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthValidationTest {
    @Test
    fun usernameTooShortAt2Chars() {
        val result = AuthValidation.login("ab", "password123") as AuthValidationResult.Invalid
        assertEquals("Имя пользователя не короче 3 символов", result.errors[AuthFieldTarget.Username])
    }

    @Test
    fun usernameOkAt3Chars() {
        val result = AuthValidation.login("abc", "password123")
        assertTrue(result is AuthValidationResult.Valid)
    }

    @Test
    fun usernameOkAt32Chars() {
        val username = "a".repeat(32)
        val result = AuthValidation.login(username, "password123")
        assertTrue(result is AuthValidationResult.Valid)
    }

    @Test
    fun usernameTooLongAt33Chars() {
        val username = "a".repeat(33)
        val result = AuthValidation.login(username, "password123") as AuthValidationResult.Invalid
        assertEquals("Имя пользователя не длиннее 32 символов", result.errors[AuthFieldTarget.Username])
    }

    @Test
    fun usernamePatternRejectsUppercaseSourceButNormalizes() {
        val result = AuthValidation.login("Abc_123", "password123") as AuthValidationResult.Valid
        assertEquals("abc_123", result.value.username)
    }

    @Test
    fun usernamePatternRejectsSymbols() {
        val result = AuthValidation.login("abc-def", "password123") as AuthValidationResult.Invalid
        assertEquals("Только латиница, цифры и подчёркивание", result.errors[AuthFieldTarget.Username])
    }

    @Test
    fun usernameTrimsSurroundingSpaces() {
        val result = AuthValidation.login("  abc  ", "password123") as AuthValidationResult.Valid
        assertEquals("abc", result.value.username)
    }

    @Test
    fun emptyUsernameFailsLength() {
        val result = AuthValidation.login("", "password123") as AuthValidationResult.Invalid
        assertEquals("Имя пользователя не короче 3 символов", result.errors[AuthFieldTarget.Username])
    }

    @Test
    fun loginEmptyPassword() {
        val result = AuthValidation.login("abc", "") as AuthValidationResult.Invalid
        assertEquals("Введите пароль", result.errors[AuthFieldTarget.Password])
    }

    @Test
    fun passwordTooShortAt7Chars() {
        val result = AuthValidation.register("abc", "a".repeat(7), "Имя") as AuthValidationResult.Invalid
        assertEquals("Пароль не короче 8 символов", result.errors[AuthFieldTarget.Password])
    }

    @Test
    fun passwordOkAt8Chars() {
        val result = AuthValidation.register("abc", "a".repeat(8), "Имя")
        assertTrue(result is AuthValidationResult.Valid)
    }

    @Test
    fun passwordOkAt128Chars() {
        val result = AuthValidation.register("abc", "a".repeat(128), "Имя")
        assertTrue(result is AuthValidationResult.Valid)
    }

    @Test
    fun passwordTooLongAt129Chars() {
        val result = AuthValidation.register("abc", "a".repeat(129), "Имя") as AuthValidationResult.Invalid
        assertEquals("Пароль не длиннее 128 символов", result.errors[AuthFieldTarget.Password])
    }

    @Test
    fun emptyDisplayNameFails() {
        val result = AuthValidation.register("abc", "a".repeat(8), "") as AuthValidationResult.Invalid
        assertEquals("Введите имя", result.errors[AuthFieldTarget.DisplayName])
    }

    @Test
    fun displayNameTrimsWhitespaceOnlyToEmpty() {
        val result = AuthValidation.register("abc", "a".repeat(8), "   ") as AuthValidationResult.Invalid
        assertEquals("Введите имя", result.errors[AuthFieldTarget.DisplayName])
    }

    @Test
    fun displayNameTooLongAt65Chars() {
        val result = AuthValidation.register("abc", "a".repeat(8), "a".repeat(65)) as AuthValidationResult.Invalid
        assertEquals("Имя не длиннее 64 символов", result.errors[AuthFieldTarget.DisplayName])
    }

    @Test
    fun displayNameOkAt64Chars() {
        val result = AuthValidation.register("abc", "a".repeat(8), "a".repeat(64))
        assertTrue(result is AuthValidationResult.Valid)
    }

    @Test
    fun reservedUsernameRejectedOnlyForRegister() {
        val register = AuthValidation.register("admin", "a".repeat(8), "Имя") as AuthValidationResult.Invalid
        assertEquals("Это имя пользователя занято сервисом", register.errors[AuthFieldTarget.Username])

        val login = AuthValidation.login("admin", "a".repeat(8))
        assertTrue(login is AuthValidationResult.Valid)
    }

    @Test
    fun reservedUsernameCaseInsensitiveAfterNormalization() {
        val result = AuthValidation.register("ADMIN", "a".repeat(8), "Имя") as AuthValidationResult.Invalid
        assertEquals("Это имя пользователя занято сервисом", result.errors[AuthFieldTarget.Username])
    }

    @Test
    fun firstErrorPerFieldOnly() {
        val result = AuthValidation.register("ab", "short", "") as AuthValidationResult.Invalid
        assertEquals("Имя пользователя не короче 3 символов", result.errors[AuthFieldTarget.Username])
        assertEquals("Пароль не короче 8 символов", result.errors[AuthFieldTarget.Password])
        assertEquals("Введите имя", result.errors[AuthFieldTarget.DisplayName])
    }
}
