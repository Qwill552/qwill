package com.qwill.app.model

import kotlinx.serialization.Serializable

@Serializable
data class AuthResponse(
    val accessToken: String,
    val user: PublicUser,
    val csrfToken: String? = null,
    val refreshToken: String? = null,
)

@Serializable
data class LoginInput(
    val username: String,
    val password: String,
)

@Serializable
data class RegisterInput(
    val username: String,
    val password: String,
    val displayName: String,
    val termsVersion: String,
    val privacyVersion: String,
)

@Serializable
data class ChangePasswordResponse(
    val terminatedSessions: Int = 0,
)

@Serializable
data class LegalVersionsDto(
    val termsVersion: String,
    val privacyVersion: String,
)

@Serializable
data class AcceptLegalInput(
    val termsVersion: String,
    val privacyVersion: String,
)

@Serializable
data class LegalDocumentDto(
    val doc: String,
    val version: String,
    val title: String,
    val effectiveDate: String,
    val content: String,
)

@Serializable
data class HealthDto(
    val status: String = "",
)

@Serializable
internal data class RefreshBody(
    val refreshToken: String,
)

@Serializable
internal data class ChangePasswordBody(
    val currentPassword: String,
    val newPassword: String,
    val refreshToken: String? = null,
)
