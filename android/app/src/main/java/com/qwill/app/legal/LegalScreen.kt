package com.qwill.app.legal

import android.content.Context
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.StyleSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TableLayout
import android.widget.TableRow
import android.widget.TextView
import com.qwill.app.QwillApplication
import com.qwill.app.auth.Requests
import com.qwill.app.model.LegalDocumentDto
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiResult
import com.qwill.app.ui.BackArrowView
import com.qwill.app.ui.glass.GlassView
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.Dimens
import com.qwill.app.ui.theme.FontWeight
import com.qwill.app.ui.theme.Fonts
import com.qwill.app.ui.theme.Theme
import com.qwill.app.ui.theme.dp
import com.qwill.app.ui.theme.dpInt
import com.qwill.app.ui.theme.withAlpha

class LegalScreen(private val doc: String, private val version: String?) : Screen() {
    private lateinit var context: Context
    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private lateinit var statusText: TextView
    private lateinit var header: FrameLayout
    private lateinit var glass: GlassView
    private lateinit var backArrow: BackArrowView
    private var loadedDocument: LegalDocumentDto? = null

    override fun createView(context: Context): View {
        this.context = context
        val root = FrameLayout(context)
        scroll = ScrollView(context).apply { clipToPadding = false }
        content = LinearLayout(context).apply { orientation = LinearLayout.VERTICAL }
        val centeredWrap = FrameLayout(context)
        centeredWrap.addView(
            content,
            FrameLayout.LayoutParams(context.dpInt(640f), ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER_HORIZONTAL),
        )
        scroll.addView(centeredWrap, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        root.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        statusText = TextView(context).apply {
            text = "Загрузка…"
            setTextSize(TypedValue.COMPLEX_UNIT_DIP, 15f)
        }
        content.addView(statusText)

        header = FrameLayout(context)
        glass = GlassView(context, root).apply { cornerRadius = context.dp(Dimens.CHROME_RADIUS) }
        header.addView(glass, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        backArrow = BackArrowView(context).apply {
            contentDescription = "Назад"
            isFocusable = true
            setOnClickListener { stack?.pop() }
        }
        val side = context.dpInt(Dimens.CHROME_BTN)
        header.addView(backArrow, FrameLayout.LayoutParams(side, side, Gravity.START or Gravity.CENTER_VERTICAL))
        root.addView(header, FrameLayout.LayoutParams(side, side))

        applyAppearance()
        load()
        return root
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        val inset = context.dpInt(Dimens.CHROME_INSET)
        val side = context.dpInt(Dimens.CHROME_BTN)
        header.layoutParams = FrameLayout.LayoutParams(side, side).apply {
            topMargin = area.top + inset
            leftMargin = area.left + inset
        }
        scroll.setPadding(
            area.left + context.dpInt(Dimens.SPACE_4),
            area.top + inset + side + context.dpInt(Dimens.SPACE_3),
            area.right + context.dpInt(Dimens.SPACE_4),
            area.bottom + context.dpInt(Dimens.SPACE_5),
        )
    }

    override fun onThemeChanged() {
        applyAppearance()
        loadedDocument?.let { render(it) }
    }

    private fun applyAppearance() {
        val palette = Theme.palette
        glass.tint = palette.chromeBg
        glass.borderColor = palette.chromeBorder
        glass.highlightColor = palette.chromeHighlight
        backArrow.color = palette.textPrimary
        backArrow.background = com.qwill.app.ui.ripple(0, context.dp(Dimens.CHROME_BTN) / 2f, withAlpha(palette.textPrimary, 0.12f))
        statusText.setTextColor(palette.textSecondary)
    }

    private fun load() {
        val resolvedVersion = version
        if (resolvedVersion != null) {
            fetchDocument(resolvedVersion)
            return
        }
        QwillApplication.api.send(Requests.legalCurrent(), classGuid) { result ->
            when (result) {
                is ApiResult.Success -> fetchDocument(if (doc == "terms") result.value.termsVersion else result.value.privacyVersion)
                is ApiResult.Failure -> showError(result.error.message ?: "Не удалось загрузить документ")
            }
        }
    }

    private fun fetchDocument(resolvedVersion: String) {
        QwillApplication.api.send(Requests.legalDocument(doc, resolvedVersion), classGuid) { result ->
            when (result) {
                is ApiResult.Success -> render(result.value)
                is ApiResult.Failure -> {
                    val message = (result.error as? ApiError)?.message ?: "Не удалось загрузить документ"
                    showError(message)
                }
            }
        }
    }

    private fun showError(message: String) {
        statusText.text = message
        statusText.setTextColor(Theme.palette.textSecondary)
    }

    private fun render(document: LegalDocumentDto) {
        loadedDocument = document
        content.removeAllViews()
        val blocks = LegalMarkdown.parse(document.content)
        for (block in blocks) content.addView(renderBlock(block))
    }

    private fun renderBlock(block: LegalBlock): View = when (block) {
        is LegalBlock.Heading -> textView(block.inline, headingSize(block.level), headingWeight(block.level)).apply {
            val topMargin = if (block.level == 1) 0f else if (block.level == 2) Dimens.SPACE_5 else Dimens.SPACE_4
            (layoutParams as? LinearLayout.LayoutParams)?.topMargin = context.dpInt(topMargin)
        }
        is LegalBlock.Paragraph -> textView(block.inline, 15f, FontWeight.REGULAR)
        is LegalBlock.Rule -> View(context).apply {
            setBackgroundColor(Theme.palette.cardBorder)
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, context.dpInt(Dimens.HAIRLINE)).apply {
                topMargin = context.dpInt(Dimens.SPACE_4)
                bottomMargin = context.dpInt(Dimens.SPACE_4)
            }
        }
        is LegalBlock.BulletList -> LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            for (item in block.items) {
                val row = textView(item, 15f, FontWeight.REGULAR, prefix = "•  ")
                addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = context.dpInt(Dimens.SPACE_1)
                })
            }
        }
        is LegalBlock.Table -> HorizontalScrollView(context).apply {
            isFillViewport = false
            addView(buildTable(block))
        }
    }

    private fun buildTable(table: LegalBlock.Table): TableLayout = TableLayout(context).apply {
        val border = Theme.palette.cardBorder
        addView(tableRow(table.header, bold = true, border = border))
        for (row in table.rows) addView(tableRow(row, bold = false, border = border))
    }

    private fun tableRow(cells: List<List<LegalInline>>, bold: Boolean, border: Int): TableRow = TableRow(context).apply {
        for (cell in cells) {
            val cellView = textView(cell, 13f, if (bold) FontWeight.SEMIBOLD else FontWeight.REGULAR)
            val pad = context.dpInt(Dimens.SPACE_2)
            cellView.setPadding(pad, pad, pad, pad)
            cellView.setBackgroundColor(if (bold) Theme.palette.cardBg else 0)
            addView(cellView, TableRow.LayoutParams(context.dpInt(160f), ViewGroup.LayoutParams.WRAP_CONTENT))
        }
    }

    private fun textView(inline: List<LegalInline>, sizeDp: Float, weight: FontWeight, prefix: String = ""): TextView = TextView(context).apply {
        text = spanned(inline, prefix)
        setTextIsSelectable(true)
        typeface = Fonts.display(weight)
        setTextSize(TypedValue.COMPLEX_UNIT_DIP, sizeDp)
        setTextColor(Theme.palette.textPrimary)
        setLineSpacing(0f, 1.6f)
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            bottomMargin = context.dpInt(Dimens.SPACE_3)
        }
    }

    private fun spanned(inline: List<LegalInline>, prefix: String): SpannableStringBuilder {
        val builder = SpannableStringBuilder(prefix)
        for (part in inline) {
            val start = builder.length
            builder.append(if (part is LegalInline.Bold) part.text else (part as LegalInline.Text).text)
            if (part is LegalInline.Bold) {
                builder.setSpan(StyleSpan(Typeface.BOLD), start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
        return builder
    }

    private fun headingSize(level: Int): Float = when (level) {
        1 -> 24f
        2 -> 18.4f
        else -> 16f
    }

    private fun headingWeight(level: Int): FontWeight = if (level == 1) FontWeight.BOLD else FontWeight.SEMIBOLD
}
