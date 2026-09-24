package com.qwill.app.ui.theme

import android.content.res.AssetManager
import android.graphics.Typeface

enum class FontWeight(val value: Int) {
    REGULAR(400),
    MEDIUM(500),
    SEMIBOLD(600),
    BOLD(700),
    EXTRABOLD(800),
}

object Fonts {
    const val MESSAGE_FEATURES = "'cv05' 1, 'ss03' 1"

    private lateinit var assets: AssetManager
    private val display = HashMap<FontWeight, Typeface>()
    private val message = HashMap<FontWeight, Typeface>()

    fun init(assetManager: AssetManager) {
        assets = assetManager
    }

    fun display(weight: FontWeight = FontWeight.REGULAR): Typeface =
        display.getOrPut(weight) { Typeface.createFromAsset(assets, "fonts/golos_text_${weight.value}.ttf") }

    fun message(weight: FontWeight = FontWeight.REGULAR): Typeface {
        val available = if (weight == FontWeight.EXTRABOLD) FontWeight.BOLD else weight
        return message.getOrPut(available) { Typeface.createFromAsset(assets, "fonts/inter_${available.value}.ttf") }
    }
}

enum class FontSize(val key: String, val base: Float) {
    SMALL("small", 13f),
    MEDIUM("medium", 15f),
    LARGE("large", 17f),
}

object TextScale {
    const val WORDMARK = 1.35f
    const val DISPLAY_TITLE = 1.75f
    const val SCREEN_TITLE = 1.1f
    const val NAME = 1f
    const val META = 0.93f
    const val CAPTION = 0.82f
    const val MESSAGE = 1f
    const val TIME = 0.82f
    const val TAB = 0.68f
    const val LINE_HEIGHT = 1.45f
}
