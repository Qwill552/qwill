package com.qwill.app.tabs

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import com.qwill.app.QwillApplication
import com.qwill.app.chats.ChatsScreen
import com.qwill.app.contacts.ContactsScreen
import com.qwill.app.messenger.ChatsListener
import com.qwill.app.profile.ProfileScreen
import com.qwill.app.settings.SettingsScreen
import com.qwill.app.ui.AmbientBlobsView
import com.qwill.app.ui.insets.SafeArea
import com.qwill.app.ui.stack.Screen
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.dp
import java.util.EnumMap

class MainTabsScreen : Screen() {
    override val paintsOwnBackground: Boolean get() = true

    override val interceptsBack: Boolean
        get() = TabRules.interceptsBack(selected, pages[selected]?.interceptsBack == true)

    private val pages = EnumMap<MainTab, Screen>(MainTab::class.java)
    private var selected = MainTab.CHATS
    private var safeArea = SafeArea.NONE
    private var shown = false
    private var slide: ValueAnimator? = null
    private var reactivateTaps = 0

    private lateinit var root: FrameLayout
    private lateinit var blobs: AmbientBlobsView
    private lateinit var pagesHost: FrameLayout
    private lateinit var tabBar: TabBarView

    private val chatsListener = ChatsListener { updateUnread() }
    private val resetTaps = Runnable { reactivateTaps = 0 }

    val selectedTab: MainTab get() = selected

    override fun createView(context: Context): View {
        root = FrameLayout(context)
        blobs = AmbientBlobsView(context)
        root.addView(blobs, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        pagesHost = FrameLayout(context)
        root.addView(pagesHost, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        tabBar = TabBarView(context, root, ::onTabClick)
        root.addView(tabBar, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM))
        tabBar.setSafeArea(safeArea)
        tabBar.setSelected(selected, animated = false)
        tabBar.setHidden(chatsPage().searchActive, animated = false)

        attachPage(MainTab.CHATS).visibility = if (selected == MainTab.CHATS) View.VISIBLE else View.GONE
        if (selected != MainTab.CHATS) attachPage(selected).visibility = View.VISIBLE

        QwillApplication.messages.addChatsListener(chatsListener)
        updateUnread()
        return root
    }

    override fun onViewDestroyed() {
        slide?.end()
        slide = null
        root.removeCallbacks(resetTaps)
        reactivateTaps = 0
        QwillApplication.messages.removeChatsListener(chatsListener)
        for (page in pages.values) {
            val pageView = page.view ?: continue
            pagesHost.removeView(pageView)
            page.releaseView()
        }
    }

    override fun onDestroyed() {
        for (page in pages.values) {
            page.releaseView()
            page.destroy()
        }
        pages.clear()
    }

    override fun onShown() {
        shown = true
        pages[selected]?.takeIf { it.view != null }?.onShown()
    }

    override fun onHidden() {
        shown = false
        pages[selected]?.takeIf { it.view != null }?.onHidden()
    }

    override fun onBackPressed(): Boolean {
        val page = pages[selected]
        val handled = page != null && page.interceptsBack && page.onBackPressed()
        if (handled) return true
        val target = TabRules.backTarget(selected, pageHandled = false) ?: return false
        selectTab(target, animated = true)
        return true
    }

    override fun onSafeAreaChanged(area: SafeArea) {
        safeArea = area
        if (::tabBar.isInitialized) tabBar.setSafeArea(area)
        for (page in pages.values) if (page.view != null) page.onSafeAreaChanged(area)
    }

    override fun onThemeChanged() {
        if (!::root.isInitialized) return
        blobs.onThemeChanged()
        tabBar.applyTheme()
        for (page in pages.values) if (page.view != null) page.onThemeChanged()
    }

    fun selectTab(tab: MainTab, animated: Boolean) {
        if (tab == selected) return
        val from = selected
        slide?.end()
        selected = tab
        root.removeCallbacks(resetTaps)
        reactivateTaps = 0
        if (view == null) {
            backStateChanged()
            return
        }
        tabBar.setSelected(tab, animated)
        val outgoing = pages[from]
        outgoing?.view?.visibility = View.GONE
        if (shown) outgoing?.takeIf { it.view != null }?.onHidden()
        val incoming = attachPage(tab)
        incoming.visibility = View.VISIBLE
        if (shown) page(tab).onShown()
        backStateChanged()
        val kind = TabRules.transition(from, tab)
        if (!animated || !Motion.animationsEnabled || kind == TabTransition.NONE) {
            incoming.translationX = 0f
            return
        }
        val shift = root.context.dp(SLIDE_DP) * if (kind == TabTransition.FORWARD) 1f else -1f
        incoming.translationX = shift
        slide = ValueAnimator.ofFloat(1f, 0f).apply {
            duration = Motion.duration(SLIDE_MS)
            interpolator = SLIDE_CURVE
            addUpdateListener { incoming.translationX = shift * (it.animatedValue as Float) }
            addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(animation: Animator) {
                    incoming.translationX = 0f
                    if (slide === animation) slide = null
                }
            })
            start()
        }
    }

    private fun onTabClick(tab: MainTab) {
        if (tab != selected) {
            selectTab(tab, animated = true)
            return
        }
        if (tab != MainTab.CHATS) return
        val chats = chatsPage()
        if (chats.searchActive) return
        root.removeCallbacks(resetTaps)
        reactivateTaps++
        if (reactivateTaps == 1) {
            chats.scrollToTop()
        } else {
            chats.scrollToFirstUnread()
            reactivateTaps = 0
        }
        root.postDelayed(resetTaps, TabRules.REACTIVATE_RESET_MS)
    }

    private fun chatsPage(): ChatsScreen = page(MainTab.CHATS) as ChatsScreen

    private fun page(tab: MainTab): Screen = pages.getOrPut(tab) {
        val created = when (tab) {
            MainTab.CHATS -> ChatsScreen().also { chats ->
                chats.onSearchActiveChanged = { active, animated ->
                    if (::tabBar.isInitialized && view != null) tabBar.setHidden(active, animated)
                }
            }
            MainTab.CONTACTS -> ContactsScreen()
            MainTab.SETTINGS -> SettingsScreen()
            MainTab.PROFILE -> ProfileScreen()
        }
        created.embedIn(this)
        created
    }

    private fun attachPage(tab: MainTab): View {
        val page = page(tab)
        page.onSafeAreaChanged(safeArea)
        val pageView = page.obtainView(root.context)
        if (pageView.parent == null) {
            pagesHost.addView(pageView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        return pageView
    }

    private fun updateUnread() {
        if (!::tabBar.isInitialized) return
        tabBar.setUnread(QwillApplication.messages.chats.sumOf { it.unreadCount })
    }

    private companion object {
        const val SLIDE_DP = 76f
        const val SLIDE_MS = 420L
        val SLIDE_CURVE = PathInterpolator(0.22f, 1f, 0.36f, 1f)
    }
}
