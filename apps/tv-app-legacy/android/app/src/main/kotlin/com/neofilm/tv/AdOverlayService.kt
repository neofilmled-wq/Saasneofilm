package com.neofilm.tv

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log

class AdOverlayService : Service() {

    companion object {
        private const val TAG = "AdOverlayService"
        private const val CHANNEL_ID = "neofilm_ad_overlay"
        private const val NOTIFICATION_ID = 42
        // Safety floor so a misconfigured partner value can't flood the TV with ads.
        // NOT a default — only clamps absurdly low values.
        private const val MIN_INTERVAL_MS = 60L * 1000           // 1 min
        // How often to recheck SharedPreferences while waiting for the WebView
        // to push the interval pulled from the DB.
        private const val WAIT_FOR_CONFIG_MS = 30L * 1000        // 30 s
    }

    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        Log.i(TAG, "AdOverlayService started — waiting for interval from DB via TvMacro bridge")
        scheduleNext()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    /**
     * Read the cadence freshly each tick so partner updates apply without a service restart.
     * Returns null when no value has been pushed by the WebView yet — the service must wait
     * rather than fall back to a hardcoded default.
     */
    private fun getIntervalMs(): Long? {
        val prefs = getSharedPreferences("neofilm_tv_prefs", Context.MODE_PRIVATE)
        if (!prefs.contains("interstitial_interval_ms")) return null
        val ms = prefs.getLong("interstitial_interval_ms", 0L)
        if (ms <= 0L) return null
        return if (ms < MIN_INTERVAL_MS) MIN_INTERVAL_MS else ms
    }

    private fun scheduleNext() {
        val intervalMs = getIntervalMs()
        if (intervalMs == null) {
            Log.i(TAG, "No interval configured yet — recheck in ${WAIT_FOR_CONFIG_MS / 1000}s")
            handler.postDelayed({ scheduleNext() }, WAIT_FOR_CONFIG_MS)
            return
        }
        handler.postDelayed({
            sendHeartbeat()
            launchAdActivity()
            scheduleNext()
        }, intervalMs)
    }

    /** Send a heartbeat to the API so the screen shows as "active" */
    private fun sendHeartbeat() {
        val prefs = getSharedPreferences("neofilm_tv_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("device_token", null) ?: return
        val apiUrl = prefs.getString("api_url", null) ?: return
        val deviceId = prefs.getString("device_id", null) ?: ""
        val screenId = prefs.getString("screen_id", null) ?: ""

        Thread {
            try {
                val url = java.net.URL("$apiUrl/auth/device/heartbeat")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                conn.doOutput = true

                val body = """{"deviceId":"$deviceId","screenId":"$screenId","isOnline":true,"source":"ad_service"}"""
                conn.outputStream.use { it.write(body.toByteArray()) }

                val code = conn.responseCode
                Log.i(TAG, "Heartbeat sent: HTTP $code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "Heartbeat failed: ${e.message}")
            }
        }.start()
    }

    private val overlayPlayer by lazy { AdOverlayPlayer(applicationContext) }

    private fun launchAdActivity() {
        val prefs = getSharedPreferences("neofilm_tv_prefs", Context.MODE_PRIVATE)

        if (!prefs.getBoolean("webview_connected", false)) {
            Log.i(TAG, "WebView not connected — skip")
            return
        }
        if (prefs.getInt("ads_available_count", 0) <= 0) {
            Log.i(TAG, "No ads available — skip")
            return
        }

        val foregroundPackage = prefs.getString("last_foreground_app", "") ?: ""
        Log.i(TAG, "Current foreground app: $foregroundPackage")

        // Prefer the system overlay (TYPE_APPLICATION_OVERLAY) so the foreground
        // app (YouTube, Netflix, …) is NOT pushed through onPause→onStop.
        // Audio focus is taken transient so well-behaved media apps pause and
        // resume their playback automatically.
        if (AdOverlayPlayer.canDrawOverlays(this)) {
            Log.i(TAG, "Launching ad as system overlay")
            handler.post { overlayPlayer.show() }
            return
        }

        // Fallback when SYSTEM_ALERT_WINDOW is not granted (rare on Android TV
        // where we self-grant via appops, but kept as a safety net).
        Log.w(TAG, "Overlay permission missing — falling back to AdActivity")
        val intent = Intent(this, AdActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("return_to_package", foregroundPackage)
        }
        startActivity(intent)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "NeoFilm Ads", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Diffusion de publicites NeoFilm"
                setShowBadge(false)
            }
            getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        }
    }

    private fun buildNotification(): Notification {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("NeoFilm").setContentText("Service publicitaire actif")
                .setSmallIcon(android.R.drawable.ic_media_play).build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("NeoFilm").setContentText("Service publicitaire actif")
                .setSmallIcon(android.R.drawable.ic_media_play).build()
        }
    }
}
