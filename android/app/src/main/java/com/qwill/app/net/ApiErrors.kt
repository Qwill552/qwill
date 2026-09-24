package com.qwill.app.net

import kotlinx.serialization.Serializable

object ErrorCode {
    const val INTERNAL = "INTERNAL"
    const val VALIDATION_FAILED = "VALIDATION_FAILED"
    const val NOT_FOUND = "NOT_FOUND"
    const val RATE_LIMITED = "RATE_LIMITED"

    const val UNAUTHORIZED = "UNAUTHORIZED"
    const val TOKEN_EXPIRED = "TOKEN_EXPIRED"
    const val TOKEN_INVALID = "TOKEN_INVALID"
    const val INVALID_CREDENTIALS = "INVALID_CREDENTIALS"
    const val USERNAME_TAKEN = "USERNAME_TAKEN"
    const val USER_BANNED = "USER_BANNED"
    const val PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED"
    const val ADMIN_TICKET_REQUIRED = "ADMIN_TICKET_REQUIRED"
    const val IP_BANNED = "IP_BANNED"
    const val LEGAL_VERSION_OUTDATED = "LEGAL_VERSION_OUTDATED"

    const val CHAT_NOT_FOUND = "CHAT_NOT_FOUND"
    const val NOT_A_MEMBER = "NOT_A_MEMBER"
    const val FORBIDDEN = "FORBIDDEN"

    const val MESSAGE_NOT_FOUND = "MESSAGE_NOT_FOUND"
    const val BLOCKED = "BLOCKED"

    const val ALREADY_MEMBER = "ALREADY_MEMBER"
    const val CANNOT_REMOVE_OWNER = "CANNOT_REMOVE_OWNER"

    const val CALL_NOT_FOUND = "CALL_NOT_FOUND"
    const val CALL_ALREADY_ACCEPTED = "CALL_ALREADY_ACCEPTED"

    const val FILE_NOT_FOUND = "FILE_NOT_FOUND"
    const val FILE_TOO_LARGE = "FILE_TOO_LARGE"
    const val UNSUPPORTED_MEDIA_TYPE = "UNSUPPORTED_MEDIA_TYPE"
    const val STORAGE_FULL = "STORAGE_FULL"
    const val UPLOAD_SESSION_NOT_FOUND = "UPLOAD_SESSION_NOT_FOUND"
    const val UPLOAD_OFFSET_MISMATCH = "UPLOAD_OFFSET_MISMATCH"
    const val UPLOAD_HASH_MISMATCH = "UPLOAD_HASH_MISMATCH"
}

sealed class ApiException(message: String, cause: Throwable? = null) : Exception(message, cause)

class ApiError(
    val status: Int,
    val code: String,
    message: String,
    val fields: Map<String, String>? = null,
    val requestId: String? = null,
) : ApiException(message) {
    companion object {
        const val UNREADABLE_MESSAGE = "Не удалось выполнить запрос"

        fun unreadable(status: Int): ApiError = ApiError(status, ErrorCode.INTERNAL, UNREADABLE_MESSAGE)
    }
}

class NetworkError(cause: Throwable? = null) : ApiException(MESSAGE, cause) {
    companion object {
        const val MESSAGE = "Нет соединения с сервером"
    }
}

class NoResponseError : ApiException(MESSAGE) {
    companion object {
        const val MESSAGE = "Сервер не ответил"
    }
}

@Serializable
internal data class ApiErrorBody(val error: ApiErrorPayload)

@Serializable
internal data class ApiErrorPayload(
    val code: String = ErrorCode.INTERNAL,
    val message: String = ApiError.UNREADABLE_MESSAGE,
    val requestId: String? = null,
    val fields: Map<String, String>? = null,
)
