package com.qwill.app.chat.composer

import com.qwill.app.chat.bottom.IslandMotion
import com.qwill.app.chat.selection.EditRules
import com.qwill.app.chat.selection.ReplyRules
import com.qwill.app.chat.selection.SwipeReply
import com.qwill.app.database.ME
import com.qwill.app.database.PEER
import com.qwill.app.database.message
import com.qwill.app.model.AttachmentDto
import com.qwill.app.model.ChatType
import com.qwill.app.model.FileDto
import com.qwill.app.model.MessageCallDto
import com.qwill.app.model.MessageForwardPreviewDto
import com.qwill.app.model.MessageType
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LongTextTest {
    @Test
    fun limitAndShorterStayWhole() {
        val exact = "а".repeat(4096)
        assertEquals(listOf(exact), LongText.split(exact))
        assertEquals(listOf("коротко"), LongText.split("  коротко  "))
    }

    @Test
    fun cutsAtBlankLineFirst() {
        val first = "а".repeat(3900) + "\n\n" + "б".repeat(50) + "\n" + "в".repeat(50)
        val text = first + " " + "г".repeat(500)
        val parts = LongText.split(text)
        assertEquals("а".repeat(3900), parts[0])
        assertTrue(parts[1].startsWith("б"))
    }

    @Test
    fun cutsAtLineBreakWithoutBlankLine() {
        val text = "а".repeat(4000) + "\n" + "б".repeat(200)
        assertEquals(listOf("а".repeat(4000), "б".repeat(200)), LongText.split(text))
    }

    @Test
    fun cutsAfterSentenceBeforeBareSpace() {
        val text = "а".repeat(3900) + ". " + "б".repeat(100) + " " + "в".repeat(200)
        val parts = LongText.split(text)
        assertEquals("а".repeat(3900) + ".", parts[0])
        assertEquals("б".repeat(100) + " " + "в".repeat(200), parts[1])
    }

    @Test
    fun cutsAtSpaceWhenNothingBetter() {
        val text = "а".repeat(4000) + " " + "б".repeat(200)
        assertEquals(listOf("а".repeat(4000), "б".repeat(200)), LongText.split(text))
    }

    @Test
    fun cutsExactlyAtLimitWhenNothingWithinReach() {
        val text = "а".repeat(3700) + " " + "б".repeat(1000)
        val parts = LongText.split(text)
        assertEquals(4096, parts[0].length)
        assertEquals(text.length - 4096, parts[1].length)
    }

    @Test
    fun searchStopsAtThreeHundredBack() {
        val text = "а".repeat(3796) + " " + "б".repeat(1000)
        assertEquals(3796, LongText.split(text)[0].length)
        val far = "а".repeat(3795) + " " + "б".repeat(1000)
        assertEquals(4096, LongText.split(far)[0].length)
    }

    @Test
    fun partsAreTrimmed() {
        val text = "а".repeat(4090) + "      \n\n     " + "б".repeat(10)
        assertEquals(listOf("а".repeat(4090), "б".repeat(10)), LongText.split(text))
    }

    @Test
    fun surrogatePairIsNotSplit() {
        val text = "а".repeat(4095) + "😀" + "б".repeat(10)
        val parts = LongText.split(text)
        assertEquals(4095, parts[0].length)
        assertTrue(parts[1].startsWith("😀"))
    }
}

class MentionQueryTest {
    @Test
    fun atTextStart() {
        assertEquals(MentionQueryMatch(0, 4, "ива"), MentionQuery.find("@ива", 4, 4))
    }

    @Test
    fun afterSpaceAndLineBreak() {
        assertEquals("bo", MentionQuery.find("привет @bo", 10, 10)?.query)
        assertEquals("", MentionQuery.find("строка\n@", 8, 8)?.query)
    }

    @Test
    fun insideWordIsNotQuery() {
        assertNull(MentionQuery.find("a@b", 3, 3))
    }

    @Test
    fun queryMayHoldSpace() {
        assertEquals("Иван П", MentionQuery.find("@Иван П", 7, 7)?.query)
    }

    @Test
    fun trailingSpaceEndsQuery() {
        assertNull(MentionQuery.find("@bob ", 5, 5))
    }

    @Test
    fun selectionIsNotCursor() {
        assertNull(MentionQuery.find("@bob", 1, 4))
    }

    @Test
    fun cursorBeforeAtFindsNothing() {
        assertNull(MentionQuery.find("@bob", 0, 0))
    }

    @Test
    fun lineBreakStopsSearch() {
        assertNull(MentionQuery.find("@bo\nb", 5, 5))
    }
}

class MentionRulesTest {
    @Test
    fun nickInTextIsMention() {
        assertTrue(MentionRules.mentionsMe(message(1, content = "глянь @Alice_1"), ChatType.GROUP, ME, "alice_1", null))
    }

    @Test
    fun replyToMineIsMention() {
        assertTrue(MentionRules.mentionsMe(message(1, content = "ответ"), ChatType.GROUP, ME, "alice", ME))
    }

    @Test
    fun ownMessageIsNotMention() {
        assertFalse(MentionRules.mentionsMe(message(1, content = "@alice", sender = ME), ChatType.GROUP, ME, "alice", ME))
    }

    @Test
    fun privateChatHasNoMentions() {
        assertFalse(MentionRules.mentionsMe(message(1, content = "@alice"), ChatType.PRIVATE, ME, "alice", ME))
    }

    @Test
    fun someoneElsesNickIsNotMine() {
        assertFalse(MentionRules.mentionsMe(message(1, content = "@bobby"), ChatType.GROUP, ME, "alice", PEER))
        assertFalse(MentionRules.mentionsMe(message(1, content = "почта a@alice.ru"), ChatType.GROUP, ME, "alice", null))
    }
}

class DraftsTest {
    private class MemoryStorage : DraftsStorage {
        val values = HashMap<String, String>()
        var writes = 0

        override fun read(userId: String): String? = values[userId]

        override fun write(userId: String, value: String) {
            writes++
            values[userId] = value
        }

        override fun clear() {
            values.clear()
        }
    }

    private val storage = MemoryStorage()
    private var now = 1_000L
    private var user: String? = "u1"
    private val drafts = Drafts(storage, { now }) { user }

    @Test
    fun emptyWithoutReplyIsRemoved() {
        drafts.save("c1", "текст", null)
        assertTrue(drafts.save("c1", "   ", null))
        assertNull(drafts["c1"])
    }

    @Test
    fun replyAloneIsKept() {
        drafts.save("c1", "", message(7))
        assertEquals(7L, drafts["c1"]?.replyTo?.id)
    }

    @Test
    fun sameDraftKeepsItsDate() {
        drafts.save("c1", "текст", message(7))
        now = 5_000L
        assertFalse(drafts.save("c1", "текст", message(7)))
        assertEquals(1_000L, drafts["c1"]?.date)
        assertEquals(1, storage.writes)
        assertTrue(drafts.save("c1", "текст!", message(7)))
        assertEquals(5_000L, drafts["c1"]?.date)
    }

    @Test
    fun survivesReload() {
        drafts.save("c1", "текст", null)
        val again = Drafts(storage, { now }) { user }
        assertEquals("текст", again["c1"]?.text)
    }

    @Test
    fun clearWipesEverything() {
        drafts.save("c1", "текст", null)
        drafts.clear()
        assertNull(drafts["c1"])
        assertTrue(storage.values.isEmpty())
    }

    @Test
    fun accountsAreSeparate() {
        drafts.save("c1", "первый", null)
        user = "u2"
        assertNull(drafts["c1"])
        drafts.save("c1", "второй", null)
        user = "u1"
        assertEquals("первый", drafts["c1"]?.text)
    }

    @Test
    fun listenersHearChanges() {
        val heard = ArrayList<String>()
        drafts.addListener { heard.add(it) }
        drafts.save("c1", "текст", null)
        drafts.remove("c1")
        assertEquals(listOf("c1", "c1"), heard)
    }
}

class EditRulesTest {
    private val own = message(5, content = "текст", sender = ME)

    @Test
    fun ownTextIsEditable() {
        assertTrue(EditRules.canEdit(own, ME))
    }

    @Test
    fun foreignIsNot() {
        assertFalse(EditRules.canEdit(message(5), ME))
        assertFalse(EditRules.canEdit(own, null))
    }

    @Test
    fun deletedAndPendingAreNot() {
        assertFalse(EditRules.canEdit(message(5, sender = ME, deleted = true), ME))
        assertFalse(EditRules.canEdit(own.copy(id = -100), ME))
    }

    @Test
    fun attachmentForwardAndCallAreNot() {
        assertFalse(EditRules.canEdit(own.copy(attachment = AttachmentDto(id = "a", file = FileDto("f", "image/jpeg"))), ME))
        assertFalse(EditRules.canEdit(own.copy(forwardedFrom = MessageForwardPreviewDto(1, "Кто-то")), ME))
        assertFalse(EditRules.canEdit(own.copy(type = MessageType.CALL, call = MessageCallDto(id = "c")), ME))
    }

    @Test
    fun replyNeedsWritableChatAndRealMessage() {
        assertTrue(ReplyRules.canReply(message(5), true))
        assertFalse(ReplyRules.canReply(message(5), false))
        assertFalse(ReplyRules.canReply(message(5, deleted = true), true))
        assertFalse(ReplyRules.canReply(message(5).copy(id = -1), true))
        assertFalse(ReplyRules.canReply(message(5).copy(type = MessageType.ANNOUNCEMENT), true))
    }
}

class SwipeReplyTest {
    private val start = 24f

    @Test
    fun startsLeftPastSlopAndMostlyHorizontal() {
        assertTrue(SwipeReply.shouldStart(-24f, 7f, start))
        assertFalse(SwipeReply.shouldStart(-23f, 0f, start))
        assertFalse(SwipeReply.shouldStart(24f, 0f, start))
        assertFalse(SwipeReply.shouldStart(-30f, 10f, start))
    }

    @Test
    fun offsetIsClampedToLimit() {
        assertEquals(-80f, SwipeReply.offset(-200f, 80f))
        assertEquals(0f, SwipeReply.offset(40f, 80f))
        assertEquals(-35f, SwipeReply.offset(-35f, 80f))
    }

    @Test
    fun iconProgressRunsFromTwentyToFifty() {
        assertEquals(0f, SwipeReply.progress(-20f, 20f, 30f))
        assertEquals(0.5f, SwipeReply.progress(-35f, 20f, 30f))
        assertEquals(1f, SwipeReply.progress(-50f, 20f, 30f))
        assertEquals(1f, SwipeReply.progress(-80f, 20f, 30f))
    }

    @Test
    fun thresholdIsFifty() {
        assertFalse(SwipeReply.crossed(-49.9f, SwipeReply.THRESHOLD))
        assertTrue(SwipeReply.crossed(-50f, SwipeReply.THRESHOLD))
        assertEquals(80f, SwipeReply.LIMIT)
        assertEquals(180L, SwipeReply.RETURN_MS)
    }

    @Test
    fun ownIconTravelsHalf() {
        assertEquals(360f, SwipeReply.iconCenterX(400f, -80f, own = true))
        assertEquals(320f, SwipeReply.iconCenterX(400f, -80f, own = false))
    }
}

class IslandTest {
    @Test
    fun growKeepsPaddingUntilEnd() {
        val island = IslandMotion(48f)
        island.retarget(104f)
        island.advance(0f)
        assertEquals(48f, island.applied)
        assertEquals(0f, island.listShift)
        island.advance(0.5f)
        assertEquals(48f, island.applied)
        assertEquals(-28f, island.listShift)
        island.advance(1f)
        assertEquals(104f, island.applied)
        assertEquals(0f, island.listShift)
    }

    @Test
    fun shrinkTakesPaddingAtStart() {
        val island = IslandMotion(104f)
        island.retarget(48f)
        island.advance(0f)
        assertEquals(48f, island.applied)
        assertEquals(-56f, island.listShift)
        island.advance(0.25f)
        assertEquals(-42f, island.listShift)
        island.advance(1f)
        assertEquals(0f, island.listShift)
    }

    @Test
    fun retargetMidwayStartsFromCurrent() {
        val island = IslandMotion(48f)
        island.retarget(104f)
        island.advance(0.5f)
        assertEquals(76f, island.current)
        island.retarget(60f)
        assertEquals(48f, island.applied)
        assertEquals(-28f, island.listShift)
        island.advance(1f)
        assertEquals(60f, island.current)
        assertEquals(60f, island.applied)
        assertEquals(0f, island.listShift)
    }

    @Test
    fun retargetToLargerMidShrinkKeepsLowerPadding() {
        val island = IslandMotion(104f)
        island.retarget(48f)
        island.advance(0.5f)
        island.retarget(90f)
        assertEquals(48f, island.applied)
        assertEquals(-28f, island.listShift)
        island.advance(1f)
        assertEquals(90f, island.applied)
    }

    @Test
    fun extentCoversBothEnds() {
        val island = IslandMotion(104f)
        island.retarget(48f)
        island.advance(0.3f)
        assertEquals(104f, island.extent)
        island.advance(1f)
        assertEquals(48f, island.extent)
    }
}
