package com.neofilm.tv

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.SurfaceTexture
import android.graphics.Typeface
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
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

/**
 * Plays the ad sequence as a system overlay (TYPE_APPLICATION_OVERLAY)
 * sitting ON TOP of whatever app is currently in the foreground (YouTube, Netflix, …).
 *
 * Key benefits over the previous Activity-based AdActivity:
 *   - The underlying app is NOT pushed through onPause→onStop, so apps that
 *     reset to home on long pauses (YouTube TV) keep their playback state.
 *   - We grab transient AudioFocus so well-behaved media apps pause their
 *     own audio/video for the duration of the ad and resume right after.
 *
 * Requires SYSTEM_ALERT_WINDOW (already requested in MainActivity.onCreate).
 * If the permission is missing, the caller should fall back to AdActivity.
 */
class AdOverlayPlayer(private val context: Context) {

    companion object {
        private const val TAG = "AdOverlayPlayer"
        private const val SKIP_DELAY_MS = 5000L

        fun canDrawOverlays(context: Context): Boolean {
            return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.provider.Settings.canDrawOverlays(context)
            } else true
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val windowManager = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var rootView: FrameLayout? = null
    private var textureView: TextureView? = null
    private var badge: TextView? = null
    private var skip: TextView? = null

    private var currentPlayer: MediaPlayer? = null
    private var currentTimer: CountDownTimer? = null
    private var adQueue = mutableListOf<AdData>()
    private var totalAds = 0
    private var isTransitioning = false
    private var adStartTime: Long = 0
    private var currentAd: AdData? = null

    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus = false
    private var isShowing = false

    data class AdData(
        val fileUrl: String,
        val advertiserName: String,
        val durationMs: Long,
        val mimeType: String,
        val campaignId: String = "",
        val creativeId: String = ""
    )

    /** Show the overlay and play the ad sequence. No-op if already running. */
    fun show() {
        if (isShowing) return
        if (!canDrawOverlays(context)) {
            Log.w(TAG, "SYSTEM_ALERT_WINDOW not granted — overlay aborted")
            return
        }

        val prefs = context.getSharedPreferences("neofilm_tv_prefs", Context.MODE_PRIVATE)
        val allAds = parseAds(prefs.getString("ads_data_json", "[]") ?: "[]")
        if (allAds.isEmpty()) {
            Log.i(TAG, "No ads — skip")
            return
        }

        val selected = if (allAds.size == 1) listOf(allAds[0]) else allAds.shuffled().take(2)
        totalAds = selected.size
        adQueue = selected.toMutableList()
        Log.i(TAG, "Starting overlay ad sequence: ${selected.size} ad(s)")

        requestAudioFocus()
        attachOverlay()
        isShowing = true
    }

    /** Remove the overlay and release resources. */
    fun hide() {
        if (!isShowing) return
        isShowing = false

        currentTimer?.cancel()
        currentTimer = null
        try { currentPlayer?.stop() } catch (_: Exception) {}
        try { currentPlayer?.release() } catch (_: Exception) {}
        currentPlayer = null

        rootView?.let {
            try { windowManager.removeView(it) } catch (_: Exception) {}
        }
        rootView = null
        textureView = null
        badge = null
        skip = null

        abandonAudioFocus()

        // Sync cache in background after ad sequence ended
        val adsJson = context.getSharedPreferences("neofilm_tv_prefs", Context.MODE_PRIVATE)
            .getString("ads_data_json", null)
        if (!adsJson.isNullOrBlank()) {
            AdCacheManager.precacheAds(context.applicationContext, adsJson)
        }
    }

    // ── Audio focus ─────────────────────────────────────────────────────────

    private fun requestAudioFocus() {
        if (hasAudioFocus) return
        val result: Int = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attrs)
                .setOnAudioFocusChangeListener {}
                .build()
            audioFocusRequest = req
            audioManager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            audioManager.requestAudioFocus(null, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        }
        hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        Log.i(TAG, "Audio focus request: ${if (hasAudioFocus) "GRANTED" else "DENIED"}")
    }

    private fun abandonAudioFocus() {
        if (!hasAudioFocus) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            audioFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
        hasAudioFocus = false
        Log.i(TAG, "Audio focus released — underlying app should resume")
    }

    // ── Overlay window ──────────────────────────────────────────────────────

    @SuppressLint("ClickableViewAccessibility")
    private fun attachOverlay() {
        val root = FrameLayout(context).apply {
            setBackgroundColor(Color.BLACK)
            isFocusable = true
            isFocusableInTouchMode = true
        }

        val tv = TextureView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        }
        root.addView(tv)

        val b = TextView(context).apply {
            setTextColor(Color.parseColor("#B0FFFFFF"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            setPadding(40, 30, 0, 0)
        }
        root.addView(b, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply { gravity = Gravity.TOP or Gravity.START })

        val s = TextView(context).apply {
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = Typeface.DEFAULT_BOLD
            setBackgroundColor(Color.parseColor("#CC000000"))
            setPadding(40, 20, 40, 20)
            visibility = View.GONE
            isFocusable = true
            isFocusableInTouchMode = true
        }
        root.addView(s, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            setMargins(0, 0, 40, 40)
        })

        // Capture key events to swallow BACK and trigger skip on OK/Enter
        root.setOnKeyListener { _, keyCode, event ->
            if (event.action != KeyEvent.ACTION_DOWN) return@setOnKeyListener false
            when (keyCode) {
                KeyEvent.KEYCODE_BACK -> true
                KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> {
                    if (skip?.isClickable == true) {
                        skip?.performClick()
                        true
                    } else false
                }
                else -> false
            }
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            // Focusable so we capture DPad input for the skip button.
            // FLAG_LAYOUT_IN_SCREEN + FLAG_LAYOUT_NO_LIMITS for fullscreen coverage.
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                    or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                    or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    or WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            PixelFormat.TRANSLUCENT
        )

        try {
            windowManager.addView(root, params)
        } catch (e: Exception) {
            Log.e(TAG, "addView failed: ${e.message}")
            abandonAudioFocus()
            return
        }

        rootView = root
        textureView = tv
        badge = b
        skip = s
        root.requestFocus()

        tv.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
                playNextAd(Surface(surface))
            }
            override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}
            override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean = true
            override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
        }
    }

    // ── Ad playback ─────────────────────────────────────────────────────────

    private fun playNextAd(surface: Surface? = null) {
        if (!isShowing) return
        if (adQueue.isEmpty()) {
            Log.i(TAG, "All ads done — closing overlay")
            handler.post { hide() }
            return
        }

        isTransitioning = true
        val ad = adQueue.removeAt(0)
        currentAd = ad
        val adNumber = totalAds - adQueue.size

        badge?.text = "Publicite - ${ad.advertiserName} ($adNumber/$totalAds)"
        skip?.visibility = View.GONE
        skip?.isClickable = false
        skip?.setOnClickListener(null)
        currentTimer?.cancel()

        try { currentPlayer?.release() } catch (_: Exception) {}
        currentPlayer = null

        val tv = textureView ?: return
        val useSurface = surface ?: if (tv.isAvailable) Surface(tv.surfaceTexture) else null
        if (useSurface == null) {
            Log.e(TAG, "No surface available")
            handler.post { hide() }
            return
        }

        val mp = MediaPlayer()
        currentPlayer = mp

        try {
            mp.setSurface(useSurface)
            val cachedFile = AdCacheManager.getCachedFile(context, ad.fileUrl)
            if (cachedFile != null) {
                Log.i(TAG, "Playing from cache: ${cachedFile.name}")
                mp.setDataSource(cachedFile.absolutePath)
            } else {
                Log.i(TAG, "Streaming from URL (not cached)")
                mp.setDataSource(context, Uri.parse(ad.fileUrl))
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
            handler.post { hide() }
        }
    }

    private fun startSkipCountdown() {
        val s = skip ?: return
        s.visibility = View.VISIBLE
        s.text = "Passer dans 5s"
        s.isClickable = false
        s.setOnClickListener(null)

        currentTimer = object : CountDownTimer(SKIP_DELAY_MS, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                s.text = "Passer dans ${(millisUntilFinished / 1000) + 1}s"
            }
            override fun onFinish() {
                s.text = "Passer  ▶▶"
                s.isClickable = true
                s.isFocusable = true
                s.setOnClickListener {
                    if (isTransitioning) return@setOnClickListener
                    val durationMs = System.currentTimeMillis() - adStartTime
                    currentAd?.let { ad ->
                        Log.i(TAG, "Skipped: ${ad.advertiserName} (${durationMs}ms)")
                        reportImpression(ad, durationMs)
                    }
                    try { currentPlayer?.stop() } catch (_: Exception) {}
                    handler.post { playNextAd() }
                }
                s.requestFocus()
            }
        }.start()
    }

    // ── Impression reporting (same as AdActivity) ──────────────────────────

    private fun reportImpression(ad: AdData, durationMs: Long) {
        Thread {
            try {
                val prefs = context.getSharedPreferences("neofilm_tv_prefs", Context.MODE_PRIVATE)
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
