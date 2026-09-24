package com.qwill.app.database

import java.io.File
import java.sql.Connection
import java.sql.DriverManager
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.SQLException
import org.sqlite.SQLiteException

class JdbcSqlDatabase(file: File) : SqlDatabase {
    private val connection: Connection = DriverManager.getConnection("jdbc:sqlite:${file.absolutePath}")

    private class Row(private val result: ResultSet) : SqlRow {
        override fun isNull(index: Int): Boolean = result.getObject(index + 1) == null

        override fun long(index: Int): Long = result.getLong(index + 1)

        override fun string(index: Int): String? = result.getString(index + 1)
    }

    override fun execute(sql: String, vararg args: Any?) {
        wrap { connection.prepareStatement(sql).use { statement -> bind(statement, args).execute() } }
    }

    override fun <T> query(sql: String, vararg args: Any?, read: (SqlRow) -> T): List<T> = wrap {
        connection.prepareStatement(sql).use { statement ->
            bind(statement, args).executeQuery().use { result ->
                val row = Row(result)
                val rows = ArrayList<T>()
                while (result.next()) rows.add(read(row))
                rows
            }
        }
    }

    override fun changes(): Int = wrap {
        connection.createStatement().use { statement ->
            statement.executeQuery("SELECT changes()").use { result -> if (result.next()) result.getInt(1) else 0 }
        }
    }

    override fun close() {
        connection.close()
    }

    private fun bind(statement: PreparedStatement, args: Array<out Any?>): PreparedStatement {
        for ((offset, value) in args.withIndex()) {
            val index = offset + 1
            when (value) {
                null -> statement.setObject(index, null)
                is Long -> statement.setLong(index, value)
                is Int -> statement.setLong(index, value.toLong())
                is Boolean -> statement.setLong(index, if (value) 1 else 0)
                is Double -> statement.setDouble(index, value)
                is String -> statement.setString(index, value)
                else -> throw IllegalArgumentException("неподдерживаемый тип аргумента: ${value.javaClass.simpleName}")
            }
        }
        return statement
    }

    private inline fun <T> wrap(body: () -> T): T = try {
        body()
    } catch (e: SQLiteException) {
        throw SqlException(e.resultCode.code, e.message.orEmpty())
    } catch (e: SQLException) {
        throw SqlException(e.errorCode, e.message.orEmpty())
    }

    companion object {
        val OPENER = SqlOpener { JdbcSqlDatabase(it) }
    }
}
