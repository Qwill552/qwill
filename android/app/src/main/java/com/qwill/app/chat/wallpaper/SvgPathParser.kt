package com.qwill.app.chat.wallpaper

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tan

sealed class PathOp {
    data class MoveTo(val x: Float, val y: Float) : PathOp()

    data class LineTo(val x: Float, val y: Float) : PathOp()

    data class CubicTo(val x1: Float, val y1: Float, val x2: Float, val y2: Float, val x: Float, val y: Float) : PathOp()

    data class QuadTo(val x1: Float, val y1: Float, val x: Float, val y: Float) : PathOp()

    object Close : PathOp()
}

class SvgPathException(message: String) : IllegalArgumentException(message)

object SvgPathParser {
    fun parse(data: String): List<PathOp> = Reader(data).run()

    private class Reader(private val text: String) {
        private var index = 0
        private val ops = ArrayList<PathOp>()
        private var x = 0f
        private var y = 0f
        private var startX = 0f
        private var startY = 0f
        private var lastControlX = 0f
        private var lastControlY = 0f
        private var lastCommand = ' '

        fun run(): List<PathOp> {
            var command = ' '
            while (true) {
                skipSeparators()
                if (index >= text.length) break
                val char = text[index]
                if (char.isLetter()) {
                    command = char
                    index++
                } else if (command == ' ') {
                    throw SvgPathException("путь начинается не с команды: $index")
                } else if (command == 'M') {
                    command = 'L'
                } else if (command == 'm') {
                    command = 'l'
                } else if (command == 'Z' || command == 'z') {
                    throw SvgPathException("число после Z: $index")
                }
                apply(command)
            }
            return ops
        }

        private fun apply(command: Char) {
            val relative = command.isLowerCase()
            val baseX = if (relative) x else 0f
            val baseY = if (relative) y else 0f
            when (command.uppercaseChar()) {
                'M' -> {
                    x = baseX + number()
                    y = baseY + number()
                    startX = x
                    startY = y
                    ops.add(PathOp.MoveTo(x, y))
                }
                'L' -> {
                    x = baseX + number()
                    y = baseY + number()
                    ops.add(PathOp.LineTo(x, y))
                }
                'H' -> {
                    x = baseX + number()
                    ops.add(PathOp.LineTo(x, y))
                }
                'V' -> {
                    y = baseY + number()
                    ops.add(PathOp.LineTo(x, y))
                }
                'C' -> {
                    val x1 = baseX + number()
                    val y1 = baseY + number()
                    val x2 = baseX + number()
                    val y2 = baseY + number()
                    x = baseX + number()
                    y = baseY + number()
                    ops.add(PathOp.CubicTo(x1, y1, x2, y2, x, y))
                    lastControlX = x2
                    lastControlY = y2
                }
                'S' -> {
                    val reflect = lastCommand.uppercaseChar() == 'C' || lastCommand.uppercaseChar() == 'S'
                    val x1 = if (reflect) 2 * x - lastControlX else x
                    val y1 = if (reflect) 2 * y - lastControlY else y
                    val x2 = baseX + number()
                    val y2 = baseY + number()
                    x = baseX + number()
                    y = baseY + number()
                    ops.add(PathOp.CubicTo(x1, y1, x2, y2, x, y))
                    lastControlX = x2
                    lastControlY = y2
                }
                'Q' -> {
                    val x1 = baseX + number()
                    val y1 = baseY + number()
                    x = baseX + number()
                    y = baseY + number()
                    ops.add(PathOp.QuadTo(x1, y1, x, y))
                    lastControlX = x1
                    lastControlY = y1
                }
                'T' -> {
                    val reflect = lastCommand.uppercaseChar() == 'Q' || lastCommand.uppercaseChar() == 'T'
                    val x1 = if (reflect) 2 * x - lastControlX else x
                    val y1 = if (reflect) 2 * y - lastControlY else y
                    x = baseX + number()
                    y = baseY + number()
                    ops.add(PathOp.QuadTo(x1, y1, x, y))
                    lastControlX = x1
                    lastControlY = y1
                }
                'A' -> {
                    val rx = number()
                    val ry = number()
                    val rotation = number()
                    val large = flag()
                    val sweep = flag()
                    val endX = baseX + number()
                    val endY = baseY + number()
                    arc(x, y, rx, ry, rotation, large, sweep, endX, endY)
                    x = endX
                    y = endY
                }
                'Z' -> {
                    ops.add(PathOp.Close)
                    x = startX
                    y = startY
                }
                else -> throw SvgPathException("неизвестная команда $command")
            }
            lastCommand = command
        }

        private fun skipSeparators() {
            while (index < text.length && (text[index].isWhitespace() || text[index] == ',')) index++
        }

        private fun flag(): Boolean {
            skipSeparators()
            if (index >= text.length) throw SvgPathException("нет флага дуги")
            val char = text[index]
            if (char != '0' && char != '1') throw SvgPathException("флаг дуги не 0/1: $index")
            index++
            return char == '1'
        }

        private fun number(): Float {
            skipSeparators()
            val start = index
            if (index < text.length && (text[index] == '+' || text[index] == '-')) index++
            var digits = 0
            while (index < text.length && text[index].isDigit()) {
                index++
                digits++
            }
            if (index < text.length && text[index] == '.') {
                index++
                while (index < text.length && text[index].isDigit()) {
                    index++
                    digits++
                }
            }
            if (digits == 0) throw SvgPathException("ожидалось число: $start")
            if (index < text.length && (text[index] == 'e' || text[index] == 'E')) {
                val mark = index
                index++
                if (index < text.length && (text[index] == '+' || text[index] == '-')) index++
                var exponent = 0
                while (index < text.length && text[index].isDigit()) {
                    index++
                    exponent++
                }
                if (exponent == 0) index = mark
            }
            return text.substring(start, index).toFloat()
        }

        private fun arc(x0: Float, y0: Float, rxIn: Float, ryIn: Float, angle: Float, large: Boolean, sweep: Boolean, x1: Float, y1: Float) {
            if (x0 == x1 && y0 == y1) return
            var rx = abs(rxIn.toDouble())
            var ry = abs(ryIn.toDouble())
            if (rx == 0.0 || ry == 0.0) {
                ops.add(PathOp.LineTo(x1, y1))
                return
            }
            val phi = Math.toRadians(angle.toDouble())
            val cosPhi = cos(phi)
            val sinPhi = sin(phi)
            val dx = (x0 - x1) / 2.0
            val dy = (y0 - y1) / 2.0
            val px = cosPhi * dx + sinPhi * dy
            val py = -sinPhi * dx + cosPhi * dy
            val lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry)
            if (lambda > 1) {
                val scale = sqrt(lambda)
                rx *= scale
                ry *= scale
            }
            val numerator = rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px
            val denominator = rx * rx * py * py + ry * ry * px * px
            var factor = sqrt(maxOf(0.0, numerator / denominator))
            if (large == sweep) factor = -factor
            val cxPrime = factor * rx * py / ry
            val cyPrime = -factor * ry * px / rx
            val cx = cosPhi * cxPrime - sinPhi * cyPrime + (x0 + x1) / 2.0
            val cy = sinPhi * cxPrime + cosPhi * cyPrime + (y0 + y1) / 2.0
            val startAngle = vectorAngle(1.0, 0.0, (px - cxPrime) / rx, (py - cyPrime) / ry)
            var delta = vectorAngle((px - cxPrime) / rx, (py - cyPrime) / ry, (-px - cxPrime) / rx, (-py - cyPrime) / ry)
            if (!sweep && delta > 0) delta -= 2 * PI
            if (sweep && delta < 0) delta += 2 * PI
            val segments = maxOf(1, ceil(abs(delta) / (PI / 2)).toInt())
            val step = delta / segments
            val handle = 4.0 / 3.0 * tan(step / 4)
            var theta = startAngle
            for (segment in 0 until segments) {
                val cos1 = cos(theta)
                val sin1 = sin(theta)
                val theta2 = theta + step
                val cos2 = cos(theta2)
                val sin2 = sin(theta2)
                val e1x = cos1 - handle * sin1
                val e1y = sin1 + handle * cos1
                val e2x = cos2 + handle * sin2
                val e2y = sin2 - handle * cos2
                val endX = if (segment == segments - 1) x1.toDouble() else map(cos2, sin2, rx, ry, cosPhi, sinPhi, cx, cy, true)
                val endY = if (segment == segments - 1) y1.toDouble() else map(cos2, sin2, rx, ry, cosPhi, sinPhi, cx, cy, false)
                ops.add(
                    PathOp.CubicTo(
                        map(e1x, e1y, rx, ry, cosPhi, sinPhi, cx, cy, true).toFloat(),
                        map(e1x, e1y, rx, ry, cosPhi, sinPhi, cx, cy, false).toFloat(),
                        map(e2x, e2y, rx, ry, cosPhi, sinPhi, cx, cy, true).toFloat(),
                        map(e2x, e2y, rx, ry, cosPhi, sinPhi, cx, cy, false).toFloat(),
                        endX.toFloat(),
                        endY.toFloat(),
                    ),
                )
                theta = theta2
            }
        }

        private fun map(ux: Double, uy: Double, rx: Double, ry: Double, cosPhi: Double, sinPhi: Double, cx: Double, cy: Double, xAxis: Boolean): Double {
            val sx = ux * rx
            val sy = uy * ry
            return if (xAxis) cosPhi * sx - sinPhi * sy + cx else sinPhi * sx + cosPhi * sy + cy
        }

        private fun vectorAngle(ux: Double, uy: Double, vx: Double, vy: Double): Double {
            val dot = ux * vx + uy * vy
            val length = sqrt(ux * ux + uy * uy) * sqrt(vx * vx + vy * vy)
            val angle = acos((dot / length).coerceIn(-1.0, 1.0))
            return if (ux * vy - uy * vx < 0) -angle else angle
        }
    }
}
