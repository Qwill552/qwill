package com.qwill.app.emoji

import android.content.res.AssetManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.text.SpannableString
import android.text.Spanned
import android.util.Log
import android.util.LruCache
import com.qwill.app.core.TaskQueue
import com.qwill.app.net.ApiJson
import java.io.IOException

fun interface EmojiListener {
    fun onEmojiChanged(indexChanged: Boolean)
}

object Emoji {
    private const val TAG = "QwillEmoji"
    private const val INDEX_ASSET = "emoji/index.json"
    private const val SHEET_ASSET = "emoji/sheet.webp"
    private const val TILE_CELLS = 8
    private const val TILE_CACHE_BYTES = 6 * 1024 * 1024

    private lateinit var assets: AssetManager
    private lateinit var queue: TaskQueue
    private lateinit var main: TaskQueue
    private var started = false
    private var cell = 0
    private var cols = 0
    private var rows = 0
    private var decoder: BitmapRegionDecoder? = null
    private val pendingTiles = HashSet<Int>()
    private val failedTiles = HashSet<Int>()
    private val listeners = ArrayList<EmojiListener>()
    private val tiles = object : LruCache<Int, Bitmap>(TILE_CACHE_BYTES) {
        override fun sizeOf(key: Int, value: Bitmap): Int = value.byteCount
    }
    private val source = Rect()

    var matcher: EmojiMatcher? = null
        private set

    fun init(assetManager: AssetManager, workQueue: TaskQueue, mainQueue: TaskQueue) {
        if (started) return
        started = true
        assets = assetManager
        queue = workQueue
        main = mainQueue
        queue.post {
            val index = readIndex() ?: return@post
            val built = EmojiMatcher(index.emoji)
            main.post {
                cell = index.cell
                cols = index.cols
                rows = index.rows
                matcher = built
                notifyListeners(indexChanged = true)
            }
        }
    }

    fun addListener(listener: EmojiListener) {
        listeners.add(listener)
    }

    fun removeListener(listener: EmojiListener) {
        listeners.remove(listener)
    }

    fun replace(text: CharSequence, sizePx: Float): CharSequence {
        val current = matcher ?: return text
        val matches = current.find(text)
        if (matches.isEmpty()) return text
        val spannable = SpannableString(text)
        for (match in matches) spannable.setSpan(EmojiSpan(match.entry, sizePx), match.start, match.end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
        return spannable
    }

    fun draw(canvas: Canvas, entry: EmojiEntry, target: RectF, paint: Paint): Boolean {
        if (cell == 0) return false
        val key = tileKey(entry)
        val tile = tiles.get(key)
        if (tile == null) {
            requestTile(key)
            return false
        }
        val left = (entry.x % TILE_CELLS) * cell
        val top = (entry.y % TILE_CELLS) * cell
        source.set(left, top, left + cell, top + cell)
        canvas.drawBitmap(tile, source, target, paint)
        return true
    }

    private fun tileKey(entry: EmojiEntry): Int {
        val tilesPerRow = (cols + TILE_CELLS - 1) / TILE_CELLS
        return (entry.y / TILE_CELLS) * tilesPerRow + entry.x / TILE_CELLS
    }

    private fun requestTile(key: Int) {
        if (key in pendingTiles || key in failedTiles) return
        pendingTiles.add(key)
        val tileSide = cell * TILE_CELLS
        val tilesPerRow = (cols + TILE_CELLS - 1) / TILE_CELLS
        val sheetWidth = cols * cell
        val sheetHeight = rows * cell
        queue.post {
            val left = (key % tilesPerRow) * tileSide
            val top = (key / tilesPerRow) * tileSide
            val region = Rect(left, top, minOf(left + tileSide, sheetWidth), minOf(top + tileSide, sheetHeight))
            val bitmap = decodeRegion(region)
            main.post {
                pendingTiles.remove(key)
                if (bitmap == null) {
                    failedTiles.add(key)
                    return@post
                }
                tiles.put(key, bitmap)
                notifyListeners(indexChanged = false)
            }
        }
    }

    private fun decodeRegion(region: Rect): Bitmap? {
        val opened = decoder ?: openDecoder()?.also { decoder = it } ?: return null
        return try {
            opened.decodeRegion(region, BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 })
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "плитка эмодзи не прочиталась", e)
            null
        }
    }

    private fun openDecoder(): BitmapRegionDecoder? = try {
        assets.open(SHEET_ASSET).use { stream ->
            if (Build.VERSION.SDK_INT >= 31) {
                BitmapRegionDecoder.newInstance(stream)
            } else {
                @Suppress("DEPRECATION")
                BitmapRegionDecoder.newInstance(stream, false)
            }
        }
    } catch (e: IOException) {
        Log.w(TAG, "лист эмодзи не открылся", e)
        null
    }

    private fun readIndex(): EmojiIndexFile? = try {
        val raw = assets.open(INDEX_ASSET).use { it.readBytes().toString(Charsets.UTF_8) }
        ApiJson.decodeFromString(EmojiIndexFile.serializer(), raw)
    } catch (e: IOException) {
        Log.w(TAG, "индекс эмодзи не прочитался", e)
        null
    } catch (e: IllegalArgumentException) {
        Log.w(TAG, "индекс эмодзи не разобрался", e)
        null
    }

    private fun notifyListeners(indexChanged: Boolean) {
        for (listener in ArrayList(listeners)) listener.onEmojiChanged(indexChanged)
    }
}
