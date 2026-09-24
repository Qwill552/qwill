package com.qwill.app.stand

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.text.InputType
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
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
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class SessionPanel(private val context: Context, private val guid: Int) {
    private val texts = ArrayList<Pair<TextView, Boolean>>()
    private val fields = ArrayList<EditText>()
    private val buttons = ArrayList<Pair<TextView, Boolean>>()
    private val stateLine: TextView
    private val resultLine: TextView
    private val username: EditText
    private val password: EditText
    private val listener = SessionStateListener { showState(it) }

    val view: LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        val pad = context.dpInt(Dimens.CARD_INSET)
        setPadding(pad, pad, pad, pad)
    }

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

    fun applyAppearance() {
        val palette = Theme.palette
        view.background = cardBackground(context)
        for ((text, secondary) in texts) {
            text.setTextColor(if (secondary) palette.textSecondary else palette.textPrimary)
        }
        for (field in fields) {
            field.setTextColor(palette.textPrimary)
            field.setHintTextColor(palette.textTertiary)
            field.background = GradientDrawable().apply {
                cornerRadius = context.dp(Dimens.RADIUS_MD)
                setColor(palette.surface3)
            }
            field.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.NAME))
        }
        for ((button, primary) in buttons) {
            button.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.META))
            button.setTextColor(if (primary) palette.textOnPrimary else palette.textPrimary)
            button.background = ripple(
                if (primary) palette.primary else palette.surface3,
                context.dp(Dimens.RADIUS_MD),
                withAlpha(if (primary) palette.textOnPrimary else palette.textPrimary, 0.16f),
            )
        }
        for ((text, _) in texts) text.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(scaleOf(text)))
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

    private fun label(value: String, scale: Float, weight: FontWeight, secondary: Boolean): TextView =
        TextView(context).apply {
            text = value
            typeface = Fonts.display(weight)
            includeFontPadding = false
            tag = scale
            texts.add(this to secondary)
        }

    private fun field(hint: String, type: Int): EditText = EditText(context).apply {
        this.hint = hint
        inputType = type
        isSingleLine = true
        typeface = Fonts.display(FontWeight.REGULAR)
        val padX = context.dpInt(Dimens.SPACE_3)
        setPadding(padX, 0, padX, 0)
        fields.add(this)
    }

    private fun button(value: String, primary: Boolean, onClick: () -> Unit): TextView = TextView(context).apply {
        text = value
        gravity = Gravity.CENTER
        typeface = Fonts.display(FontWeight.SEMIBOLD)
        isFocusable = true
        setOnClickListener { onClick() }
        buttons.add(this to primary)
    }

    private fun pair(first: TextView, second: TextView): LinearLayout = LinearLayout(context).apply {
        orientation = LinearLayout.HORIZONTAL
        addView(first, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
        addView(
            second,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply {
                leftMargin = context.dpInt(Dimens.SPACE_2)
            },
        )
    }

    private fun scaleOf(text: TextView): Float = text.tag as? Float ?: TextScale.CAPTION

    private fun rowParams(top: Float): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = context.dpInt(top)
        }

    private fun fieldParams(top: Float): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(Dimens.TAP_MIN)).apply {
            topMargin = context.dpInt(top)
        }
}
