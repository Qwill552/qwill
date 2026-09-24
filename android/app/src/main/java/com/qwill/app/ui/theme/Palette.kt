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
}
