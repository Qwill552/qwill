package com.qwill.app.chat.composer

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.content.Context
import android.view.HapticFeedbackConstants
import android.view.animation.LinearInterpolator
import android.view.inputmethod.InputMethodManager
import com.qwill.app.QwillApplication
import com.qwill.app.chat.bottom.BottomMode
import com.qwill.app.chat.bottom.ChatBottomLayer
import com.qwill.app.chat.search.MemberSuggest
import com.qwill.app.chat.selection.EditRules
import com.qwill.app.core.MainQueue
import com.qwill.app.model.GroupMemberDTO
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiError
import com.qwill.app.net.ApiException
import com.qwill.app.realtime.TypingSender
import com.qwill.app.ui.QwillIcon
import com.qwill.app.ui.SpringMotion
import com.qwill.app.ui.theme.Motion
import com.qwill.app.ui.theme.dp

class ComposerController(private val chatId: String, private val host: Host) {
    interface Host {
        val myId: String?

        val groupChat: Boolean

        fun members(): List<GroupMemberDTO>?

        fun recentAuthorIds(): List<String>

        fun jumpTo(messageId: Long)

        fun socketReady(): Boolean
    }

    private val messages get() = QwillApplication.messages
    private val drafts get() = QwillApplication.drafts
    private val typing = TypingSender(QwillApplication.socket, chatId, MainQueue)
    private val shakeSpring = SpringMotion(SHAKE_STIFFNESS, SHAKE_DAMPING)
    private var shakeAnimator: ValueAnimator? = null

    var context: ComposerContext = ComposerContext.None
        private set

    private var text = ""
    private var selectionStart = 0
    private var selectionEnd = 0
    private var error: String? = null
    private var layer: ChatBottomLayer? = null
    private var draftChecked = false
    private var gone = false
    private var mentionMatch: MentionQueryMatch? = null

    val isEditing: Boolean get() = context is ComposerContext.Edit

    fun attach(bottom: ChatBottomLayer) {
        layer = bottom
        val input = bottom.composer.input
        input.setProgrammatic(text, cursorToEnd = false)
        input.setSelection(selectionStart.coerceIn(0, text.length), selectionEnd.coerceIn(0, text.length))
        input.onUserEdit = { value -> onUserEdit(value) }
        input.onSelectionMoved = { updateMentions(animated = true) }
        input.onSendShortcut = { submit() }
        input.setOnFocusChangeListener { _, _ -> updateMentions(animated = true) }
        bottom.composer.send.setOnClickListener { submit() }
        bottom.contextBar.onTap = { context.target?.let { host.jumpTo(it.id) } }
        bottom.contextBar.close.setOnClickListener { cancelContext() }
        bottom.mentions.onPick = { member -> insertMention(member) }
        render(animated = false)
    }

    fun detach() {
        val bottom = layer ?: return
        val input = bottom.composer.input
        text = input.value
        selectionStart = input.selectionStart.coerceAtLeast(0)
        selectionEnd = input.selectionEnd.coerceAtLeast(0)
        input.onUserEdit = null
        input.onSelectionMoved = null
        input.onSendShortcut = null
        input.onFocusChangeListener = null
        shakeAnimator?.cancel()
        shakeAnimator = null
        layer = null
    }

    fun restoreDraft() {
        if (draftChecked) return
        draftChecked = true
        val draft = drafts[chatId] ?: return
        if (text.isNotEmpty() || context != ComposerContext.None) return
        text = draft.text
        selectionStart = text.length
        selectionEnd = text.length
        context = draft.replyTo?.let { ComposerContext.Reply(it) } ?: ComposerContext.None
        layer?.composer?.input?.setProgrammatic(text)
        render(animated = false)
    }

    fun saveDraft() {
        if (gone) return
        val current = currentText()
        val (value, reply) = when (val c = context) {
            is ComposerContext.Edit -> c.stashed to c.stashedReply
            is ComposerContext.Reply -> current to c.message
            ComposerContext.None -> current to null
        }
        drafts.save(chatId, value, reply)
    }

    fun onLeave() {
        typing.onLeave()
    }

    fun reply(message: MessageDto) {
        if (context is ComposerContext.Edit) exitEdit()
        context = ComposerContext.Reply(message)
        render(animated = true)
        focusInput()
    }

    fun edit(message: MessageDto) {
        if (!EditRules.canEdit(message, host.myId)) return
        val current = currentText()
        val (stashed, stashedReply) = when (val c = context) {
            is ComposerContext.Edit -> c.stashed to c.stashedReply
            is ComposerContext.Reply -> current to c.message
            ComposerContext.None -> current to null
        }
        context = ComposerContext.Edit(message, stashed, stashedReply)
        setText(message.content.orEmpty())
        setError(null)
        render(animated = true)
        focusInput()
    }

    fun onMessagesRemoved(ids: Collection<Long>) {
        val target = context.target ?: return
        if (target.id !in ids) return
        when (val c = context) {
            is ComposerContext.Edit -> exitEdit()
            is ComposerContext.Reply -> {
                context = ComposerContext.None
                render(animated = true)
            }
            ComposerContext.None -> Unit
        }
    }

    fun onMessageChanged(message: MessageDto) {
        if (message.deletedAt != null) {
            onMessagesRemoved(listOf(message.id))
            return
        }
        when (val c = context) {
            is ComposerContext.Reply -> if (c.message.id == message.id) {
                context = ComposerContext.Reply(message)
                render(animated = false)
            }
            else -> Unit
        }
    }

    fun onChatGone() {
        gone = true
        drafts.remove(chatId)
    }

    fun showError(message: String) {
        setError(message)
    }

    fun refreshMentions() {
        updateMentions(animated = true)
    }

    fun onModeChanged() {
        updateMentions(animated = true)
    }

    fun dropKeyboard() {
        val input = layer?.composer?.input ?: return
        val imm = input.context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        imm?.hideSoftInputFromWindow(input.windowToken, 0)
        input.clearFocus()
    }

    private fun focusInput() {
        val input = layer?.composer?.input ?: return
        input.requestFocus()
        val imm = input.context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager ?: return
        imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun currentText(): String = layer?.composer?.input?.value ?: text

    private fun setText(value: String) {
        text = value
        selectionStart = value.length
        selectionEnd = value.length
        layer?.composer?.input?.setProgrammatic(value)
    }

    private fun onUserEdit(value: String) {
        text = value
        if (context !is ComposerContext.Edit) typing.onTextChanged(value)
        updateCircle(animated = true)
        updateMentions(animated = true)
    }

    private fun submit() {
        when (val c = context) {
            is ComposerContext.Edit -> saveEdit(c)
            else -> send()
        }
    }

    private fun send() {
        val trimmed = currentText().trim()
        if (trimmed.isEmpty()) return
        val reply = (context as? ComposerContext.Reply)?.message
        for (part in LongText.split(trimmed)) messages.sendText(chatId, part, reply)
        context = ComposerContext.None
        setText("")
        drafts.remove(chatId)
        typing.onSent()
        setError(null)
        render(animated = true)
    }

    private fun saveEdit(edit: ComposerContext.Edit) {
        val value = currentText().trim()
        if (value.isEmpty()) return
        if (value == edit.message.content.orEmpty().trim()) {
            exitEdit()
            return
        }
        if (value.length > LongText.LIMIT) {
            shake()
            setError(ComposerTexts.tooLong(value.length, LongText.LIMIT))
            return
        }
        if (!host.socketReady()) {
            setError(ComposerTexts.NO_CONNECTION)
            return
        }
        exitEdit()
        setError(null)
        messages.editMessage(edit.message, value) { failure -> if (failure != null) setError(editFailure(failure)) }
    }

    private fun editFailure(failure: ApiException): String {
        val message = (failure as? ApiError)?.message
        return if (message.isNullOrBlank()) ComposerTexts.EDIT_FAILED else message
    }

    private fun exitEdit() {
        val edit = context as? ComposerContext.Edit ?: return
        context = edit.stashedReply?.let { ComposerContext.Reply(it) } ?: ComposerContext.None
        setText(edit.stashed)
        render(animated = true)
    }

    private fun cancelContext() {
        when (context) {
            is ComposerContext.Edit -> exitEdit()
            is ComposerContext.Reply -> {
                context = ComposerContext.None
                render(animated = true)
            }
            ComposerContext.None -> Unit
        }
    }

    private fun setError(value: String?) {
        if (value == error) return
        error = value
        val bottom = layer ?: return
        if (value != null) bottom.errorLine.set(value)
        bottom.setErrorShown(value != null)
    }

    private fun render(animated: Boolean) {
        val bottom = layer ?: return
        when (val c = context) {
            ComposerContext.None -> bottom.setContextShown(false)
            is ComposerContext.Reply -> {
                bottom.contextBar.set(ComposerTexts.replyTitle(c.message), ComposerTexts.preview(c.message))
                bottom.setContextShown(true)
            }
            is ComposerContext.Edit -> {
                bottom.contextBar.set(ComposerTexts.EDITING, ComposerTexts.preview(c.message))
                bottom.setContextShown(true)
            }
        }
        error?.let { bottom.errorLine.set(it) }
        bottom.setErrorShown(error != null)
        updateCircle(animated)
        updateMentions(animated)
    }

    private fun updateCircle(animated: Boolean) {
        val bottom = layer ?: return
        val editing = context is ComposerContext.Edit
        val filled = currentText().isNotBlank()
        val icon = when {
            editing -> QwillIcon.CHECK
            filled -> QwillIcon.SEND
            else -> QwillIcon.MIC
        }
        bottom.composer.send.setIcon(icon, animated)
        bottom.composer.send.setLocked(editing && !filled, animated)
        bottom.composer.capsule.attach.isEnabled = !editing
        val input = bottom.composer.input
        val hint = if (editing) ComposerTexts.PLACEHOLDER_EDIT else ComposerTexts.PLACEHOLDER
        if (input.hint?.toString() != hint) {
            input.hint = hint
            input.contentDescription = hint
        }
    }

    private fun updateMentions(animated: Boolean) {
        val bottom = layer ?: return
        val input = bottom.composer.input
        val match = if (host.groupChat && input.hasFocus() && bottom.currentMode == BottomMode.COMPOSER) {
            MentionQuery.find(input.text ?: "", input.selectionStart, input.selectionEnd)
        } else {
            null
        }
        mentionMatch = match
        val list = if (match == null) emptyList() else MemberSuggest.filter(host.members(), match.query, host.recentAuthorIds().take(RECENT_LIMIT), host.myId)
        bottom.mentions.setMembers(list, match?.query.orEmpty(), list.isNotEmpty(), animated)
    }

    private fun insertMention(member: GroupMemberDTO) {
        val match = mentionMatch ?: return
        val input = layer?.composer?.input ?: return
        val insertion = MentionQuery.insertion(member.username)
        input.replaceRange(match.start, match.end, insertion)
        val cursor = (match.start + insertion.length).coerceAtMost(input.length())
        input.setSelection(cursor)
        updateMentions(animated = true)
    }

    private fun shake() {
        val circle = layer?.composer?.send ?: return
        circle.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
        if (!Motion.animationsEnabled) return
        shakeAnimator?.cancel()
        circle.translationX = 0f
        val v0 = -circle.context.dp(SHAKE_SHIFT) * 100f
        val durationMs = shakeSpring.settleDurationMs(0f, v0, SHAKE_EPSILON).coerceAtLeast(1L)
        val animator = ValueAnimator.ofFloat(0f, durationMs / 1000f)
        animator.duration = durationMs
        animator.interpolator = LinearInterpolator()
        animator.addUpdateListener { circle.translationX = shakeSpring.valueAt(it.animatedValue as Float, 0f, v0) }
        animator.addListener(object : AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: Animator) {
                if (shakeAnimator === animation) shakeAnimator = null
                circle.translationX = 0f
            }
        })
        shakeAnimator = animator
        animator.start()
    }

    private companion object {
        const val RECENT_LIMIT = 100
        const val SHAKE_SHIFT = 3.5f
        const val SHAKE_STIFFNESS = 600f
        const val SHAKE_DAMPING = 0.5f
        const val SHAKE_EPSILON = 0.5f
    }
}
