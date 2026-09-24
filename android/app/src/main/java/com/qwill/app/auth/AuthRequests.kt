package com.qwill.app.auth

import com.qwill.app.model.AuthResponse
import com.qwill.app.model.ChangePasswordBody
import com.qwill.app.model.ChangePasswordResponse
import com.qwill.app.model.HealthDto
import com.qwill.app.model.LegalVersionsDto
import com.qwill.app.model.LoginInput
import com.qwill.app.model.PublicUser
import com.qwill.app.model.RefreshBody
import com.qwill.app.model.RegisterInput
import com.qwill.app.net.ApiJson
import com.qwill.app.net.ApiRequest

internal object AuthRequests {
    fun login(input: LoginInput): ApiRequest<AuthResponse> = authPost("/api/auth/login") {
        ApiJson.encodeToString(LoginInput.serializer(), input)
    }

    fun register(input: RegisterInput): ApiRequest<AuthResponse> = authPost("/api/auth/register") {
        ApiJson.encodeToString(RegisterInput.serializer(), input)
    }

    fun refresh(refreshToken: String): ApiRequest<AuthResponse> = authPost("/api/auth/refresh") {
        ApiJson.encodeToString(RefreshBody.serializer(), RefreshBody(refreshToken))
    }

    fun logout(refreshToken: String): ApiRequest<Unit> = ApiRequest(
        "POST",
        "/api/auth/logout",
        ApiRequest.NO_CONTENT,
        body = { ApiJson.encodeToString(RefreshBody.serializer(), RefreshBody(refreshToken)) },
        bodySession = true,
        authRetry = false,
    )

    fun changePassword(currentPassword: String, newPassword: String): ApiRequest<ChangePasswordResponse> = ApiRequest(
        "POST",
        "/api/auth/password",
        ApiRequest.parser(ChangePasswordResponse.serializer()),
        body = { refreshToken ->
            ApiJson.encodeToString(ChangePasswordBody.serializer(), ChangePasswordBody(currentPassword, newPassword, refreshToken))
        },
        bodySession = true,
    )

    private fun authPost(path: String, body: () -> String): ApiRequest<AuthResponse> = ApiRequest(
        "POST",
        path,
        ApiRequest.parser(AuthResponse.serializer()),
        body = { body() },
        bodySession = true,
        authRetry = false,
    )
}

object Requests {
    fun me(): ApiRequest<PublicUser> = ApiRequest.get("/api/users/me", PublicUser.serializer())

    fun legalCurrent(): ApiRequest<LegalVersionsDto> = ApiRequest.get("/api/legal/current", LegalVersionsDto.serializer())

    fun health(): ApiRequest<HealthDto> = ApiRequest.get("/api/health", HealthDto.serializer())
}
