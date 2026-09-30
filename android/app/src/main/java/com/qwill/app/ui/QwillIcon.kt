package com.qwill.app.ui

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import androidx.core.graphics.PathParser

enum class QwillIcon(vararg val data: String) {
    CHECK("m4.5 12.5 5 5 10-11"),
    CHECK_DOUBLE("m2 13 4.5 4.5 9-10", "m9.5 16 1.5 1.5 9-10"),
    CLOCK("M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3.5 2"),
    FORWARD("m15 14.5 5-5-5-5", "M20 9.5h-9.5A6.5 6.5 0 0 0 4 16v3.5"),
    CHEVRON_DOWN("m5 9.5 7 7 7-7"),
    CHEVRON_UP("m5 14.5 7-7 7 7"),
    SEARCH("M11 19a8 8 0 1 0 0 -16 8 8 0 0 0 0 16Z", "m21 21-4.35-4.35"),
    CALENDAR("M4.5 6.5a1 1 0 0 1 1 -1h13a1 1 0 0 1 1 1v13a1 1 0 0 1 -1 1h-13a1 1 0 0 1 -1 -1Z", "M8 3.5v4", "M16 3.5v4", "M4.5 10.5h15"),
    USER("M20 21v-2a4 4 0 0 0 -4 -4H8a4 4 0 0 0 -4 4v2", "M12 11a4 4 0 1 0 0 -8 4 4 0 0 0 0 8Z"),
    RETRY("M4 12a8 8 0 0 1 14.5-4.7", "M18.5 3.5v4.3h-4.3", "M20 12a8 8 0 0 1-14.5 4.7", "M5.5 20.5v-4.3h4.3"),
    PHONE(
        "M21 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 1.1 4.2 2 2 0 0 1 3.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L7.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z",
    ),
    VIDEO("M14 5.5H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z", "m16 10.4 5.5-3.2v9.6L16 13.6v-3.2Z"),
    FILE("M13.5 3.5H7a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V8Z", "M13.5 3.5V8h4.5"),
    MIC("M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z", "M19 11a7 7 0 0 1-14 0", "M12 18v3", "M8.5 21h7"),
    CAMERA(
        "M21 20.5H3a1.5 1.5 0 0 1-1.5-1.5V8.5A1.5 1.5 0 0 1 3 7h3.5l1.8-3h7.4l1.8 3H21a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5Z",
        "M12 17.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    ),
    IMAGE(
        "M4 4.5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z",
        "M8.5 10a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z",
        "m4 17 5.5-5.5a2 2 0 0 1 2.8 0L21 20",
    ),
    ATTACH("M21.4 11.05 12.2 20.24a6 6 0 0 1-8.48-8.49l9.19-9.19a4 4 0 0 1 5.65 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"),
    CALL_IN("M17 7 7 17", "M16.5 17H7V7.5"),
    CALL_OUT("M7 17 17 7", "M7.5 7H17v9.5"),
    CLOSE("M18 6 6 18", "m6 6 12 12"),
    BACK("M15 5 8 12l7 7"),
    MORE(
        "M10.9 5.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0 -2.2 0",
        "M10.9 12a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0 -2.2 0",
        "M10.9 18.5a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0 -2.2 0",
    ),
    LOCK("M5.5 10.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1 -1 1h-13a1 1 0 0 1 -1 -1v-8a1 1 0 0 1 1 -1Z", "M8 10.5V7a4 4 0 0 1 8 0v3.5"),
    COPY(
        "M9.5 8.5h10a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1Z",
        "M5.5 15.5h-1a1 1 0 0 1 -1 -1v-10a1 1 0 0 1 1 -1h10a1 1 0 0 1 1 1v1",
    ),
    BELL("M18 8.5a6 6 0 1 0-12 0c0 6.5-3 8.5-3 8.5h18s-3-2-3-8.5", "M13.7 21a2 2 0 0 1-3.4 0"),
    MUTE("M18 8.5a6 6 0 0 0-9.4-4.9", "M6 9.5c0 6.5-3 8.5-3 8.5h13.5", "M13.7 21a2 2 0 0 1-3.4 0", "m3 3 18 18"),
    TRASH("M3.5 6h17", "M9 6V3.5h6V6", "M18.5 6l-.9 13.6a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6", "M10 10.5v6", "M14 10.5v6"),
    MOON("M20.5 14.4A8.5 8.5 0 1 1 9.6 3.5a6.6 6.6 0 0 0 10.9 10.9Z"),
    SUN(
        "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
        "M12 2v2",
        "M12 20v2",
        "M4.2 4.2l1.4 1.4",
        "M18.4 18.4l1.4 1.4",
        "M2 12h2",
        "M20 12h2",
        "M4.2 19.8l1.4-1.4",
        "M18.4 5.6l1.4-1.4",
    ),
    ;

    val path: Path by lazy {
        Path().apply { for (part in data) addPath(PathParser.createPathFromPathData(part)) }
    }

    fun draw(canvas: Canvas, left: Float, top: Float, size: Float, color: Int, paint: Paint) {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = STROKE
        paint.strokeCap = Paint.Cap.ROUND
        paint.strokeJoin = Paint.Join.ROUND
        paint.color = color
        paint.shader = null
        val save = canvas.save()
        canvas.translate(left, top)
        val scale = size / GRID
        canvas.scale(scale, scale)
        canvas.drawPath(path, paint)
        canvas.restoreToCount(save)
    }

    companion object {
        const val GRID = 24f
        const val STROKE = 2f
    }
}
