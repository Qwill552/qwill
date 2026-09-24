package com.qwill.app.files

import com.qwill.app.model.AttachmentDto
import java.util.Locale

enum class MediaKind(val key: String) {
    PHOTO("photo"),
    VIDEO("video"),
    FILE("file"),
    VOICE("voice"),
    AUDIO("audio"),
    AVATAR("avatar"),
    OTHER("other"),
    ;

    companion object {
        fun of(key: String?): MediaKind = entries.firstOrNull { it.key == key } ?: OTHER
    }
}

enum class MediaTier(val key: String, val evictionOrder: Int) {
    FULL("full", 0),
    THUMB("thumb", 1),
    AVATAR("avatar", 2),
    ;

    companion object {
        fun of(key: String?): MediaTier = entries.firstOrNull { it.key == key } ?: FULL
    }
}

enum class AttachmentCategory { PHOTO, VIDEO, GIF, VOICE, AUDIO, FILE }

object MediaTypes {
    const val FALLBACK_MIME_TYPE = "application/octet-stream"
    const val BLURHASH_MAX_LENGTH = 64
    const val BLURHASH_MIN_LENGTH = 6

    private const val MIME_TYPE_MAX_LENGTH = 100
    private val MIME_TYPE_PATTERN = Regex("^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$")
    private val BLURHASH_PATTERN = Regex("^[\\w#$%*+,\\-.:;=?@\\[\\]^{|}~]+$")
    private val PLAYABLE_VIDEO = setOf("video/mp4", "video/webm")

    private val EXTENSION_MIME = mapOf(
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "png" to "image/png",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "heic" to "image/heic",
        "heif" to "image/heif",
        "mp4" to "video/mp4",
        "m4v" to "video/mp4",
        "webm" to "video/webm",
        "mov" to "video/quicktime",
        "3gp" to "video/3gpp",
        "mkv" to "video/x-matroska",
        "mp3" to "audio/mpeg",
        "m4a" to "audio/mp4",
        "ogg" to "audio/ogg",
        "oga" to "audio/ogg",
        "opus" to "audio/ogg",
        "wav" to "audio/wav",
        "pdf" to "application/pdf",
        "txt" to "text/plain",
        "zip" to "application/zip",
        "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "apk" to "application/vnd.android.package-archive",
    )

    fun sanitizeMimeType(value: String?): String {
        val normalized = value.orEmpty().trim().lowercase(Locale.ROOT)
        if (normalized.isEmpty() || normalized.length > MIME_TYPE_MAX_LENGTH) return FALLBACK_MIME_TYPE
        return if (MIME_TYPE_PATTERN.matches(normalized)) normalized else FALLBACK_MIME_TYPE
    }

    fun mimeTypeOf(declared: String?, fileName: String): String {
        val sanitized = sanitizeMimeType(declared)
        if (sanitized != FALLBACK_MIME_TYPE) return sanitized
        return EXTENSION_MIME[extensionOf(fileName)] ?: FALLBACK_MIME_TYPE
    }

    fun extensionOf(fileName: String): String {
        val base = fileName.substring(maxOf(fileName.lastIndexOf('/'), fileName.lastIndexOf('\\')) + 1)
        val dot = base.lastIndexOf('.')
        if (dot <= 0) return ""
        return base.substring(dot + 1).lowercase(Locale.ROOT)
    }

    private val RISKY_EXTENSIONS = setOf(
        "exe", "msi", "bat", "cmd", "com", "pif", "scr", "hta", "reg", "lnk", "msc", "vbs", "vbe", "js", "jse",
        "ws", "wsf", "wsh", "ps1", "psm1", "apk", "jar", "app", "pkg", "dmg", "deb", "rpm", "sh", "run", "svg",
    )

    fun isRiskyFileName(fileName: String): Boolean = extensionOf(fileName) in RISKY_EXTENSIONS

    fun extensionForMime(mimeType: String): String =
        EXTENSION_MIME.entries.firstOrNull { it.value == mimeType }?.key.orEmpty()

    fun isPlayableVideo(mimeType: String): Boolean = mimeType in PLAYABLE_VIDEO

    fun isBlurhash(value: String?): Boolean =
        value != null &&
            value.length in BLURHASH_MIN_LENGTH..BLURHASH_MAX_LENGTH &&
            BLURHASH_PATTERN.matches(value)

    fun categorize(mimeType: String, peaks: List<Double>?): AttachmentCategory = when {
        !peaks.isNullOrEmpty() -> AttachmentCategory.VOICE
        mimeType == "image/gif" -> AttachmentCategory.GIF
        mimeType.startsWith("image/") -> AttachmentCategory.PHOTO
        isPlayableVideo(mimeType) -> AttachmentCategory.VIDEO
        mimeType.startsWith("audio/") -> AttachmentCategory.AUDIO
        else -> AttachmentCategory.FILE
    }

    fun kindOf(mimeType: String, peaks: List<Double>?): MediaKind = when (categorize(mimeType, peaks)) {
        AttachmentCategory.PHOTO, AttachmentCategory.GIF -> MediaKind.PHOTO
        AttachmentCategory.VIDEO -> MediaKind.VIDEO
        AttachmentCategory.VOICE -> MediaKind.VOICE
        AttachmentCategory.AUDIO -> MediaKind.AUDIO
        AttachmentCategory.FILE -> MediaKind.FILE
    }

    fun kindOf(attachment: AttachmentDto): MediaKind = kindOf(attachment.file.mimeType, attachment.peaks)

    fun fileIdFromUrl(url: String?): String? {
        val value = url ?: return null
        val marker = "/api/files/"
        val start = value.indexOf(marker)
        if (start < 0) return null
        val id = value.substring(start + marker.length).substringBefore('?').substringBefore('/')
        return id.ifEmpty { null }
    }
}
