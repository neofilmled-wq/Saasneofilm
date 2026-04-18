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
        private const val INTERVAL_MS = 60L * 60 * 1000  // 1 h
    }

    private val handler = Handler(Looper.getMainLooper())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        Log.i(TAG, "AdOverlayService started — interval ${INTERVAL_MS / 1000}s")
        scheduleNext()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun scheduleNext() {
        handler.postDelayed({
            sendHeartbeat()
            launchAdActivity()
            scheduleNext()
        }, INTERVAL_MS)
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

        // Read the last foreground app from SharedPrefs (set by MainActivity.onPause)
        val foregroundPackage = prefs.getString("last_foreground_app", "") ?: ""
        Log.i(TAG, "Current foreground app: $foregroundPackage")

        Log.i(TAG, "Launching AdActivity")
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
