package com.qwill.app.files

import com.qwill.app.model.AttachmentDto
import com.qwill.app.model.FileDto

class ShownCopy(val file: FileDto, val tier: MediaTier)

object FeedQuality {
    const val PREVIEW_MAX_DIMENSION = 512
    const val FEED_BUBBLE_WIDTH_DP = 320f
    private const val LIGHT_ORIGINAL_MAX_BYTES = 400L * 1024
    private const val LIGHT_ORIGINAL_MAX_PIXELS = 5_000_000L

    fun prefersOriginalInFeed(attachment: AttachmentDto): Boolean {
        if (MediaTypes.categorize(attachment.file.mimeType, attachment.peaks) != AttachmentCategory.PHOTO) return false
        val width = attachment.width ?: 0
        val height = attachment.height ?: 0
        if (width <= 0 || height <= 0) return false
        if (maxOf(width, height) <= PREVIEW_MAX_DIMENSION) return true
        return attachment.file.size <= LIGHT_ORIGINAL_MAX_BYTES && width.toLong() * height <= LIGHT_ORIGINAL_MAX_PIXELS
    }

    fun prefersThumbnailInFeed(attachment: AttachmentDto, density: Float, boxWidthDp: Float = FEED_BUBBLE_WIDTH_DP): Boolean {
        if (attachment.thumbnail == null) return false
        val category = MediaTypes.categorize(attachment.file.mimeType, attachment.peaks)
        if (category != AttachmentCategory.PHOTO && category != AttachmentCategory.VIDEO && category != AttachmentCategory.GIF) return false
        return boxWidthDp * density > PREVIEW_MAX_DIMENSION
    }

    fun feedFileOf(attachment: AttachmentDto, density: Float, boxWidthDp: Float = FEED_BUBBLE_WIDTH_DP): FileDto {
        if (prefersOriginalInFeed(attachment)) return attachment.file
        if (prefersThumbnailInFeed(attachment, density, boxWidthDp)) return attachment.thumbnail!!
        return attachment.preview ?: attachment.thumbnail ?: attachment.file
    }

    fun feedUsesDownscaled(attachment: AttachmentDto): Boolean =
        !prefersOriginalInFeed(attachment) && (attachment.preview != null || attachment.thumbnail != null)

    fun needsOriginalInList(attachment: AttachmentDto): Boolean =
        MediaTypes.categorize(attachment.file.mimeType, attachment.peaks) == AttachmentCategory.GIF

    fun shownInFeed(attachment: AttachmentDto, density: Float, boxWidthDp: Float = FEED_BUBBLE_WIDTH_DP): ShownCopy {
        val file = feedFileOf(attachment, density, boxWidthDp)
        return ShownCopy(file, if (file.id == attachment.file.id) MediaTier.FULL else MediaTier.THUMB)
    }

    fun autoDownloadCheckFile(attachment: AttachmentDto, density: Float, boxWidthDp: Float = FEED_BUBBLE_WIDTH_DP): FileDto =
        if (needsOriginalInList(attachment)) attachment.file else feedFileOf(attachment, density, boxWidthDp)
}
