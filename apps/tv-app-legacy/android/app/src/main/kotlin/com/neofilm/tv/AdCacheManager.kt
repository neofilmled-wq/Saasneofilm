package com.neofilm.tv

import android.content.Context
import android.util.Log
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Pre-downloads ad videos to local cache so AdActivity plays instantly.
 * Files are stored in the app's cache dir with a hash of the URL as filename.
 */
object AdCacheManager {

    private const val TAG = "AdCacheManager"
    private const val CACHE_DIR = "ad_cache"
    private const val MAX_CACHE_SIZE_MB = 500L

    /** Get the cache directory, creating it if needed. */
    private fun cacheDir(context: Context): File {
        val dir = File(context.cacheDir, CACHE_DIR)
        if (!dir.exists()) dir.mkdirs()
        return dir
    }

    /** Generate a stable filename from a URL. */
    private fun cacheKey(url: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(url.toByteArray()).joinToString("") { "%02x".format(it) }.take(16)
        val ext = url.substringAfterLast('.', "mp4").substringBefore('?').take(4)
        return "$hash.$ext"
    }

    /** Get the local cached file for a given URL, or null if not cached. */
    fun getCachedFile(context: Context, url: String): File? {
        val file = File(cacheDir(context), cacheKey(url))
        return if (file.exists() && file.length() > 0) file else null
    }

    /** Pre-download all ads from JSON in a background thread. */
    fun precacheAds(context: Context, json: String) {
        Thread {
            try {
                val arr = JSONArray(json)
                val urls = mutableListOf<String>()
                for (i in 0 until arr.length()) {
                    val url = arr.getJSONObject(i).optString("fileUrl", "")
                    if (url.isNotBlank()) urls.add(url)
                }

                // Clean up old cached files not in the current ad list
                cleanOldCache(context, urls)

                for (url in urls) {
                    val cached = getCachedFile(context, url)
                    if (cached != null) {
                        Log.d(TAG, "Already cached: ${cacheKey(url)}")
                        continue
                    }
                    downloadToCache(context, url)
                }
            } catch (e: Exception) {
                Log.e(TAG, "precacheAds failed: ${e.message}")
            }
        }.start()
    }

    /** Download a single file to cache. */
    private fun downloadToCache(context: Context, url: String) {
        val fileName = cacheKey(url)
        val outFile = File(cacheDir(context), fileName)
        val tmpFile = File(cacheDir(context), "$fileName.tmp")

        try {
            Log.i(TAG, "Downloading: $fileName from ${url.takeLast(60)}")
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 30000
            conn.instanceFollowRedirects = true

            if (conn.responseCode != 200) {
                Log.w(TAG, "Download failed: HTTP ${conn.responseCode} for $fileName")
                conn.disconnect()
                return
            }

            conn.inputStream.use { input ->
                FileOutputStream(tmpFile).use { output ->
                    input.copyTo(output, bufferSize = 8192)
                }
            }
            conn.disconnect()

            // Rename tmp → final (atomic-ish)
            tmpFile.renameTo(outFile)
            Log.i(TAG, "Cached: $fileName (${outFile.length() / 1024}KB)")
        } catch (e: Exception) {
            Log.e(TAG, "Download failed for $fileName: ${e.message}")
            tmpFile.delete()
        }
    }

    /** Remove cached files that are no longer in the current ad list. */
    private fun cleanOldCache(context: Context, currentUrls: List<String>) {
        val validKeys = currentUrls.map { cacheKey(it) }.toSet()
        val dir = cacheDir(context)
        var cleaned = 0
        dir.listFiles()?.forEach { file ->
            if (file.name.endsWith(".tmp") || file.name !in validKeys) {
                file.delete()
                cleaned++
            }
        }
        if (cleaned > 0) Log.i(TAG, "Cleaned $cleaned old cache files")
    }
}
