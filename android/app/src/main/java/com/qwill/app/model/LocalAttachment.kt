package com.qwill.app.model

import kotlinx.serialization.Serializable

@Serializable
data class LocalAttachment(
    val source: String,
    val originalName: String,
    val mimeType: String,
    val size: Long,
    val sha256: String? = null,
    val duration: Int? = null,
    val peaks: List<Double>? = null,
    val albumId: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val thumb: String? = null,
    val thumbSha256: String? = null,
    val preview: String? = null,
    val previewSha256: String? = null,
    val prepared: Boolean = false,
    val failed: Boolean = false,
    val error: String? = null,
)

@Serializable
data class InitUploadInput(
    val sha256: String,
    val size: Long,
    val mimeType: String,
    val originalName: String,
    val purpose: String,
)

@Serializable
data class InitUploadResponse(
    val status: String,
    val file: FileDto? = null,
    val sessionId: String? = null,
    val receivedBytes: Long = 0,
    val chunkSize: Long = 0,
)

@Serializable
data class UploadChunkResponse(
    val receivedBytes: Long = 0,
    val done: Boolean = false,
    val file: FileDto? = null,
)

@Serializable
data class UploadOffsetMismatch(val receivedBytes: Long? = null)

@Serializable
data class MessageAttachmentInput(
    val fileId: String,
    val sha256: String,
    val thumbnailFileId: String? = null,
    val thumbnailSha256: String? = null,
    val previewFileId: String? = null,
    val previewSha256: String? = null,
    val originalName: String,
    val width: Int? = null,
    val height: Int? = null,
    val duration: Int? = null,
    val peaks: List<Double>? = null,
)
