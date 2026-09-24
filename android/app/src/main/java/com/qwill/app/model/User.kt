package com.qwill.app.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class AvatarColor {
    @SerialName("blue") BLUE,
    @SerialName("violet") VIOLET,
    @SerialName("teal") TEAL,
    @SerialName("orange") ORANGE,
    @SerialName("pink") PINK,
    @SerialName("green") GREEN,
}

@Serializable
enum class UserRole {
    @SerialName("user") USER,
    @SerialName("admin") ADMIN,
}

@Serializable
data class PendingConsentDto(
    val terms: Boolean = false,
    val privacy: Boolean = false,
)

@Serializable
data class PublicUser(
    val id: String,
    val username: String,
    val displayName: String,
    val avatarUrl: String? = null,
    val avatarColor: AvatarColor = AvatarColor.BLUE,
    val theme: String = "",
    val createdAt: String = "",
    val lastSeenAt: String = "",
    val role: UserRole = UserRole.USER,
    val cardDisabled: Boolean = false,
    val pendingConsent: PendingConsentDto? = null,
)
