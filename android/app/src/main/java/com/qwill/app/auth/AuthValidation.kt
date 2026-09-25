package com.qwill.app.auth

object AuthLimits {
    const val USERNAME_MIN_LENGTH = 3
    const val USERNAME_MAX_LENGTH = 32
    val USERNAME_PATTERN = Regex("^[a-z0-9_]+\$")

    const val PASSWORD_MIN_LENGTH = 8
    const val PASSWORD_MAX_LENGTH = 128

    const val DISPLAY_NAME_MIN_LENGTH = 1
    const val DISPLAY_NAME_MAX_LENGTH = 64

    val RESERVED_USERNAMES = setOf(
        "qwill", "admin", "administrator", "administration", "support", "moderator", "mod",
        "system", "root", "staff", "team", "official", "security", "abuse", "help", "info",
        "service", "bot", "null", "undefined",
    )
}

sealed class AuthFieldTarget {
    object Username : AuthFieldTarget()
    object Password : AuthFieldTarget()
    object DisplayName : AuthFieldTarget()
}

class LoginFields(val username: String, val password: String)

class RegisterFields(val username: String, val password: String, val displayName: String)

sealed class AuthValidationResult<out T> {
    class Valid<T>(val value: T) : AuthValidationResult<T>()
    class Invalid(val errors: Map<AuthFieldTarget, String>) : AuthValidationResult<Nothing>()
}

object AuthValidation {
    fun login(username: String, password: String): AuthValidationResult<LoginFields> {
        val errors = LinkedHashMap<AuthFieldTarget, String>()
        val normalized = normalizeUsername(username)
        usernameError(normalized, checkReserved = false)?.let { errors[AuthFieldTarget.Username] = it }
        if (password.isEmpty()) errors[AuthFieldTarget.Password] = "Введите пароль"
        return if (errors.isEmpty()) {
            AuthValidationResult.Valid(LoginFields(normalized, password))
        } else {
            AuthValidationResult.Invalid(errors)
        }
    }

    fun register(username: String, password: String, displayName: String): AuthValidationResult<RegisterFields> {
        val errors = LinkedHashMap<AuthFieldTarget, String>()
        val normalized = normalizeUsername(username)
        usernameError(normalized, checkReserved = true)?.let { errors[AuthFieldTarget.Username] = it }
        passwordError(password)?.let { errors[AuthFieldTarget.Password] = it }
        val trimmedName = displayName.trim()
        displayNameError(trimmedName)?.let { errors[AuthFieldTarget.DisplayName] = it }
        return if (errors.isEmpty()) {
            AuthValidationResult.Valid(RegisterFields(normalized, password, trimmedName))
        } else {
            AuthValidationResult.Invalid(errors)
        }
    }

    fun normalizeUsername(username: String): String = username.trim().lowercase()

    private fun usernameError(normalized: String, checkReserved: Boolean): String? {
        if (normalized.length < AuthLimits.USERNAME_MIN_LENGTH) {
            return "Имя пользователя не короче ${AuthLimits.USERNAME_MIN_LENGTH} символов"
        }
        if (normalized.length > AuthLimits.USERNAME_MAX_LENGTH) {
            return "Имя пользователя не длиннее ${AuthLimits.USERNAME_MAX_LENGTH} символов"
        }
        if (!AuthLimits.USERNAME_PATTERN.matches(normalized)) {
            return "Только латиница, цифры и подчёркивание"
        }
        if (checkReserved && AuthLimits.RESERVED_USERNAMES.contains(normalized)) {
            return "Это имя пользователя занято сервисом"
        }
        return null
    }

    private fun passwordError(password: String): String? {
        if (password.length < AuthLimits.PASSWORD_MIN_LENGTH) {
            return "Пароль не короче ${AuthLimits.PASSWORD_MIN_LENGTH} символов"
        }
        if (password.length > AuthLimits.PASSWORD_MAX_LENGTH) {
            return "Пароль не длиннее ${AuthLimits.PASSWORD_MAX_LENGTH} символов"
        }
        return null
    }

    private fun displayNameError(trimmed: String): String? {
        if (trimmed.length < AuthLimits.DISPLAY_NAME_MIN_LENGTH) return "Введите имя"
        if (trimmed.length > AuthLimits.DISPLAY_NAME_MAX_LENGTH) {
            return "Имя не длиннее ${AuthLimits.DISPLAY_NAME_MAX_LENGTH} символов"
        }
        return null
    }
}
