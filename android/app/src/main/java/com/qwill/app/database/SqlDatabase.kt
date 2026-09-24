package com.qwill.app.database

import java.io.Closeable
import java.io.File

class SqlException(val code: Int, message: String) : Exception(message) {
    val corrupt: Boolean get() = (code and PRIMARY_MASK) == SQLITE_CORRUPT || (code and PRIMARY_MASK) == SQLITE_NOTADB

    private companion object {
        const val PRIMARY_MASK = 0xFF
        const val SQLITE_CORRUPT = 11
        const val SQLITE_NOTADB = 26
    }
}

interface SqlRow {
    fun isNull(index: Int): Boolean

    fun long(index: Int): Long

    fun string(index: Int): String?
}

interface SqlDatabase : Closeable {
    fun execute(sql: String, vararg args: Any?)

    fun <T> query(sql: String, vararg args: Any?, read: (SqlRow) -> T): List<T>

    fun changes(): Int

    fun <T> transaction(block: () -> T): T {
        execute("BEGIN IMMEDIATE")
        val result = try {
            block()
        } catch (e: Throwable) {
            try {
                execute("ROLLBACK")
            } catch (ignored: SqlException) {
            }
            throw e
        }
        execute("COMMIT")
        return result
    }
}

fun interface SqlOpener {
    fun open(file: File): SqlDatabase
}

fun SqlDatabase.queryLong(sql: String, vararg args: Any?): Long? =
    query(sql, *args) { if (it.isNull(0)) null else it.long(0) }.firstOrNull()
