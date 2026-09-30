package com.qwill.app.chat.bottom

import kotlin.math.max

class Tween(initial: Float) {
    var from = initial
        private set
    var to = initial
        private set
    var value = initial
        private set

    fun retarget(target: Float) {
        from = value
        to = target
    }

    fun at(progress: Float) {
        value = if (progress >= 1f) to else from + (to - from) * progress
    }

    fun jump(target: Float) {
        from = target
        to = target
        value = target
    }
}

class IslandMotion(initial: Float) {
    private val tween = Tween(initial)

    var progress = 1f
        private set

    var applied = initial
        private set

    val current: Float get() = tween.value

    val target: Float get() = tween.to

    val running: Boolean get() = progress < 1f

    val listShift: Float get() = applied - current

    val extent: Float get() = if (running) max(tween.from, tween.to) else tween.to

    fun retarget(next: Float): Boolean {
        if (next == tween.to) return false
        tween.retarget(next)
        progress = 0f
        if (next < applied) applied = next
        if (tween.from == next) finish()
        return true
    }

    fun advance(eased: Float) {
        progress = eased.coerceIn(0f, 1f)
        tween.at(progress)
        if (progress >= 1f) applied = tween.to
    }

    fun finish() {
        advance(1f)
    }

    fun jump(next: Float) {
        tween.jump(next)
        progress = 1f
        applied = next
    }
}
