package com.qwill.app.net

import com.qwill.app.auth.AuthRequests
import com.qwill.app.auth.Session
import com.qwill.app.core.TaskQueue
import com.qwill.app.model.ChangePasswordResponse
import com.qwill.app.model.LoginInput
import com.qwill.app.model.PublicUser
import com.qwill.app.model.RegisterInput

class ApiClient(
    private val transport: HttpTransport,
    private val session: Session,
    private val queue: TaskQueue,
    private val main: TaskQueue,
) {
    private val owners = HashMap<Int, MutableSet<RequestHandle>>()

    fun <T> send(request: ApiRequest<T>, guid: Int, callback: ApiCallback<T>): RequestHandle =
        dispatch(request, guid, callback) { ApiResult.Success(it) }

    fun login(input: LoginInput, guid: Int, callback: ApiCallback<PublicUser>): RequestHandle =
        dispatch(AuthRequests.login(input), guid, callback) { session.signIn(it) }

    fun register(input: RegisterInput, guid: Int, callback: ApiCallback<PublicUser>): RequestHandle =
        dispatch(AuthRequests.register(input), guid, callback) { session.signIn(it) }

    fun changePassword(
        currentPassword: String,
        newPassword: String,
        guid: Int,
        callback: ApiCallback<ChangePasswordResponse>,
    ): RequestHandle = send(AuthRequests.changePassword(currentPassword, newPassword), guid, callback)

    fun logout() {
        queue.post {
            val token = session.signOutLocally() ?: return@post
            transport.execute(AuthRequests.logout(token), null, token) {}
        }
    }

    fun cancel(handle: RequestHandle) {
        synchronized(owners) { owners[handle.guid]?.remove(handle) }
        handle.cancel()
    }

    fun cancelRequestsForGuid(guid: Int) {
        val handles = synchronized(owners) { owners.remove(guid) } ?: return
        for (handle in handles) handle.cancel()
    }

    private fun <T, R> dispatch(
        request: ApiRequest<T>,
        guid: Int,
        callback: ApiCallback<R>,
        onSuccess: (T) -> ApiResult<R>,
    ): RequestHandle {
        val handle = RequestHandle(guid)
        synchronized(owners) { owners.getOrPut(guid) { HashSet() }.add(handle) }
        queue.post {
            session.execute(request, handle) { result ->
                val delivered = when (result) {
                    is ApiResult.Success -> onSuccess(result.value)
                    is ApiResult.Failure -> result
                }
                main.post { deliver(handle, callback, delivered) }
            }
        }
        return handle
    }

    private fun <R> deliver(handle: RequestHandle, callback: ApiCallback<R>, result: ApiResult<R>) {
        synchronized(owners) {
            val set = owners[handle.guid] ?: return@synchronized
            set.remove(handle)
            if (set.isEmpty()) owners.remove(handle.guid)
        }
        if (handle.cancelled) return
        callback.onResult(result)
    }
}
