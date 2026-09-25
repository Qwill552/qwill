package com.qwill.app.auth

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.R
import com.qwill.app.chats.ChatsScreen
import com.qwill.app.legal.LegalScreen
import com.qwill.app.model.LegalVersionsDto
import com.qwill.app.model.LoginInput
import com.qwill.app.model.PublicUser
import com.qwill.app.model.RegisterInput
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.net.ErrorCode
import com.qwill.app.net.NetworkError
import com.qwill.app.net.NoResponseError
import com.qwill.app.ui.QwillDialog
import com.qwill.app.ui.SpringMotion
import com.qwill.app.ui.fieldBackground
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.ripple
import com.qwill.app.ui.roundRect
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.ThemePreference
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class AuthScreen(private val bannedMessage: String? = null) : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    private enum class Mode { LOGIN, REGISTER }

    private class Field(
        val wrapper: LinearLayout,
        val input: EditText,
        val error: TextView,
        val background: View = input,
        val trailing: TextView? = null,
    )

    private lateinit var context: Context
    private lateinit var root: FrameLayout
    private lateinit var backdrop: SkyBackdropView
    private lateinit var celestial: CelestialView
    private lateinit var clouds: CloudsView
    private lateinit var scroll: ScrollView
    private lateinit var centerBox: LinearLayout
    private lateinit var cardBox: MaxWidthBox
    private lateinit var glass: com.qwill.app.ui.glass.GlassView
    private lateinit var logo: ImageView
    private lateinit var title: TextView
    private lateinit var formErrorText: TextView
    private lateinit var usernameField: Field
    private lateinit var displayNameField: Field
    private lateinit var passwordField: Field
    private lateinit var usernameTooltip: TextView
    private lateinit var primaryButton: TextView
    private lateinit var primaryProgress: android.widget.ProgressBar
    private lateinit var secondaryButton: TextView
    private lateinit var themeToggle: TextView
    private var consentDialog: QwillDialog? = null
    private var consentContent: ConsentContent? = null

    private var mode = Mode.LOGIN
    private var submitting = false
    private var safeArea: SafeArea = SafeArea.NONE
    private var legalVersions: LegalVersionsDto? = null
    private var legalVersionsRequested = false

    private val fieldClearRunnables = HashMap<Field, Runnable>()
    private val fieldAnimators = HashMap<Field, ValueAnimator>()
    private val shakeSpring = SpringMotion(SHAKE_STIFFNESS, SHAKE_DAMPING)

    override fun createView(context: Context): View {
        this.context = context
        val prefs = draftPrefs(context)

        root = object : FrameLayout(context) {
            override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
                super.onSizeChanged(w, h, oldw, oldh)
                clouds.requestLayout()
            }
        }

        backdrop = SkyBackdropView(context)
        root.addView(backdrop, matchParent())
        celestial = CelestialView(context)
        root.addView(celestial, matchParent())

        scroll = ScrollView(context).apply {
            isFillViewport = true
            clipToPadding = false
            isVerticalScrollBarEnabled = false
        }
        centerBox = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }
        cardBox = MaxWidthBox(context, CARD_MAX_WIDTH_DP)
        glass = com.qwill.app.ui.glass.GlassView(context, backdrop, blurDp = CARD_BLUR_DP, saturation = CARD_SATURATION).apply {
            cornerRadius = context.dp(Dimens.RADIUS_CARD)
        }
        backdrop.onRepaint = { glass.invalidate() }
        cardBox.addView(glass, matchParent())

        val cardContent = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val padX = context.dpInt(Dimens.SPACE_5)
            val padY = context.dpInt(Dimens.SPACE_6)
            setPadding(padX, padY, padX, padY)
        }
        buildCardContent(cardContent, prefs)
        cardBox.addView(cardContent, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        usernameTooltip = TextView(context).apply {
            text = "Выбирайте имя пользователя с умом! Его невозможно изменить после регистрации. " +
                "По нему вас смогут найти другие люди."
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, TOOLTIP_TEXT_DP)
            val padX = context.dpInt(18f)
            val padY = context.dpInt(14f)
            setPadding(padX, padY, padX, padY)
            alpha = 0f
            visibility = View.INVISIBLE
        }
        cardBox.addView(usernameTooltip, FrameLayout.LayoutParams(context.dpInt(TOOLTIP_WIDTH_DP), ViewGroup.LayoutParams.WRAP_CONTENT))
        usernameField.wrapper.post { repositionTooltip() }

        themeToggle = TextView(context).apply {
            gravity = Gravity.CENTER
            text = if (Theme.isDark) "🌙" else "☀️"
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, 20f)
            isFocusable = true
            setOnClickListener { toggleTheme() }
        }
        val toggleSide = context.dpInt(Dimens.TAP_MIN)
        cardBox.addView(
            themeToggle,
            FrameLayout.LayoutParams(toggleSide, toggleSide, Gravity.BOTTOM or Gravity.END).apply {
                val margin = context.dpInt(Dimens.SPACE_4)
                bottomMargin = margin
                rightMargin = margin
            },
        )

        centerBox.addView(
            cardBox,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                val margin = context.dpInt(Dimens.SPACE_4)
                leftMargin = margin
                rightMargin = margin
                topMargin = margin
                bottomMargin = margin
            },
        )
        scroll.addView(centerBox, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.addView(scroll, matchParent())

        clouds = CloudsView(context)
        root.addView(clouds, matchParent())

        if (Build.VERSION.SDK_INT >= 30) attachKeyboardMotion(root)

        restoreDraft(prefs)
        applyMode(animated = false)
        applyAppearance(animated = false)
        if (bannedMessage != null) showFormError(bannedMessage)
        return root
    }

    private fun buildCardContent(cardContent: LinearLayout, prefs: SharedPreferences) {
        logo = ImageView(context).apply {
            setImageResource(R.drawable.logo_mark)
            scaleType = ImageView.ScaleType.FIT_CENTER
            val pad = context.dpInt(LOGO_PADDING_DP)
            setPadding(pad, pad, pad, pad)
        }
        val logoSide = context.dpInt(LOGO_SIZE_DP)
        cardContent.addView(
            logo,
            LinearLayout.LayoutParams(logoSide, logoSide).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                bottomMargin = context.dpInt(Dimens.SPACE_3)
            },
        )

        title = TextView(context).apply {
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.BOLD)
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, TITLE_TEXT_DP)
        }
        cardContent.addView(title, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_5) })

        formErrorText = TextView(context).apply {
            gravity = Gravity.CENTER
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, FORM_ERROR_TEXT_DP)
            visibility = View.GONE
        }
        cardContent.addView(formErrorText, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_3) })

        usernameField = buildField("Имя пользователя (@username)", isPassword = false) {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            imeOptions = EditorInfo.IME_ACTION_NEXT
            setAutofillHintCompat(this, "username")
            setOnFocusChangeListener { _, focused -> onUsernameFocusChanged(focused) }
        }
        cardContent.addView(usernameField.wrapper, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_4) })

        displayNameField = buildField("Ваше имя", isPassword = false) {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_NEXT
            setAutofillHintCompat(this, "name")
        }
        cardContent.addView(displayNameField.wrapper, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_4) })

        passwordField = buildField("Пароль", isPassword = true) {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            imeOptions = EditorInfo.IME_ACTION_DONE
            setAutofillHintCompat(this, "password")
            setOnEditorActionListener { _, actionId, _ ->
                if (actionId == EditorInfo.IME_ACTION_DONE) {
                    submit()
                    true
                } else {
                    false
                }
            }
        }
        cardContent.addView(passwordField.wrapper, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_2) })

        primaryButton = TextView(context).apply {
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            isFocusable = true
            setOnClickListener { submit() }
        }
        primaryProgress = android.widget.ProgressBar(context).apply { visibility = View.GONE }
        val primaryHeight = context.dpInt(Dimens.COMPOSER_MIN_H)
        val primaryBox = FrameLayout(context)
        primaryBox.addView(primaryButton, matchParent())
        primaryBox.addView(primaryProgress, FrameLayout.LayoutParams(context.dpInt(24f), context.dpInt(24f), Gravity.CENTER))
        cardContent.addView(
            primaryBox,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, primaryHeight).apply {
                topMargin = context.dpInt(Dimens.SPACE_2)
            },
        )

        secondaryButton = TextView(context).apply {
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            isFocusable = true
            setOnClickListener { switchMode() }
        }
        cardContent.addView(
            secondaryButton,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, primaryHeight).apply {
                topMargin = context.dpInt(Dimens.SPACE_3)
            },
        )
    }

    private fun buildField(hint: String, isPassword: Boolean, configure: EditText.() -> Unit): Field {
        val wrapper = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val input = EditText(context).apply {
            this.hint = hint
            isSingleLine = true
            typeface = Fonts.display(FontWeight.REGULAR)
            val padX = context.dpInt(16f)
            val padY = context.dpInt(14f)
            setPadding(padX, padY, padX, padY)
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, FIELD_TEXT_DP)
            includeFontPadding = false
            minimumHeight = context.dpInt(Dimens.COMPOSER_MIN_H)
            gravity = Gravity.CENTER_VERTICAL
            configure()
            addTextChangedListener(object : TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                override fun afterTextChanged(s: Editable?) {
                    clearFieldErrorOnType(this@apply)
                }
            })
        }
        val error = TextView(context).apply {
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, FIELD_ERROR_TEXT_DP)
            val padX = context.dpInt(2f)
            val padTop = context.dpInt(4f)
            setPadding(padX, padTop, padX, 0)
            visibility = View.GONE
        }

        if (!isPassword) {
            wrapper.addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            wrapper.addView(error, wrap())
            return Field(wrapper, input, error)
        }

        val row = FrameLayout(context)
        val toggleSide = context.dpInt(Dimens.TAP_MIN)
        input.background = null
        input.setPadding(input.paddingLeft, input.paddingTop, toggleSide, input.paddingBottom)
        row.addView(input, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val toggle = TextView(context).apply {
            text = EYE_HIDDEN
            gravity = Gravity.CENTER
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_DIP, 18f)
            isFocusable = true
            contentDescription = "Показать пароль"
        }
        var passwordVisible = false
        toggle.setOnClickListener {
            passwordVisible = !passwordVisible
            val selection = input.selectionStart.coerceAtLeast(0)
            input.inputType = InputType.TYPE_CLASS_TEXT or
                if (passwordVisible) InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD else InputType.TYPE_TEXT_VARIATION_PASSWORD
            input.typeface = Fonts.display(FontWeight.REGULAR)
            input.setSelection(selection.coerceAtMost(input.text?.length ?: 0))
            toggle.text = if (passwordVisible) EYE_VISIBLE else EYE_HIDDEN
        }
        row.addView(toggle, FrameLayout.LayoutParams(toggleSide, toggleSide, Gravity.END or Gravity.CENTER_VERTICAL))
        wrapper.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        wrapper.addView(error, wrap())
        return Field(wrapper, input, error, background = row, trailing = toggle)
    }

    override fun onShown() {
        celestial.setSceneActive(true)
        clouds.setActive(true)
        com.qwill.app.ui.AppForeground.addListener(foregroundListener)
        fetchLegalVersionsIfNeeded()
    }

    override fun onHidden() {
        celestial.setSceneActive(false)
        clouds.setActive(false)
        com.qwill.app.ui.AppForeground.removeListener(foregroundListener)
        persistDraft()
        consentDialog?.let { dialog ->
            dialog.detach()
            consentDialog = null
            consentContent = null
        }
    }

    override fun onViewDestroyed() {
        for ((field, runnable) in fieldClearRunnables) field.input.removeCallbacks(runnable)
        fieldClearRunnables.clear()
        for (animator in fieldAnimators.values) animator.cancel()
        fieldAnimators.clear()
    }

    override val interceptsBack: Boolean get() = consentDialog != null

    override fun onBackPressed(): Boolean {
        val content = consentContent ?: return false
        if (content.pending) return true
        closeConsent()
        return true
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        safeArea = area
        scroll.setPadding(area.left, area.top, area.right, area.bottom)
        if (Build.VERSION.SDK_INT < 30) {
            scroll.translationY = -computeKeyboardShift(area.keyboard)
        }
    }

    private fun computeKeyboardShift(keyboardHeightPx: Int): Float {
        if (keyboardHeightPx <= 0) return 0f
        val focused = root.findFocus() as? EditText ?: return 0f
        val fieldRect = android.graphics.Rect()
        if (!focused.getGlobalVisibleRect(fieldRect)) return 0f
        val screenHeight = context.resources.displayMetrics.heightPixels
        val visibleBottom = screenHeight - keyboardHeightPx
        val margin = context.dpInt(Dimens.SPACE_4)
        val overlap = (fieldRect.bottom + margin) - visibleBottom
        return overlap.coerceAtLeast(0).toFloat()
    }

    @android.annotation.TargetApi(30)
    private fun attachKeyboardMotion(target: View) {
        var shiftTarget = 0f
        var maxImeBottom = 0
        target.setWindowInsetsAnimationCallback(object : android.view.WindowInsetsAnimation.Callback(
            android.view.WindowInsetsAnimation.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE,
        ) {
            override fun onStart(
                animation: android.view.WindowInsetsAnimation,
                bounds: android.view.WindowInsetsAnimation.Bounds,
            ): android.view.WindowInsetsAnimation.Bounds {
                if (animation.typeMask and android.view.WindowInsets.Type.ime() != 0) {
                    maxImeBottom = bounds.upperBound.bottom
                    shiftTarget = computeKeyboardShift(maxImeBottom)
                }
                return super.onStart(animation, bounds)
            }

            override fun onProgress(
                insets: android.view.WindowInsets,
                runningAnimations: MutableList<android.view.WindowInsetsAnimation>,
            ): android.view.WindowInsets {
                val imeRunning = runningAnimations.any { it.typeMask and android.view.WindowInsets.Type.ime() != 0 }
                if (!imeRunning || maxImeBottom <= 0) return insets
                val current = insets.getInsets(android.view.WindowInsets.Type.ime()).bottom
                val progress = (current.toFloat() / maxImeBottom).coerceIn(0f, 1f)
                scroll.translationY = -shiftTarget * progress
                return insets
            }

            override fun onEnd(animation: android.view.WindowInsetsAnimation) {
                if (animation.typeMask and android.view.WindowInsets.Type.ime() == 0) return
                val visible = target.rootWindowInsets?.isVisible(android.view.WindowInsets.Type.ime()) == true
                scroll.translationY = if (visible) -shiftTarget else 0f
            }
        })
    }

    override fun onThemeChanged() {
        applyAppearance(animated = true)
    }

    private val foregroundListener = com.qwill.app.ui.ForegroundListener { active ->
        celestial.setSceneActive(active && stack?.top === this)
        clouds.setActive(active && stack?.top === this)
    }

    private fun applyAppearance(animated: Boolean) {
        val palette = Theme.palette
        glass.tint = palette.authCardBg
        glass.borderColor = palette.authCardBorder
        glass.highlightColor = palette.authCardBorderStrong
        logo.background = android.graphics.drawable.GradientDrawable(
            android.graphics.drawable.GradientDrawable.Orientation.TL_BR,
            intArrayOf(palette.accentFrom, palette.accentTo),
        ).apply { shape = android.graphics.drawable.GradientDrawable.OVAL }
        title.setTextColor(palette.textPrimary)
        title.text = if (mode == Mode.LOGIN) "С возвращением!" else "Добро пожаловать!"
        formErrorText.setTextColor(FixedColors.authDanger)
        formErrorText.background = context.roundRect(context.dp(Dimens.RADIUS_MD), FixedColors.authDangerSoft)
        val padX = context.dpInt(Dimens.SPACE_3)
        formErrorText.setPadding(padX, padX, padX, padX)

        for (field in listOf(usernameField, displayNameField, passwordField)) {
            field.input.setTextColor(palette.textPrimary)
            field.input.setHintTextColor(palette.textSecondary)
            field.error.setTextColor(FixedColors.authDanger)
            field.trailing?.setTextColor(palette.textSecondary)
            paintFieldBackground(field, danger = fieldHasError(field))
        }
        usernameTooltip.setTextColor(palette.textPrimary)
        usernameTooltip.background = context.fieldBackground(TOOLTIP_RADIUS_DP, palette.surface, palette.border)

        primaryButton.text = if (mode == Mode.LOGIN) "Войти" else "Зарегистрироваться"
        primaryButton.setTextColor(palette.textOnPrimary)
        primaryButton.background = ripple(palette.primary, context.dp(pillRadiusDp()), withAlpha(palette.textOnPrimary, 0.24f))
        primaryProgress.indeterminateTintList = android.content.res.ColorStateList.valueOf(palette.textOnPrimary)

        secondaryButton.text = if (mode == Mode.LOGIN) "Создать аккаунт" else "У меня уже есть аккаунт"
        secondaryButton.setTextColor(palette.textPrimary)
        secondaryButton.background = ripple(0, context.dp(pillRadiusDp()), withAlpha(palette.primary, 0.16f), palette.primary, context.dpInt(2f))

        themeToggle.background = ripple(palette.surface, context.dp(Dimens.TAP_MIN) / 2f, withAlpha(palette.textPrimary, 0.12f))
        themeToggle.text = if (Theme.isDark) "🌙" else "☀️"
        backdrop.setNight(Theme.isDark, animated)
        celestial.setNight(Theme.isDark, animated)
        clouds.setNight(Theme.isDark, animated)
        consentDialog?.applyAppearance()
        consentContent?.applyAppearance()
    }

    private fun pillRadiusDp(): Float = Dimens.COMPOSER_MIN_H / 2f

    private fun paintFieldBackground(field: Field, danger: Boolean) {
        val palette = Theme.palette
        val focused = field.input.isFocused
        val border = when {
            danger -> FixedColors.authDanger
            focused -> palette.primary
            else -> palette.border
        }
        val ring = if (focused && !danger) palette.primarySoft else 0
        field.background.background = context.fieldBackground(Dimens.RADIUS_MD, palette.surface, border, ring)
    }

    private fun onUsernameFocusChanged(focused: Boolean) {
        paintFieldBackground(usernameField, danger = fieldHasError(usernameField))
        if (mode != Mode.REGISTER) return
        animateTooltip(focused)
    }

    private fun repositionTooltip() {
        if (usernameField.wrapper.width == 0) return
        val params = usernameTooltip.layoutParams as FrameLayout.LayoutParams
        params.leftMargin = usernameField.wrapper.left + context.dpInt(4f)
        params.topMargin = usernameField.wrapper.top - usernameTooltip.measuredHeight - context.dpInt(14f)
        usernameTooltip.layoutParams = params
    }

    private fun animateTooltip(visible: Boolean) {
        usernameTooltip.animate().cancel()
        if (visible) {
            repositionTooltip()
            usernameTooltip.visibility = View.VISIBLE
            usernameTooltip.translationY = context.dp(15f)
            usernameTooltip.scaleX = 0.9f
            usernameTooltip.scaleY = 0.9f
            usernameTooltip.alpha = 0f
            usernameTooltip.animate()
                .alpha(1f).translationY(0f).scaleX(1f).scaleY(1f)
                .setDuration(Motion.duration(TOOLTIP_DURATION_MS))
                .setInterpolator(TOOLTIP_INTERPOLATOR)
                .start()
        } else {
            usernameTooltip.animate()
                .alpha(0f).translationY(context.dp(15f)).scaleX(0.9f).scaleY(0.9f)
                .setDuration(Motion.duration(TOOLTIP_DURATION_MS))
                .setInterpolator(TOOLTIP_INTERPOLATOR)
                .withEndAction { usernameTooltip.visibility = View.INVISIBLE }
                .start()
        }
    }

    private fun switchMode() {
        if (submitting) return
        mode = if (mode == Mode.LOGIN) Mode.REGISTER else Mode.LOGIN
        clearAllErrors()
        applyMode(animated = true)
        applyAppearance(animated = false)
        cardBox.post { repositionTooltip() }
    }

    private fun applyMode(animated: Boolean) {
        val showName = mode == Mode.REGISTER
        if (showName) {
            displayNameField.wrapper.visibility = View.VISIBLE
            if (animated && Motion.animationsEnabled) {
                displayNameField.wrapper.alpha = 0f
                displayNameField.wrapper.animate().alpha(1f).setDuration(Motion.duration(Motion.MENU)).start()
            } else {
                displayNameField.wrapper.alpha = 1f
            }
        } else {
            displayNameField.wrapper.visibility = View.GONE
            animateTooltip(false)
        }
    }

    private fun toggleTheme() {
        val next = if (Theme.isDark) ThemePreference.LIGHT else ThemePreference.DARK
        Theme.setPreference(context, next)
    }

    private fun clearFieldErrorOnType(field: EditText) {
        val target = fieldFor(field) ?: return
        if (!fieldHasError(target)) return
        setFieldError(target, null)
    }

    private fun fieldFor(input: EditText): Field? = when (input) {
        usernameField.input -> usernameField
        displayNameField.input -> displayNameField
        passwordField.input -> passwordField
        else -> null
    }

    private fun fieldHasError(field: Field): Boolean = field.error.visibility == View.VISIBLE

    private fun setFieldError(field: Field, message: String?) {
        if (message == null) {
            field.error.visibility = View.GONE
            paintFieldBackground(field, danger = false)
            fieldClearRunnables.remove(field)?.let { field.input.removeCallbacks(it) }
            return
        }
        field.error.text = message
        field.error.visibility = View.VISIBLE
        paintFieldBackground(field, danger = true)
        fieldClearRunnables.remove(field)?.let { field.input.removeCallbacks(it) }
        val runnable = Runnable { paintFieldBackground(field, danger = false) }
        fieldClearRunnables[field] = runnable
        field.input.postDelayed(runnable, FIELD_ERROR_BORDER_MS)
    }

    private fun clearAllErrors() {
        formErrorText.visibility = View.GONE
        for (field in listOf(usernameField, displayNameField, passwordField)) setFieldError(field, null)
    }

    private fun shake(field: Field) {
        if (!Motion.animationsEnabled) {
            field.input.performHapticFeedback(
                android.view.HapticFeedbackConstants.KEYBOARD_TAP,
                android.view.HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING,
            )
            return
        }
        fieldAnimators.remove(field)?.cancel()
        field.input.translationX = 0f
        field.input.performHapticFeedback(
            android.view.HapticFeedbackConstants.KEYBOARD_TAP,
            android.view.HapticFeedbackConstants.FLAG_IGNORE_GLOBAL_SETTING,
        )
        val v0 = -context.dp(SHAKE_SHIFT_DP) * 100f
        val durationMs = shakeSpring.settleDurationMs(0f, v0, SHAKE_EPSILON_PX).coerceAtLeast(1L)
        val animator = ValueAnimator.ofFloat(0f, durationMs / 1000f)
        animator.duration = durationMs
        animator.addUpdateListener {
            val t = it.animatedValue as Float
            field.input.translationX = shakeSpring.valueAt(t, 0f, v0)
        }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (fieldAnimators[field] !== animation) return
                fieldAnimators.remove(field)
                field.input.translationX = 0f
            }
        })
        fieldAnimators[field] = animator
        animator.start()
    }

    private fun showFormError(message: String) {
        formErrorText.text = message
        formErrorText.visibility = View.VISIBLE
    }

    private fun submit() {
        if (submitting) return
        formErrorText.visibility = View.GONE
        when (mode) {
            Mode.LOGIN -> submitLogin()
            Mode.REGISTER -> submitRegister()
        }
    }

    private fun submitLogin() {
        val username = usernameField.input.text.toString()
        val password = passwordField.input.text.toString()
        when (val result = AuthValidation.login(username, password)) {
            is AuthValidationResult.Invalid -> applyFieldErrors(result.errors)
            is AuthValidationResult.Valid -> {
                clearAllErrors()
                startSubmitting()
                QwillApplication.api.login(LoginInput(result.value.username, result.value.password), classGuid) { r ->
                    onAuthResult(r)
                }
            }
        }
    }

    private fun submitRegister() {
        val username = usernameField.input.text.toString()
        val password = passwordField.input.text.toString()
        val displayName = displayNameField.input.text.toString()
        when (val result = AuthValidation.register(username, password, displayName)) {
            is AuthValidationResult.Invalid -> applyFieldErrors(result.errors)
            is AuthValidationResult.Valid -> {
                clearAllErrors()
                openConsent(result.value)
            }
        }
    }

    private fun applyFieldErrors(errors: Map<AuthFieldTarget, String>) {
        for ((target, message) in errors) {
            val field = fieldForTarget(target) ?: continue
            setFieldError(field, message)
            shake(field)
        }
        (errors.keys.firstOrNull()?.let { fieldForTarget(it) })?.input?.requestFocus()
    }

    private fun fieldForTarget(target: AuthFieldTarget): Field? = when (target) {
        AuthFieldTarget.Username -> usernameField
        AuthFieldTarget.Password -> passwordField
        AuthFieldTarget.DisplayName -> displayNameField
    }

    private fun startSubmitting() {
        submitting = true
        primaryButton.alpha = 0.6f
        secondaryButton.alpha = 0.6f
        primaryButton.isEnabled = false
        secondaryButton.isEnabled = false
        primaryButton.visibility = View.INVISIBLE
        primaryProgress.visibility = View.VISIBLE
    }

    private fun stopSubmitting() {
        submitting = false
        primaryButton.alpha = 1f
        secondaryButton.alpha = 1f
        primaryButton.isEnabled = true
        secondaryButton.isEnabled = true
        primaryButton.visibility = View.VISIBLE
        primaryProgress.visibility = View.GONE
    }

    private fun onAuthResult(result: ApiResult<PublicUser>) {
        when (result) {
            is ApiResult.Success -> onAuthSuccess()
            is ApiResult.Failure -> {
                stopSubmitting()
                applyAuthError(result.error)
            }
        }
    }

    private fun onAuthSuccess() {
        val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(usernameField.input.windowToken, 0)
        clearDraft()
        usernameField.input.postDelayed({
            stack?.replaceAll(ChatsScreen())
        }, SUCCESS_DELAY_MS)
    }

    private fun applyAuthError(error: ApiException) {
        when (error) {
            is ApiError -> {
                val fields = error.fields
                if (fields != null) {
                    val targets = HashMap<AuthFieldTarget, String>()
                    fields["username"]?.let { targets[AuthFieldTarget.Username] = it }
                    fields["password"]?.let { targets[AuthFieldTarget.Password] = it }
                    fields["displayName"]?.let { targets[AuthFieldTarget.DisplayName] = it }
                    applyFieldErrors(targets)
                }
                showFormError(error.message ?: "")
                if (error.code == ErrorCode.INVALID_CREDENTIALS) {
                    passwordField.input.setText("")
                    shake(passwordField)
                }
            }
            is NetworkError, is NoResponseError -> showFormError(NETWORK_ERROR_TEXT)
            else -> showFormError(error.message ?: NETWORK_ERROR_TEXT)
        }
    }

    private fun fetchLegalVersionsIfNeeded() {
        if (legalVersionsRequested) return
        legalVersionsRequested = true
        QwillApplication.api.send(Requests.legalCurrent(), classGuid) { result ->
            if (result is ApiResult.Success) legalVersions = result.value
        }
    }

    private fun openConsent(fields: RegisterFields) {
        val dialog = QwillDialog(context, root)
        val content = ConsentContent(context, dialog.card) { openLegalDocument(it) }
        dialog.attachTo(root)
        dialog.applyAppearance()
        dialog.onCancelRequested = { if (!content.pending) closeConsent() }
        content.onCancel = { if (!content.pending) closeConsent() }
        content.onConfirm = { confirmRegister(fields, content) }
        consentDialog = dialog
        consentContent = content
        content.applyAppearance()
        dialog.show()
        backStateChanged()
    }

    private fun closeConsent() {
        val dialog = consentDialog ?: return
        dialog.hide {
            dialog.detach()
        }
        consentDialog = null
        consentContent = null
        backStateChanged()
    }

    private fun confirmRegister(fields: RegisterFields, content: ConsentContent) {
        val versions = legalVersions
        if (versions == null) {
            fetchLegalVersionsForConsent(fields, content)
            return
        }
        content.setPending(true)
        QwillApplication.api.register(
            RegisterInput(fields.username, fields.password, fields.displayName, versions.termsVersion, versions.privacyVersion),
            classGuid,
        ) { result -> onConsentAuthResult(result, fields, content) }
    }

    private fun fetchLegalVersionsForConsent(fields: RegisterFields, content: ConsentContent) {
        content.setPending(true)
        QwillApplication.api.send(Requests.legalCurrent(), classGuid) { result ->
            when (result) {
                is ApiResult.Success -> {
                    legalVersions = result.value
                    confirmRegister(fields, content)
                }
                is ApiResult.Failure -> {
                    content.setPending(false)
                    content.setError(NETWORK_ERROR_TEXT)
                }
            }
        }
    }

    private fun onConsentAuthResult(result: ApiResult<PublicUser>, fields: RegisterFields, content: ConsentContent) {
        when (result) {
            is ApiResult.Success -> {
                content.setPending(false)
                closeConsent()
                onAuthSuccess()
            }
            is ApiResult.Failure -> {
                content.setPending(false)
                val error = result.error
                when {
                    error is ApiError && error.code == ErrorCode.LEGAL_VERSION_OUTDATED -> {
                        content.setError("Документы обновились, попробуйте ещё раз")
                        legalVersionsRequested = false
                        fetchLegalVersionsIfNeeded()
                    }
                    error is ApiError && error.fields != null -> {
                        closeConsent()
                        val fieldErrors = error.fields ?: emptyMap()
                        val targets = HashMap<AuthFieldTarget, String>()
                        fieldErrors["username"]?.let { targets[AuthFieldTarget.Username] = it }
                        fieldErrors["password"]?.let { targets[AuthFieldTarget.Password] = it }
                        fieldErrors["displayName"]?.let { targets[AuthFieldTarget.DisplayName] = it }
                        applyFieldErrors(targets)
                    }
                    error is ApiError -> content.setError(error.message ?: "")
                    else -> content.setError(NETWORK_ERROR_TEXT)
                }
            }
        }
    }

    private fun openLegalDocument(doc: String) {
        stack?.push(LegalScreen(doc, null))
    }

    private fun draftPrefs(context: Context): SharedPreferences = context.getSharedPreferences(DRAFT_PREFS, Context.MODE_PRIVATE)

    private fun restoreDraft(prefs: SharedPreferences) {
        val savedMode = prefs.getString(KEY_MODE, null)
        mode = if (savedMode == Mode.REGISTER.name) Mode.REGISTER else Mode.LOGIN
        usernameField.input.setText(prefs.getString(KEY_USERNAME, "") ?: "")
        displayNameField.input.setText(prefs.getString(KEY_DISPLAY_NAME, "") ?: "")
    }

    private fun persistDraft() {
        draftPrefs(context).edit()
            .putString(KEY_MODE, mode.name)
            .putString(KEY_USERNAME, usernameField.input.text.toString())
            .putString(KEY_DISPLAY_NAME, displayNameField.input.text.toString())
            .apply()
    }

    private fun clearDraft() {
        draftPrefs(context).edit().clear().apply()
    }

    private fun matchParent(): FrameLayout.LayoutParams =
        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

    private fun wrap(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    private class MaxWidthBox(context: Context, private val maxWidthDp: Float) : FrameLayout(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val maxPx = context.dpInt(maxWidthDp)
            val mode = View.MeasureSpec.getMode(widthMeasureSpec)
            val size = View.MeasureSpec.getSize(widthMeasureSpec)
            val cappedWidth = if (mode == View.MeasureSpec.UNSPECIFIED) maxPx else min(size, maxPx)
            val widthSpec = View.MeasureSpec.makeMeasureSpec(cappedWidth, View.MeasureSpec.EXACTLY)

            var contentHeight = 0
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                val lp = child.layoutParams as LayoutParams
                if (lp.height == LayoutParams.MATCH_PARENT) continue
                measureChildWithMargins(child, widthSpec, 0, heightMeasureSpec, 0)
                contentHeight = maxOf(contentHeight, child.measuredHeight + lp.topMargin + lp.bottomMargin)
            }
            val resolvedHeight = resolveSize(contentHeight + paddingTop + paddingBottom, heightMeasureSpec)
            setMeasuredDimension(cappedWidth, resolvedHeight)

            val exactHeightSpec = View.MeasureSpec.makeMeasureSpec(resolvedHeight, View.MeasureSpec.EXACTLY)
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                val lp = child.layoutParams as LayoutParams
                if (lp.height != LayoutParams.MATCH_PARENT) continue
                measureChildWithMargins(child, widthSpec, 0, exactHeightSpec, 0)
            }
        }

        private fun min(a: Int, b: Int) = if (a < b) a else b
    }

    private companion object {
        const val CARD_MAX_WIDTH_DP = 400f
        const val CARD_BLUR_DP = 24f
        const val CARD_SATURATION = 1.8f
        const val LOGO_SIZE_DP = 64f
        const val LOGO_PADDING_DP = 12f
        const val TITLE_TEXT_DP = 22f
        const val FORM_ERROR_TEXT_DP = 13f
        const val FIELD_TEXT_DP = 15f
        const val FIELD_ERROR_TEXT_DP = 12f
        const val TOOLTIP_TEXT_DP = 13f
        const val TOOLTIP_WIDTH_DP = 260f
        const val TOOLTIP_RADIUS_DP = 20f
        const val TOOLTIP_DURATION_MS = 400L
        val TOOLTIP_INTERPOLATOR = PathInterpolator(0.68f, -0.55f, 0.265f, 1f)
        const val FIELD_ERROR_BORDER_MS = 2000L
        const val SHAKE_SHIFT_DP = 3.5f
        const val SHAKE_STIFFNESS = 600f
        const val SHAKE_DAMPING = 0.5f
        const val SHAKE_EPSILON_PX = 0.5f
        const val SUCCESS_DELAY_MS = 150L
        const val NETWORK_ERROR_TEXT = "Не удалось выполнить запрос. Проверьте соединение."
        const val EYE_HIDDEN = "👁️"
        const val EYE_VISIBLE = "🙈"
        const val DRAFT_PREFS = "auth_draft"
        const val KEY_MODE = "mode"
        const val KEY_USERNAME = "username"
        const val KEY_DISPLAY_NAME = "displayName"

        fun setAutofillHintCompat(view: EditText, hint: String) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) view.setAutofillHints(hint)
        }
    }
}
