package com.qwill.app.ui.theme

import android.content.Context
import kotlin.math.ceil

fun Context.dp(value: Float): Float = value * resources.displayMetrics.density

fun Context.dpInt(value: Float): Int = ceil(dp(value).toDouble()).toInt()

object Dimens {
    const val RADIUS_SM = 10f
    const val RADIUS_MD = 14f
    const val RADIUS_BUBBLE = 20f
    const val RADIUS_CARD = 20f
    const val RADIUS_TILE = 9f

    const val SPACE_1 = 4f
    const val SPACE_2 = 8f
    const val SPACE_3 = 12f
    const val SPACE_4 = 16f
    const val SPACE_5 = 24f
    const val SPACE_6 = 32f

    const val CHROME_INSET = 8f
    const val CHROME_GAP = 8f
    const val CHROME_PAD_X = 8f
    const val CHROME_RADIUS = 26f
    const val CHROME_H = 52f
    const val CHROME_BTN = 44f
    const val TABBAR_H = 54f
    const val TABBAR_PILL_RADIUS = 18f

    const val CARD_INSET = 12f
    const val CARD_RADIUS = 18f
    const val CARD_ROW_H = 56f
    const val ICON_TILE = 30f

    const val FAB_SIZE = 56f
    const val CHIP_H = 32f
    const val SEARCH_H = 40f

    const val ROW_CHAT_H = 72f
    const val ROW_CONTACT_H = 60f
    const val AVATAR_CHAT = 54f
    const val AVATAR_CONTACT = 44f
    const val AVATAR_HEADER = 40f

    const val BUBBLE_MAX_WIDTH_FRACTION = 0.76f
    const val BUBBLE_MEDIA_MAX_W = 560f
    const val BUBBLE_MEDIA_MAX_H_FRACTION = 0.60f
    const val BUBBLE_PAD_Y = 8f
    const val BUBBLE_PAD_X = 12f

    const val PINNED_BANNER_H = 48f

    const val COMPOSER_MIN_H = 48f
    const val COMPOSER_MAX_H = 120f
    const val EMOJI_CELL = 44f
    const val EMOJI_SIZE = 34f
    const val REACTION_H = 26f

    const val SCREEN_PAD_X = 12f
    const val TAP_MIN = 44f

    const val SCROLLBAR_W = 1.5f
    const val SCROLLBAR_THUMB_H = 20f
    const val SCROLLBAR_EDGE = 3f

    const val HAIRLINE = 1f
}

object Glass {
    const val CHROME_BLUR = 14f
    const val CHROME_SATURATION = 1.9f
    const val SHEET_BLUR = 16f
    const val SHEET_SATURATION = 1.8f
    const val MENU_BLUR = 14f
    const val MENU_SATURATION = 1.8f
    const val MENU_SCRIM_BLUR = 30f
    const val SCRIM_BLUR = 14f

    const val BLOB_BLUE_BLUR = 40f
    const val BLOB_VIOLET_BLUR = 46f
    const val BLOB_TEAL_BLUR = 50f

    const val MAX_BLUR_LAYERS = 4
}
