package com.qwill.app.ui

import com.qwill.app.model.AvatarColor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertSame
import org.junit.Test

class AvatarGradientsTest {
    private val web = listOf(
        Triple("", 0, 0),
        Triple("a", 97, 1),
        Triple("chat-1", -1361632516, 4),
        Triple("cm3x9a2b10000qwerty", 1862853346, 4),
        Triple("Группа друзей", -711409622, 2),
        Triple("550e8400-e29b-41d4-a716-446655440000", 1716781005, 3),
        Triple("😀 эмодзи", -2011613053, 1),
        Triple("zzzzzzzzzzzzzzzzzzzz", 1718487168, 0),
    )

    @Test
    fun hashMatchesWeb() {
        for ((key, hash, index) in web) {
            assertEquals(key, hash, AvatarGradients.hash(key))
            assertEquals(key, index, AvatarGradients.indexFor(key))
        }
    }

    @Test
    fun personalColorWinsOverHash() {
        assertSame(AvatarGradients.ALL[2], AvatarGradients.resolve(AvatarColor.TEAL, "a"))
        assertSame(AvatarGradients.ALL[1], AvatarGradients.resolve(null, "a"))
        assertEquals(AvatarColor.entries.size, AvatarGradients.ALL.size)
    }

    @Test
    fun letterIsFirstCodePointUppercased() {
        assertEquals("Б", AvatarDrawable.letterOf("борис"))
        assertEquals("😀", AvatarDrawable.letterOf("😀 группа"))
        assertEquals("", AvatarDrawable.letterOf(""))
    }
}
