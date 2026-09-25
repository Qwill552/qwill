package com.qwill.app.search

import com.qwill.app.core.TaskQueue
import com.qwill.app.model.ChatSearchResult
import com.qwill.app.model.ChatType
import com.qwill.app.model.SearchResultsDto
import com.qwill.app.model.UserSearchResult
import com.qwill.app.net.ApiClient
import com.qwill.app.net.ApiResult
import com.qwill.app.net.NetworkError
import com.qwill.app.net.RequestHandle

enum class SearchFailure(val text: String) {
    NETWORK(NetworkError.MESSAGE),
    OTHER("Не удалось выполнить поиск"),
    START_CHAT("Не удалось начать чат"),
}

class SearchSession(
    private val guid: Int,
    private val api: ApiClient,
    private val main: TaskQueue,
    private val recents: RecentSearches,
    private val startPrivateChat: (username: String, guid: Int, callback: (ApiResult<String>) -> Unit) -> Unit,
) {
    var query: String = ""
        private set
    var results: SearchResultsDto? = null
        private set
    var loading = false
        private set
    var failure: SearchFailure? = null
        private set
    var openingUserId: String? = null
        private set

    var listener: (() -> Unit)? = null

    val state: SearchState get() = SearchState(query, results, loading, failure, openingUserId)

    private var handle: RequestHandle? = null
    private var generation = 0
    private val debounce = Runnable { runSearch() }

    fun setQuery(text: String) {
        if (text == query) return
        val previous = query.trim()
        query = text
        if (text.trim() == previous) return
        restart()
    }

    fun retry() {
        restart()
    }

    fun reset() {
        generation++
        cancelPending()
        query = ""
        results = null
        loading = false
        failure = null
        openingUserId = null
        notifyChanged()
    }

    fun openChat(chat: ChatSearchResult, open: (String) -> Unit) {
        recents.remember(
            RecentSearchEntry(
                chatId = chat.id,
                kind = RecentKind.CHAT,
                title = chat.title,
                username = null,
                avatarUrl = chat.avatarUrl,
                avatarColor = chat.avatarColor,
                type = chat.type,
                isService = chat.isService,
            ),
        )
        open(chat.id)
    }

    fun openUser(user: UserSearchResult, open: (String) -> Unit) {
        if (openingUserId != null) return
        openingUserId = user.id
        failure = null
        notifyChanged()
        val started = generation
        startPrivateChat(user.username, guid) { result ->
            if (started != generation) return@startPrivateChat
            openingUserId = null
            when (result) {
                is ApiResult.Success -> {
                    recents.remember(
                        RecentSearchEntry(
                            chatId = null,
                            kind = RecentKind.USER,
                            title = user.displayName,
                            username = user.username,
                            avatarUrl = user.avatarUrl,
                            avatarColor = user.avatarColor,
                            type = ChatType.PRIVATE,
                            isService = false,
                        ),
                    )
                    notifyChanged()
                    open(result.value)
                }
                is ApiResult.Failure -> {
                    failure = SearchFailure.START_CHAT
                    notifyChanged()
                }
            }
        }
    }

    fun dispose() {
        generation++
        cancelPending()
        listener = null
    }

    private fun restart() {
        cancelPending()
        if (query.trim().isEmpty()) {
            results = null
            failure = null
            loading = false
            notifyChanged()
            return
        }
        loading = true
        notifyChanged()
        main.postDelayed(debounce, DEBOUNCE_MS)
    }

    private fun runSearch() {
        val trimmed = query.trim()
        if (trimmed.isEmpty()) return
        handle = api.send(SearchRequests.search(trimmed), guid) { result ->
            handle = null
            when (result) {
                is ApiResult.Success -> {
                    results = result.value
                    failure = null
                }
                is ApiResult.Failure -> failure = if (result.error is NetworkError) SearchFailure.NETWORK else SearchFailure.OTHER
            }
            loading = false
            notifyChanged()
        }
    }

    private fun cancelPending() {
        main.cancel(debounce)
        handle?.let { api.cancel(it) }
        handle = null
    }

    private fun notifyChanged() {
        listener?.invoke()
    }

    companion object {
        const val DEBOUNCE_MS = 250L
    }
}
