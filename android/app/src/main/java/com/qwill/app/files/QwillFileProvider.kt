package com.qwill.app.files

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

class QwillFileProvider : ContentProvider() {
    private lateinit var media: File

    override fun onCreate(): Boolean {
        media = File(context!!.cacheDir, MEDIA_DIR)
        return true
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("только чтение")
        val file = resolve(uri) ?: throw FileNotFoundException(uri.toString())
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri): String {
        val name = uri.getQueryParameter(PARAM_NAME) ?: uri.lastPathSegment.orEmpty()
        return MediaTypes.mimeTypeOf(null, name)
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val file = resolve(uri)
        val columns = projection?.filter { it == OpenableColumns.DISPLAY_NAME || it == OpenableColumns.SIZE }?.toTypedArray()
            ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        val cursor = MatrixCursor(columns)
        if (file == null) return cursor
        val name = uri.getQueryParameter(PARAM_NAME) ?: file.name
        cursor.addRow(columns.map { if (it == OpenableColumns.DISPLAY_NAME) name else file.length() }.toTypedArray())
        return cursor
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = throw UnsupportedOperationException()

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException()

    private fun resolve(uri: Uri): File? {
        val segments = uri.pathSegments
        if (segments.size != 2 || segments[0] != MEDIA_DIR) return null
        val file = File(media, segments[1])
        if (file.canonicalFile.parentFile != media.canonicalFile) return null
        return file.takeIf { it.isFile }
    }

    companion object {
        private const val MEDIA_DIR = "media"
        private const val PARAM_NAME = "name"

        fun authority(context: Context): String = "${context.packageName}.files"

        fun uriFor(context: Context, file: File, originalName: String): Uri = Uri.Builder()
            .scheme("content")
            .authority(authority(context))
            .appendPath(MEDIA_DIR)
            .appendPath(file.name)
            .appendQueryParameter(PARAM_NAME, originalName.ifBlank { file.name })
            .build()
    }
}
