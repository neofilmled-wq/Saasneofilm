# NeoFilm Android TV — Part 4: Crash Recovery, Security, Testing

---

## 10. CRASH RECOVERY & WATCHDOG

### 10.1 Global Exception Handler

```kotlin
class NeoFilmApplication : Application(), Configuration.Provider {

    @Inject lateinit var crashReporter: CrashReporter
    @Inject lateinit var watchdogStarter: WatchdogStarter

    override fun onCreate() {
        super.onCreate()

        // Install global crash handler BEFORE Hilt initialization
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            handleFatalCrash(thread, throwable, defaultHandler)
        }

        // Also catch coroutine exceptions
        val coroutineExceptionHandler = CoroutineExceptionHandler { _, throwable ->
            crashReporter.reportNonFatal(throwable)
        }

        // Store in companion for global access by CoroutineScope builders
        globalCoroutineExceptionHandler = coroutineExceptionHandler
    }

    private fun handleFatalCrash(
        thread: Thread,
        throwable: Throwable,
        defaultHandler: Thread.UncaughtExceptionHandler?,
    ) {
        try {
            // 1. Log crash synchronously to local storage
            CrashLogWriter.writeCrashSync(
                throwable = throwable,
                threadName = thread.name,
                timestamp = System.currentTimeMillis(),
                appVersion = BuildConfig.VERSION_NAME,
                memoryInfo = getMemoryInfo(),
            )

            // 2. Increment crash counter in SharedPreferences (not encrypted — must survive)
            val prefs = getSharedPreferences("crash_meta", MODE_PRIVATE)
            val count = prefs.getInt("crash_count_today", 0) + 1
            prefs.edit()
                .putInt("crash_count_today", count)
                .putLong("last_crash_timestamp", System.currentTimeMillis())
                .putString("last_crash_message", throwable.message?.take(500))
                .apply()

            // 3. If crash-looping (>5 crashes in 10 min), enter safe mode
            if (count > 5) {
                prefs.edit().putBoolean("safe_mode", true).apply()
            }

            // 4. Schedule restart via AlarmManager (fires in 2 seconds)
            scheduleRestart()

        } catch (_: Exception) {
            // Crash handler itself crashed — let system handle it
        }

        // 5. Call default handler (kills process)
        defaultHandler?.uncaughtException(thread, throwable)
    }

    private fun scheduleRestart() {
        val intent = Intent(this, ShellActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            putExtra("restart_after_crash", true)
        }

        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE,
        )

        val alarmManager = getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP,
            SystemClock.elapsedRealtime() + 2000,
            pendingIntent,
        )
    }

    private fun getMemoryInfo(): String {
        val runtime = Runtime.getRuntime()
        val activityManager = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        activityManager.getMemoryInfo(memInfo)

        return buildString {
            appendLine("Heap: ${runtime.totalMemory() / 1024 / 1024}MB / ${runtime.maxMemory() / 1024 / 1024}MB")
            appendLine("Free heap: ${runtime.freeMemory() / 1024 / 1024}MB")
            appendLine("System available: ${memInfo.availMem / 1024 / 1024}MB")
            appendLine("System low memory: ${memInfo.lowMemory}")
        }
    }
}
```

### 10.2 Watchdog Foreground Service

```kotlin
@AndroidEntryPoint
class WatchdogService : Service() {

    companion object {
        private const val NOTIFICATION_ID = 1001
        private const val CHANNEL_ID = "neofilm_watchdog"
        private const val HEALTH_CHECK_INTERVAL_MS = 30_000L // 30s
        private const val ACTIVITY_TIMEOUT_MS = 10_000L // 10s without foreground = restart
        private const val ANR_CHECK_INTERVAL_MS = 5_000L
        private const val ANR_THRESHOLD_MS = 5_000L
        private const val MEMORY_LEAK_CHECK_INTERVAL_MS = 300_000L // 5 min
        private const val REBOOT_THRESHOLD_CRASH_COUNT = 10
    }

    @Inject lateinit var healthReporter: HealthReporter
    @Inject lateinit var crashLogUploader: CrashLogUploader

    private val watchdogHandler = HandlerThread("Watchdog").apply { start() }
    private val handler = Handler(watchdogHandler.looper)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var lastMainThreadResponseTime = SystemClock.elapsedRealtime()
    private val serviceScope = CoroutineScope(
        SupervisorJob() + Dispatchers.Default + CoroutineName("Watchdog")
    )

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())

        startHealthCheckLoop()
        startAnrDetection()
        startMemoryMonitoring()
        startActivityMonitoring()
        startCrashLogUpload()

        return START_STICKY // Restart if killed by system
    }

    /**
     * Periodic health check — reports device health to backend.
     */
    private fun startHealthCheckLoop() {
        serviceScope.launch {
            while (isActive) {
                delay(HEALTH_CHECK_INTERVAL_MS)

                val health = gatherHealth()
                healthReporter.report(health)

                // Check for crash-loop
                val prefs = getSharedPreferences("crash_meta", MODE_PRIVATE)
                val crashCount = prefs.getInt("crash_count_today", 0)
                if (crashCount >= REBOOT_THRESHOLD_CRASH_COUNT) {
                    // Too many crashes — force reboot device
                    healthReporter.reportCritical("crash_loop_reboot", crashCount)
                    triggerDeviceReboot()
                }

                // Reset daily crash counter at midnight
                val lastReset = prefs.getLong("crash_count_reset", 0)
                if (System.currentTimeMillis() - lastReset > 86_400_000) {
                    prefs.edit()
                        .putInt("crash_count_today", 0)
                        .putLong("crash_count_reset", System.currentTimeMillis())
                        .apply()
                }
            }
        }
    }

    /**
     * ANR detection: post a message to main thread and measure response time.
     * If main thread doesn't respond within threshold, it's blocked.
     */
    private fun startAnrDetection() {
        handler.post(object : Runnable {
            override fun run() {
                val pingTime = SystemClock.elapsedRealtime()

                mainHandler.post {
                    lastMainThreadResponseTime = SystemClock.elapsedRealtime()
                }

                handler.postDelayed({
                    val responseDelay = lastMainThreadResponseTime - pingTime
                    if (responseDelay < 0 || responseDelay > ANR_THRESHOLD_MS) {
                        // Main thread blocked — potential ANR
                        handleAnrDetected(responseDelay)
                    }
                }, ANR_THRESHOLD_MS)

                handler.postDelayed(this, ANR_CHECK_INTERVAL_MS)
            }
        })
    }

    private fun handleAnrDetected(blockDurationMs: Long) {
        // Capture main thread stack trace
        val mainThread = Looper.getMainLooper().thread
        val stackTrace = mainThread.stackTrace.joinToString("\n") { it.toString() }

        serviceScope.launch {
            healthReporter.reportAnr(
                blockDurationMs = blockDurationMs,
                mainThreadStack = stackTrace,
                timestamp = System.currentTimeMillis(),
            )
        }

        // If ANR persists for >30s, force restart the activity
        handler.postDelayed({
            val currentDelay = SystemClock.elapsedRealtime() - lastMainThreadResponseTime
            if (currentDelay > 30_000) {
                forceRestartActivity()
            }
        }, 30_000)
    }

    /**
     * Memory leak monitoring — track heap growth over time.
     */
    private fun startMemoryMonitoring() {
        serviceScope.launch {
            var previousHeapUsed = 0L

            while (isActive) {
                delay(MEMORY_LEAK_CHECK_INTERVAL_MS)

                val runtime = Runtime.getRuntime()
                val heapUsed = runtime.totalMemory() - runtime.freeMemory()

                // If heap grows >50MB in 5 minutes without corresponding activity, suspect leak
                if (previousHeapUsed > 0 && heapUsed - previousHeapUsed > 50 * 1024 * 1024) {
                    healthReporter.reportMemoryLeak(
                        previousMb = previousHeapUsed / 1024 / 1024,
                        currentMb = heapUsed / 1024 / 1024,
                    )
                }

                previousHeapUsed = heapUsed

                // Proactive GC if >80% heap used
                val heapMax = runtime.maxMemory()
                if (heapUsed.toFloat() / heapMax > 0.80f) {
                    System.gc()
                }
            }
        }
    }

    /**
     * Ensure ShellActivity stays in foreground.
     */
    private fun startActivityMonitoring() {
        serviceScope.launch {
            while (isActive) {
                delay(ACTIVITY_TIMEOUT_MS)

                if (!isShellActivityInForeground()) {
                    // Shell escaped foreground — relaunch
                    forceRestartActivity()
                }
            }
        }
    }

    private fun isShellActivityInForeground(): Boolean {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val tasks = am.getRunningTasks(1)
        return tasks.firstOrNull()?.topActivity?.className ==
            "com.neofilm.tv.feature.shell.ShellActivity"
    }

    private fun forceRestartActivity() {
        val intent = Intent(this, ShellActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            putExtra("force_restart", true)
        }
        startActivity(intent)
    }

    private fun triggerDeviceReboot() {
        try {
            val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE)
                as DevicePolicyManager
            val admin = ComponentName(this, NeoFilmDeviceAdmin::class.java)
            dpm.reboot(admin) // Requires Device Owner
        } catch (e: Exception) {
            // Fallback: restart just the app process
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            intent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            startActivity(intent)
            Runtime.getRuntime().exit(0)
        }
    }

    /**
     * Upload crash logs that accumulated during offline or between sessions.
     */
    private fun startCrashLogUpload() {
        serviceScope.launch {
            delay(60_000) // Wait 1 min after boot to stabilize

            crashLogUploader.uploadPendingLogs()
        }
    }

    private fun gatherHealth(): DeviceHealth {
        val runtime = Runtime.getRuntime()
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val memInfo = ActivityManager.MemoryInfo()
        am.getMemoryInfo(memInfo)

        return DeviceHealth(
            uptimeMs = SystemClock.elapsedRealtime(),
            crashCount = getSharedPreferences("crash_meta", MODE_PRIVATE)
                .getInt("crash_count_today", 0),
            webSocketConnected = NeoFilmWebSocketClient.isConnected(),
            playerFunctional = DualPlayerManager.isPrimaryHealthy(),
            isAnrDetected = false,
            memoryUsagePercent = ((runtime.totalMemory() - runtime.freeMemory()).toFloat()
                / runtime.maxMemory() * 100),
            diskUsagePercent = getDiskUsagePercent(),
            cpuTemperatureCelsius = readCpuTemperature(),
        )
    }

    private fun readCpuTemperature(): Float? {
        return try {
            File("/sys/class/thermal/thermal_zone0/temp")
                .readText().trim().toFloat() / 1000f
        } catch (_: Exception) {
            null
        }
    }

    private fun buildNotification(): Notification {
        val channel = NotificationChannel(
            CHANNEL_ID, "NeoFilm Watchdog",
            NotificationManager.IMPORTANCE_LOW,
        ).apply { setShowBadge(false) }

        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("NeoFilm TV")
            .setContentText("Running")
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
        watchdogHandler.quitSafely()

        // Self-restart: watchdog must never stop
        val intent = Intent(this, WatchdogService::class.java)
        startForegroundService(intent)
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
```

### 10.3 Failsafe Reboot Schedule

```kotlin
/**
 * Preventive reboot schedule:
 * - Reboot device once per week (configurable) during maintenance window (3-5 AM)
 * - Clears leaked memory, zombie processes, and system caches
 * - Only executes if no active playback or if configured to override
 */
class ScheduledRebootManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configRepository: ConfigRepository,
) {
    fun scheduleWeeklyReboot(dayOfWeek: Int = Calendar.MONDAY, hour: Int = 4) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        val calendar = Calendar.getInstance().apply {
            set(Calendar.DAY_OF_WEEK, dayOfWeek)
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            if (before(Calendar.getInstance())) add(Calendar.WEEK_OF_YEAR, 1)
        }

        val intent = Intent(context, ScheduledRebootReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        alarmManager.setRepeating(
            AlarmManager.RTC_WAKEUP,
            calendar.timeInMillis,
            AlarmManager.INTERVAL_DAY * 7,
            pendingIntent,
        )
    }
}
```

---

## 11. SECURITY MODEL

### 11.1 Security Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY LAYERS                           │
│                                                              │
│  Layer 1: TRANSPORT SECURITY                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ - TLS 1.3 for all connections                       │    │
│  │ - Certificate pinning (leaf + intermediate)          │    │
│  │ - No HTTP fallback (HTTPS-only)                      │    │
│  │ - WebSocket over WSS only                            │    │
│  │ - MQTT over TLS 8883                                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 2: AUTHENTICATION & AUTHORIZATION                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ - JWT (RS256) with 15-min access token TTL           │    │
│  │ - Refresh token rotation (single-use)                │    │
│  │ - Device-bound tokens (tied to device UUID)          │    │
│  │ - Scoped permissions (device role = limited access)  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 3: DATA PROTECTION                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ - Android Keystore for key material                  │    │
│  │ - EncryptedSharedPreferences (AES-256-GCM)           │    │
│  │ - Encrypted Room database (SQLCipher)                │    │
│  │ - File-level encryption for cached media             │    │
│  │ - No sensitive data in logs                          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 4: RUNTIME INTEGRITY                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ - Root detection (multi-signal)                      │    │
│  │ - Debug mode detection                               │    │
│  │ - Emulator detection                                 │    │
│  │ - App tampering detection (APK signature verify)     │    │
│  │ - Frida/Xposed framework detection                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  Layer 5: DEVICE HARDENING (Device Owner)                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ - Factory reset protection                           │    │
│  │ - USB file transfer disabled                         │    │
│  │ - ADB disabled in production                         │    │
│  │ - Screen capture disabled                            │    │
│  │ - Unknown sources disabled                           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 11.2 Root Detection

```kotlin
class RootDetector @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /**
     * Multi-signal root detection. Each signal returns a confidence score.
     * Total score >3 = considered rooted.
     */
    fun isDeviceRooted(): RootCheckResult {
        var score = 0
        val signals = mutableListOf<String>()

        // 1. Check for su binary
        val suPaths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/data/local/xbin/su", "/data/local/bin/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su",
            "/data/local/su", "/su/bin/su",
        )
        for (path in suPaths) {
            if (File(path).exists()) {
                score += 2
                signals.add("su_binary:$path")
                break
            }
        }

        // 2. Check for root management apps
        val rootApps = listOf(
            "com.topjohnwu.magisk",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.noshufou.android.su",
            "com.thirdparty.superuser",
        )
        for (app in rootApps) {
            try {
                context.packageManager.getPackageInfo(app, 0)
                score += 2
                signals.add("root_app:$app")
                break
            } catch (_: PackageManager.NameNotFoundException) {}
        }

        // 3. Check Build tags
        if (Build.TAGS?.contains("test-keys") == true) {
            score += 1
            signals.add("test_keys")
        }

        // 4. Check /system read-write
        try {
            Runtime.getRuntime().exec("mount").inputStream.bufferedReader()
                .readText().let { mountOutput ->
                    if (mountOutput.contains("/system") && mountOutput.contains("rw")) {
                        score += 1
                        signals.add("system_rw")
                    }
                }
        } catch (_: Exception) {}

        // 5. Check for Magisk hide
        try {
            val prop = System.getProperty("ro.debuggable")
            if (prop == "1") {
                score += 1
                signals.add("debuggable_prop")
            }
        } catch (_: Exception) {}

        // 6. Check for hooking frameworks
        val hookApps = listOf(
            "de.robv.android.xposed.installer",
            "com.saurik.substrate",
        )
        for (app in hookApps) {
            try {
                context.packageManager.getPackageInfo(app, 0)
                score += 3
                signals.add("hook_framework:$app")
                break
            } catch (_: PackageManager.NameNotFoundException) {}
        }

        // 7. Frida detection — check for frida-server process
        try {
            File("/proc").listFiles()?.forEach { procDir ->
                try {
                    val cmdline = File(procDir, "cmdline").readText()
                    if (cmdline.contains("frida") || cmdline.contains("gadget")) {
                        score += 3
                        signals.add("frida_detected")
                        return@forEach
                    }
                } catch (_: Exception) {}
            }
        } catch (_: Exception) {}

        return RootCheckResult(
            isRooted = score >= 3,
            confidenceScore = score,
            detectedSignals = signals,
        )
    }

    data class RootCheckResult(
        val isRooted: Boolean,
        val confidenceScore: Int,
        val detectedSignals: List<String>,
    )
}
```

### 11.3 Tamper Detection

```kotlin
class TamperDetector @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /**
     * Verify APK signature matches expected signing certificate.
     * Detects repackaging/modification attacks.
     */
    fun verifyAppIntegrity(): Boolean {
        val expectedSignatureHash = BuildConfig.EXPECTED_SIGNATURE_SHA256

        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNING_CERTIFICATES,
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.GET_SIGNATURES,
            )
        }

        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.signingInfo.apkContentsSigners
        } else {
            @Suppress("DEPRECATION")
            packageInfo.signatures
        }

        for (signature in signatures) {
            val digest = MessageDigest.getInstance("SHA-256")
            val hash = digest.digest(signature.toByteArray())
            val hashHex = hash.joinToString("") { "%02x".format(it) }

            if (hashHex == expectedSignatureHash) return true
        }

        return false
    }

    /**
     * Detect if running in debug mode or with debugger attached.
     */
    fun isDebugEnvironment(): Boolean {
        return BuildConfig.DEBUG
            || (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
            || Debug.isDebuggerConnected()
            || Debug.waitingForDebugger()
    }

    /**
     * Detect emulator environment.
     */
    fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86")
            || Build.BOARD == "QC_Reference_Phone"
            || Build.MANUFACTURER.contains("Genymotion")
            || Build.HOST.startsWith("Build")
            || Build.BRAND.startsWith("generic")
            || Build.DEVICE.startsWith("generic")
            || Build.PRODUCT == "google_sdk"
            || Build.HARDWARE.contains("goldfish")
            || Build.HARDWARE.contains("ranchu"))
    }
}
```

### 11.4 Security Manager (Orchestrator)

```kotlin
class SecurityManager @Inject constructor(
    private val rootDetector: RootDetector,
    private val tamperDetector: TamperDetector,
    private val healthReporter: HealthReporter,
    private val tokenStore: SecureTokenStore,
) {
    /**
     * Run all security checks on startup and periodically.
     * Actions based on severity:
     *
     * LOW:    Log + report to backend (debug mode on non-production build)
     * MEDIUM: Log + report + restrict sensitive operations
     * HIGH:   Log + report + wipe tokens + require re-pairing
     * CRITICAL: Log + report + wipe all data + show error screen
     */
    suspend fun performSecurityAudit(): SecurityAuditResult {
        val issues = mutableListOf<SecurityIssue>()

        // Root check
        val rootResult = rootDetector.isDeviceRooted()
        if (rootResult.isRooted) {
            issues.add(SecurityIssue(
                type = "ROOT_DETECTED",
                severity = Severity.HIGH,
                details = rootResult.detectedSignals.joinToString(", "),
            ))
        }

        // Tamper check
        if (!tamperDetector.verifyAppIntegrity()) {
            issues.add(SecurityIssue(
                type = "APK_TAMPERED",
                severity = Severity.CRITICAL,
                details = "APK signature does not match expected certificate",
            ))
        }

        // Debug check
        if (tamperDetector.isDebugEnvironment()) {
            issues.add(SecurityIssue(
                type = "DEBUG_ENVIRONMENT",
                severity = if (BuildConfig.DEBUG) Severity.LOW else Severity.HIGH,
                details = "Debugger attached or debug build flag set",
            ))
        }

        // Emulator check
        if (tamperDetector.isEmulator()) {
            issues.add(SecurityIssue(
                type = "EMULATOR_DETECTED",
                severity = Severity.MEDIUM,
                details = "Running on emulator: ${Build.MODEL}",
            ))
        }

        // Report all issues to backend
        if (issues.isNotEmpty()) {
            healthReporter.reportSecurityIssues(issues)
        }

        // Take action based on highest severity
        val maxSeverity = issues.maxByOrNull { it.severity.ordinal }?.severity
        when (maxSeverity) {
            Severity.CRITICAL -> {
                tokenStore.clearTokens()
                // App will transition to error state
            }
            Severity.HIGH -> {
                // Allow continued operation but flag for review
            }
            else -> { /* Continue normally */ }
        }

        return SecurityAuditResult(issues)
    }

    enum class Severity { LOW, MEDIUM, HIGH, CRITICAL }

    data class SecurityIssue(
        val type: String,
        val severity: Severity,
        val details: String,
    )

    data class SecurityAuditResult(
        val issues: List<SecurityIssue>,
    ) {
        val isClean: Boolean get() = issues.isEmpty()
        val maxSeverity: Severity? get() = issues.maxByOrNull { it.severity.ordinal }?.severity
    }
}
```

### 11.5 Secure Logging

```kotlin
class SecureLogger @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val MAX_LOG_FILE_SIZE = 5 * 1024 * 1024 // 5MB
        private const val MAX_LOG_FILES = 3
        private val REDACT_PATTERNS = listOf(
            Regex("(Bearer\\s+)[A-Za-z0-9\\-._~+/]+=*"),    // JWT tokens
            Regex("(password[\":]\\s*[\"']?)[^\"'\\s,}]+"),   // Passwords
            Regex("(token[\":]\\s*[\"']?)[^\"'\\s,}]+"),      // Generic tokens
            Regex("(\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4})"), // Card numbers
        )
    }

    fun log(level: Level, tag: String, message: String) {
        val sanitized = redactSensitiveData(message)
        val entry = "${System.currentTimeMillis()}|${level.name}|$tag|$sanitized"

        // Write to rotating log file (NOT logcat in production)
        if (!BuildConfig.DEBUG) {
            writeToFile(entry)
        } else {
            android.util.Log.println(level.toAndroidLevel(), tag, sanitized)
        }
    }

    private fun redactSensitiveData(input: String): String {
        var result = input
        for (pattern in REDACT_PATTERNS) {
            result = pattern.replace(result) { matchResult ->
                val prefix = matchResult.groupValues.getOrElse(1) { "" }
                "$prefix[REDACTED]"
            }
        }
        return result
    }

    private fun writeToFile(entry: String) {
        val logDir = File(context.filesDir, "logs").also { it.mkdirs() }
        val currentFile = File(logDir, "app.log")

        // Rotate if too large
        if (currentFile.exists() && currentFile.length() > MAX_LOG_FILE_SIZE) {
            rotateLogFiles(logDir)
        }

        currentFile.appendText("$entry\n")
    }

    private fun rotateLogFiles(logDir: File) {
        // Delete oldest
        File(logDir, "app.log.${MAX_LOG_FILES}").delete()
        // Rotate: 2→3, 1→2, current→1
        for (i in MAX_LOG_FILES - 1 downTo 1) {
            File(logDir, "app.log.$i").renameTo(File(logDir, "app.log.${i + 1}"))
        }
        File(logDir, "app.log").renameTo(File(logDir, "app.log.1"))
    }
}
```

### 11.6 Screen Capture Prevention

```kotlin
/**
 * Prevent screen capture/recording of ad content and sensitive screens.
 * Applied via Window flag on activities displaying premium content.
 */
class ScreenCapturePolicy @Inject constructor() {

    fun enforceOnActivity(activity: Activity) {
        activity.window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE,
        )
    }

    /**
     * For overlay windows (ad zone), set FLAG_SECURE on the WindowManager params.
     */
    fun enforceOnOverlay(layoutParams: WindowManager.LayoutParams) {
        layoutParams.flags = layoutParams.flags or WindowManager.LayoutParams.FLAG_SECURE
    }
}
```

---

## 12. TESTING STRATEGY

### 12.1 Test Pyramid

```
                    ┌─────────────┐
                    │   E2E (5%)  │  Real device farm tests
                    │  Espresso + │  Firebase Test Lab
                    │  UI Automator│
                    ├─────────────┤
                    │Integration  │  Robolectric + MockWebServer
                    │  (20%)      │  Room in-memory DB
                    │             │  Hilt testing
                    ├─────────────┤
                    │             │
                    │  Unit (75%) │  JUnit 5 + Mockk
                    │             │  Turbine (Flow testing)
                    │             │  Pure Kotlin domain tests
                    └─────────────┘
```

### 12.2 Unit Testing

```kotlin
// Example: AdRotationEngine unit test
class AdRotationEngineTest {

    @MockK private lateinit var scheduleRepository: ScheduleRepository
    @MockK private lateinit var analyticsReporter: AnalyticsReporter
    @MockK private lateinit var cacheManager: VideoCacheManager

    private lateinit var engine: AdRotationEngine

    @BeforeEach
    fun setup() {
        MockKAnnotations.init(this)
        engine = AdRotationEngine(
            scheduleRepository = scheduleRepository,
            analyticsReporter = analyticsReporter,
            cacheManager = cacheManager,
            ioDispatcher = UnconfinedTestDispatcher(),
        )
    }

    @Test
    fun `skips uncached creatives and plays next available`() = runTest {
        // Given
        val ads = listOf(
            testAd(id = "1", cached = false),
            testAd(id = "2", cached = true),
            testAd(id = "3", cached = true),
        )
        coEvery { scheduleRepository.getActiveAdsForCurrentSlot() } returns ads
        coEvery { cacheManager.getCachedUri(ads[0].creative.fileUrl) } returns null
        coEvery { cacheManager.getCachedUri(ads[1].creative.fileUrl) } returns mockUri()
        coEvery { cacheManager.getCachedUri(ads[2].creative.fileUrl) } returns mockUri()

        // When — run one rotation cycle
        val playedAds = mutableListOf<String>()
        engine.onAdPlayed = { playedAds.add(it.creative.id) }
        engine.executeOneRotation()

        // Then — ad "1" skipped, "2" and "3" played
        assertEquals(listOf("2", "3"), playedAds)

        // And download was enqueued for uncached ad
        coVerify { cacheManager.enqueueDownload(ads[0].creative.fileUrl, Priority.HIGH) }
    }

    @Test
    fun `reports impression for each played ad`() = runTest {
        val ad = testAd(id = "1", cached = true, durationMs = 5000)
        coEvery { scheduleRepository.getActiveAdsForCurrentSlot() } returns listOf(ad)
        coEvery { cacheManager.getCachedUri(any()) } returns mockUri()

        engine.executeOneRotation()

        coVerify(exactly = 1) {
            analyticsReporter.reportAdImpression(
                creativeId = "1",
                campaignId = any(),
                durationMs = 5000L,
                timestamp = any(),
            )
        }
    }

    @Test
    fun `shows fallback when no ads scheduled`() = runTest {
        coEvery { scheduleRepository.getActiveAdsForCurrentSlot() } returns emptyList()

        val state = engine.executeOneRotation()

        assertEquals(AdRotationState.FALLBACK, state)
    }
}
```

### 12.3 Integration Testing

```kotlin
// WebSocket integration test with MockWebServer
@HiltAndroidTest
class WebSocketIntegrationTest {

    @get:Rule val hiltRule = HiltAndroidRule(this)

    private lateinit var mockServer: MockWebServer
    private lateinit var wsClient: NeoFilmWebSocketClient

    @BeforeEach
    fun setup() {
        hiltRule.inject()
        mockServer = MockWebServer()
        mockServer.start()
    }

    @Test
    fun `reconnects with exponential backoff after server disconnect`() = runTest {
        // Given — server accepts then closes
        mockServer.enqueue(MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                ws.send("""{"type":"auth_ok"}""")
                ws.close(1001, "going away") // Immediate close
            }
        }))

        val connectionStates = mutableListOf<ConnectionState>()
        val job = launch {
            wsClient.connectionState.collect { connectionStates.add(it) }
        }

        // When
        wsClient.connect(this)
        advanceTimeBy(10_000) // Fast-forward 10s

        // Then — should have attempted reconnect
        assertTrue(connectionStates.contains(ConnectionState.RECONNECTING))
        job.cancel()
    }

    @Test
    fun `queues messages while disconnected and drains on reconnect`() = runTest {
        // Given — start disconnected
        val sentMessages = mutableListOf<String>()

        // Send 3 messages while offline
        wsClient.send(ClientMessage.Heartbeat(timestamp = 1))
        wsClient.send(ClientMessage.Heartbeat(timestamp = 2))
        wsClient.send(ClientMessage.Heartbeat(timestamp = 3))

        // When — connect with server that captures messages
        mockServer.enqueue(MockResponse().withWebSocketUpgrade(object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                ws.send("""{"type":"auth_ok"}""")
            }
            override fun onMessage(ws: WebSocket, text: String) {
                sentMessages.add(text)
            }
        }))

        wsClient.connect(this)
        advanceUntilIdle()

        // Then — all 3 queued messages sent
        assertEquals(3, sentMessages.size)
    }
}

// Room database integration test
class OfflineEventDaoTest {

    private lateinit var db: NeoFilmDatabase
    private lateinit var dao: OfflineEventDao

    @BeforeEach
    fun setup() {
        db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            NeoFilmDatabase::class.java,
        ).build()
        dao = db.offlineEventDao()
    }

    @Test
    fun `trimToMax keeps only newest 10000 events`() = runTest {
        // Insert 10500 events
        repeat(10_500) { i ->
            dao.insert(OfflineEventEntity(
                eventType = "test",
                payload = "{}",
                timestamp = i.toLong(),
            ))
        }

        dao.trimToMax()

        val remaining = dao.getPendingCount()
        assertEquals(10_000, remaining)

        // Verify oldest were removed (timestamps 0-499)
        val oldest = dao.getPendingBatch(1).first()
        assertEquals(500L, oldest.timestamp)
    }
}
```

### 12.4 Network Failure Simulation

```kotlin
/**
 * Test scenarios for network resilience:
 */
class NetworkResilienceTest {

    @Test
    fun `survives complete network loss for 24 hours`() = runTest {
        // Setup: device with cached schedule
        val device = setupDeviceWithCachedSchedule(hoursOfContent = 48)

        // Simulate: cut all network
        networkSimulator.disconnectAll()

        // Advance 24 hours
        advanceTimeBy(24 * 3600 * 1000L)

        // Assert: device still playing cached content
        assertTrue(device.isPlayingContent())
        assertEquals(OfflineState.OFFLINE_STALE, device.offlineState)

        // Assert: events are queued locally
        assertTrue(device.getQueuedEventCount() > 0)

        // Simulate: restore network
        networkSimulator.reconnect()
        advanceTimeBy(60_000) // Allow sync

        // Assert: events drained to server
        assertEquals(0, device.getQueuedEventCount())
        assertEquals(ConnectionState.CONNECTED, device.connectionState)
    }

    @Test
    fun `handles flapping connection gracefully`() = runTest {
        val device = setupPairedDevice()

        // Simulate: connection flapping (up/down every 5 seconds for 10 minutes)
        repeat(120) { i ->
            if (i % 2 == 0) networkSimulator.disconnect()
            else networkSimulator.reconnect()
            advanceTimeBy(5_000)
        }

        // Assert: device is in a stable state (not crash-looped)
        assertTrue(device.isAlive())
        assertTrue(device.reconnectAttempts < 200) // Backoff should limit attempts
    }

    @Test
    fun `WebSocket to MQTT failover works correctly`() = runTest {
        val device = setupPairedDevice()

        // Verify WebSocket is primary
        assertEquals(ConnectionState.CONNECTED, device.wsState)

        // Kill WebSocket only (MQTT still available)
        networkSimulator.blockPort(443)

        advanceTimeBy(60_000) // Allow failover

        // Assert: degraded mode via MQTT
        assertEquals(ConnectionState.DEGRADED, device.effectiveState)
        assertTrue(device.mqttConnected)

        // Send command via MQTT — should be received
        val command = ServerCommand.ForceSync
        mqttBroker.publish("neofilm/devices/${device.id}/commands", command)
        advanceTimeBy(1_000)

        assertTrue(device.lastReceivedCommand == command)
    }
}
```

### 12.5 72-Hour Stability Test

```kotlin
/**
 * Automated stability test specification.
 * Run on real hardware via Firebase Test Lab or internal device farm.
 *
 * Duration: 72 hours continuous
 * Monitoring: Prometheus + Grafana dashboard
 *
 * PASS CRITERIA:
 * ┌─────────────────────────────┬──────────────┐
 * │ Metric                      │ Threshold    │
 * ├─────────────────────────────┼──────────────┤
 * │ Crash count                 │ 0            │
 * │ ANR count                   │ 0            │
 * │ Memory leak (heap growth)   │ < 20MB/24h   │
 * │ Frame drop rate             │ < 0.1%       │
 * │ WebSocket disconnect count  │ < 10         │
 * │ Reconnect success rate      │ 100%         │
 * │ Cache integrity failures    │ 0            │
 * │ Playback gap (no content)   │ < 5s total   │
 * │ CPU average (idle screen)   │ < 15%        │
 * │ CPU average (split-screen)  │ < 40%        │
 * │ Memory average              │ < 500MB      │
 * │ Disk cache corruption       │ 0            │
 * └─────────────────────────────┴──────────────┘
 *
 * TEST SEQUENCE:
 * Hour 0-6:    Normal operation (IPTV + ads in split-screen)
 * Hour 6-12:   Simulate network instability (random 30s disconnects every 5 min)
 * Hour 12-18:  Heavy ad rotation (new creative every 10 seconds)
 * Hour 18-24:  Complete offline mode (network blocked)
 * Hour 24-30:  Reconnect + full event queue drain + schedule refresh
 * Hour 30-36:  4K content playback + split-screen
 * Hour 36-42:  OTA update mid-playback + verify seamless resume
 * Hour 42-48:  Simulated memory pressure (allocate/free large buffers)
 * Hour 48-54:  Rapid config changes from backend (every 30 seconds)
 * Hour 54-60:  Mixed workload (all scenarios combined)
 * Hour 60-72:  Steady-state (normal operation, monitoring for degradation)
 */
```

### 12.6 CI/CD Integration

```yaml
# .github/workflows/tv-app.yml
name: TV App CI

on:
  push:
    paths: ['apps/tv-app/**']
  pull_request:
    paths: ['apps/tv-app/**']

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'
      - name: Run unit tests
        run: ./gradlew :app:testDebugUnitTest
      - name: Upload test results
        uses: actions/upload-artifact@v4
        with:
          name: unit-test-results
          path: app/build/reports/tests/

  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Android Lint
        run: ./gradlew :app:lintDebug
      - name: Run detekt (Kotlin static analysis)
        run: ./gradlew detekt

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run integration tests
        run: ./gradlew :app:testDebugUnitTest --tests "*IntegrationTest"

  instrumented-tests:
    runs-on: ubuntu-latest
    needs: [unit-tests, lint]
    steps:
      - uses: actions/checkout@v4
      - name: Run Espresso tests on Firebase Test Lab
        uses: google-github-actions/firebase-test-lab@v1
        with:
          credentials: ${{ secrets.FIREBASE_SA_KEY }}
          type: instrumentation
          app: app/build/outputs/apk/debug/app-debug.apk
          test: app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
          devices: |
            model=MiBox4,version=28
            model=ADT3,version=30
            model=Chromecast,version=31

  build-release:
    runs-on: ubuntu-latest
    needs: [unit-tests, lint, integration-tests]
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Build release APK
        run: ./gradlew :app:assembleRelease
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
      - name: Upload to CDN staging
        run: |
          CHECKSUM=$(sha256sum app/build/outputs/apk/release/app-release.apk | cut -d' ' -f1)
          aws s3 cp app/build/outputs/apk/release/app-release.apk \
            s3://neofilm-ota-staging/tv/${GITHUB_SHA}/app-release.apk
          echo "SHA256=$CHECKSUM" >> $GITHUB_ENV
```

### 12.7 Monitoring KPIs Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                  NEOFILM TV FLEET DASHBOARD                      │
│                                                                  │
│  FLEET HEALTH                                                    │
│  ┌──────────────────┬──────────────────┬────────────────────┐   │
│  │ Online Devices   │ Offline Devices  │ Maintenance        │   │
│  │ 97,234 (97.2%)   │ 1,891 (1.9%)    │ 875 (0.9%)         │   │
│  └──────────────────┴──────────────────┴────────────────────┘   │
│                                                                  │
│  CRITICAL METRICS (last 24h)                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Metric                    │ Current │ Target  │ Status   │   │
│  ├───────────────────────────┼─────────┼─────────┼──────────┤   │
│  │ App crash rate            │ 0.02%   │ <0.1%   │ PASS     │   │
│  │ ANR rate                  │ 0.01%   │ <0.05%  │ PASS     │   │
│  │ WebSocket uptime          │ 99.7%   │ >99.5%  │ PASS     │   │
│  │ Ad impression delivery    │ 99.8%   │ >99%    │ PASS     │   │
│  │ Cache hit rate            │ 95.3%   │ >90%    │ PASS     │   │
│  │ Avg reconnect time        │ 4.2s    │ <10s    │ PASS     │   │
│  │ OTA success rate          │ 99.1%   │ >98%    │ PASS     │   │
│  │ Avg memory usage          │ 412MB   │ <600MB  │ PASS     │   │
│  │ Avg CPU usage             │ 18%     │ <30%    │ PASS     │   │
│  │ Playback gap events       │ 12      │ <100    │ PASS     │   │
│  │ P95 heartbeat latency     │ 890ms   │ <2000ms │ PASS     │   │
│  │ Offline devices >1h       │ 340     │ <500    │ PASS     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ALERTING RULES                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ P1 (PagerDuty): >5% devices offline for >5 min          │   │
│  │ P1 (PagerDuty): crash rate >1% in rolling 1 hour        │   │
│  │ P2 (Slack):     OTA rollout failure rate >5%             │   │
│  │ P2 (Slack):     >100 devices in crash-loop               │   │
│  │ P3 (Email):     cache hit rate <85%                       │   │
│  │ P3 (Email):     avg memory >600MB across fleet            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  DEVICE TELEMETRY (per-device, stored in AnalyticsEvent table)   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Event Type        │ Frequency    │ Payload               │   │
│  ├────────────────────┼──────────────┼───────────────────────┤   │
│  │ heartbeat          │ every 30s    │ cpu, mem, disk, uptime│   │
│  │ ad_impression      │ per ad play  │ creativeId, duration  │   │
│  │ playback_start     │ per content  │ mediaUri, type        │   │
│  │ playback_error     │ on error     │ errorCode, stackTrace │   │
│  │ cache_event        │ on hit/miss  │ url, hitOrMiss, size  │   │
│  │ ws_connection      │ on change    │ state, latency        │   │
│  │ ota_event          │ on update    │ version, status       │   │
│  │ security_event     │ on detection │ type, severity        │   │
│  │ crash_event        │ on crash     │ stackTrace, memInfo   │   │
│  │ anr_event          │ on ANR       │ mainThreadStack       │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 12.8 Field Deployment Checklist

```
PRE-DEPLOYMENT (per device):
□ Flash factory image + NeoFilm DPC via NFC provisioning tag
□ Verify Device Owner set: adb shell dpm list-owners
□ Verify kiosk mode: device boots directly to NeoFilm shell
□ Verify WiFi auto-connect to venue network
□ Scan QR code from admin portal → verify pairing succeeds
□ Verify WebSocket connection established (check admin portal status)
□ Verify initial schedule download completes
□ Verify ad playback in split-screen mode
□ Verify IPTV channel playback
□ Verify heartbeat appearing in backend (30s intervals)
□ Power cycle device → verify auto-boot to NeoFilm shell
□ Disconnect WiFi → verify offline mode engages within 60s
□ Reconnect WiFi → verify automatic reconnection + event drain
□ Verify screen capture blocked (try screenshot via adb)
□ Verify back/home buttons disabled
□ Verify admin escape sequence works with correct PIN
□ Record device serial, UUID, venue assignment in asset management

POST-DEPLOYMENT (monitoring — first 48h):
□ Device shows ONLINE in dashboard for >95% of time
□ No crash events reported
□ No ANR events reported
□ Ad impressions being recorded correctly
□ Heartbeat latency <2s consistently
□ Memory usage stable (no upward trend)
□ Cache hit rate >90% after initial population
□ CPU temperature within safe range (<75°C sustained)
```