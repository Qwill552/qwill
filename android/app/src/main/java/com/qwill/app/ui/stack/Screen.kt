package com.qwill.app.ui.stack

import android.content.Context
import android.view.View
import com.qwill.app.QwillApplication
import com.qwill.app.net.RequestGuid
import com.qwill.app.ui.insets.SafeArea

abstract class Screen {
    val classGuid: Int = RequestGuid.next()

    var stack: ScreenStack? = null
        internal set

    var view: View? = null
        private set

    open val paintsOwnBackground: Boolean get() = false

    open val interceptsBack: Boolean get() = false

    protected abstract fun createView(context: Context): View

    open fun onShown() {}

    open fun onHidden() {}

    open fun onViewDestroyed() {}

    open fun onDestroyed() {}

    open fun onBackPressed(): Boolean = false

    open fun onSafeAreaChanged(area: SafeArea) {}

    open fun onThemeChanged() {}

    protected fun backStateChanged() {
        stack?.notifyBackStateChanged()
    }

    internal fun destroy() {
        QwillApplication.api.cancelRequestsForGuid(classGuid)
        QwillApplication.socket.cancelRequestsForGuid(classGuid)
        QwillApplication.messages.cancelRequestsForGuid(classGuid)
        onDestroyed()
    }

    internal fun obtainView(context: Context): View = view ?: createView(context).also { view = it }

    internal fun releaseView() {
        if (view == null) return
        view = null
        onViewDestroyed()
    }
}
