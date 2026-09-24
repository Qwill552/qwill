package com.qwill.app.net

sealed class ApiResult<out T> {
    class Success<out T>(val value: T) : ApiResult<T>()

    class Failure(val error: ApiException) : ApiResult<Nothing>()
}

fun interface ApiCallback<in T> {
    fun onResult(result: ApiResult<T>)
}
