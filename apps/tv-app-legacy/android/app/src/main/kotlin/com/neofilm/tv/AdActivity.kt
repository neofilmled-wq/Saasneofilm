package com.neofilm.tv

import android.app.Activity
import android.graphics.Color
import android.graphics.SurfaceTexture
import android.graphics.Typeface
import android.media.MediaPlayer
import android.net.Uri
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.Surface
import android.view.TextureView
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

class AdActivity : Activity() {

    companion object {
        private const val TAG = "AdActivity"
        private const val SKIP_DELAY_MS = 5000L
    }

    private val handler = Handler(Looper.getMainLooper())
    private var returnToPackage: String = ""
    private var currentPlayer: MediaPlayer? = null
    private var currentTimer: CountDownTimer? = null
    private var adQueue = mutableListOf<AdData>()
    private var totalAds = 0
    private var isTransitioning = false
    private var adStartTime: Long = 0
    private var currentAd: AdData? = null

    private lateinit var container: FrameLayout
    private lateinit var textureView: TextureView
    private lateinit var badge: TextView
    private lateinit var skip: TextView

    data class AdData(
        val fileUrl: String,
        val advertiserName: String,
        val durationMs: Long,
        val mimeType: String,
        val campaignId: String = "",
        val creativeId: String = ""
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        window.addFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)

        returnToPackage = intent.getStringExtra("return_to_package") ?: ""

        val prefs = getSharedPreferences("neofilm_tv_prefs", MODE_PRIVATE)
        val allAds = parseAds(prefs.getString("ads_data_json", "[]") ?: "[]")

        if (allAds.isEmpty()) {
            Log.i(TAG, "No ads — closing")
            finish()
            return
        }

        val selected = if (allAds.size == 1) listOf(allAds[0]) else allAds.shuffled().take(2)
        totalAds = selected.size
        adQueue = selected.toMutableList()
        Log.i(TAG, "Starting ad sequence: ${selected.size} ad(s)")

        // Build UI
        container = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }

        textureView = TextureView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        container.addView(textureView)

        badge = TextView(this).apply {
            setTextColor(Color.parseColor("#B0FFFFFF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(40, 30, 0, 0)
        }
        container.addView(badge, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.TOP or Gravity.START })

        skip = TextView(this).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = Typeface.DEFAULT_BOLD
            setBackgroundColor(Color.parseColor("#CC000000"))
            setPadding(40, 20, 40, 20)
            visibility = View.GONE
            isFocusable = true
            isFocusableInTouchMode = true
        }
        container.addView(skip, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            setMargins(0, 0, 40, 40)
        })

        setContentView(container)

        textureView.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
                playNextAd(Surface(surface))
            }
            override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}
            override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean = true
            override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
        }
    }

    private fun playNextAd(surface: Surface? = null) {
        if (adQueue.isEmpty()) {
            Log.i(TAG, "All ads done — closing")
            // Sync cache in background after ad sequence
            val adsJson = getSharedPreferences("neofilm_tv_prefs", MODE_PRIVATE)
                .getString("ads_data_json", null)
            if (!adsJson.isNullOrBlank()) {
                AdCacheManager.precacheAds(applicationContext, adsJson)
            }
            finish()
            return
        }

        isTransitioning = true
        val ad = adQueue.removeAt(0)
        currentAd = ad
        val adNumber = totalAds - adQueue.size

        badge.text = "Publicite - ${ad.advertiserName} ($adNumber/$totalAds)"
        skip.visibility = View.GONE
        skip.isClickable = false
        skip.setOnClickListener(null)
        currentTimer?.cancel()

        try { currentPlayer?.release() } catch (_: Exception) {}
        currentPlayer = null

        val mp = MediaPlayer()
        currentPlayer = mp

        val useSurface = surface ?: if (textureView.isAvailable) Surface(textureView.surfaceTexture) else null
        if (useSurface == null) {
            Log.e(TAG, "No surface available")
            finish()
            return
        }

        try {
            mp.setSurface(useSurface)
            // Use cached file if available, otherwise stream from URL
            val cachedFile = AdCacheManager.getCachedFile(this, ad.fileUrl)
            if (cachedFile != null) {
                Log.i(TAG, "Playing from cache: ${cachedFile.name}")
                mp.setDataSource(cachedFile.absolutePath)
            } else {
                Log.i(TAG, "Streaming from URL (not cached)")
                mp.setDataSource(this, Uri.parse(ad.fileUrl))
            }
            mp.isLooping = false

            mp.setOnPreparedListener {
                isTransitioning = false
                adStartTime = System.currentTimeMillis()
                it.start()
                Log.i(TAG, "Playing: ${ad.advertiserName} ($adNumber/$totalAds)")
                startSkipCountdown()
            }
            mp.setOnCompletionListener {
                val durationMs = System.currentTimeMillis() - adStartTime
                Log.i(TAG, "Completed: ${ad.advertiserName} (${durationMs}ms)")
                reportImpression(ad, durationMs)
                handler.post { playNextAd() }
            }
            mp.setOnErrorListener { _, what, extra ->
                val durationMs = System.currentTimeMillis() - adStartTime
                Log.e(TAG, "Video error: what=$what extra=$extra (${durationMs}ms)")
                if (durationMs > 1000) reportImpression(ad, durationMs)
                handler.post { playNextAd() }
                true
            }
            mp.prepareAsync()
        } catch (e: Exception) {
            Log.e(TAG, "Setup failed: ${e.message}")
            finish()
        }
    }

    private fun startSkipCountdown() {
        skip.visibility = View.VISIBLE
        skip.text = "Passer dans 5s"
        skip.isClickable = false
        skip.setOnClickListener(null)

        currentTimer = object : CountDownTimer(SKIP_DELAY_MS, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                skip.text = "Passer dans ${(millisUntilFinished / 1000) + 1}s"
            }
            override fun onFinish() {
                skip.text = "Passer  \u25B6\u25B6"
                skip.isClickable = true
                skip.isFocusable = true
                skip.setOnClickListener {
                    if (isTransitioning) return@setOnClickListener
                    val durationMs = System.currentTimeMillis() - adStartTime
                    currentAd?.let { ad ->
                        Log.i(TAG, "Skipped: ${ad.advertiserName} (${durationMs}ms)")
                        reportImpression(ad, durationMs)
                    }
                    try { currentPlayer?.stop() } catch (_: Exception) {}
                    handler.post { playNextAd() }
                }
                skip.requestFocus()
            }
        }.start()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) return true
        if ((keyCode == KeyEvent.KEYCODE_DPAD_CENTER || keyCode == KeyEvent.KEYCODE_ENTER) && skip.isClickable) {
            skip.performClick()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        currentTimer?.cancel()
        try { currentPlayer?.release() } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun reportImpression(ad: AdData, durationMs: Long) {
        Thread {
            try {
                val prefs = getSharedPreferences("neofilm_tv_prefs", MODE_PRIVATE)
                val apiUrl = prefs.getString("api_url", null) ?: return@Thread
                val token = prefs.getString("device_token", null) ?: return@Thread
                val deviceId = prefs.getString("device_id", null) ?: return@Thread
                val screenId = prefs.getString("screen_id", null) ?: return@Thread

                val now = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                    .apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
                val endTime = now.format(java.util.Date())
                val startTime = now.format(java.util.Date(System.currentTimeMillis() - durationMs))

                val proof = JSONObject().apply {
                    put("proofId", UUID.randomUUID().toString())
                    put("screenId", screenId)
                    put("campaignId", ad.campaignId)
                    put("creativeId", ad.creativeId)
                    put("startTime", startTime)
                    put("endTime", endTime)
                    put("durationMs", durationMs)
                    put("triggerContext", "SCHEDULED")
                    put("appVersion", "0.2.0")
                    put("mediaHash", ad.fileUrl.hashCode().toString(16))
                    put("signature", "none")
                }

                val body = JSONObject().apply {
                    put("deviceId", deviceId)
                    put("batchId", UUID.randomUUID().toString())
                    put("proofs", JSONArray().put(proof))
                }

                val url = URL("$apiUrl/diffusion/log")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.doOutput = true
                conn.outputStream.write(body.toString().toByteArray())

                val code = conn.responseCode
                Log.i(TAG, "Impression reported: HTTP $code (campaign=${ad.campaignId.takeLast(6)})")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Impression report failed: ${e.message}")
            }
        }.start()
    }

    private fun parseAds(json: String): List<AdData> {
        val result = mutableListOf<AdData>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val fileUrl = obj.optString("fileUrl", "")
                if (fileUrl.isBlank()) continue
                result.add(AdData(
                    fileUrl = fileUrl,
                    advertiserName = obj.optString("advertiserName", ""),
                    durationMs = obj.optLong("durationMs", 15000),
                    mimeType = obj.optString("mimeType", "video/mp4"),
                    campaignId = obj.optString("campaignId", ""),
                    creativeId = obj.optString("creativeId", "")
                ))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Parse error: ${e.message}")
        }
        return result
    }
}
