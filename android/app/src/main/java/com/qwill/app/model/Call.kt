package com.qwill.app.model

import kotlinx.serialization.Serializable

@Serializable
data class CallParticipantDto(
    val user: ChatMemberSummary,
    val joinedAt: String? = null,
    val leftAt: String? = null,
)

@Serializable
data class CallDto(
    val id: String,
    val chatId: String,
    val initiator: ChatMemberSummary? = null,
    val kind: CallKind = CallKind.UNKNOWN,
    val status: CallStatus = CallStatus.UNKNOWN,
    val startedAt: String? = null,
    val endedAt: String? = null,
    val participants: List<CallParticipantDto> = emptyList(),
) {
    val activeParticipants: List<CallParticipantDto> get() = participants.filter { it.leftAt == null }
}

@Serializable
data class CallEvent(val call: CallDto)

@Serializable
data class CallLiveEvent(val calls: List<CallDto> = emptyList())
