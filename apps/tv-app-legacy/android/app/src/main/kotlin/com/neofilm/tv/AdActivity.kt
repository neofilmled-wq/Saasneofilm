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
                it.start()
                Log.i(TAG, "Playing: ${ad.advertiserName} ($adNumber/$totalAds)")
                startSkipCountdown()
            }
            mp.setOnCompletionListener {
                Log.i(TAG, "Done: ${ad.advertiserName}")
                handler.post { playNextAd() }
            }
            mp.setOnErrorListener { _, what, extra ->
                Log.e(TAG, "Video error: what=$what extra=$extra")
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
