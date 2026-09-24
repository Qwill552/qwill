package com.qwill.app.stand

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.qwill.app.ui.AmbientBlobsView
import com.qwill.app.ui.BackArrowView
import com.qwill.app.ui.glass.GlassView
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FixedColors
import com.qwill.app.ui.theme.FontSize
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.TextScale
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.ThemePreference
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class StandScreen(private val level: Int) : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    private class Styled(val view: TextView, val scale: Float, val role: Role)

    private enum class Role { PRIMARY, SECONDARY, ON_PRIMARY }

    private class Segment<T>(val value: T, val view: TextView)

    private lateinit var context: Context
    private lateinit var blobs: AmbientBlobsView
    private lateinit var scroll: ScrollView
    private lateinit var header: FrameLayout
    private lateinit var glass: GlassView
    private lateinit var backArrow: BackArrowView
    private lateinit var info: TextView
    private lateinit var card: LinearLayout
    private lateinit var pushButton: TextView
    private var sessionPanel: SessionPanel? = null
    private var socketPanel: SocketPanel? = null
    private var databasePanel: DatabasePanel? = null
    private var filesPanel: FilesPanel? = null
    private val styled = ArrayList<Styled>()
    private val themeSegments = ArrayList<Segment<ThemePreference>>()
    private val sizeSegments = ArrayList<Segment<FontSize>>()
    private val segmentGroups = ArrayList<LinearLayout>()
    private val rowCards = ArrayList<View>()

    override fun createView(context: Context): View {
        this.context = context
        styled.clear()
        themeSegments.clear()
        sizeSegments.clear()
        segmentGroups.clear()
        rowCards.clear()

        val root = FrameLayout(context)
        val content = FrameLayout(context)
        blobs = AmbientBlobsView(context)
        content.addView(blobs, matchParent())

        scroll = ScrollView(context).apply {
            clipToPadding = false
            isVerticalScrollBarEnabled = false
        }
        val column = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        column.addView(buildControls(), wrapWidth())
        if (level == 1) {
            val panel = SessionPanel(context, classGuid)
            column.addView(panel.view, wrapWidth().apply { topMargin = context.dpInt(Dimens.SPACE_2) })
            panel.attach()
            sessionPanel = panel
            val sockets = SocketPanel(context, classGuid)
            column.addView(sockets.view, wrapWidth().apply { topMargin = context.dpInt(Dimens.SPACE_2) })
            sockets.attach()
            socketPanel = sockets
            val database = DatabasePanel(context, classGuid)
            column.addView(database.view, wrapWidth().apply { topMargin = context.dpInt(Dimens.SPACE_2) })
            database.attach()
            databasePanel = database
            val files = FilesPanel(context, classGuid)
            column.addView(files.view, wrapWidth().apply { topMargin = context.dpInt(Dimens.SPACE_2) })
            files.attach()
            filesPanel = files
        }
        for (index in 0 until STUB_ROWS) column.addView(buildRow(index), wrapWidth().apply { topMargin = context.dpInt(Dimens.SPACE_2) })
        scroll.addView(column, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        content.addView(scroll, matchParent())
        root.addView(content, matchParent())

        header = FrameLayout(context)
        glass = GlassView(context, content).apply { cornerRadius = context.dp(Dimens.CHROME_RADIUS) }
        header.addView(glass, matchParent())
        val title = text(if (level == 1) "Стенд" else "Экран $level", TextScale.SCREEN_TITLE, FontWeight.SEMIBOLD, Role.PRIMARY).apply {
            gravity = Gravity.CENTER
        }
        header.addView(title, matchParent())
        if (level > 1) {
            backArrow = BackArrowView(context).apply {
                contentDescription = "Назад"
                isFocusable = true
                setOnClickListener { stack?.pop() }
            }
            val side = context.dpInt(Dimens.CHROME_BTN)
            header.addView(
                backArrow,
                FrameLayout.LayoutParams(side, side, Gravity.START or Gravity.CENTER_VERTICAL).apply {
                    leftMargin = context.dpInt((Dimens.CHROME_H - Dimens.CHROME_BTN) / 2f)
                },
            )
        }
        root.addView(header, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(Dimens.CHROME_H)))

        applyAppearance()
        return root
    }

    override fun onViewDestroyed() {
        sessionPanel?.detach()
        sessionPanel = null
        socketPanel?.detach()
        socketPanel = null
        databasePanel?.detach()
        databasePanel = null
        filesPanel?.detach()
        filesPanel = null
    }

    override fun onShown() {
        updateInfo()
    }

    override fun onThemeChanged() {
        applyAppearance()
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        val inset = context.dpInt(Dimens.CHROME_INSET)
        val params = header.layoutParams as FrameLayout.LayoutParams
        params.topMargin = area.top + inset
        params.leftMargin = area.left + inset
        params.rightMargin = area.right + inset
        header.layoutParams = params
        val padX = context.dpInt(Dimens.SCREEN_PAD_X)
        scroll.setPadding(
            area.left + padX,
            area.top + inset + context.dpInt(Dimens.CHROME_H) + context.dpInt(Dimens.CHROME_GAP),
            area.right + padX,
            area.bottom + context.dpInt(Dimens.SPACE_4),
        )
    }

    private fun buildControls(): View {
        card = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            val pad = context.dpInt(Dimens.CARD_INSET)
            setPadding(pad, pad, pad, pad)
        }
        card.addView(text("Каркас НАТ-2", TextScale.SCREEN_TITLE, FontWeight.SEMIBOLD, Role.PRIMARY))
        info = text("", TextScale.CAPTION, FontWeight.REGULAR, Role.SECONDARY)
        card.addView(info, wrapWidth().apply { topMargin = context.dpInt(Dimens.SPACE_1) })

        pushButton = text("Открыть ещё экран", 1f, FontWeight.SEMIBOLD, Role.ON_PRIMARY).apply {
            gravity = Gravity.CENTER
            isFocusable = true
            setOnClickListener { stack?.push(StandScreen(level + 1)) }
        }
        card.addView(
            pushButton,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(Dimens.COMPOSER_MIN_H)).apply {
                topMargin = context.dpInt(Dimens.SPACE_3)
            },
        )

        card.addView(text("Тема", TextScale.CAPTION, FontWeight.MEDIUM, Role.SECONDARY), sectionLabel())
        card.addView(
            segments(
                themeSegments,
                listOf(ThemePreference.LIGHT to "Светлая", ThemePreference.DARK to "Тёмная", ThemePreference.SYSTEM to "Как в системе"),
            ) { Theme.setPreference(context, it) },
            segmentParams(),
        )

        card.addView(text("Размер шрифта", TextScale.CAPTION, FontWeight.MEDIUM, Role.SECONDARY), sectionLabel())
        card.addView(
            segments(sizeSegments, FontSize.entries.map { it to it.base.toInt().toString() }) { Theme.setFontSize(context, it) },
            segmentParams(),
        )
        return card
    }

    private fun <T> segments(target: MutableList<Segment<T>>, options: List<Pair<T, String>>, onPick: (T) -> Unit): View {
        val group = LinearLayout(context).apply { orientation = LinearLayout.HORIZONTAL }
        for ((value, label) in options) {
            val option = text(label, TextScale.META, FontWeight.MEDIUM, Role.PRIMARY).apply {
                gravity = Gravity.CENTER
                isFocusable = true
                setOnClickListener { onPick(value) }
            }
            group.addView(option, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f))
            target.add(Segment(value, option))
        }
        segmentGroups.add(group)
        return group
    }

    private fun buildRow(index: Int): View {
        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val pad = context.dpInt(Dimens.CARD_INSET)
            setPadding(pad, 0, pad, 0)
            minimumHeight = context.dpInt(Dimens.ROW_CHAT_H)
        }
        val tint = FixedColors.tints[index % FixedColors.tints.size]
        val avatar = TextView(context).apply {
            text = NAMES[index % NAMES.size].take(1)
            gravity = Gravity.CENTER
            typeface = Fonts.display(FontWeight.SEMIBOLD)
            setTextColor(FixedColors.lift)
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(TextScale.SCREEN_TITLE))
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(tint)
            }
        }
        val side = context.dpInt(Dimens.AVATAR_CHAT)
        row.addView(avatar, LinearLayout.LayoutParams(side, side))
        val texts = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(text(NAMES[index % NAMES.size], TextScale.NAME, FontWeight.MEDIUM, Role.PRIMARY))
        val preview = text(PREVIEW, TextScale.META, FontWeight.REGULAR, Role.SECONDARY).apply {
            typeface = Fonts.message(FontWeight.REGULAR)
            fontFeatureSettings = Fonts.MESSAGE_FEATURES
        }
        texts.addView(preview)
        row.addView(
            texts,
            LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                leftMargin = context.dpInt(Dimens.SPACE_3)
            },
        )
        rowCards.add(row)
        return row
    }

    private fun text(value: String, scale: Float, weight: FontWeight, role: Role): TextView {
        val view = TextView(context).apply {
            text = value
            typeface = Fonts.display(weight)
            includeFontPadding = false
            maxLines = 2
        }
        styled.add(Styled(view, scale, role))
        return view
    }

    private fun applyAppearance() {
        val palette = Theme.palette
        blobs.onThemeChanged()
        glass.tint = palette.chromeBg
        glass.borderColor = palette.chromeBorder
        glass.highlightColor = palette.chromeHighlight
        if (::backArrow.isInitialized) {
            backArrow.color = palette.textPrimary
            backArrow.background = ripple(0, context.dp(Dimens.CHROME_BTN) / 2f, withAlpha(palette.textPrimary, 0.12f))
        }
        for (item in styled) {
            item.view.setTextSize(TypedValue.COMPLEX_UNIT_DIP, Theme.textSize(item.scale))
            item.view.setTextColor(
                when (item.role) {
                    Role.PRIMARY -> palette.textPrimary
                    Role.SECONDARY -> palette.textSecondary
                    Role.ON_PRIMARY -> palette.textOnPrimary
                },
            )
        }
        card.background = cardBackground(context)
        sessionPanel?.applyAppearance()
        socketPanel?.applyAppearance()
        databasePanel?.applyAppearance()
        filesPanel?.applyAppearance()
        for (row in rowCards) row.background = cardBackground(context)
        pushButton.background = ripple(palette.primary, context.dp(Dimens.RADIUS_MD), withAlpha(palette.textOnPrimary, 0.24f))
        for (group in segmentGroups) {
            group.background = GradientDrawable().apply {
                cornerRadius = context.dp(Dimens.RADIUS_MD)
                setColor(palette.surface3)
            }
        }
        paintSegments(themeSegments, Theme.preference)
        paintSegments(sizeSegments, Theme.fontSize)
        updateInfo()
    }

    private fun <T> paintSegments(items: List<Segment<T>>, selected: T) {
        val palette = Theme.palette
        for (item in items) {
            val active = item.value == selected
            item.view.setTextColor(if (active) palette.textOnPrimary else palette.textPrimary)
            item.view.background = ripple(
                if (active) palette.primary else 0,
                context.dp(Dimens.RADIUS_MD),
                withAlpha(palette.textPrimary, 0.12f),
            )
        }
    }

    private fun updateInfo() {
        if (!::info.isInitialized) return
        val blur = if (Build.VERSION.SDK_INT >= 31) "RenderEffect" else "своё (stack blur)"
        val motion = if (Motion.animationsEnabled) "включены" else "выключены"
        val depth = stack?.depth ?: level
        info.text = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}) · размытие: $blur · анимации: $motion · в стеке: $depth"
    }

    private fun sectionLabel(): LinearLayout.LayoutParams = wrapWidth().apply {
        topMargin = context.dpInt(Dimens.SPACE_4)
        bottomMargin = context.dpInt(Dimens.SPACE_2)
    }

    private fun segmentParams(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(Dimens.TAP_MIN))

    private fun matchParent(): FrameLayout.LayoutParams =
        FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)

    private fun wrapWidth(): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

    private companion object {
        const val STUB_ROWS = 30
        const val PREVIEW = "Съешь же ещё этих мягких французских булок — Il1 0O a"
        val NAMES = listOf(
            "Аня", "Борис", "Вера", "Глеб", "Дина", "Егор", "Жанна", "Захар",
            "Ира", "Кирилл", "Лена", "Марк", "Нина", "Олег", "Полина", "Роман",
        )
    }
}
