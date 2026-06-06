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
        startKioskWatchdog()
        // External keepalive — even if Android kills this whole process,
        // the system AlarmManager will fire WatchdogAlarmReceiver every
        // minute and restart us.
        WatchdogAlarmReceiver.scheduleNext(applicationContext)
    }

    // ────────────────────────────────────────────────────────────────────
    // Kiosk watchdog — polls the foreground app every WATCHDOG_INTERVAL_MS
    // and brings NeoFilm back when the user lands on the Amazon launcher
    // (the only way to recover HOME-button control on Fire OS 8 without
    // being the system launcher).
    // ────────────────────────────────────────────────────────────────────

    private val KIOSK_LAUNCHER_PACKAGES = setOf(
        "com.amazon.tv.launcher",
        "com.amazon.firehomestarter",
        "com.amazon.tv.settings.v2.system.FallbackHome",
        "com.amazon.tv.parentalcontrols"
    )
    private val WATCHDOG_INTERVAL_MS = 1500L

    private var watchdogTickCount = 0
    private val watchdogRunnable = object : Runnable {
        override fun run() {
            try {
                watchdogTickCount++
                val kioskEnabled = getSharedPreferences("neofilm_tv_prefs", Context.MODE_PRIVATE)
                    .getBoolean("kiosk_mode_enabled", true)
                if (!kioskEnabled) {
                    if (watchdogTickCount % 20 == 0) Log.d(TAG, "Watchdog: kiosk disabled, idle")
                    handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
                    return
                }
                val fg = getForegroundPackage()
                // Log every ~30s so we can confirm the watchdog is alive even when
                // it doesn't need to act. Heavy logs would otherwise spam the buffer.
                if (watchdogTickCount % 20 == 0) Log.d(TAG, "Watchdog tick: fg=$fg")
                if (fg != null && KIOSK_LAUNCHER_PACKAGES.any { fg.startsWith(it) }) {
                    if (UpdateManager.installInProgress) {
                        Log.i(TAG, "Watchdog: launcher $fg detected but OTA install in progress — skipping bounce")
                    } else {
                        Log.i(TAG, "Watchdog: launcher app $fg detected — re-launching NeoFilm")
                        val intent = Intent(applicationContext, MainActivity::class.java).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
                            addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
                        }
                        startActivity(intent)
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Watchdog tick failed: ${e.message}")
            }
            handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
        }
    }

    private fun startKioskWatchdog() {
        handler.removeCallbacks(watchdogRunnable)
        handler.postDelayed(watchdogRunnable, WATCHDOG_INTERVAL_MS)
    }

    /**
     * Returns the package name of the foreground app via UsageStatsManager.
     * Requires PACKAGE_USAGE_STATS access (granted manually in Settings or via
     *   adb shell appops set com.neofilm.tv.legacy GET_USAGE_STATS allow
     * Returns null when access is missing — the watchdog silently skips.
     */
    private fun getForegroundPackage(): String? {
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as? android.app.usage.UsageStatsManager
            ?: return null
        val end = System.currentTimeMillis()
        val begin = end - 10_000
        val events = usm.queryEvents(begin, end)
        val event = android.app.usage.UsageEvents.Event()
        var latest: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == android.app.usage.UsageEvents.Event.MOVE_TO_FOREGROUND) {
                latest = event.packageName
            }
        }
        return latest
    }

    /**
     * START_STICKY tells Android to relaunch this service if it was killed
     * (low memory, long Netflix session, etc.). Without it, the service stays
     * dead after a kill — ads stop firing and the kiosk loop dies with it.
     */
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    /**
     * Called when the user swipes NeoFilm out of the recents tray. Reschedule
     * ourselves immediately so the foreground service comes back rather than
     * just dying with the task.
     */
    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.w(TAG, "Task removed — scheduling self-restart in 1s")
        val restartIntent = Intent(applicationContext, AdOverlayService::class.java)
        val pi = android.app.PendingIntent.getService(
            this, 1, restartIntent,
            android.app.PendingIntent.FLAG_ONE_SHOT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        val am = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
        am.set(android.app.AlarmManager.RTC, System.currentTimeMillis() + 1000, pi)
    }

    override fun onDestroy() {
        Log.w(TAG, "onDestroy — scheduling immediate self-restart")
        handler.removeCallbacksAndMessages(null)
        // Schedule a restart in case Android (or the OOM killer) tore us down.
        try {
            val restartIntent = Intent(applicationContext, AdOverlayService::class.java)
            val pi = android.app.PendingIntent.getService(
                this, 2, restartIntent,
                android.app.PendingIntent.FLAG_ONE_SHOT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            val am = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            am.set(android.app.AlarmManager.RTC, System.currentTimeMillis() + 1000, pi)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to schedule self-restart: ${e.message}")
        }
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
        // Clicking the notification returns the user to NeoFilm — useful after
        // a long Netflix session where the user wants the signage back.
        val openMain = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)
        }
        val contentIntent = android.app.PendingIntent.getActivity(
            this, 0, openMain,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("NeoFilm").setContentText("Service publicitaire actif")
                .setContentIntent(contentIntent)
                .setSmallIcon(android.R.drawable.ic_media_play).build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("NeoFilm").setContentText("Service publicitaire actif")
                .setContentIntent(contentIntent)
                .setSmallIcon(android.R.drawable.ic_media_play).build()
        }
    }
}
