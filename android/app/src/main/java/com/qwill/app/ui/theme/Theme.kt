package com.qwill.app.ui.theme

import android.content.Context
import android.content.res.Configuration

enum class ThemePreference(val key: String) {
    LIGHT("light"),
    DARK("dark"),
    SYSTEM("system"),
}

fun interface ThemeListener {
    fun onThemeChanged()
}

object Theme {
    private const val PREFS = "qwill.appearance"
    private const val KEY_THEME = "theme"
    private const val KEY_FONT_SIZE = "fontSize"

    var preference: ThemePreference = ThemePreference.SYSTEM
        private set
    var fontSize: FontSize = FontSize.MEDIUM
        private set
    var palette: Palette = Palette.light
        private set

    val isDark: Boolean get() = palette.isDark

    private var systemDark = false
    private val listeners = ArrayList<ThemeListener>()

    fun init(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val storedTheme = prefs.getString(KEY_THEME, null)
        val storedSize = prefs.getString(KEY_FONT_SIZE, null)
        preference = ThemePreference.entries.firstOrNull { it.key == storedTheme } ?: ThemePreference.SYSTEM
        fontSize = FontSize.entries.firstOrNull { it.key == storedSize } ?: FontSize.MEDIUM
        systemDark = isNight(context.resources.configuration)
        palette = resolve()
    }

    fun setPreference(context: Context, value: ThemePreference) {
        if (value == preference) return
        preference = value
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_THEME, value.key).apply()
        update(force = false)
    }

    fun setFontSize(context: Context, value: FontSize) {
        if (value == fontSize) return
        fontSize = value
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_FONT_SIZE, value.key).apply()
        update(force = true)
    }

    fun onConfigurationChanged(configuration: Configuration) {
        val dark = isNight(configuration)
        if (dark == systemDark) return
        systemDark = dark
        update(force = false)
    }

    fun textSize(scale: Float): Float = fontSize.base * scale

    fun addListener(listener: ThemeListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: ThemeListener) {
        listeners.remove(listener)
    }

    private fun update(force: Boolean) {
        val next = resolve()
        if (next === palette && !force) return
        palette = next
        for (listener in listeners.toList()) listener.onThemeChanged()
    }

    private fun resolve(): Palette = when (preference) {
        ThemePreference.LIGHT -> Palette.light
        ThemePreference.DARK -> Palette.dark
        ThemePreference.SYSTEM -> if (systemDark) Palette.dark else Palette.light
    }

    private fun isNight(configuration: Configuration): Boolean =
        (configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
}
