package com.qwill.app.files

import com.qwill.app.model.AttachmentDto
import com.qwill.app.model.ChatType
import com.qwill.app.model.FileDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedQualityTest {
    private fun file(id: String, mime: String, size: Long) = FileDto(id, mime, size, "/api/files/$id")

    private fun attachment(
        file: FileDto,
        width: Int? = 4000,
        height: Int? = 3000,
        thumbnail: FileDto? = file("thumb", "image/jpeg", 90_000),
        preview: FileDto? = file("prev", "image/jpeg", 30_000),
        peaks: List<Double>? = null,
    ) = AttachmentDto("a1", file, thumbnail, preview, "p.png", width, height, null, peaks, null)

    @Test
    fun smallPhotoIsShownAsOriginal() {
        val small = attachment(file("f", "image/png", 40_000), 400, 300)
        assertTrue(FeedQuality.prefersOriginalInFeed(small))
        assertEquals("f", FeedQuality.feedFileOf(small, 1f).id)
        assertFalse(FeedQuality.feedUsesDownscaled(small))
    }

    @Test
    fun lightScreenshotIsShownAsOriginal() {
        assertTrue(FeedQuality.prefersOriginalInFeed(attachment(file("f", "image/png", 300_000), 1080, 2400)))
    }

    @Test
    fun heavyPhotoGoesThroughPreview() {
        val heavy = attachment(file("f", "image/jpeg", 3_000_000))
        assertFalse(FeedQuality.prefersOriginalInFeed(heavy))
        assertEquals("prev", FeedQuality.feedFileOf(heavy, 1f).id)
        assertTrue(FeedQuality.feedUsesDownscaled(heavy))
    }

    @Test
    fun lightButHugeInPixelsGoesThroughPreview() {
        assertFalse(FeedQuality.prefersOriginalInFeed(attachment(file("f", "image/png", 200_000), 8000, 8000)))
    }

    @Test
    fun videoVoiceGifAndUnknownSizeAreNotOriginals() {
        assertFalse(FeedQuality.prefersOriginalInFeed(attachment(file("f", "video/mp4", 100_000), 320, 240)))
        assertFalse(FeedQuality.prefersOriginalInFeed(attachment(file("f", "audio/ogg", 10_000), null, null, peaks = listOf(0.2, 0.4))))
        assertFalse(FeedQuality.prefersOriginalInFeed(attachment(file("f", "image/gif", 50_000), 200, 200)))
        assertFalse(FeedQuality.prefersOriginalInFeed(attachment(file("f", "image/jpeg", 50_000), null, null)))
    }

    private val screenshot = attachment(
        file("orig", "image/png", 615_921),
        1280,
        2856,
        preview = file("prev", "image/jpeg", 9_400),
        thumbnail = file("thumb", "image/jpeg", 45_233),
    )

    @Test
    fun densityDecidesBetweenThumbnailAndPreview() {
        assertTrue(FeedQuality.prefersThumbnailInFeed(screenshot, 3f))
        assertEquals("thumb", FeedQuality.feedFileOf(screenshot, 3f).id)
        assertEquals("thumb", FeedQuality.feedFileOf(screenshot, 2f).id)
        assertFalse(FeedQuality.prefersThumbnailInFeed(screenshot, 1f))
        assertEquals("prev", FeedQuality.feedFileOf(screenshot, 1f).id)
        assertEquals("f", FeedQuality.feedFileOf(attachment(file("f", "image/png", 40_000), 400, 300), 3f).id)
    }

    @Test
    fun withoutThumbnailPreviewStays() {
        val noThumb = screenshot.copy(thumbnail = null)
        assertFalse(FeedQuality.prefersThumbnailInFeed(noThumb, 3f))
        assertEquals("prev", FeedQuality.feedFileOf(noThumb, 3f).id)
        assertFalse(FeedQuality.prefersThumbnailInFeed(attachment(file("f", "audio/ogg", 10_000), null, null, peaks = listOf(0.1)), 3f))
    }

    @Test
    fun copyIsChosenByRealBox() {
        val photo = attachment(
            file("orig", "image/jpeg", 900_000),
            3000,
            2000,
            preview = file("prev", "image/jpeg", 12_000),
            thumbnail = file("thumb", "image/jpeg", 60_000),
        )
        assertEquals("prev", FeedQuality.feedFileOf(photo, 3f, 128f).id)
        assertEquals("thumb", FeedQuality.feedFileOf(photo, 3f, 420f).id)
        assertEquals(MediaTier.THUMB, FeedQuality.shownInFeed(photo, 3f).tier)
    }

    @Test
    fun gifIsCheckedByOriginal() {
        val gif = attachment(file("g", "image/gif", 50_000), 200, 200)
        assertEquals("g", FeedQuality.autoDownloadCheckFile(gif, 3f).id)
    }
}

class AutoDownloadTest {
    private val defaults = AutoDownloadSettings.DEFAULT

    private fun decide(kind: AutoDownloadKind, network: NetworkKind, size: Long, cached: Boolean = false, saveData: Boolean = false) =
        AutoDownload.shouldAutoDownload(kind, network, size, cached, saveData, defaults)

    @Test
    fun cachedAlwaysAllowed() {
        assertTrue(decide(AutoDownloadKind.VIDEO, NetworkKind.CELLULAR, 999_000_000, cached = true, saveData = true))
    }

    @Test
    fun dataSaverBlocksEverythingNotCached() {
        assertFalse(decide(AutoDownloadKind.PHOTO, NetworkKind.WIFI, 1000, saveData = true))
    }

    @Test
    fun kindAndCeilingPerNetwork() {
        assertFalse(decide(AutoDownloadKind.VIDEO, NetworkKind.CELLULAR, 1000))
        assertTrue(decide(AutoDownloadKind.PHOTO, NetworkKind.CELLULAR, 1000))
        assertTrue(decide(AutoDownloadKind.PHOTO, NetworkKind.CELLULAR, 10L * 1024 * 1024))
        assertFalse(decide(AutoDownloadKind.PHOTO, NetworkKind.CELLULAR, 10L * 1024 * 1024 + 1))
        assertTrue(decide(AutoDownloadKind.VIDEO, NetworkKind.WIFI, 100L * 1024 * 1024))
        assertFalse(decide(AutoDownloadKind.VIDEO, NetworkKind.WIFI, 100L * 1024 * 1024 + 1))
    }

    @Test
    fun noCeilingAllowsAnySize() {
        val open = defaults.copy(wifi = defaults.wifi.copy(maxBytes = null))
        assertTrue(AutoDownload.shouldAutoDownload(AutoDownloadKind.VIDEO, NetworkKind.WIFI, Long.MAX_VALUE, false, false, open))
    }

    @Test
    fun voiceAndAudioAreNotGated() {
        assertNull(AutoDownload.kindOf(AttachmentCategory.VOICE))
        assertNull(AutoDownload.kindOf(AttachmentCategory.AUDIO))
    }
}

class MediaTypesTest {
    @Test
    fun mimeIsSanitizedAndGuessedByExtension() {
        assertEquals("image/jpeg", MediaTypes.sanitizeMimeType(" IMAGE/JPEG "))
        assertEquals(MediaTypes.FALLBACK_MIME_TYPE, MediaTypes.sanitizeMimeType("не тип"))
        assertEquals("application/pdf", MediaTypes.mimeTypeOf(null, "Договор.PDF"))
        assertEquals("video/mp4", MediaTypes.mimeTypeOf("", "clip.mp4"))
    }

    @Test
    fun categoriesFollowWeb() {
        assertEquals(AttachmentCategory.VOICE, MediaTypes.categorize("audio/ogg", listOf(0.1)))
        assertEquals(AttachmentCategory.GIF, MediaTypes.categorize("image/gif", null))
        assertEquals(AttachmentCategory.VIDEO, MediaTypes.categorize("video/mp4", null))
        assertEquals(AttachmentCategory.FILE, MediaTypes.categorize("video/quicktime", null))
        assertEquals(MediaKind.PHOTO, MediaTypes.kindOf("image/gif", null))
    }

    @Test
    fun blurhashValidation() {
        assertTrue(MediaTypes.isBlurhash("LEHV6nWB2yk8pyo0adR*.7kCMdnj"))
        assertFalse(MediaTypes.isBlurhash("LEHV"))
        assertFalse(MediaTypes.isBlurhash("«русские буквы»"))
        assertFalse(MediaTypes.isBlurhash("L".repeat(200)))
        assertFalse(MediaTypes.isBlurhash(null))
    }

    @Test
    fun riskyNamesLikeWeb() {
        assertTrue(MediaTypes.isRiskyFileName("SETUP.EXE"))
        assertTrue(MediaTypes.isRiskyFileName("archive.gz.exe"))
        assertFalse(MediaTypes.isRiskyFileName("archive.tar.gz"))
        assertFalse(MediaTypes.isRiskyFileName(".exe"))
        assertFalse(MediaTypes.isRiskyFileName("README"))
    }

    @Test
    fun avatarUrlGivesFileId() {
        assertEquals("abc123", MediaTypes.fileIdFromUrl("/api/files/abc123"))
        assertEquals("abc123", MediaTypes.fileIdFromUrl("https://dev.qwill.mooo.com/api/files/abc123?token=x"))
        assertNull(MediaTypes.fileIdFromUrl(null))
    }
}

class RetentionTest {
    private fun entry(id: String, size: Long, tier: MediaTier = MediaTier.FULL, used: Long = 0, chatId: String? = "c1") =
        CachedMedia(id, chatId, MediaKind.PHOTO, tier, size, used, complete = true)

    @Test
    fun expiryFollowsChatTypeAndNullChatIsForever() {
        val ttl = MediaRetention.resolver(RetentionSettings.DEFAULT, mapOf("p" to ChatType.PRIVATE, "g" to ChatType.GROUP))
        val now = 100 * DAY_MS
        val entries = listOf(
            entry("private-old", 1, chatId = "p"),
            entry("group-old", 1, chatId = "g", used = now - 31 * DAY_MS),
            entry("group-fresh", 1, chatId = "g", used = now - 29 * DAY_MS),
            entry("avatar", 1, chatId = null),
        )
        assertEquals(listOf("group-old"), MediaRetention.selectExpired(entries, now, ttl).map { it.fileId })
    }

    @Test
    fun exceptionWinsOverType() {
        val settings = RetentionSettings.DEFAULT.copy(exceptions = mapOf("p" to RetentionPeriod.WEEK))
        val ttl = MediaRetention.resolver(settings, mapOf("p" to ChatType.PRIVATE))
        assertEquals(1, MediaRetention.selectExpired(listOf(entry("x", 1, chatId = "p")), 8 * DAY_MS, ttl).size)
    }

    @Test
    fun noBudgetEvictsNothing() {
        assertTrue(MediaRetention.selectOverBudget(listOf(entry("a", 1_000_000)), null).isEmpty())
    }

    @Test
    fun evictionOrderAndTarget() {
        val entries = listOf(
            entry("avatar", 10, MediaTier.AVATAR, used = 0),
            entry("thumb-old", 20, MediaTier.THUMB, used = 1),
            entry("full-new", 30, MediaTier.FULL, used = 9),
            entry("full-old", 30, MediaTier.FULL, used = 2),
        )
        val victims = MediaRetention.selectOverBudget(entries, 80).map { it.fileId }
        assertEquals(listOf("full-old"), victims)
        val deeper = MediaRetention.selectOverBudget(entries, 20).map { it.fileId }
        assertEquals(listOf("full-old", "full-new", "thumb-old"), deeper)
    }

    @Test
    fun avatarsKeepTenPercentReserve() {
        val entries = listOf(entry("a1", 30, MediaTier.AVATAR, used = 1), entry("a2", 30, MediaTier.AVATAR, used = 2))
        val victims = MediaRetention.selectOverBudget(entries, 50).map { it.fileId }
        assertEquals(listOf("a1"), victims)
        val tight = MediaRetention.selectOverBudget(listOf(entry("a1", 60, MediaTier.AVATAR)), 50)
        assertTrue(tight.isEmpty())
    }

    @Test
    fun accessIsTouchedAtMostOncePerDay() {
        assertFalse(MediaRetention.shouldTouch(0, DAY_MS))
        assertTrue(MediaRetention.shouldTouch(0, DAY_MS + 1))
    }
}

class ImageMathTest {
    @Test
    fun exifSixSwapsSides() {
        assertEquals(PixelSize(3000, 4000), ImageMath.oriented(PixelSize(4000, 3000), 6))
        assertEquals(PixelSize(4000, 3000), ImageMath.oriented(PixelSize(4000, 3000), 3))
        for (orientation in 5..8) assertTrue(ImageMath.exifTransform(orientation).swapsSides)
        for (orientation in 1..4) assertFalse(ImageMath.exifTransform(orientation).swapsSides)
        assertTrue(ImageMath.exifTransform(2).mirrored)
    }

    @Test
    fun thumbnailAndPreviewSizes() {
        assertEquals(PixelSize(960, 1280), ImageMath.fit(PixelSize(3000, 4000), 1280))
        assertEquals(PixelSize(400, 300), ImageMath.fit(PixelSize(400, 300), 1280))
        assertFalse(ImageMath.needsPreview(PixelSize(400, 300)))
        assertTrue(ImageMath.needsPreview(PixelSize(513, 300)))
    }

    @Test
    fun sampleSizeNeverGoesBelowTarget() {
        assertEquals(4, ImageMath.sampleSizeForWidth(PixelSize(4000, 3000), 768))
        assertEquals(1, ImageMath.sampleSizeForWidth(PixelSize(700, 500), 768))
        assertEquals(2, ImageMath.sampleSize(PixelSize(3000, 4000), PixelSize(960, 1280)))
    }

    @Test
    fun halvingStepsEndAtTarget() {
        val steps = ImageMath.halvingSteps(PixelSize(4000, 3000), PixelSize(512, 384))
        assertEquals(PixelSize(2000, 1500), steps.first())
        assertEquals(PixelSize(512, 384), steps.last())
    }

    @Test
    fun videoRotationSwapsSides() {
        assertEquals(PixelSize(1080, 1920), ImageMath.videoSize(1920, 1080, 90))
        assertEquals(PixelSize(1920, 1080), ImageMath.videoSize(1920, 1080, 180))
    }
}

class BlurHashTest {
    @Test
    fun matchesNpmReference() {
        val pixels = BlurHash.decodeRgba("LEHV6nWB2yk8pyo0adR*.7kCMdnj")!!
        assertEquals(32 * 32 * 4, pixels.size)
        val expected = mapOf(
            0 to 135, 1 to 164, 2 to 177, 3 to 255,
            668 to 153, 669 to 165, 670 to 172,
            4092 to 133, 4093 to 142, 4094 to 147,
            2112 to 158, 2113 to 125, 2114 to 108,
        )
        for ((index, value) in expected) assertEquals("байт $index", value, pixels[index].toInt() and 0xFF)
        var hash = 0L
        for (byte in pixels) hash = (hash * 31 + (byte.toInt() and 0xFF)) and 0xFFFFFFFFL
        assertEquals(1748646123L, hash)
    }

    @Test
    fun garbageGivesNull() {
        assertNull(BlurHash.decodeRgba("LEHV6nWB2yk8pyo0adR*.7kCMdn"))
        assertNull(BlurHash.decodeRgba(""))
        assertNull(BlurHash.decodeRgba(null))
    }
}

class ByteRangesTest {
    @Test
    fun neighboursMerge() {
        var ranges = ByteRanges.merge(emptyList(), ByteRange(0, 9))
        ranges = ByteRanges.merge(ranges, ByteRange(20, 29))
        assertEquals(2, ranges.size)
        ranges = ByteRanges.merge(ranges, ByteRange(10, 19))
        assertEquals(listOf(ByteRange(0, 29)), ranges)
        assertTrue(ByteRanges.isComplete(ranges, 30))
    }

    @Test
    fun windowIsAlignedAndCapped() {
        val chunk = ByteRanges.VIDEO_CHUNK_BYTES
        val window = ByteRanges.window(3 * chunk + 100, 10 * chunk)
        assertEquals(3 * chunk, window.start)
        assertEquals(5 * chunk - 1, window.end)
        assertEquals(ByteRange(9 * chunk, 10 * chunk - 1), ByteRanges.window(9 * chunk + 5, 10 * chunk))
    }

    @Test
    fun gapsSkipCoveredBytes() {
        val ranges = listOf(ByteRange(0, 99), ByteRange(200, 299))
        assertEquals(100L, ByteRanges.firstGap(ranges, 0, 400))
        assertEquals(ByteRange(100, 199), ByteRanges.missingIn(ranges, ByteRange(50, 250)))
        assertNull(ByteRanges.missingIn(ranges, ByteRange(0, 99)))
        assertEquals(50L, ByteRanges.coveredFrom(ranges, 50))
    }

    @Test
    fun contentRangeParsing() {
        assertEquals(1000L, ByteRanges.parseContentRangeTotal("bytes 0-99/1000"))
        assertEquals(100L, ByteRanges.parseContentRangeStart("bytes 100-199/1000"))
        assertNull(ByteRanges.parseContentRangeTotal("bytes */0"))
    }
}
