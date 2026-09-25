package com.qwill.app.consent

import android.animation.TimeAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.StateListDrawable
import android.os.SystemClock
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.ViewOutlineProvider
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.R
import com.qwill.app.auth.Requests
import com.qwill.app.core.DispatchQueue
import com.qwill.app.legal.LegalScreen
import com.qwill.app.model.PendingConsentDto
import com.qwill.app.model.PublicUser
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.ui.AppForeground
import com.qwill.app.ui.ForegroundListener
import com.qwill.app.ui.QwillDialog
import com.qwill.app.ui.QwillSwitch
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.ripple
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.PosterColors
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.ThemePreference
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

class ConsentGateScreen(consent: PendingConsentDto) : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    override val interceptsBack: Boolean get() = declineDialog != null

    var consent: PendingConsentDto = consent
        private set

    private lateinit var context: Context
    private lateinit var root: GateRoot
    private lateinit var window: FrameLayout
    private lateinit var frame: RoundFrame
    private lateinit var scroll: PosterScroll
    private lateinit var poster: PosterLayout
    private lateinit var hint: LinearLayout
    private var title: TextView? = null
    private var doneTitle: TextView? = null
    private var doneBadge: DoneBadgeView? = null
    private var acceptButton: TextView? = null
    private var declineButton: TextView? = null
    private var readSwitch: QwillSwitch? = null
    private var bubble: TextView? = null
    private var card: PosterCard? = null
    private var windowBackground: PosterCardDrawable? = null
    private var cardBackground: PosterCardDrawable? = null

    private var metrics: PosterMetrics? = null
    private var sizedWidth = 0
    private var sizedHeight = 0
    private var safeArea = SafeArea.NONE
    private var art: PosterArtSet? = null
    private var artRequest = 0
    private var artKey = ""

    private var read = false
    private var pending = false
    private var accepted: PublicUser? = null
    private var errorText: String? = null
    private var declineDialog: QwillDialog? = null

    private val clock = LoopClock()
    private var ticker: TimeAnimator? = null
    private var shown = false
    private var hintVisible = false
    private val hideError = Runnable { setError(null) }
    private val hintCheck = Runnable { evaluateHint() }
    private val foregroundListener = ForegroundListener { updateMotion() }

    override fun createView(context: Context): View {
        this.context = context
        root = GateRoot(context)
        window = FrameLayout(context)
        frame = RoundFrame(context)
        scroll = PosterScroll(context).apply {
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isFillViewport = true
            onScrolled = { onActivity() }
        }
        poster = PosterLayout(context)
        scroll.addView(poster, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        frame.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        window.addView(frame, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        hint = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            alpha = 0f
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        }
        window.addView(hint, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END or Gravity.BOTTOM))
        root.addView(window)
        return root
    }

    fun updateConsent(next: PendingConsentDto) {
        if (next == consent) return
        consent = next
        if (accepted == null && ::poster.isInitialized && metrics != null) rebuildCard()
    }

    override fun onShown() {
        shown = true
        AppForeground.addListener(foregroundListener)
        updateMotion()
        scheduleHint()
        root.post { (doneTitle ?: title)?.let { focusForAccessibility(it) } }
    }

    override fun onHidden() {
        shown = false
        AppForeground.removeListener(foregroundListener)
        updateMotion()
        cancelHint()
    }

    override fun onViewDestroyed() {
        ticker?.cancel()
        ticker = null
        root.removeCallbacks(hideError)
        root.removeCallbacks(hintCheck)
        artRequest++
        art = null
        declineDialog = null
    }

    override fun onDestroyed() {
        AppForeground.removeListener(foregroundListener)
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        safeArea = area
        if (!::root.isInitialized || metrics == null) return
        onSized(sizedWidth, sizedHeight)
        applyGeometry()
    }

    override fun onThemeChanged() {
        if (!::root.isInitialized || metrics == null) return
        rebuildAll()
        declineDialog?.let { dialog ->
            dialog.applyAppearance()
            styleDeclineDialog(dialog)
        }
    }

    override fun onBackPressed(): Boolean {
        if (declineDialog != null) {
            closeDeclineDialog()
            return true
        }
        return false
    }

    private fun onSized(width: Int, height: Int) {
        if (width == 0 || height == 0) return
        sizedWidth = width
        sizedHeight = height
        val density = context.resources.displayMetrics.density
        val reserved = safeArea.left + safeArea.right + 4 * hairline(density)
        val next = PosterMetrics.compute(width.toFloat(), height.toFloat(), density, reserved.toFloat())
        val previous = metrics
        metrics = next
        if (previous != null && previous.u == next.u && previous.wide == next.wide && previous.screenHeight == next.screenHeight) return
        rebuildAll()
    }

    private fun hairline(density: Float): Int = max(1, density.roundToInt())

    private fun rebuildAll() {
        val m = metrics ?: return
        val colors = Theme.palette.poster
        poster.metrics = m
        poster.colors = colors
        poster.content = buildHeroContent(m, colors)
        rebuildCard()
        buildHint(colors)
        applyGeometry()
        requestArt(m, colors)
        applyPoses()
    }

    private fun applyGeometry() {
        val m = metrics ?: return
        val colors = Theme.palette.poster
        val density = m.density
        if (m.wide) {
            val gutter = context.dpInt(Dimens.SPACE_5)
            val pad = context.dpInt(Dimens.SPACE_3)
            val hairline = hairline(density)
            val windowWidth = (m.posterWidth + 2 * pad + 4 * hairline).roundToInt()
            window.layoutParams = FrameLayout.LayoutParams(windowWidth, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER).apply {
                leftMargin = gutter + safeArea.left
                rightMargin = gutter + safeArea.right
                topMargin = gutter + safeArea.top
                bottomMargin = gutter + safeArea.bottom
            }
            window.setPadding(pad + hairline, pad + hairline, pad + hairline, pad + hairline)
            val frameRadius = m.units(CARD_RADIUS)
            val background = windowBackground ?: PosterCardDrawable(
                cornerRadius = { (metrics?.units(CARD_RADIUS) ?: 0f) + context.dp(Dimens.SPACE_3) },
                strokeWidth = { hairline.toFloat() },
                shadowOffset = context.dp(SHADOW_OFFSET),
                shadowSigma = context.dp(SHADOW_BLUR) / 2f,
            ).also { windowBackground = it }
            background.fill = Theme.palette.surface
            background.stroke = Theme.palette.chromeBorder
            background.shadowColor = colors.shadow
            window.background = background
            window.clipChildren = false
            frame.outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) {
                    outline.setRoundRect(0, 0, view.width, view.height, frameRadius)
                }
            }
            frame.clipToOutline = true
            frame.setBorder(frameRadius, hairline.toFloat(), Theme.palette.border)
            frame.setPadding(hairline, hairline, hairline, hairline)
            frame.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            scroll.layoutParams = FrameLayout.LayoutParams(m.posterWidth.roundToInt(), ViewGroup.LayoutParams.WRAP_CONTENT)
            poster.safeTop = 0
            poster.safeBottom = 0
            val hintInset = context.dpInt(Dimens.SPACE_5)
            (hint.layoutParams as FrameLayout.LayoutParams).apply {
                rightMargin = hintInset
                bottomMargin = hintInset
            }
        } else {
            window.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            window.setPadding(0, 0, 0, 0)
            window.background = null
            frame.clipToOutline = false
            frame.setBorder(0f, 0f, 0)
            frame.setPadding(0, 0, 0, 0)
            frame.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            scroll.layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            poster.safeTop = safeArea.top
            poster.safeBottom = safeArea.bottom
            (hint.layoutParams as FrameLayout.LayoutParams).apply {
                rightMargin = safeArea.right + context.dpInt(HINT_INSET)
                bottomMargin = safeArea.bottom + context.dpInt(HINT_INSET)
            }
        }
        window.requestLayout()
    }

    private fun buildHeroContent(m: PosterMetrics, colors: PosterColors): View {
        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.TOP
        }
        val brand = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val wordmark = text(PosterText.WORDMARK, m.units(48f), FontWeight.EXTRABOLD, colors.violetDeep).apply {
            letterSpacing = -0.03f
            cssLineHeight(1f)
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        brand.addView(wordmark, wrap())
        val toggle = ThemeToggleView(context).apply {
            val scale = m.toggleScale
            pillWidth = m.units(92f) * scale
            pillHeight = m.units(46f) * scale
            knobPad = m.units(5f) * scale
            knobSize = m.units(34f) * scale
            iconSize = m.units(20f) * scale
            border = max(m.units(2f), 1f)
            tapMin = context.dp(Dimens.TAP_MIN)
            dark = Theme.isDark
            this.colors = colors
            refresh()
            setOnClickListener { toggleTheme() }
        }
        val tapPadX = max(0f, context.dp(Dimens.TAP_MIN) - toggle.pillWidth) / 2f
        val tapPadY = max(0f, context.dp(Dimens.TAP_MIN) - toggle.pillHeight) / 2f
        brand.addView(
            toggle,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = (m.units(16f) - tapPadY).roundToInt()
                leftMargin = -tapPadX.roundToInt()
                bottomMargin = -tapPadY.roundToInt()
            },
        )
        header.addView(brand, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            rightMargin = (m.units(26f) - tapPadX).roundToInt()
        })
        header.addView(buildBadge(m, colors), LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, m.units(62f).roundToInt()))
        column.addView(header, wrap())

        val titleView = text(PosterText.TITLE, m.units(116f), FontWeight.EXTRABOLD, colors.ink).apply {
            letterSpacing = -0.04f
            cssLineHeight(0.94f)
            isFocusable = true
            accessibilityHeading()
        }
        title = titleView
        column.addView(
            titleView,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = m.titleTopMargin.roundToInt()
            },
        )
        titleView.maxWidth = m.titleMaxWidth.roundToInt()
        val subtitle = text(PosterText.SUBTITLE, m.units(36f), FontWeight.MEDIUM, colors.ink2).apply {
            cssLineHeight(1.3f)
            maxWidth = m.units(540f).roundToInt()
        }
        column.addView(
            subtitle,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                topMargin = m.units(40f).roundToInt()
            },
        )
        return column
    }

    private fun buildBadge(m: PosterMetrics, colors: PosterColors): View {
        val badge = TextView(context).apply {
            text = PosterText.BADGE
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, m.units(25f))
            setTextColor(colors.violetDeep)
            includeFontPadding = false
            gravity = Gravity.CENTER_VERTICAL
            maxLines = 1
            val pad = m.units(26f).roundToInt()
            setPadding(pad, 0, pad, 0)
            val iconSize = m.units(26f).roundToInt().coerceAtLeast(1)
            setCompoundDrawables(context.posterIcon(R.drawable.ic_poster_shield, colors.violetDeep, iconSize), null, null, null)
            compoundDrawablePadding = m.units(12f).roundToInt()
            background = GradientDrawable().apply {
                cornerRadius = m.units(31f)
                setColor(colors.pillBg)
                setStroke(max(m.units(2f), 1f).roundToInt(), colors.cardEdge)
            }
        }
        return badge
    }

    private fun rebuildCard() {
        val m = metrics ?: return
        val colors = Theme.palette.poster
        val next = PosterCard(context)
        val background = cardBackground ?: PosterCardDrawable(
            cornerRadius = { metrics?.units(CARD_RADIUS) ?: 0f },
            strokeWidth = { max(metrics?.units(2f) ?: 1f, 1f) },
            shadowOffset = context.dp(SHADOW_OFFSET),
            shadowSigma = context.dp(SHADOW_BLUR) / 2f,
        ).also { cardBackground = it }
        background.fill = colors.cardBg
        background.stroke = colors.cardEdge
        background.shadowColor = colors.shadow
        next.background = background
        next.setPadding(
            m.floor(52f, Dimens.SPACE_4).roundToInt(),
            m.floor(52f, Dimens.SPACE_4).roundToInt(),
            m.floor(52f, Dimens.SPACE_4).roundToInt(),
            m.floor(56f, Dimens.SPACE_5).roundToInt(),
        )
        val body = accepted?.let { buildDone(m, colors) } ?: buildDecision(m, colors)
        next.addView(body, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_VERTICAL))
        val bubbleView = buildBubble(m)
        next.addView(bubbleView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        next.bubble = bubbleView
        next.anchor = acceptButton
        bubble = bubbleView
        card = next
        poster.card = next
        applyButtons()
        showBubbleText(animated = false)
    }

    private fun baseText(): Float = context.dp(Theme.fontSize.base)

    private fun metaText(): Float = baseText() * TextScale.META

    private fun buildDecision(m: PosterMetrics, colors: PosterColors): View {
        doneTitle = null
        doneBadge = null
        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val lede = text(PosterText.ledeFor(consent), max(m.units(36f), baseText()), FontWeight.MEDIUM, colors.ink).apply { cssLineHeight(1.42f) }
        column.addView(lede, wrap())

        val docs: ViewGroup = if (m.wide) FlowRow(context, m.floor(14f, Dimens.SPACE_2).roundToInt()) else LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val docGap = m.floor(14f, Dimens.SPACE_2).roundToInt()
        var first = true
        if (consent.terms) {
            docs.addView(docChip(m, colors, PosterText.DOC_TERMS, R.drawable.ic_poster_file) { openDoc("terms") }, chipParams(m, first, docGap))
            first = false
        }
        if (consent.privacy) {
            docs.addView(docChip(m, colors, PosterText.DOC_PRIVACY, R.drawable.ic_poster_lock) { openDoc("privacy") }, chipParams(m, first, docGap))
        }
        column.addView(docs, wrap().apply { topMargin = m.floor(34f, Dimens.SPACE_4).roundToInt() })

        val gate = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val padY = m.floor(22f, Dimens.SPACE_3).roundToInt()
            val padX = m.floor(28f, Dimens.SPACE_4).roundToInt()
            setPadding(padX, padY, padX, padY)
            background = ripple(colors.gate, m.units(28f), withAlpha(colors.ink, 0.08f))
            isClickable = true
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        val switch = QwillSwitch(context).apply {
            id = View.generateViewId()
            setChecked(read, animated = false)
            onCheckedChange = { checked ->
                read = checked
                applyButtons()
            }
        }
        readSwitch = switch
        val label = text(PosterText.GATE_LABEL, max(m.units(29f), baseText()), FontWeight.SEMIBOLD, colors.ink).apply {
            labelFor = switch.id
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
        }
        switch.contentDescription = PosterText.GATE_LABEL.replace(' ', ' ')
        gate.addView(label, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
            rightMargin = m.floor(24f, Dimens.SPACE_3).roundToInt()
        })
        gate.addView(switch, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        gate.setOnClickListener { switch.toggle() }
        column.addView(gate, wrap().apply { topMargin = m.floor(34f, Dimens.SPACE_4).roundToInt() })

        val actions = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        val buttonHeight = m.floor(96f, Dimens.COMPOSER_MIN_H).roundToInt()
        val buttonPad = m.floor(24f, Dimens.SPACE_3).roundToInt()
        val border = max(m.units(2f), 1f).roundToInt()
        val decline = text(if (m.wide) PosterText.DECLINE_WIDE else PosterText.DECLINE_NARROW, max(m.units(31f), baseText()), FontWeight.SEMIBOLD, colors.ink2).apply {
            gravity = Gravity.CENTER
            maxLines = 1
            setPadding(buttonPad, 0, buttonPad, 0)
            setTextColor(stateColors(pressed = colors.ink, normal = colors.ink2, disabled = colors.ink2))
            background = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_pressed), pill(colors.lav, colors.lav, border))
                addState(intArrayOf(), pill(colors.card, colors.lav, border))
            }
            isFocusable = true
            setOnClickListener { if (!pending) openDeclineDialog() }
        }
        declineButton = decline
        actions.addView(decline, LinearLayout.LayoutParams(0, buttonHeight, 1f))
        val accept = text(PosterText.ACCEPT, max(m.units(34f), baseText()), FontWeight.BOLD, colors.white).apply {
            gravity = Gravity.CENTER
            maxLines = 1
            setPadding(buttonPad, 0, buttonPad, 0)
            setTextColor(stateColors(pressed = colors.white, normal = colors.white, disabled = colors.offFg))
            background = StateListDrawable().apply {
                addState(intArrayOf(-android.R.attr.state_enabled), pill(colors.offBg, 0, 0))
                addState(intArrayOf(android.R.attr.state_pressed), ctaGradient(colors.ctaHover, colors.hotDeep))
                addState(intArrayOf(), ctaGradient(colors.violet, colors.hot))
            }
            isFocusable = true
            setOnClickListener { accept() }
        }
        acceptButton = accept
        actions.addView(accept, LinearLayout.LayoutParams(0, buttonHeight, 1.5f).apply {
            leftMargin = m.floor(20f, Dimens.SPACE_3).roundToInt()
        })
        column.addView(actions, wrap().apply { topMargin = m.floor(34f, Dimens.SPACE_4).roundToInt() })
        return column
    }

    private fun buildDone(m: PosterMetrics, colors: PosterColors): View {
        acceptButton = null
        declineButton = null
        readSwitch = null
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        val badgeSize = m.floor(168f, DONE_BADGE_MIN).roundToInt()
        val badge = DoneBadgeView(context).apply { this.colors = colors }
        doneBadge = badge
        row.addView(badge, LinearLayout.LayoutParams(badgeSize, badgeSize).apply {
            rightMargin = m.floor(40f, Dimens.SPACE_4).roundToInt()
        })
        val textColumn = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val titleView = text(PosterText.DONE_TITLE, max(m.units(58f), baseText() * 1.5f), FontWeight.EXTRABOLD, colors.ink).apply {
            letterSpacing = -0.03f
            cssLineHeight(1.05f)
            isFocusable = true
            accessibilityHeading()
        }
        doneTitle = titleView
        textColumn.addView(titleView, wrap())
        val lede = text(PosterText.DONE_LEDE, max(m.units(31f), baseText()), FontWeight.MEDIUM, colors.ink2).apply { cssLineHeight(1.35f) }
        textColumn.addView(lede, wrap().apply { topMargin = m.floor(18f, Dimens.SPACE_2).roundToInt() })
        val pad = m.floor(44f, Dimens.SPACE_5).roundToInt()
        val button = text(PosterText.DONE_BUTTON, max(m.units(30f), baseText()), FontWeight.BOLD, colors.white).apply {
            gravity = Gravity.CENTER
            maxLines = 1
            setPadding(pad, 0, pad, 0)
            minimumHeight = m.floor(84f, Dimens.COMPOSER_MIN_H).roundToInt()
            background = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_pressed), ctaGradient(colors.ctaHover, colors.hotDeep))
                addState(intArrayOf(), ctaGradient(colors.violet, colors.hot))
            }
            isFocusable = true
            setOnClickListener { enter() }
        }
        textColumn.addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = m.floor(30f, Dimens.SPACE_4).roundToInt()
        })
        row.addView(textColumn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        return row
    }

    private fun buildBubble(m: PosterMetrics): TextView {
        val tail = context.dp(Dimens.SPACE_2)
        return TextView(context).apply {
            typeface = Fonts.display(FontWeight.MEDIUM)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, metaText())
            setTextColor(Theme.palette.poster.white)
            gravity = Gravity.CENTER
            cssLineHeight(1.35f)
            val padY = context.dpInt(Dimens.SPACE_2)
            val padX = context.dpInt(Dimens.SPACE_3)
            setPadding(padX, padY, padX, padY + tail.roundToInt())
            maxWidth = min(context.dp(BUBBLE_MAX_W), m.screenWidth * 0.8f).roundToInt()
            background = BubbleDrawable(context.dp(Dimens.CARD_RADIUS), tail).apply { color = Theme.palette.danger }
            visibility = View.GONE
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_ASSERTIVE
        }
    }

    private fun buildHint(colors: PosterColors) {
        hint.removeAllViews()
        val stroke = context.dpInt(2f)
        val pill = TextView(context).apply {
            text = PosterText.HINT
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_PX, metaText())
            setTextColor(colors.violetDeep)
            includeFontPadding = false
            setPadding(context.dpInt(18f), context.dpInt(8f), context.dpInt(18f), context.dpInt(8f))
            background = GradientDrawable().apply {
                cornerRadius = context.dp(999f)
                setColor(colors.hintBg)
                setStroke(stroke, colors.cardEdge)
            }
        }
        hint.addView(pill, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val circle = FrameLayout(context).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(colors.hintBg)
                setStroke(stroke, colors.cardEdge)
            }
        }
        val chevron = View(context).apply { background = context.posterIcon(R.drawable.ic_poster_chevron_down, colors.violetDeep, context.dpInt(34f)) }
        circle.addView(chevron, FrameLayout.LayoutParams(context.dpInt(34f), context.dpInt(34f), Gravity.CENTER))
        hint.addView(circle, LinearLayout.LayoutParams(context.dpInt(64f), context.dpInt(64f)).apply { topMargin = context.dpInt(10f) })
    }

    private fun docChip(m: PosterMetrics, colors: PosterColors, label: String, icon: Int, onClick: () -> Unit): TextView {
        val size = max(m.units(26f), metaText())
        return text(label, size, FontWeight.SEMIBOLD, colors.violetDeep).apply {
            gravity = Gravity.CENTER_VERTICAL or Gravity.START
            val pad = m.floor(26f, Dimens.SPACE_4).roundToInt()
            val padY = context.dpInt(Dimens.SPACE_2)
            setPadding(pad, padY, pad, padY)
            minHeight = m.floor(59f, Dimens.TAP_MIN).roundToInt()
            setTextColor(stateColors(pressed = colors.ink, normal = colors.violetDeep, disabled = colors.violetDeep))
            val iconSize = max(m.units(25f), size).roundToInt()
            val drawable = context.posterIcon(icon, colors.violetDeep, iconSize)
            drawable.setTintList(stateColors(pressed = colors.ink, normal = colors.violetDeep, disabled = colors.violetDeep))
            setCompoundDrawables(drawable, null, null, null)
            compoundDrawablePadding = m.floor(12f, Dimens.SPACE_2).roundToInt()
            background = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_pressed), pill(colors.lav, 0, 0))
                addState(intArrayOf(), pill(colors.lilac, 0, 0))
            }
            isFocusable = true
            setOnClickListener { onClick() }
        }
    }

    private fun chipParams(m: PosterMetrics, first: Boolean, gap: Int): ViewGroup.LayoutParams =
        if (m.wide) {
            ViewGroup.MarginLayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        } else {
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                if (!first) topMargin = gap
            }
        }

    private fun pill(fill: Int, stroke: Int, strokeWidth: Int): GradientDrawable = GradientDrawable().apply {
        cornerRadius = context.dp(999f)
        setColor(fill)
        if (strokeWidth > 0) setStroke(strokeWidth, stroke)
    }

    private fun ctaGradient(from: Int, to: Int): CssLinearDrawable =
        CssLinearDrawable(CTA_ANGLE, intArrayOf(from, to), null) { it.height() / 2f }

    private fun stateColors(pressed: Int, normal: Int, disabled: Int): ColorStateList = ColorStateList(
        arrayOf(intArrayOf(-android.R.attr.state_enabled), intArrayOf(android.R.attr.state_pressed), intArrayOf()),
        intArrayOf(disabled, pressed, normal),
    )

    private fun text(value: String, sizePx: Float, weight: FontWeight, color: Int): TextView = TextView(context).apply {
        text = value
        typeface = Fonts.display(weight)
        setTextSize(TypedValue.COMPLEX_UNIT_PX, sizePx)
        setTextColor(color)
        includeFontPadding = false
    }

    private fun wrap(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    private fun TextView.accessibilityHeading() {
        accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: View, info: AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info)
                if (android.os.Build.VERSION.SDK_INT >= 28) info.isHeading = true
            }
        }
    }

    private fun focusForAccessibility(view: View) {
        view.performAccessibilityAction(AccessibilityNodeInfo.ACTION_ACCESSIBILITY_FOCUS, null)
    }

    private fun applyButtons() {
        acceptButton?.isEnabled = read && !pending
        declineButton?.isEnabled = !pending
        readSwitch?.isEnabled = !pending
    }

    private fun toggleTheme() {
        onActivity()
        val next = if (Theme.isDark) ThemePreference.LIGHT else ThemePreference.DARK
        Theme.setPreference(context, next)
    }

    private fun openDoc(doc: String) {
        onActivity()
        stack?.push(LegalScreen(doc, null))
    }

    private fun accept() {
        if (pending || !read) return
        pending = true
        setError(null)
        applyButtons()
        QwillApplication.api.send(Requests.legalCurrent(), classGuid) { current ->
            when (current) {
                is ApiResult.Failure -> failAccept(current.error)
                is ApiResult.Success -> QwillApplication.api.send(Requests.acceptLegal(current.value), classGuid) { result ->
                    when (result) {
                        is ApiResult.Failure -> failAccept(result.error)
                        is ApiResult.Success -> {
                            pending = false
                            accepted = result.value
                            rebuildCard()
                            root.post { doneTitle?.let { focusForAccessibility(it) } }
                        }
                    }
                }
            }
        }
    }

    private fun failAccept(error: ApiException) {
        pending = false
        applyButtons()
        setError(if (error is ApiError) error.message else PosterText.NETWORK_ERROR)
    }

    private fun enter() {
        val user = accepted ?: return
        QwillApplication.session.acceptUser(user)
    }

    private fun setError(message: String?) {
        errorText = message
        root.removeCallbacks(hideError)
        if (message != null) root.postDelayed(hideError, ERROR_VISIBLE_MS)
        showBubbleText(animated = message != null)
    }

    private fun showBubbleText(animated: Boolean) {
        val view = bubble ?: return
        val message = errorText
        view.animate().cancel()
        if (message == null || acceptButton == null) {
            view.visibility = View.GONE
            return
        }
        view.text = message
        view.visibility = View.VISIBLE
        if (!animated || !Motion.animationsEnabled) {
            view.alpha = 1f
            view.translationY = 0f
            return
        }
        view.alpha = 0f
        view.translationY = context.dp(Dimens.SPACE_2)
        view.animate().alpha(1f).translationY(0f).setDuration(Motion.duration(Motion.MENU)).setInterpolator(Motion.easeScreen).start()
    }

    private fun openDeclineDialog() {
        if (declineDialog != null) return
        onActivity()
        val dialog = QwillDialog(context, window)
        dialog.attachTo(root)
        dialog.applyAppearance()
        dialog.onCancelRequested = { closeDeclineDialog() }
        declineDialog = dialog
        styleDeclineDialog(dialog)
        dialog.show()
        backStateChanged()
    }

    private fun styleDeclineDialog(dialog: QwillDialog) {
        val palette = Theme.palette
        val card = dialog.card
        card.removeAllViews()
        val heading = TextView(context).apply {
            text = PosterText.DECLINE_TITLE
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.BOLD)
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 20f)
            setTextColor(palette.textPrimary)
        }
        card.addView(heading, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_3) })
        val body = TextView(context).apply {
            text = PosterText.DECLINE_TEXT
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 14f)
            setTextColor(palette.textSecondary)
        }
        card.addView(body, wrap().apply { bottomMargin = context.dpInt(Dimens.SPACE_4) })
        val actions = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        val height = context.dpInt(Dimens.COMPOSER_MIN_H)
        val stay = TextView(context).apply {
            text = PosterText.DECLINE_STAY
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            setTextColor(palette.textOnPrimary)
            background = ripple(palette.primary, context.dp(Dimens.RADIUS_MD), withAlpha(palette.textOnPrimary, 0.24f))
            isFocusable = true
            setOnClickListener { closeDeclineDialog() }
        }
        val leave = TextView(context).apply {
            text = PosterText.DECLINE_LEAVE
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            setTextColor(palette.danger)
            background = ripple(0, context.dp(Dimens.RADIUS_MD), withAlpha(palette.danger, 0.14f))
            isFocusable = true
            setOnClickListener { QwillApplication.api.logout() }
        }
        actions.addView(stay, LinearLayout.LayoutParams(0, height, 1f))
        actions.addView(leave, LinearLayout.LayoutParams(0, height, 1f).apply { leftMargin = context.dpInt(Dimens.SPACE_2) })
        card.addView(actions, wrap())
        stay.post {
            stay.requestFocus()
            focusForAccessibility(stay)
        }
    }

    private fun closeDeclineDialog() {
        val dialog = declineDialog ?: return
        declineDialog = null
        dialog.hide { dialog.detach() }
        backStateChanged()
    }

    private fun onActivity() {
        if (!::root.isInitialized) return
        setHintVisible(false)
        scheduleHint()
    }

    private fun scheduleHint() {
        if (!::root.isInitialized) return
        root.removeCallbacks(hintCheck)
        if (shown) root.postDelayed(hintCheck, HINT_IDLE_MS)
    }

    private fun cancelHint() {
        if (!::root.isInitialized) return
        root.removeCallbacks(hintCheck)
        setHintVisible(false)
    }

    private fun evaluateHint() {
        val room = poster.height - scroll.height
        val show = room > context.dp(HINT_MIN_ROOM) && scroll.scrollY < room * HINT_MAX_PROGRESS
        setHintVisible(show)
    }

    private fun setHintVisible(visible: Boolean) {
        if (visible == hintVisible) return
        hintVisible = visible
        hint.animate().cancel()
        hint.animate().alpha(if (visible) 1f else 0f).setDuration(Motion.duration(Motion.THEME)).setInterpolator(Motion.easeScreen).start()
    }

    private fun requestArt(m: PosterMetrics, colors: PosterColors) {
        val key = "${m.artU}:${m.wide}:${colors.isDark}"
        if (key == artKey) {
            applyArt()
            return
        }
        artKey = key
        val request = ++artRequest
        val resources = context.resources
        PosterWorker.queue.post {
            val rendered = PosterArt.render(resources, m, colors)
            root.post {
                if (request != artRequest) return@post
                art = rendered
                applyArt()
            }
        }
    }

    private fun applyArt() {
        val set = art ?: return
        poster.cloud.setBody(set.cloud)
        poster.lock.setBody(set.lock)
        poster.scroll.setBody(set.scroll)
        poster.stars.forEachIndexed { index, view -> view.setBody(set.stars[index]) }
        val colors = Theme.palette.poster
        val filter = if (colors.isDark) ColorMatrixColorFilter(ColorMatrix(CssFilters.posterSmokeNight.values)) else null
        poster.smokes.forEachIndexed { index, view ->
            val spec = PosterMetrics.SMOKES[index]
            view.setBitmap(set.smoke, FOG_OPACITY * spec.opacity, filter, mirror = spec.kind == PosterMetrics.SmokeKind.B)
        }
        poster.requestLayout()
        applyPoses()
    }

    private fun motionAllowed(): Boolean = shown && AppForeground.active && Motion.animationsEnabled && root.isAttachedToWindow

    private fun updateMotion() {
        if (!::root.isInitialized) return
        val now = SystemClock.uptimeMillis()
        if (!Motion.animationsEnabled) clock.finishEntrance(ENTRANCE_END_MS)
        if (motionAllowed()) {
            clock.start(now)
            if (ticker == null) {
                ticker = TimeAnimator().apply {
                    setTimeListener { _, _, _ -> applyPoses() }
                    start()
                }
            }
        } else {
            clock.stop(now)
            ticker?.cancel()
            ticker = null
            applyPoses()
        }
    }

    private fun applyPoses() {
        val m = metrics ?: return
        if (!::poster.isInitialized) return
        val animated = Motion.animationsEnabled
        val elapsed = clock.elapsed(SystemClock.uptimeMillis())
        fun swing(period: Long): Float = if (animated) LoopClock.swing(elapsed, period) else 0f
        floatBody(poster.cloud, m.artU, entrance(elapsed, 120, animated), swing(9_000), 0f, -26f, -3f, 4f)
        floatBody(poster.lock, m.artU, entrance(elapsed, 240, animated), swing(11_000), 8f, -16f, 5f, -4f)
        floatBody(poster.scroll, m.artU, entrance(elapsed, 360, animated), swing(13_000), -8f, 16f, -9f, -2f)
        poster.stars.forEachIndexed { index, view ->
            val k = swing(PosterMetrics.STARS[index].periodMs)
            val scale = LoopClock.lerp(0.76f, 1.12f, k)
            view.scaleX = scale
            view.scaleY = scale
            view.rotation = LoopClock.lerp(0f, 28f, k)
            view.alpha = LoopClock.lerp(0.32f, 1f, k)
        }
        poster.smokes.forEachIndexed { index, view ->
            val spec = PosterMetrics.SMOKES[index]
            val k = swing(spec.periodMs)
            val a = m.artU
            val (tx, ty, scale) = when (spec.kind) {
                PosterMetrics.SmokeKind.A -> Triple(LoopClock.lerp(0f, 46f * a, k), LoopClock.lerp(0f, -18f * a, k), LoopClock.lerp(1f, 1.07f, k))
                PosterMetrics.SmokeKind.B -> Triple(LoopClock.lerp(0f, -54f * a, k), LoopClock.lerp(0f, 16f * a, k), LoopClock.lerp(1f, 1.09f, k))
                PosterMetrics.SmokeKind.C -> Triple(LoopClock.lerp(0f, -38f * a, k), LoopClock.lerp(6f * a, -14f * a, k), LoopClock.lerp(1.04f, 1f, k))
            }
            view.translationX = tx
            view.translationY = ty
            view.scaleX = scale
            view.scaleY = scale
        }
        doneBadge?.let { floatBody(it, m.u, 1f, swing(9_000), 0f, -26f, -3f, 4f) }
        val bob = context.dp(LoopClock.lerp(-7f, 9f, swing(2_000)))
        for (i in 0 until hint.childCount) hint.getChildAt(i).translationY = bob
    }

    private fun entrance(elapsed: Long, delay: Long, animated: Boolean): Float =
        if (animated) LoopClock.entrance(elapsed, delay, ENTRANCE_MS) else 1f

    private fun floatBody(view: View, unit: Float, entered: Float, k: Float, yFrom: Float, yTo: Float, rotFrom: Float, rotTo: Float) {
        val floatY = LoopClock.lerp(yFrom, yTo, k) * unit
        val floatRotation = LoopClock.lerp(rotFrom, rotTo, k)
        val inRotation = -24f * (1f - entered)
        val inScale = 0.8f + 0.2f * entered
        val inY = 80f * unit * (1f - entered)
        val radians = Math.toRadians(inRotation.toDouble())
        view.translationX = (-inScale * sin(radians) * floatY).toFloat()
        view.translationY = (inY + inScale * cos(radians) * floatY).toFloat()
        view.rotation = inRotation + floatRotation
        view.scaleX = inScale
        view.scaleY = inScale
        view.alpha = entered.coerceIn(0f, 1f)
    }

    private inner class GateRoot(context: Context) : FrameLayout(context) {
        init {
            isClickable = true
            clipChildren = false
        }

        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            onSized(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
            super.onMeasure(widthMeasureSpec, heightMeasureSpec)
        }

        override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
            if (ev.actionMasked == MotionEvent.ACTION_DOWN) onActivity()
            return super.dispatchTouchEvent(ev)
        }

        override fun dispatchKeyEvent(event: KeyEvent): Boolean {
            onActivity()
            return super.dispatchKeyEvent(event)
        }

        override fun onAttachedToWindow() {
            super.onAttachedToWindow()
            updateMotion()
        }

        override fun onDetachedFromWindow() {
            super.onDetachedFromWindow()
            updateMotion()
        }
    }

    class RoundFrame(context: Context) : FrameLayout(context) {
        private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { style = android.graphics.Paint.Style.STROKE }
        private val box = android.graphics.RectF()
        private var radius = 0f

        fun setBorder(radius: Float, width: Float, color: Int) {
            this.radius = radius
            paint.strokeWidth = width
            paint.color = color
            setWillNotDraw(width <= 0f)
            invalidate()
        }

        override fun dispatchDraw(canvas: android.graphics.Canvas) {
            super.dispatchDraw(canvas)
            val stroke = paint.strokeWidth
            if (stroke <= 0f) return
            box.set(stroke / 2f, stroke / 2f, width - stroke / 2f, height - stroke / 2f)
            canvas.drawRoundRect(box, radius - stroke / 2f, radius - stroke / 2f, paint)
        }
    }

    class PosterScroll(context: Context) : ScrollView(context) {
        var onScrolled: (() -> Unit)? = null

        override fun onScrollChanged(l: Int, t: Int, oldl: Int, oldt: Int) {
            super.onScrollChanged(l, t, oldl, oldt)
            onScrolled?.invoke()
        }
    }

    class PosterCard(context: Context) : FrameLayout(context) {
        var bubble: View? = null
        var anchor: View? = null
        private val anchorBox = android.graphics.Rect()

        init {
            clipChildren = false
            clipToPadding = false
        }

        override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
            super.onLayout(changed, left, top, right, bottom)
            val view = bubble ?: return
            val target = anchor ?: return
            if (view.visibility == View.GONE || !target.isAttachedToWindow) return
            anchorBox.set(0, 0, target.width, target.height)
            offsetDescendantRectToMyCoords(target, anchorBox)
            val gap = context.dpInt(Dimens.SPACE_2)
            val x = anchorBox.centerX() - view.measuredWidth / 2
            val y = anchorBox.top - gap - view.measuredHeight
            view.layout(x, y, x + view.measuredWidth, y + view.measuredHeight)
        }
    }

    class FlowRow(context: Context, private val gap: Int) : ViewGroup(context) {
        override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
            val maxWidth = MeasureSpec.getSize(widthMeasureSpec)
            var x = 0
            var y = 0
            var rowHeight = 0
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                child.measure(MeasureSpec.makeMeasureSpec(maxWidth, MeasureSpec.AT_MOST), MeasureSpec.makeMeasureSpec(0, MeasureSpec.UNSPECIFIED))
                if (x > 0 && x + child.measuredWidth > maxWidth) {
                    x = 0
                    y += rowHeight + gap
                    rowHeight = 0
                }
                x += child.measuredWidth + gap
                rowHeight = max(rowHeight, child.measuredHeight)
            }
            setMeasuredDimension(maxWidth, y + rowHeight)
        }

        override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
            val maxWidth = r - l
            var x = 0
            var y = 0
            var rowHeight = 0
            for (i in 0 until childCount) {
                val child = getChildAt(i)
                if (x > 0 && x + child.measuredWidth > maxWidth) {
                    x = 0
                    y += rowHeight + gap
                    rowHeight = 0
                }
                child.layout(x, y, x + child.measuredWidth, y + child.measuredHeight)
                x += child.measuredWidth + gap
                rowHeight = max(rowHeight, child.measuredHeight)
            }
        }
    }

    private companion object {
        const val CARD_RADIUS = 48f
        const val SHADOW_OFFSET = 10f
        const val SHADOW_BLUR = 34f
        const val CTA_ANGLE = 118f
        const val DONE_BADGE_MIN = 72f
        const val BUBBLE_MAX_W = 280f
        const val HINT_INSET = 28f
        const val HINT_IDLE_MS = 3_200L
        const val HINT_MIN_ROOM = 120f
        const val HINT_MAX_PROGRESS = 0.55f
        const val ERROR_VISIBLE_MS = 3_500L
        const val ENTRANCE_MS = 800L
        const val ENTRANCE_END_MS = 360L + ENTRANCE_MS
        const val FOG_OPACITY = 0.5f
    }
}

object PosterWorker {
    val queue: DispatchQueue by lazy { DispatchQueue("posterQueue") }
}
