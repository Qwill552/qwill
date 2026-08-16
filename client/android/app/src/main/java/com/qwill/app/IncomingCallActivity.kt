package com.qwill.app

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import java.lang.ref.WeakReference

class IncomingCallActivity : Activity() {

    private var callId: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        showOverLockScreen()
        setContentView(R.layout.activity_incoming_call)
        current = WeakReference(this)
        bind(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        bind(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        if (current?.get() === this) current = null
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        NativeCalls.reject(callId)
    }

    private fun bind(source: Intent?) {
        val incoming = source ?: return
        callId = incoming.getStringExtra(NativeCalls.EXTRA_CALL_ID).orEmpty()

        val callerName = incoming.getStringExtra(NativeCalls.EXTRA_CALLER_NAME)
            ?.takeIf { it.isNotBlank() }
            ?: getString(R.string.call_unknown_caller)
        val callKind = incoming.getStringExtra(NativeCalls.EXTRA_CALL_KIND).orEmpty()

        findViewById<TextView>(R.id.call_name).text = callerName
        findViewById<TextView>(R.id.call_status).setText(
            if (callKind == NativeCalls.KIND_VIDEO) R.string.call_incoming_video else R.string.call_incoming_audio,
        )
        findViewById<LetterAvatarView>(R.id.call_avatar).letter = callerName.take(1).uppercase()

        findViewById<ImageView>(R.id.call_accept).setOnClickListener { NativeCalls.answer(callId) }
        findViewById<ImageView>(R.id.call_decline).setOnClickListener { NativeCalls.reject(callId) }

        if (incoming.getBooleanExtra(EXTRA_ANSWER_NOW, false)) NativeCalls.answer(callId)
    }

    private fun showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    private fun finishResolved(accepted: Boolean) {
        if (accepted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            keyguard?.requestDismissKeyguard(this, null)
        }
        launchApp(this, callId, accepted)
        finish()
    }

    companion object {
        const val EXTRA_ANSWER_NOW = "com.qwill.app.extra.ANSWER_NOW"

        private var current: WeakReference<IncomingCallActivity>? = null

        fun intent(
            context: Context,
            callId: String,
            callerName: String,
            callKind: String,
            answerNow: Boolean,
        ): Intent = Intent(context, IncomingCallActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra(NativeCalls.EXTRA_CALL_ID, callId)
            putExtra(NativeCalls.EXTRA_CALLER_NAME, callerName)
            putExtra(NativeCalls.EXTRA_CALL_KIND, callKind)
            putExtra(EXTRA_ANSWER_NOW, answerNow)
        }

        fun resolve(context: Context, callId: String, accepted: Boolean) {
            val activity = current?.get()
            if (activity == null) {
                launchApp(context, callId, accepted)
                return
            }
            activity.runOnUiThread { activity.finishResolved(accepted) }
        }

        fun dismiss(callId: String) {
            val activity = current?.get() ?: return
            if (activity.callId != callId) return
            activity.runOnUiThread { activity.finish() }
        }

        private fun launchApp(context: Context, callId: String, accepted: Boolean) {
            val intent = Intent(context, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_NO_ANIMATION,
                )
                putExtra(NativeCalls.EXTRA_CALL_ID, callId)
                putExtra(NativeCalls.EXTRA_ACCEPTED, accepted)
            }
            context.startActivity(intent)
        }
    }
}
