package com.qwill.app.consent

import com.qwill.app.auth.SessionState
import com.qwill.app.model.PendingConsentDto

enum class GateChange {
    NONE,
    SHOW_INSTANT,
    SHOW_ANIMATED,
    HIDE_INSTANT,
    HIDE_ANIMATED,
}

object ConsentGateRule {
    fun pendingOf(state: SessionState): PendingConsentDto? {
        val consent = when (state) {
            is SessionState.Authenticated -> state.user.pendingConsent
            is SessionState.IpBanned -> state.user?.pendingConsent
            else -> null
        }
        return consent?.takeIf { it.terms || it.privacy }
    }

    fun decide(shown: Boolean, initial: Boolean, state: SessionState): GateChange {
        val pending = pendingOf(state)
        if (pending != null) {
            return when {
                shown -> GateChange.NONE
                initial -> GateChange.SHOW_INSTANT
                else -> GateChange.SHOW_ANIMATED
            }
        }
        if (!shown) return GateChange.NONE
        return when (state) {
            is SessionState.Authenticated -> GateChange.HIDE_ANIMATED
            is SessionState.IpBanned -> if (state.user == null) GateChange.NONE else GateChange.HIDE_ANIMATED
            else -> GateChange.HIDE_INSTANT
        }
    }
}

object FlexShares {
    fun distribute(space: Int, grow: FloatArray, minimums: IntArray): IntArray {
        val widths = IntArray(grow.size)
        val frozen = BooleanArray(grow.size)
        while (true) {
            var free = space
            var weight = 0f
            for (i in grow.indices) if (frozen[i]) free -= widths[i] else weight += grow[i]
            var violated = false
            for (i in grow.indices) {
                if (frozen[i]) continue
                val share = if (weight > 0f) (free * grow[i] / weight).toInt() else 0
                if (share < minimums[i]) {
                    widths[i] = minimums[i]
                    frozen[i] = true
                    violated = true
                } else {
                    widths[i] = share
                }
            }
            if (!violated) return widths
        }
    }
}

object PosterText {
    const val WORDMARK = "Qwill"
    const val BADGE = "Важное обновление"
    const val TITLE = "Соглашение обновилось"
    const val SUBTITLE = "Новая версия вступает в силу для всех, кто пользуется Qwill."
    const val GATE_LABEL = "Я прочитал(а) новую версию"
    const val DECLINE_NARROW = "Отказываюсь"
    const val DECLINE_WIDE = "Не принимаю"
    const val ACCEPT = "Принимаю"
    const val DOC_TERMS = "Пользовательское соглашение"
    const val DOC_PRIVACY = "Политика обработки персональных данных"
    const val DONE_TITLE = "Спасибо, принято"
    const val DONE_LEDE = "Новая версия соглашения и политики сохранена в вашем профиле. Можно возвращаться к чатам."
    const val DONE_BUTTON = "Перейти в Qwill"
    const val HINT = "Листайте вниз"
    const val NETWORK_ERROR = "Не удалось сохранить согласие. Проверьте соединение."
    const val THEME_TO_LIGHT = "Включить светлую тему"
    const val THEME_TO_DARK = "Включить тёмную тему"
    const val DECLINE_TITLE = "Отказаться от соглашения?"
    const val DECLINE_TEXT =
        "Без принятия новой версии пользоваться Qwill нельзя. Вы выйдете из аккаунта, а при следующем входе вам снова предложат её принять."
    const val DECLINE_STAY = "Остаться"
    const val DECLINE_LEAVE = "Выйти"

    fun ledeFor(consent: PendingConsentDto): String {
        val tail = "Чтобы продолжить пользоваться Qwill, ознакомьтесь с новой версией и примите её заново."
        if (consent.terms && consent.privacy) {
            return "Пользовательское соглашение и Политика обработки персональных данных обновились. $tail"
        }
        if (consent.privacy) return "Политика обработки персональных данных обновилась. $tail"
        return "Пользовательское соглашение обновилось. $tail"
    }
}
