package com.qwill.app.chat

import com.qwill.app.chat.cells.BubbleGeometry
import com.qwill.app.chat.cells.BubbleScale
import com.qwill.app.database.ME
import com.qwill.app.database.PEER
import com.qwill.app.database.member
import com.qwill.app.emoji.EmojiIndexFile
import com.qwill.app.emoji.EmojiMatcher
import com.qwill.app.messenger.ManualQueue
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiJson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class BubbleLayoutTest {
    private val matcher = EmojiMatcher(
        ApiJson.decodeFromString(EmojiIndexFile.serializer(), File("../../client/public/emoji/index.json").readText(Charsets.UTF_8)).emoji,
    )

    @Test
    fun metaSitsOnLastLineWhenItFitsWithTwelveGap() {
        val fit = BubbleGeometry.placeMeta(lastLineWidth = 100f, widestLine = 150f, metaWidth = 40f, maxContentWidth = 200f, gap = 12f)
        assertTrue(fit.inline)
        assertFalse(fit.extraLine)
        assertEquals(152f, fit.contentWidth)
        val exact = BubbleGeometry.placeMeta(148f, 150f, 40f, 200f, 12f)
        assertTrue(exact.inline)
        assertEquals(200f, exact.contentWidth)
    }

    @Test
    fun metaMovesToNewLineWhenLastLineIsLong() {
        val fit = BubbleGeometry.placeMeta(lastLineWidth = 149f, widestLine = 190f, metaWidth = 40f, maxContentWidth = 200f, gap = 12f)
        assertFalse(fit.inline)
        assertTrue(fit.extraLine)
        assertEquals(190f, fit.contentWidth)
        val short = BubbleGeometry.placeMeta(20f, 20f, 40f, 50f, 12f)
        assertTrue(short.extraLine)
        assertEquals(50f, short.contentWidth)
    }

    @Test
    fun emojiOnlyUpToThree() {
        assertEquals(1, BubbleGeometry.emojiOnly("😀", matcher)!!.size)
        assertEquals(3, BubbleGeometry.emojiOnly("😀 🔥😂", matcher)!!.size)
        assertNull(BubbleGeometry.emojiOnly("😀🔥😂👍", matcher))
        assertNull(BubbleGeometry.emojiOnly("ок 😀", matcher))
        assertNull(BubbleGeometry.emojiOnly("", matcher))
        assertNull(BubbleGeometry.emojiOnly("😀", null))
    }

    @Test
    fun reactionsTakeTimeIntoTheirRow() {
        val fit = BubbleGeometry.reactionRow(
            chipWidths = floatArrayOf(50f, 50f),
            otherContentWidth = 60f,
            metaWidth = 40f,
            maxContentWidth = 300f,
            chipGap = 4f,
            chipHeight = 26f,
            metaGap = 12f,
            chipTop = 4f,
        )
        assertEquals(156f, fit.contentWidth)
        assertEquals(1, fit.flow.lines)
        assertEquals(30f, fit.chipsHeight)
        val wide = BubbleGeometry.reactionRow(floatArrayOf(50f), 250f, 40f, 300f, 4f, 26f, 12f, 4f)
        assertEquals(250f, wide.contentWidth)
    }

    @Test
    fun chipsWrapWhenRowIsFull() {
        val fit = BubbleGeometry.reactionRow(floatArrayOf(60f, 60f, 60f), 0f, 40f, 200f, 4f, 26f, 12f, 4f)
        assertEquals(200f, fit.contentWidth)
        assertEquals(2, fit.flow.lines)
        assertEquals(64f, fit.flow.xs[1])
        assertEquals(0f, fit.flow.ys[1])
        assertEquals(0f, fit.flow.xs[2])
        assertEquals(30f, fit.flow.ys[2])
        assertEquals(4f + 26f * 2 + 4f, fit.chipsHeight)
    }

    @Test
    fun textScalesWithFontSizeButChromeDoesNot() {
        for (base in listOf(13f, 15f, 17f)) {
            val scale = BubbleScale(base)
            val share = base / 15f
            assertEquals(15f * share, scale.text, 0.001f)
            assertEquals(12.3f * share, scale.meta, 0.001f)
            assertEquals(12.3f * share, scale.caption, 0.001f)
            assertEquals(12.5f * share, scale.author, 0.001f)
            assertEquals(20.1f * share, scale.line, 0.001f)
            assertEquals(48f * share, scale.emojiOnly, 0.001f)
        }
        assertEquals(8f, BubbleGeometry.PAD_TOP)
        assertEquals(12f, BubbleGeometry.PAD_X)
        assertEquals(7f, BubbleGeometry.PAD_BOTTOM)
        assertEquals(20f, BubbleGeometry.RADIUS)
        assertEquals(7f, BubbleGeometry.RADIUS_TAIL)
        assertEquals(26f, BubbleGeometry.CHIP_H)
    }

    @Test
    fun rowIsAtLeastFortyFourAndBubbleCentered() {
        assertEquals(48f, BubbleGeometry.rowHeight(30f, 1f))
        assertEquals(7f, BubbleGeometry.bubbleTop(30f, 1f))
        assertEquals(104f, BubbleGeometry.rowHeight(100f, 1f))
        assertEquals(0f, BubbleGeometry.bubbleTop(100f, 1f))
        assertEquals(0.76f * 400f, BubbleGeometry.maxBubbleWidth(400f))
        assertEquals(0.76f * 400f - 26f, BubbleGeometry.maxContentWidth(400f, 1f))
    }
}

class ReadTrackerTest {
    private val queue = ManualQueue()
    private val sent = ArrayList<Long>()
    private val tracker = ReadTracker(queue, { queue.now }) { sent.add(it) }

    @Test
    fun cursorOnlyGrows() {
        assertTrue(tracker.seen(10))
        assertFalse(tracker.seen(8))
        assertFalse(tracker.seen(10))
        queue.advance(600)
        assertTrue(tracker.seen(12))
        assertEquals(listOf(10L, 12L), sent)
    }

    @Test
    fun notMoreOftenThanHalfSecondAndLastIsDelivered() {
        tracker.seen(1)
        tracker.seen(2)
        tracker.seen(3)
        assertEquals(listOf(1L), sent)
        queue.advance(ReadTracker.MIN_INTERVAL_MS - 1)
        assertEquals(listOf(1L), sent)
        queue.advance(1)
        assertEquals(listOf(1L, 3L), sent)
    }

    @Test
    fun leavingFlushesPending() {
        tracker.seen(1)
        tracker.seen(5)
        tracker.stop()
        assertEquals(listOf(1L, 5L), sent)
        queue.advance(1000)
        assertEquals(listOf(1L, 5L), sent)
    }

    @Test
    fun pendingAndKnownCursorsDoNotCount() {
        tracker.know(20)
        assertFalse(tracker.seen(-3))
        assertFalse(tracker.seen(15))
        assertTrue(sent.isEmpty())
        assertTrue(tracker.seen(21))
        assertEquals(listOf(21L), sent)
    }

    @Test
    fun counterMeltsOnForeignInAccumulator() {
        val feed = listOf(
            MessageDto(id = 10, chatId = "c1", sender = member(PEER)),
            MessageDto(id = 11, chatId = "c1", sender = member(ME)),
            MessageDto(id = 12, chatId = "c1", sender = member(PEER)),
            MessageDto(id = 13, chatId = "c1", sender = member(PEER)),
            MessageDto(id = -1, chatId = "c1", sender = member(PEER)),
        )
        assertEquals(2, ReadTracker.unreadBetween(feed, ME, 10, 13))
        assertEquals(3, ReadTracker.unreadBetween(feed, ME, 0, 13))
        assertEquals(0, ReadTracker.unreadBetween(feed, ME, 13, 20))
    }
}
