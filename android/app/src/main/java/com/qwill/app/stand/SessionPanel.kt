package com.qwill.app.stand

import android.content.Context
import android.text.InputType
import android.widget.EditText
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.auth.Requests
import com.qwill.app.auth.SessionState
import com.qwill.app.auth.SessionStateListener
import com.qwill.app.model.LoginInput
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.TextScale

class SessionPanel(context: Context, private val guid: Int) : StandPanel(context) {
    private val stateLine: TextView
    private val resultLine: TextView
    private val username: EditText
    private val password: EditText
    private val listener = SessionStateListener { showState(it) }

    init {
        view.addView(label("Сессия", TextScale.SCREEN_TITLE, FontWeight.SEMIBOLD, secondary = false))
        stateLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = true)
        view.addView(stateLine, rowParams(Dimens.SPACE_1))

        username = field("Имя пользователя", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS)
        password = field("Пароль", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        view.addView(username, fieldParams(Dimens.SPACE_3))
        view.addView(password, fieldParams(Dimens.SPACE_2))

        view.addView(pair(button("Войти", primary = true) { login() }, button("Выйти", primary = false) { logout() }), fieldParams(Dimens.SPACE_3))
        view.addView(button("Запросить профиль", primary = false) { requestProfile() }, fieldParams(Dimens.SPACE_2))
        view.addView(button("Испортить access-токен", primary = false) { corruptToken() }, fieldParams(Dimens.SPACE_2))
        view.addView(button("Проверить соединение", primary = false) { checkHealth() }, fieldParams(Dimens.SPACE_2))

        resultLine = label("", TextScale.CAPTION, FontWeight.REGULAR, secondary = false).apply { maxLines = 6 }
        view.addView(resultLine, rowParams(Dimens.SPACE_3))
    }

    fun attach() {
        QwillApplication.session.addStateListener(listener)
        showState(QwillApplication.session.state)
    }

    fun detach() {
        QwillApplication.session.removeStateListener(listener)
    }

    private fun login() {
        val input = LoginInput(username.text.toString().trim().lowercase(), password.text.toString())
        resultLine.text = "Вход…"
        QwillApplication.api.login(input, guid) { result ->
            resultLine.text = when (result) {
                is ApiResult.Success -> "Вход выполнен: ${result.value.displayName} (@${result.value.username})"
                is ApiResult.Failure -> describe(result.error)
            }
        }
    }

    private fun logout() {
        QwillApplication.api.logout()
        resultLine.text = "Выход выполнен"
    }

    private fun requestProfile() {
        resultLine.text = "Запрос профиля…"
        QwillApplication.api.send(Requests.me(), guid) { result ->
            resultLine.text = when (result) {
                is ApiResult.Success -> "Профиль: ${result.value.displayName} (@${result.value.username}) · роль ${result.value.role.name.lowercase()}"
                is ApiResult.Failure -> describe(result.error)
            }
        }
    }

    private fun corruptToken() {
        QwillApplication.session.debugCorruptAccessToken()
        resultLine.text = "access-токен в памяти заменён мусором"
    }

    private fun checkHealth() {
        resultLine.text = "Проверка соединения…"
        QwillApplication.api.send(Requests.health(), guid) { result ->
            resultLine.text = when (result) {
                is ApiResult.Success -> "Ответ 200 · ${result.value.status}"
                is ApiResult.Failure -> describe(result.error)
            }
        }
    }

    private fun describe(error: ApiException): String = when (error) {
        is ApiError -> "Ответ ${error.status} · ${error.code} · ${error.message}"
        else -> error.message.orEmpty()
    }

    private fun showState(state: SessionState) {
        stateLine.text = when (state) {
            SessionState.Anonymous -> "Anonymous"
            SessionState.Restoring -> "Restoring"
            is SessionState.Authenticated ->
                "Authenticated · confirmed: ${if (state.confirmed) "да" else "нет"} · ${state.user.displayName} (@${state.user.username})"
            is SessionState.IpBanned -> "IpBanned" + (state.user?.let { " · ${it.displayName}" } ?: "")
            is SessionState.Banned -> "Banned · ${state.message}"
        }
    }
}
