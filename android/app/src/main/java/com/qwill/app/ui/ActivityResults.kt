package com.qwill.app.ui

import android.content.Intent

object ActivityResults {
    private val handlers = HashMap<Int, (Int, Intent?) -> Unit>()

    fun register(requestCode: Int, handler: (resultCode: Int, data: Intent?) -> Unit) {
        handlers[requestCode] = handler
    }

    fun unregister(requestCode: Int) {
        handlers.remove(requestCode)
    }

    fun dispatch(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        val handler = handlers[requestCode] ?: return false
        handler(resultCode, data)
        return true
    }
}
