package com.qwill.app.database

import java.io.File

internal object NativeSqlite {
    init {
        System.loadLibrary("qwill_sqlite")
    }

    @JvmStatic external fun open(path: String): Long

    @JvmStatic external fun close(db: Long)

    @JvmStatic external fun prepare(db: Long, sql: ByteArray): Long

    @JvmStatic external fun bindLong(statement: Long, index: Int, value: Long)

    @JvmStatic external fun bindDouble(statement: Long, index: Int, value: Double)

    @JvmStatic external fun bindText(statement: Long, index: Int, value: ByteArray)

    @JvmStatic external fun bindNull(statement: Long, index: Int)

    @JvmStatic external fun step(statement: Long): Boolean

    @JvmStatic external fun columnIsNull(statement: Long, index: Int): Boolean

    @JvmStatic external fun columnLong(statement: Long, index: Int): Long

    @JvmStatic external fun columnDouble(statement: Long, index: Int): Double

    @JvmStatic external fun columnText(statement: Long, index: Int): ByteArray?

    @JvmStatic external fun finalizeStatement(statement: Long)

    @JvmStatic external fun changes(db: Long): Int

    @JvmStatic external fun version(): String
}

class NativeSqlDatabase private constructor(private var handle: Long) : SqlDatabase {
    private class Row(private val statement: Long) : SqlRow {
        override fun isNull(index: Int): Boolean = NativeSqlite.columnIsNull(statement, index)

        override fun long(index: Int): Long = NativeSqlite.columnLong(statement, index)

        override fun string(index: Int): String? = NativeSqlite.columnText(statement, index)?.toString(Charsets.UTF_8)
    }

    override fun execute(sql: String, vararg args: Any?) {
        run(sql, args) { statement -> while (NativeSqlite.step(statement)) Unit }
    }

    override fun <T> query(sql: String, vararg args: Any?, read: (SqlRow) -> T): List<T> {
        val rows = ArrayList<T>()
        run(sql, args) { statement ->
            val row = Row(statement)
            while (NativeSqlite.step(statement)) rows.add(read(row))
        }
        return rows
    }

    override fun changes(): Int = NativeSqlite.changes(requireOpen())

    override fun close() {
        if (handle == 0L) return
        NativeSqlite.close(handle)
        handle = 0
    }

    private inline fun run(sql: String, args: Array<out Any?>, body: (Long) -> Unit) {
        val statement = NativeSqlite.prepare(requireOpen(), sql.toByteArray(Charsets.UTF_8))
        try {
            bind(statement, args)
            body(statement)
        } finally {
            NativeSqlite.finalizeStatement(statement)
        }
    }

    private fun bind(statement: Long, args: Array<out Any?>) {
        for ((offset, value) in args.withIndex()) {
            val index = offset + 1
            when (value) {
                null -> NativeSqlite.bindNull(statement, index)
                is Long -> NativeSqlite.bindLong(statement, index, value)
                is Int -> NativeSqlite.bindLong(statement, index, value.toLong())
                is Boolean -> NativeSqlite.bindLong(statement, index, if (value) 1 else 0)
                is Double -> NativeSqlite.bindDouble(statement, index, value)
                is String -> NativeSqlite.bindText(statement, index, value.toByteArray(Charsets.UTF_8))
                else -> throw IllegalArgumentException("неподдерживаемый тип аргумента: ${value.javaClass.simpleName}")
            }
        }
    }

    private fun requireOpen(): Long {
        check(handle != 0L) { "база закрыта" }
        return handle
    }

    companion object {
        val OPENER = SqlOpener { file -> NativeSqlDatabase(NativeSqlite.open(file.absolutePath)) }

        fun version(): String = NativeSqlite.version()

        fun open(file: File): SqlDatabase = OPENER.open(file)
    }
}
