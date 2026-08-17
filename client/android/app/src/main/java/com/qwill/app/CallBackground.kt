package com.qwill.app

import android.content.Context
import android.graphics.Canvas

class CallBackgroundSource {
    var centerX = 0.5f
    var centerY = 0.4f
    var radius = 0.14f
}

interface CallBackgroundRenderer {
    val bufferWidth: Int

    fun render(
        canvas: Canvas,
        width: Float,
        height: Float,
        seconds: Float,
        source: CallBackgroundSource,
    )
}

enum class CallBackgroundStyle(val id: String) {
    GLOW("glow"),
    BLOBS("blobs");

    fun createRenderer(): CallBackgroundRenderer = when (this) {
        GLOW -> GlowGradientRenderer()
        BLOBS -> LegacyMeshGradientRenderer()
    }

    companion object {
        private const val PREFERENCES = "qwill.call"
        private const val KEY = "backgroundStyle"

        fun read(context: Context): CallBackgroundStyle {
            val stored = preferences(context).getString(KEY, null)
            return entries.firstOrNull { it.id == stored } ?: GLOW
        }

        fun write(context: Context, id: String): Boolean {
            val style = entries.firstOrNull { it.id == id } ?: return false
            preferences(context).edit().putString(KEY, style.id).apply()
            return true
        }

        private fun preferences(context: Context) =
            context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    }
}
