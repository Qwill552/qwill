package com.qwill.app.files

import com.qwill.app.auth.LiveToken
import com.qwill.app.net.ExtraRootTrust
import com.qwill.app.net.HttpClients
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.security.SecureRandom
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.util.zip.CRC32
import java.util.zip.Deflater

class DevFilesTest {
    private val origin = "https://dev.qwill.mooo.com"

    private fun client(): OkHttpClient {
        val trust = File("src/main/res/raw/isrg_root_x1.pem").inputStream().use { ExtraRootTrust.systemPlus(it) }
        return HttpClients.create(trust)
    }

    @Test
    fun fileWithoutTokenIsUnauthorized() {
        val response = client().newCall(Request.Builder().url("$origin/api/files/nonexistent").build()).execute()
        response.use { assertEquals(401, it.code) }
    }

    @Test
    fun bearerGetsPartialContentOnRange() {
        val username = System.getenv("QWILL_DEV_USERNAME")
        val password = System.getenv("QWILL_DEV_PASSWORD")
        assumeTrue("нет QWILL_DEV_USERNAME/QWILL_DEV_PASSWORD", !username.isNullOrEmpty() && !password.isNullOrEmpty())
        val client = client()
        val login = Request.Builder()
            .url("$origin/api/auth/login")
            .header("X-Qwill-Session", "body")
            .post("""{"username":"$username","password":"$password"}""".toRequestBody("application/json".toMediaType()))
            .build()
        val token = client.newCall(login).execute().use { response ->
            assertEquals(200, response.code)
            Regex("\"accessToken\":\"([^\"]+)\"").find(response.body!!.string())!!.groupValues[1]
        }
        val http = FileHttp(client, origin, "qwill-test", { LiveToken.Ready(token, false) }) {}
        val source = Files.createTempFile("dev-avatar", ".png").toFile().apply { writeBytes(randomPng(16)) }
        val sha = MediaTasks.sha256(source)
        val uploaded = FileUploader(http).upload(source, "image/png", "avatar.png", FileUploader.PURPOSE_AVATAR, sha, CallSlot())
        source.delete()
        val body = """{"fileId":"${uploaded.file.id}","sha256":"$sha"}""".toRequestBody("application/json".toMediaType())
        http.execute("/api/users/me/avatar", CallSlot()) { it.post(body) }.use { assertEquals(200, it.code) }
        http.execute("/api/files/${uploaded.file.id}", CallSlot()) { it.header("Range", "bytes=0-9") }.use { response ->
            assertEquals(206, response.code)
            assertTrue(response.header("Content-Range")!!.startsWith("bytes 0-9/"))
            assertEquals(10, response.body!!.bytes().size)
        }
    }

    private fun randomPng(side: Int): ByteArray {
        val random = SecureRandom()
        val raw = ByteArrayOutputStream()
        for (row in 0 until side) {
            raw.write(0)
            repeat(side * 3) { raw.write(random.nextInt(256)) }
        }
        val deflater = Deflater().apply {
            setInput(raw.toByteArray())
            finish()
        }
        val packed = ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        while (!deflater.finished()) packed.write(buffer, 0, deflater.deflate(buffer))
        val header = ByteArrayOutputStream().also { out ->
            DataOutputStream(out).apply {
                writeInt(side)
                writeInt(side)
                writeByte(8)
                writeByte(2)
                writeByte(0)
                writeByte(0)
                writeByte(0)
            }
        }
        val out = ByteArrayOutputStream()
        out.write(byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte(), 13, 10, 26, 10))
        chunk(out, "IHDR", header.toByteArray())
        chunk(out, "IDAT", packed.toByteArray())
        chunk(out, "IEND", ByteArray(0))
        return out.toByteArray()
    }

    private fun chunk(out: ByteArrayOutputStream, type: String, data: ByteArray) {
        val stream = DataOutputStream(out)
        stream.writeInt(data.size)
        val typeBytes = type.toByteArray(Charsets.US_ASCII)
        stream.write(typeBytes)
        stream.write(data)
        val crc = CRC32().apply {
            update(typeBytes)
            update(data)
        }
        stream.writeInt(crc.value.toInt())
    }
}
