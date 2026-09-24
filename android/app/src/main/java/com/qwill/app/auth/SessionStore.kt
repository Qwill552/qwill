package com.qwill.app.auth

import android.util.AtomicFile
import com.qwill.app.model.PublicUser
import com.qwill.app.net.ApiJson
import kotlinx.serialization.Serializable
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException

@Serializable
data class StoredSession(
    val refreshToken: String,
    val accessToken: String? = null,
    val accessExpiresAt: Long = 0,
    val user: PublicUser? = null,
)

interface SessionStore {
    fun read(): StoredSession?

    fun write(session: StoredSession)

    fun clear()
}

class FileSessionStore(file: File) : SessionStore {
    private val file = AtomicFile(file)

    override fun read(): StoredSession? {
        val bytes = try {
            file.readFully()
        } catch (e: FileNotFoundException) {
            return null
        } catch (e: IOException) {
            return null
        }
        return try {
            ApiJson.decodeFromString(StoredSession.serializer(), bytes.toString(Charsets.UTF_8))
        } catch (e: IllegalArgumentException) {
            null
        }
    }

    override fun write(session: StoredSession) {
        val bytes = ApiJson.encodeToString(StoredSession.serializer(), session).toByteArray(Charsets.UTF_8)
        val stream = file.startWrite()
        try {
            stream.write(bytes)
            file.finishWrite(stream)
        } catch (e: IOException) {
            file.failWrite(stream)
            throw e
        }
    }

    override fun clear() {
        file.delete()
    }
}
