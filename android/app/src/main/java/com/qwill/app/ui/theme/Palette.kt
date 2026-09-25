package com.qwill.app.ui.theme

import kotlin.math.roundToInt

private fun rgb(value: Int): Int = (0xFF shl 24) or (value and 0xFFFFFF)

private fun rgb(red: Int, green: Int, blue: Int): Int = (0xFF shl 24) or (red shl 16) or (green shl 8) or blue

fun withAlpha(color: Int, alpha: Float): Int =
    ((alpha * 255f).roundToInt().coerceIn(0, 255) shl 24) or (color and 0xFFFFFF)

class Palette(
    val isDark: Boolean,
    val bg: Int,
    val surface: Int,
    val surface2: Int,
    val surface3: Int,
    val hoverRow: Int,
    val chatBg: Int,
    val chatPatternInk: Int,
    val messageIn: Int,
    val messageOut: Int,
    val messageOutFrom: Int,
    val messageOutTo: Int,
    val primary: Int,
    val primaryPress: Int,
    val primarySoft: Int,
    val accentFrom: Int,
    val accentTo: Int,
    val textPrimary: Int,
    val textSecondary: Int,
    val textTertiary: Int,
    val textOnPrimary: Int,
    val textOnOut: Int,
    val linkOut: Int,
    val metaOnOut: Int,
    val border: Int,
    val online: Int,
    val danger: Int,
    val dangerSoft: Int,
    val unreadBadge: Int,
    val unreadMuted: Int,
    val scrimTint: Int,
    val blobOpacity: Float,
    val pulseInk: Int,
    val pulseGlass: Int,
    val pulseDock: Int,
    val pulseCapFrom: Int,
    val pulseCapTo: Int,
    val pulseCapBorder: Int,
    val pulseBubble: Int,
    val pulseBubbleBorder: Int,
    val chromeBg: Int,
    val chromeBorder: Int,
    val chromeHighlight: Int,
    val cardBorder: Int,
    val authCardBg: Int,
    val authCardBorder: Int,
    val authCardBorderStrong: Int,
    val poster: PosterColors,
) {
    val updateLiveFrom: Int = FixedColors.updateLiveFrom
    val updateLiveTo: Int = FixedColors.updateLiveTo
    val searchHitBg: Int = primarySoft
    val searchHitInk: Int = primary
    val searchHitBgOut: Int = textOnOut
    val searchHitInkOut: Int = primaryPress
    val cardBg: Int = surface
    val sheetBg: Int = withAlpha(surface2, 0.74f)
    val sheetBorder: Int = chromeBorder
    val menuBg: Int = withAlpha(surface2, 0.70f)
    val menuBorder: Int = chromeBorder
    val menuScrimBg: Int = withAlpha(scrimTint, 0.45f)
    val scrimBg: Int = withAlpha(scrimTint, 0.30f)
    val mediaPlaceholder: Int = withAlpha(textPrimary, 0.08f)
    val scrollbarThumb: Int = withAlpha(textPrimary, 0.32f)
    val scrollbarThumbActive: Int = withAlpha(textPrimary, 0.46f)

    companion object {
        val light = Palette(
            isDark = false,
            bg = rgb(0xEEF1F6),
            surface = rgb(0xFFFFFF),
            surface2 = rgb(0xFFFFFF),
            surface3 = rgb(0xE4E9F4),
            hoverRow = rgb(0xF2F5FA),
            chatBg = rgb(0xE7EBF4),
            chatPatternInk = withAlpha(rgb(60, 70, 120), 0.18f),
            messageIn = rgb(0xFFFFFF),
            messageOut = rgb(0xDBE6FF),
            messageOutFrom = rgb(0x5B8DFF),
            messageOutTo = rgb(0x8B5CF6),
            primary = rgb(0x3D7DE0),
            primaryPress = rgb(0x2F6FE0),
            primarySoft = rgb(0xD7E3FF),
            accentFrom = rgb(0x4D8DFF),
            accentTo = rgb(0x8B5CF6),
            textPrimary = rgb(0x1C202D),
            textSecondary = rgb(0x6D7385),
            textTertiary = rgb(0x9AA0B0),
            textOnPrimary = rgb(0xFFFFFF),
            textOnOut = rgb(0xFFFFFF),
            linkOut = rgb(0xD9E8FF),
            metaOnOut = withAlpha(rgb(0xFFFFFF), 0.85f),
            border = rgb(0xE1E4EC),
            online = rgb(0x2FAE63),
            danger = rgb(0xD93A50),
            dangerSoft = rgb(0xFBEAEC),
            unreadBadge = rgb(0x4D8DFF),
            unreadMuted = rgb(0xC4CDDF),
            scrimTint = rgb(0x1C202D),
            blobOpacity = 0.42f,
            pulseInk = rgb(28, 32, 45),
            pulseGlass = rgb(22, 28, 44),
            pulseDock = rgb(255, 255, 255),
            pulseCapFrom = withAlpha(rgb(124, 88, 214), 0.15f),
            pulseCapTo = withAlpha(rgb(70, 104, 210), 0.11f),
            pulseCapBorder = withAlpha(rgb(120, 86, 210), 0.24f),
            pulseBubble = rgb(0xFFFFFF),
            pulseBubbleBorder = withAlpha(rgb(20, 26, 40), 0.09f),
            chromeBg = withAlpha(rgb(0xFFFFFF), 0.62f),
            chromeBorder = withAlpha(rgb(0xE1E4EC), 0.85f),
            chromeHighlight = withAlpha(FixedColors.lift, 0.70f),
            cardBorder = rgb(0xE1E4EC),
            authCardBg = withAlpha(rgb(0xFFFFFF), 0.45f),
            authCardBorder = withAlpha(rgb(0xFFFFFF), 0.60f),
            authCardBorderStrong = withAlpha(rgb(0xFFFFFF), 0.85f),
            poster = PosterColors.light,
        )

        val dark = Palette(
            isDark = true,
            bg = rgb(0x0A0C12),
            surface = rgb(0x141A2B),
            surface2 = rgb(0x1B2338),
            surface3 = rgb(0x232C46),
            hoverRow = rgb(0x1B2338),
            chatBg = rgb(0x0D0F18),
            chatPatternInk = withAlpha(rgb(0xFFFFFF), 0.24f),
            messageIn = rgb(0x1C2336),
            messageOut = rgb(0x6A7DE0),
            messageOutFrom = rgb(0x4D8DFF),
            messageOutTo = rgb(0xA05AFF),
            primary = rgb(0x6AA5FF),
            primaryPress = rgb(0x4D8DFF),
            primarySoft = rgb(0x1B2A4A),
            accentFrom = rgb(0x4D8DFF),
            accentTo = rgb(0xA05AFF),
            textPrimary = rgb(0xEEF1F7),
            textSecondary = rgb(0x9096A8),
            textTertiary = rgb(0x666D80),
            textOnPrimary = rgb(0xFFFFFF),
            textOnOut = rgb(0xFFFFFF),
            linkOut = rgb(0xD9E8FF),
            metaOnOut = withAlpha(rgb(0xFFFFFF), 0.85f),
            border = rgb(0x262C3C),
            online = rgb(0x3DDC84),
            danger = rgb(0xFF5D73),
            dangerSoft = rgb(0x35202C),
            unreadBadge = rgb(0x4D8DFF),
            unreadMuted = rgb(0x333C52),
            scrimTint = rgb(0x0A0C12),
            blobOpacity = 1f,
            pulseInk = rgb(238, 241, 247),
            pulseGlass = rgb(255, 255, 255),
            pulseDock = rgb(30, 36, 50),
            pulseCapFrom = withAlpha(rgb(126, 92, 214), 0.40f),
            pulseCapTo = withAlpha(rgb(77, 110, 214), 0.28f),
            pulseCapBorder = withAlpha(rgb(186, 166, 255), 0.24f),
            pulseBubble = withAlpha(rgb(0xFFFFFF), 0.08f),
            pulseBubbleBorder = withAlpha(rgb(0xFFFFFF), 0.09f),
            chromeBg = withAlpha(rgb(0x1B2338), 0.56f),
            chromeBorder = withAlpha(FixedColors.lift, 0.09f),
            chromeHighlight = withAlpha(FixedColors.lift, 0.14f),
            cardBorder = withAlpha(FixedColors.lift, 0.05f),
            authCardBg = withAlpha(rgb(30, 27, 40), 0.55f),
            authCardBorder = withAlpha(rgb(0xFFFFFF), 0.10f),
            authCardBorderStrong = withAlpha(rgb(0xFFFFFF), 0.18f),
            poster = PosterColors.dark,
        )
    }
}

class PosterColors(
    val isDark: Boolean,
    val ink: Int,
    val ink2: Int,
    val white: Int,
    val lilac: Int,
    val lav: Int,
    val violet: Int,
    val violetDeep: Int,
    val pink: Int,
    val hot: Int,
    val hotDeep: Int,
    val sky: Int,
    val mint: Int,
    val cloud1: Int,
    val cloud2: Int,
    val cloud3: Int,
    val sheet: Int,
    val sheetRoll: Int,
    val card: Int,
    val cardEdge: Int,
    val gate: Int,
    val offBg: Int,
    val offFg: Int,
    val ok: Int,
    val okDeep: Int,
    val okLit: Int,
    val face: Int,
    val faceGlint: Int,
    val paper: Int,
    val lock1: Int,
    val lock2: Int,
    val lock3: Int,
    val lockHole: Int,
    val gloss: Int,
    val star: Int,
    val ctaHover: Int,
    val toggleIcon: Int,
    val canvasStops: IntArray,
    val canvasPositions: FloatArray,
    val shadow: Int,
) {
    val cardBg: Int = withAlpha(card, 0.90f)
    val pillBg: Int = withAlpha(card, 0.78f)
    val hintBg: Int = withAlpha(card, 0.86f)
    val glossTop: Int = withAlpha(gloss, 0.55f * (gloss ushr 24) / 255f)
    val glossBottom: Int = gloss and 0xFFFFFF
    val toggleBorder: Int = if (isDark) violet else lav

    companion object {
        val light = PosterColors(
            isDark = false,
            ink = rgb(0x372A56),
            ink2 = rgb(0x6D5F93),
            white = rgb(0xFFFFFF),
            lilac = rgb(0xECE1FB),
            lav = rgb(0xD3BDF7),
            violet = rgb(0x9268EF),
            violetDeep = rgb(0x6B3BD6),
            pink = rgb(0xFFD6EA),
            hot = rgb(0xFF7FBB),
            hotDeep = rgb(0xFF5FA8),
            sky = rgb(0xC8E6FF),
            mint = rgb(0xC4F2E6),
            cloud1 = rgb(0xFFFFFF),
            cloud2 = rgb(0xF0F1FC),
            cloud3 = rgb(0xD7DCF3),
            sheet = rgb(0xEEF2FF),
            sheetRoll = rgb(0xCFD6F2),
            card = rgb(0xFFFFFF),
            cardEdge = rgb(0xFFFFFF),
            gate = rgb(0xF6F2FE),
            offBg = rgb(0xE3DCF5),
            offFg = rgb(0xA79EC6),
            ok = rgb(0x8BE3C8),
            okDeep = rgb(0x3FBF9E),
            okLit = rgb(0xFFFFFF),
            face = rgb(0x372A56),
            faceGlint = rgb(0xFFFFFF),
            paper = rgb(0xFFFFFF),
            lock1 = rgb(0xD3BDF7),
            lock2 = rgb(0x9268EF),
            lock3 = rgb(0x6B3BD6),
            lockHole = rgb(0xECE1FB),
            gloss = rgb(0xFFFFFF),
            star = rgb(0xFFFFFF),
            ctaHover = rgb(0x6B3BD6),
            toggleIcon = rgb(0x6B3BD6),
            canvasStops = intArrayOf(rgb(0xECE1FB), rgb(0xFFD6EA), rgb(0xC8E6FF), rgb(0xC4F2E6), rgb(0xECE1FB)),
            canvasPositions = floatArrayOf(0f, 0.28f, 0.56f, 0.76f, 1f),
            shadow = withAlpha(rgb(20, 24, 35), 0.14f),
        )

        val dark = PosterColors(
            isDark = true,
            ink = rgb(0xECE6FF),
            ink2 = rgb(0xA99CD4),
            white = rgb(0xFFFFFF),
            lilac = rgb(0x2F2752),
            lav = rgb(0x574A8F),
            violet = rgb(0x8A5EF0),
            violetDeep = rgb(0xC9B2FF),
            pink = rgb(0xE58FC0),
            hot = rgb(0xFF7FBB),
            hotDeep = rgb(0xFF5FA8),
            sky = rgb(0x7FB6E8),
            mint = rgb(0x7FD8C4),
            cloud1 = rgb(0xB3AED6),
            cloud2 = rgb(0xA8A3CC),
            cloud3 = rgb(0x8E89B4),
            sheet = rgb(0xACA7CB),
            sheetRoll = rgb(0xA09BC0),
            card = rgb(0x241C40),
            cardEdge = rgb(0x3F3468),
            gate = rgb(0x2C2450),
            offBg = rgb(0x332B52),
            offFg = rgb(0x7A6FA6),
            ok = rgb(0x63CFB0),
            okDeep = rgb(0x2F9B80),
            okLit = rgb(0x5CC0A4),
            face = rgb(0x241D3C),
            faceGlint = rgb(0xFFFFFF),
            paper = rgb(0xB7B2D6),
            lock1 = rgb(0x4A3A86),
            lock2 = rgb(0x453681),
            lock3 = rgb(0x3B2E70),
            lockHole = rgb(0xBDB6E0),
            gloss = 0,
            star = rgb(0xFFFFFF),
            ctaHover = rgb(0x7146D8),
            toggleIcon = rgb(0x6B3BD6),
            canvasStops = intArrayOf(rgb(0x16112B), rgb(0x241638), rgb(0x141F3C), rgb(0x13302F), rgb(0x1A1332)),
            canvasPositions = floatArrayOf(0f, 0.24f, 0.52f, 0.76f, 1f),
            shadow = withAlpha(rgb(0, 0, 0), 0.46f),
        )
    }
}

object FixedColors {
    val lift: Int = rgb(0xFFFFFF)
    val updateLiveFrom: Int = rgb(0x0DCC39)
    val updateLiveTo: Int = rgb(0x0BB6BD)

    val qrPaper: Int = rgb(0xFFFFFF)
    val qrInk: Int = rgb(0x10131C)

    val codeBg: Int = rgb(0x10131C)
    val codeInk: Int = rgb(0xD7DCEA)
    val codeInkDim: Int = rgb(0x7B8399)
    val codeBorder: Int = rgb(0x2A3145)

    val tintBlue: Int = rgb(0x4D8DFF)
    val tintViolet: Int = rgb(0xA05AFF)
    val tintOrange: Int = rgb(0xF0913E)
    val tintGreen: Int = rgb(0x3DDC84)
    val tintRed: Int = rgb(0xF0566B)
    val tintTeal: Int = rgb(0x1FB8AB)
    val tintPink: Int = rgb(0xFF6B9D)
    val tintIndigo: Int = rgb(0x6470F0)
    val tints: List<Int> = listOf(tintBlue, tintViolet, tintOrange, tintGreen, tintRed, tintTeal, tintPink, tintIndigo)

    val viewerBg: Int = rgb(0x000000)
    val viewerInk: Int = rgb(0xFFFFFF)
    val viewerInkSoft: Int = withAlpha(rgb(0xFFFFFF), 0.65f)
    val viewerChromeBg: Int = withAlpha(rgb(0x000000), 0.55f)

    val mediaMetaBg: Int = withAlpha(rgb(0x000000), 0.62f)
    val mediaMetaInk: Int = rgb(0xFFFFFF)

    val blobBlue: Int = withAlpha(rgb(77, 141, 255), 0.55f)
    val blobViolet: Int = withAlpha(rgb(160, 90, 255), 0.45f)
    val blobTeal: Int = withAlpha(rgb(0, 190, 190), 0.32f)

    val avatarBlueFrom: Int = rgb(0x4D8DFF)
    val avatarBlueTo: Int = rgb(0x2F6FE0)
    val avatarVioletFrom: Int = rgb(0xA05AFF)
    val avatarVioletTo: Int = rgb(0x6D3CE0)
    val avatarTealFrom: Int = rgb(0x00C8B4)
    val avatarTealTo: Int = rgb(0x079A8C)
    val avatarOrangeFrom: Int = rgb(0xFFB057)
    val avatarOrangeTo: Int = rgb(0xF07D2A)
    val avatarPinkFrom: Int = rgb(0xFF6B9D)
    val avatarPinkTo: Int = rgb(0xE0447A)
    val avatarGreenFrom: Int = rgb(0x3DDC84)
    val avatarGreenTo: Int = rgb(0x1FAF63)
    val avatarShadow: Int = withAlpha(rgb(0x000000), 0.9f)
    val onlineDot: Int = rgb(0x3DDC84)

    val badgeFrom: Int = rgb(0x4D8DFF)
    val badgeTo: Int = rgb(0x8B5CF6)
    val typingInk: Int = rgb(0x6AA5FF)
    val menuDanger: Int = rgb(0xFF5D73)
    val menuShadow: Int = withAlpha(rgb(0x000000), 0.7f)

    val tabActive: Int = rgb(0x4FAAFF)
    val tabShadow: Int = withAlpha(rgb(0x000000), 0.95f)

    val contactsInviteFrom: Int = rgb(0x4D8DFF)
    val contactsInviteTo: Int = rgb(0x2F6FE0)
    val contactsCallsFrom: Int = rgb(0x3DDC84)
    val contactsCallsTo: Int = rgb(0x1FAF63)

    val chipActiveFrom: Int = withAlpha(rgb(77, 141, 255), 0.92f)
    val chipActiveTo: Int = withAlpha(rgb(160, 90, 255), 0.88f)
    val chipActiveBorder: Int = withAlpha(rgb(150, 180, 255), 0.45f)
    val chipActiveShadow: Int = withAlpha(rgb(90, 120, 255), 0.9f)

    val authSkyDay: Int = rgb(0x7BD3F7)
    val authSkyNightTop: Int = rgb(0x09, 0x10, 0x24)
    val authSkyNightMid: Int = rgb(0x15, 0x22, 0x4A)
    val authSkyNightBottom: Int = rgb(0x1E, 0x33, 0x68)
    val authSun: Int = rgb(0xFFDF73)
    val authSunGlow: Int = withAlpha(rgb(0xFFDF73), 0.70f)
    val authSunRayGlow: Int = withAlpha(rgb(0xFFDF73), 0.80f)
    val authCloudDay: Int = rgb(0xFFFFFF)
    val authCloudNight: Int = rgb(0x1C, 0x2D, 0x5A)
    val authStar: Int = rgb(0xFFFFFF)
    val authDanger: Int = rgb(0xD1, 0x43, 0x43)
    val authDangerSoft: Int = withAlpha(rgb(0xD1, 0x43, 0x43), 0.10f)
}
