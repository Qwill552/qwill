package com.qwill.app.chat.wallpaper

import com.qwill.app.files.DevicePreferences

class PatternShape(
    val ops: List<PathOp>,
    val stroke: Boolean,
    val fill: Boolean,
    val strokeWidth: Float,
    val evenOdd: Boolean,
    val dash: FloatArray?,
    val roundCap: Boolean,
    val roundJoin: Boolean,
    val miterLimit: Float,
)

class PatternData(val width: Float, val height: Float, val shapes: List<PatternShape>)

object PatternSvg {
    private val SVG_TAG = Regex("<svg\\b([^>]*)>")
    private val PATH_TAG = Regex("<path\\b([^>]*?)/?>")
    private val ATTRIBUTE = Regex("([a-zA-Z-]+)=\"([^\"]*)\"")
    private val VIEW_BOX = Regex("[\\s,]+")

    fun parse(svg: String): PatternData {
        val root = SVG_TAG.find(svg)?.groupValues?.get(1).orEmpty()
        val rootAttributes = attributes(root)
        val box = rootAttributes["viewBox"]?.trim()?.split(VIEW_BOX)?.mapNotNull { it.toFloatOrNull() }
        val width = box?.getOrNull(2) ?: Wallpapers.TILE_WIDTH
        val height = box?.getOrNull(3) ?: Wallpapers.TILE_HEIGHT
        val inherited = Style.from(rootAttributes, Style.INITIAL)
        val shapes = PATH_TAG.findAll(svg).mapNotNull { match ->
            val own = attributes(match.groupValues[1])
            val data = own["d"] ?: return@mapNotNull null
            val style = Style.from(own, inherited)
            PatternShape(
                ops = SvgPathParser.parse(data),
                stroke = style.stroke,
                fill = style.fill,
                strokeWidth = style.strokeWidth,
                evenOdd = style.evenOdd,
                dash = style.dash,
                roundCap = style.roundCap,
                roundJoin = style.roundJoin,
                miterLimit = style.miterLimit,
            )
        }.toList()
        return PatternData(width, height, shapes)
    }

    private fun attributes(source: String): Map<String, String> =
        ATTRIBUTE.findAll(source).associate { it.groupValues[1] to it.groupValues[2] }

    private class Style(
        val stroke: Boolean,
        val fill: Boolean,
        val strokeWidth: Float,
        val evenOdd: Boolean,
        val dash: FloatArray?,
        val roundCap: Boolean,
        val roundJoin: Boolean,
        val miterLimit: Float,
    ) {
        companion object {
            val INITIAL = Style(stroke = false, fill = true, strokeWidth = 1f, evenOdd = false, dash = null, roundCap = false, roundJoin = false, miterLimit = 4f)

            fun from(attributes: Map<String, String>, parent: Style): Style = Style(
                stroke = attributes["stroke"]?.let { it != "none" } ?: parent.stroke,
                fill = attributes["fill"]?.let { it != "none" } ?: parent.fill,
                strokeWidth = attributes["stroke-width"]?.toFloatOrNull() ?: parent.strokeWidth,
                evenOdd = attributes["fill-rule"]?.let { it == "evenodd" } ?: parent.evenOdd,
                dash = attributes["stroke-dasharray"]?.let(::dashOf) ?: parent.dash,
                roundCap = attributes["stroke-linecap"]?.let { it == "round" } ?: parent.roundCap,
                roundJoin = attributes["stroke-linejoin"]?.let { it == "round" } ?: parent.roundJoin,
                miterLimit = attributes["stroke-miterlimit"]?.toFloatOrNull() ?: parent.miterLimit,
            )

            private fun dashOf(value: String): FloatArray? {
                if (value == "none") return null
                val parts = value.trim().split(Regex("[\\s,]+")).mapNotNull { it.toFloatOrNull() }
                if (parts.isEmpty() || parts.all { it == 0f }) return null
                val even = if (parts.size % 2 == 0) parts else parts + parts
                return even.toFloatArray()
            }
        }
    }
}

class RadialLayer(
    val widthShare: Float,
    val heightShare: Float,
    val atX: Float,
    val atY: Float,
    val from: Int,
    val to: Int,
)

class GradientSpec(val base: Int, val layers: List<RadialLayer>)

object Wallpapers {
    const val TILE_WIDTH = 375f
    const val TILE_HEIGHT = 812f
    const val DEFAULT_PATTERN = "cats"
    const val DEFAULT_GRADIENT = "default"
    const val SUMMER = "summer"

    val PATTERNS: List<String> = listOf(
        "cats", "free-time", "sport", "t-city", "magic", "magic-2", "magic-potion", "space", "space-cat", "fun-space",
        "cartoon-space", "star-wars", "star-wars-2", "renovation", "food", "sweets", "sweet-love", "love", "wizard-world",
        "unicorn", "zoo", "woodland", "sea-world", "snowflakes", "christmas", "halloween", "witch", "characters", "games",
        "games-2", "sightseeing", "richness",
    )

    val GRADIENTS: List<String> = listOf(DEFAULT_GRADIENT, SUMMER)

    fun patternId(preferences: DevicePreferences): String {
        val stored = preferences.wallpaperPattern()
        return if (stored in PATTERNS) stored!! else DEFAULT_PATTERN
    }

    fun gradientId(preferences: DevicePreferences): String {
        val stored = preferences.wallpaperGradient()
        return if (stored in GRADIENTS) stored!! else DEFAULT_GRADIENT
    }

    fun assetOf(patternId: String): String = "wallpaper/patterns/$patternId.svg"

    fun gradient(id: String, dark: Boolean): GradientSpec = when {
        id == SUMMER -> SUMMER_SPEC
        dark -> DEFAULT_DARK
        else -> DEFAULT_LIGHT
    }

    private fun rgb(value: Int): Int = (0xFF shl 24) or (value and 0xFFFFFF)

    private fun rgba(value: Int, alpha: Float): Int = (Math.round(alpha * 255f).coerceIn(0, 255) shl 24) or (value and 0xFFFFFF)

    private val DEFAULT_LIGHT = GradientSpec(
        base = rgb(0xC1E1FC),
        layers = listOf(
            RadialLayer(0.768f, 0.8787f, 1f, 1f, rgb(0xDDE9CE), rgba(0xDDE9CE, 0f)),
            RadialLayer(0.8756f, 0.5969f, 0f, 1f, rgb(0xA5B3F9), rgba(0xA5B3F9, 0f)),
            RadialLayer(0.8581f, 0.7746f, 0f, 0.1268f, rgb(0xE7CCFB), rgba(0xE7CCFB, 0f)),
        ),
    )

    private val DEFAULT_DARK = GradientSpec(
        base = rgb(0x111233),
        layers = listOf(
            RadialLayer(1.0751f, 0.7248f, 0f, 1f, rgb(0x21414E), rgba(0x21414E, 0f)),
            RadialLayer(1.2772f, 0.7303f, 1f, 0f, rgb(0x39305A), rgba(0x39305A, 0f)),
        ),
    )

    private val SUMMER_SPEC = GradientSpec(
        base = rgb(0xE2C27A),
        layers = listOf(
            RadialLayer(0.6598f, 0.7549f, 0f, 1f, rgba(0xEEE492, 0.72f), rgba(0xEEE492, 0f)),
            RadialLayer(0.768f, 0.8787f, 1f, 1f, rgba(0xE0A676, 0.86f), rgba(0xE0A676, 0.224f)),
            RadialLayer(1.2547f, 0.7759f, 0f, 0.1576f, rgb(0xFF7CB2), rgba(0xE6A2BE, 0f)),
        ),
    )
}
