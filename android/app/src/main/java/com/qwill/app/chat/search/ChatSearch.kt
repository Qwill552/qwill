package com.qwill.app.chat.search

import com.qwill.app.chat.JumpOutcome
import com.qwill.app.core.plural
import com.qwill.app.model.ChatSearchResponse
import com.qwill.app.model.GroupMemberDTO
import com.qwill.app.model.MessageDto
import com.qwill.app.net.ApiException
import com.qwill.app.net.ApiResult
import com.qwill.app.net.NetworkError

enum class ChatSearchMode { CHAT, LIST }

fun interface SearchCancel {
    fun cancel()
}

interface ChatSearchTransport {
    fun search(q: String, before: Long?, fromUserId: String?, done: (ApiResult<ChatSearchResponse>) -> Unit): SearchCancel

    fun jump(messageId: Long, done: (JumpOutcome) -> Unit)
}

class ChatSearch(private val transport: ChatSearchTransport, private val onChange: () -> Unit) {
    var open = false
        private set
    var draft = ""
        private set
    var query = ""
        private set
    var from: GroupMemberDTO? = null
        private set
    var picking = false
        private set
    var mode = ChatSearchMode.CHAT
        private set
    var results: List<MessageDto> = emptyList()
        private set
    var total = 0
        private set
    var hasMore = false
        private set
    var index = 0
        private set
    var loading = false
        private set
    var loadingMore = false
        private set
    var error: String? = null
        private set

    private var generation = 0
    private var jumpGeneration = 0
    private var pending: SearchCancel? = null
    private var pendingMore: SearchCancel? = null

    val canOlder: Boolean get() = index + 1 < results.size || hasMore

    val canNewer: Boolean get() = index > 0

    fun open() {
        abort()
        reset()
        open = true
        run(jump = false)
    }

    fun close() {
        abort()
        reset()
        open = false
        onChange()
    }

    fun setDraft(text: String) {
        if (!open || text == draft) return
        draft = text
        if (mode == ChatSearchMode.LIST) mode = ChatSearchMode.CHAT
        if (text.isEmpty() && !picking) {
            run(jump = false)
            return
        }
        onChange()
    }

    fun submit() {
        if (!open || picking) return
        run(jump = true)
    }

    fun setMode(next: ChatSearchMode) {
        if (!open || next == mode) return
        if (next == ChatSearchMode.LIST && total == 0) return
        mode = next
        onChange()
    }

    fun next() {
        if (!open || results.isEmpty()) return
        val ahead = results.getOrNull(index + 1)
        if (ahead != null) {
            index += 1
            onChange()
            jump(ahead.id)
            return
        }
        if (!hasMore) return
        loadMore { grew ->
            if (!grew) return@loadMore
            val nextResult = results.getOrNull(index + 1) ?: return@loadMore
            index += 1
            onChange()
            jump(nextResult.id)
        }
    }

    fun prev() {
        if (!open || index <= 0) return
        val back = results.getOrNull(index - 1) ?: return
        index -= 1
        onChange()
        jump(back.id)
    }

    fun loadMore() {
        loadMore {}
    }

    fun select(position: Int) {
        val target = results.getOrNull(position) ?: return
        index = position
        mode = ChatSearchMode.CHAT
        onChange()
        jump(target.id)
    }

    fun startPicking() {
        if (!open) return
        picking = true
        draft = ""
        mode = ChatSearchMode.CHAT
        onChange()
    }

    fun pick(member: GroupMemberDTO) {
        if (!open) return
        from = member
        picking = false
        draft = ""
        run(jump = true)
    }

    fun clearCaption() {
        if (!open) return
        if (from != null) {
            from = null
            picking = true
            draft = ""
            run(jump = false)
            return
        }
        if (picking) {
            picking = false
            onChange()
        }
    }

    private fun reset() {
        draft = ""
        query = ""
        from = null
        picking = false
        mode = ChatSearchMode.CHAT
        results = emptyList()
        total = 0
        hasMore = false
        index = 0
        loading = false
        loadingMore = false
        error = null
    }

    private fun abort() {
        generation++
        jumpGeneration++
        pending?.cancel()
        pending = null
        pendingMore?.cancel()
        pendingMore = null
        loadingMore = false
    }

    private fun run(jump: Boolean) {
        abort()
        val mine = generation
        query = draft
        loading = true
        error = null
        onChange()
        pending = transport.search(query.trim(), null, from?.userId) { result ->
            if (mine != generation) return@search
            pending = null
            loading = false
            when (result) {
                is ApiResult.Success -> {
                    results = result.value.messages
                    total = result.value.total
                    hasMore = result.value.hasMore
                    index = 0
                    onChange()
                    val first = results.firstOrNull()
                    if (jump && first != null) jump(first.id)
                }
                is ApiResult.Failure -> {
                    results = emptyList()
                    total = 0
                    hasMore = false
                    index = 0
                    error = errorText(result.error)
                    onChange()
                }
            }
        }
    }

    private fun loadMore(then: (Boolean) -> Unit) {
        val last = results.lastOrNull() ?: return
        if (!hasMore || loadingMore || loading) return
        loadingMore = true
        val mine = generation
        onChange()
        pendingMore = transport.search(query.trim(), last.id, from?.userId) { result ->
            if (mine != generation) return@search
            pendingMore = null
            loadingMore = false
            if (result is ApiResult.Success) {
                results = results + result.value.messages
                hasMore = result.value.hasMore
                total = result.value.total
                onChange()
                then(result.value.messages.isNotEmpty())
            } else {
                onChange()
                then(false)
            }
        }
    }

    private fun jump(messageId: Long) {
        val mine = ++jumpGeneration
        transport.jump(messageId) { outcome ->
            if (mine != jumpGeneration || !open) return@jump
            when (outcome) {
                JumpOutcome.FAILED -> {
                    error = JUMP_FAILED
                    onChange()
                }
                JumpOutcome.OK -> if (error == JUMP_FAILED) {
                    error = null
                    onChange()
                }
                JumpOutcome.SUPERSEDED -> Unit
            }
        }
    }

    companion object {
        const val SEARCH_FAILED = "Не удалось выполнить поиск"
        const val JUMP_FAILED = "Не удалось открыть сообщение"

        fun errorText(error: ApiException): String = if (error is NetworkError) error.message ?: NetworkError.MESSAGE else SEARCH_FAILED
    }
}

object ChatSearchText {
    const val SEARCHING = "Ищу…"
    const val NOTHING = "Ничего не найдено"

    fun counter(search: ChatSearch): String = counter(search.error, search.loading, search.results.size, search.total, search.index, search.mode)

    fun counter(error: String?, loading: Boolean, loaded: Int, total: Int, index: Int, mode: ChatSearchMode): String = when {
        error != null -> error
        loading && loaded == 0 -> SEARCHING
        total == 0 -> NOTHING
        mode == ChatSearchMode.LIST -> "$total ${plural(total, "результат", "результата", "результатов")}"
        else -> "${index + 1} из $total"
    }
}
