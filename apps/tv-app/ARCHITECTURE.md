# NeoFilm Android TV Application — Production Architecture Document

> **Version:** 1.0.0
> **Target:** Android TV API 26+ (Android 8.0 Oreo+)
> **Scale:** 100,000+ concurrent devices
> **Uptime Target:** 99.95% (24/7/365)
> **Last Updated:** 2026-02-25

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Auto-Boot & Kiosk Mode](#2-auto-boot--kiosk-mode)
3. [Secure Pairing Flow](#3-secure-pairing-flow)
4. [Cloud Sync & Real-Time Control](#4-cloud-sync--real-time-control)
5. [Custom TV UX Shell](#5-custom-tv-ux-shell)
6. [Split-Screen Advertising Engine](#6-split-screen-advertising-engine)
7. [Video Caching System](#7-video-caching-system)
8. [Offline Mode](#8-offline-mode)
9. [OTA Update System](#9-ota-update-system)
10. [Crash Recovery & Watchdog](#10-crash-recovery--watchdog)
11. [Security Model](#11-security-model)
12. [Testing Strategy](#12-testing-strategy)

---

## 1. SYSTEM ARCHITECTURE

### 1.1 Module Breakdown

The application follows **Clean Architecture** with strict dependency rules: outer layers depend on inner layers, never the reverse.

```
┌─────────────────────────────────────────────────────────────────┐
│                        PRESENTATION LAYER                       │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  TV Shell │ │  Pairing  │ │  Admin   │ │  Split-Screen    │  │
│  │    UI     │ │   Screen  │ │  Escape  │ │  Overlay Engine  │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                        DOMAIN LAYER                             │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Schedule  │ │ Campaign  │ │  Device  │ │  Playback        │  │
│  │ UseCases │ │ UseCases  │ │ UseCases │ │  UseCases        │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                              │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Cloud   │ │   Local   │ │  Media   │ │  Device          │  │
│  │  Sync    │ │   Cache   │ │  Cache   │ │  Identity        │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE LAYER                       │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │WebSocket │ │   MQTT    │ │ ExoPlayer│ │  Android Keystore│  │
│  │ Client   │ │ Fallback  │ │  Engine  │ │  + EncryptedPrefs│  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       PLATFORM SERVICES                         │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Watchdog │ │   OTA     │ │  Boot    │ │  Kiosk / Device  │  │
│  │ Service  │ │ Updater   │ │ Receiver │ │  Policy Manager  │  │
│  └──────────┘ └───────────┘ └──────────┘ └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Gradle Module Map

```
:app                          → Main application module, Hilt entry point
:core:common                  → Base classes, extensions, constants
:core:network                 → WebSocket client, MQTT client, REST client, interceptors
:core:security                → Keystore wrapper, encryption, root detection
:core:device                  → Device identity, hardware info, provisioning
:feature:shell                → TV launcher UI, home screen, navigation
:feature:pairing              → QR code display, pairing flow UI
:feature:player               → ExoPlayer wrapper, split-screen engine
:feature:overlay              → Ad overlay rendering, transitions
:feature:settings             → Admin escape, diagnostics screen
:data:local                   → Room DB, EncryptedSharedPreferences, cache DAOs
:data:remote                  → API DTOs, WebSocket message models, mappers
:data:repository              → Repository implementations, offline-first logic
:domain                       → Use cases, domain models, repository interfaces
:service:watchdog             → Foreground watchdog service, ANR detection
:service:sync                 → Background sync, campaign download scheduler
:service:ota                  → OTA checker, installer, rollback manager
```

### 1.3 Responsibilities Per Module

| Module | Responsibility | Thread | Lifecycle |
|--------|---------------|--------|-----------|
| `:app` | Hilt graph root, `Application` subclass, global exception handler | Main | Process |
| `:core:network` | Persistent WebSocket, MQTT fallback, certificate pinning | IO Dispatcher (dedicated thread pool) | Process-scoped singleton |
| `:core:security` | Keystore ops, token encrypt/decrypt, root checks | Default Dispatcher | On-demand |
| `:core:device` | UUID generation, hardware fingerprint, serial number | Main (read-only) | Process |
| `:feature:shell` | Leanback `BrowseSupportFragment`, focus engine, theming | Main | Activity |
| `:feature:player` | Dual ExoPlayer instances, SurfaceView management | Main + ExoPlayer internal threads | Activity |
| `:feature:overlay` | `WindowManager` overlay, ad rotation timer | Main + Handler | Service |
| `:data:local` | Room DB (WAL mode), encrypted prefs, LRU disk cache | IO Dispatcher | Process |
| `:data:remote` | OkHttp + Retrofit, WebSocket frame parser, protobuf | IO Dispatcher | Process |
| `:data:repository` | Offline-first merge, conflict resolution, sync state | IO Dispatcher | Process |
| `:domain` | Pure Kotlin, no Android deps, business rules | Caller's dispatcher | Stateless |
| `:service:watchdog` | `START_STICKY` foreground service, heartbeat timer | Dedicated HandlerThread | Process |
| `:service:sync` | `WorkManager` periodic + one-shot workers | WorkManager thread pool | System-managed |
| `:service:ota` | Download + verify + install APK, rollback on failure | IO Dispatcher | Foreground service |

### 1.4 Threading Strategy

```kotlin
// Dispatcher configuration — injected via Hilt
@Module
@InstallIn(SingletonComponent::class)
object DispatcherModule {

    @Provides @IoDispatcher
    fun provideIoDispatcher(): CoroutineDispatcher =
        Dispatchers.IO.limitedParallelism(8) // Cap IO threads for TV hardware

    @Provides @DefaultDispatcher
    fun provideDefaultDispatcher(): CoroutineDispatcher =
        Dispatchers.Default.limitedParallelism(4) // 4 CPU threads max

    @Provides @MainDispatcher
    fun provideMainDispatcher(): CoroutineDispatcher = Dispatchers.Main.immediate

    @Provides @WebSocketDispatcher
    fun provideWebSocketDispatcher(): CoroutineDispatcher =
        Executors.newSingleThreadExecutor().asCoroutineDispatcher()
        // Single-thread guarantees message ordering

    @Provides @MqttDispatcher
    fun provideMqttDispatcher(): CoroutineDispatcher =
        Executors.newSingleThreadExecutor().asCoroutineDispatcher()
}
```

**Thread allocation rationale for TV hardware (typically 2-4 cores, 1.5-2GB RAM):**

| Thread Pool | Max Threads | Purpose |
|-------------|-------------|---------|
| Main | 1 | UI rendering, focus handling, Leanback |
| IO | 8 | Network, disk I/O, database |
| Default | 4 | JSON parsing, crypto, hashing |
| ExoPlayer Internal | 3 per instance | Demuxing, decoding, rendering |
| WebSocket | 1 | Message ordering guarantee |
| MQTT | 1 | Message ordering guarantee |
| Watchdog Handler | 1 | Heartbeat, health checks |
| WorkManager | 2 | Background sync jobs |

### 1.5 Lifecycle Management

```
Application.onCreate()
  ├── Initialize Hilt dependency graph
  ├── Initialize global UncaughtExceptionHandler
  ├── Start WatchdogService (foreground, START_STICKY)
  ├── Initialize SecurityManager (root detection, tamper check)
  ├── Open encrypted local database
  └── Begin identity resolution
         │
         ├── [NOT PAIRED] → Launch PairingActivity
         │                     └── Display QR code → await backend verification
         │                          └── On success → store JWT → launch ShellActivity
         │
         └── [PAIRED] → Validate stored JWT
                ├── [VALID] → Launch ShellActivity
                │               ├── Connect WebSocket
                │               ├── Sync schedule from backend
                │               ├── Start media pre-fetch workers
                │               └── Begin playback loop
                │
                └── [EXPIRED] → Attempt token refresh
                       ├── [SUCCESS] → Launch ShellActivity
                       └── [FAILURE] → Launch PairingActivity (re-pair)
```

### 1.6 Memory Management Plan

**Budget allocation (targeting 1.5GB device, ~800MB available to app):**

| Component | Budget | Strategy |
|-----------|--------|----------|
| ExoPlayer Primary | 200MB | Bounded buffer: 30s video, 2s audio |
| ExoPlayer Secondary (Ad) | 80MB | Bounded buffer: 10s video, 2s audio |
| UI Rendering | 100MB | RecyclerView pooling, Glide with 50MB LRU |
| Room DB + WAL | 50MB | WAL checkpoint at 10MB |
| Network Buffers | 30MB | OkHttp connection pool: 5 idle, 30s keep-alive |
| WebSocket Frames | 10MB | Ring buffer, drop oldest on pressure |
| Working Memory | 150MB | Coroutine stacks, object allocation |
| **Headroom** | **180MB** | GC breathing room, spike absorption |

**Pressure response strategy:**

```kotlin
class MemoryPressureHandler(
    private val playerManager: PlayerManager,
    private val cacheManager: CacheManager,
    private val imageLoader: ImageLoader,
) : ComponentCallbacks2 {

    override fun onTrimMemory(level: Int) {
        when {
            level >= TRIM_MEMORY_RUNNING_CRITICAL -> {
                // Level 15: App is in foreground, system critically low
                playerManager.releaseSecondaryPlayer()
                imageLoader.clearMemoryCache()
                cacheManager.evictStalest(percent = 50)
                System.gc()
            }
            level >= TRIM_MEMORY_RUNNING_LOW -> {
                // Level 10: App in foreground, system getting low
                playerManager.reduceBufferSize(factor = 0.5f)
                imageLoader.trimMemoryCache(percent = 50)
            }
            level >= TRIM_MEMORY_RUNNING_MODERATE -> {
                // Level 5: moderate pressure
                imageLoader.trimMemoryCache(percent = 25)
            }
        }
    }
}
```

### 1.7 Interaction Diagram

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Backend  │     │ WebSocket│     │  Device   │     │  TV UI   │
│  (API)    │     │  Server  │     │  App      │     │  Shell   │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │                 │
     │  ◄─── JWT Auth (REST) ─────────┤                 │
     │────── Schedule Payload ────────►│                 │
     │                │                │── Parse + Cache─►│
     │                │                │                 │── Render
     │                │◄─── WS Connect─┤                 │
     │                │──── Config Push►│                 │
     │                │                │── Apply Config──►│── Re-render
     │                │◄─── Heartbeat──┤                 │
     │                │                │                 │
     │  ◄─── Analytics POST ──────────┤                 │
     │                │◄─── WS Event───┤                 │
     │                │    (ad_played)  │                 │
     │                │                │                 │
     │── Campaign Update (WS push) ──►│                 │
     │                │── schedule_upd─►│── Hot-swap ────►│
     │                │                │                 │
     │── Remote Cmd ──►│── cmd_reboot──►│── Reboot ──────►│
     │                │── cmd_purge───►│── Purge Cache──►│
     │                │── cmd_refresh─►│── Force Sync ──►│
```

### 1.8 Application State Machine

```
                    ┌─────────────┐
                    │   BOOTING   │
                    └──────┬──────┘
                           │ boot complete + kiosk locked
                           ▼
                    ┌─────────────┐
                    │INITIALIZING │  (security checks, DB open)
                    └──────┬──────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       ┌─────────────┐          ┌─────────────┐
       │  UNPAIRED   │          │   PAIRED    │
       │ (QR screen) │          │ (JWT valid) │
       └──────┬──────┘          └──────┬──────┘
              │ pair success           │
              └────────┬───────────────┘
                       ▼
                ┌─────────────┐
                │  SYNCING    │  (fetch schedule, pre-cache)
                └──────┬──────┘
                       │ sync complete
                       ▼
                ┌─────────────┐  ◄── remote_config_push
                │   ACTIVE    │  ◄── schedule_update
                │ (playback)  │  ◄── campaign_sync
                └──────┬──────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
  ┌───────────┐ ┌───────────┐ ┌───────────┐
  │  OFFLINE  │ │ UPDATING  │ │  ERROR    │
  │ (cached   │ │ (OTA in   │ │ (crash    │
  │  playback)│ │  progress)│ │  recovery)│
  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
        │             │              │
        └─────────────┴──────────────┘
                      │
                      ▼
               ┌─────────────┐
               │   ACTIVE    │  (restored)
               └─────────────┘
```

**State transitions stored in `StateFlow<AppState>` observed by all features:**

```kotlin
sealed class AppState {
    object Booting : AppState()
    object Initializing : AppState()
    object Unpaired : AppState()
    data class Paired(val deviceId: String, val venueId: String) : AppState()
    data class Syncing(val progress: Float) : AppState()
    data class Active(val currentSchedule: Schedule) : AppState()
    data class Offline(val lastSyncTimestamp: Long) : AppState()
    data class Updating(val version: String, val progress: Float) : AppState()
    data class Error(val code: ErrorCode, val canRecover: Boolean) : AppState()
}
```

---

## 2. AUTO-BOOT & KIOSK MODE

### 2.1 BootReceiver

```kotlin
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.QUICKBOOT_POWERON") {

            // Launch main activity with kiosk flags
            val launchIntent = Intent(context, ShellActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }
            context.startActivity(launchIntent)

            // Start watchdog service
            val serviceIntent = Intent(context, WatchdogService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
        }
    }
}
```

**Manifest registration:**

```xml
<receiver
    android:name=".platform.BootReceiver"
    android:enabled="true"
    android:exported="true"
    android:directBootAware="true">
    <intent-filter android:priority="999">
        <action android:name="android.intent.action.BOOT_COMPLETED" />
        <action android:name="android.intent.action.QUICKBOOT_POWERON" />
        <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED" />
    </intent-filter>
</receiver>
```

### 2.2 LockTaskMode Configuration

```kotlin
class ShellActivity : AppCompatActivity() {

    private lateinit var dpm: DevicePolicyManager
    private lateinit var adminComponent: ComponentName

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        adminComponent = ComponentName(this, NeoFilmDeviceAdmin::class.java)

        if (dpm.isDeviceOwnerApp(packageName)) {
            enableKioskMode()
        }
    }

    private fun enableKioskMode() {
        // 1. Set this app as the lock task package
        dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))

        // 2. Configure lock task features
        dpm.setLockTaskFeatures(
            adminComponent,
            DevicePolicyManager.LOCK_TASK_FEATURE_NONE
            // No home button, no recents, no notifications, no status bar
        )

        // 3. Enter lock task mode
        startLockTask()

        // 4. Suppress system UI
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        )

        // 5. Keep screen on
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    override fun onBackPressed() {
        // Intercept back button — no-op in kiosk mode
    }
}
```

### 2.3 Device Owner Provisioning

**Method 1: NFC Provisioning (preferred for fleet deployment)**

```json
{
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME":
    "com.neofilm.tv/.platform.NeoFilmDeviceAdmin",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION":
    "https://cdn.neofilm.io/tv/latest.apk",
  "android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM":
    "<SHA-256 base64>",
  "android.app.extra.PROVISIONING_WIFI_SSID": "NeoFilm-Setup",
  "android.app.extra.PROVISIONING_WIFI_PASSWORD": "<encrypted>",
  "android.app.extra.PROVISIONING_LOCALE": "fr_FR",
  "android.app.extra.PROVISIONING_TIME_ZONE": "Europe/Paris",
  "android.app.extra.PROVISIONING_SKIP_ENCRYPTION": false
}
```

**Method 2: ADB for development/small deployments**

```bash
adb shell dpm set-device-owner com.neofilm.tv/.platform.NeoFilmDeviceAdmin
```

**Method 3: Zero-Touch Enrollment (for 1000+ devices)**

Configured via Google Zero-Touch portal or partner EMM. The `NeoFilmDeviceAdmin` DPC handles:

```kotlin
class NeoFilmDeviceAdmin : DeviceAdminReceiver() {

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        // Device owner set — apply initial policies
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE)
            as DevicePolicyManager
        val admin = getComponentName(context)

        // Disable factory reset by non-owners
        dpm.addUserRestriction(admin, UserManager.DISALLOW_FACTORY_RESET)
        dpm.addUserRestriction(admin, UserManager.DISALLOW_SAFE_BOOT)
        dpm.addUserRestriction(admin, UserManager.DISALLOW_ADD_USER)
        dpm.addUserRestriction(admin, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
        dpm.addUserRestriction(admin, UserManager.DISALLOW_USB_FILE_TRANSFER)

        // Set as preferred launcher
        val filter = IntentFilter(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            addCategory(Intent.CATEGORY_DEFAULT)
        }
        dpm.addPersistentPreferredActivity(
            admin,
            filter,
            ComponentName(context, ShellActivity::class.java)
        )

        // Disable other launchers
        dpm.setApplicationHidden(admin, "com.google.android.tvlauncher", true)
        dpm.setApplicationHidden(admin, "com.google.android.leanbacklauncher", true)
    }
}
```

### 2.4 Launcher Override

```xml
<!-- AndroidManifest.xml -->
<activity
    android:name=".feature.shell.ShellActivity"
    android:launchMode="singleTask"
    android:screenOrientation="landscape"
    android:configChanges="orientation|screenSize|keyboard|keyboardHidden"
    android:theme="@style/Theme.NeoFilm.Fullscreen">

    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.HOME" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.LAUNCHER" />
        <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
    </intent-filter>
</activity>
```

### 2.5 Secure Admin Escape

```kotlin
class AdminEscapeManager @Inject constructor(
    private val encryptedPrefs: EncryptedSharedPreferences,
    private val analyticsReporter: AnalyticsReporter,
) {
    companion object {
        private const val PIN_HASH_KEY = "admin_pin_hash"
        private const val ESCAPE_SEQUENCE = "DPAD_UP,DPAD_UP,DPAD_DOWN,DPAD_DOWN,DPAD_LEFT,DPAD_RIGHT"
        private const val SEQUENCE_TIMEOUT_MS = 5000L
        private const val MAX_PIN_ATTEMPTS = 5
        private const val LOCKOUT_DURATION_MS = 300_000L // 5 min
    }

    private val keySequence = mutableListOf<String>()
    private var sequenceStartTime = 0L
    private var failedAttempts = 0
    private var lockoutUntil = 0L

    fun onKeyEvent(keyCode: Int): Boolean {
        val now = SystemClock.elapsedRealtime()

        if (now - sequenceStartTime > SEQUENCE_TIMEOUT_MS) {
            keySequence.clear()
        }
        if (keySequence.isEmpty()) sequenceStartTime = now

        keySequence.add(KeyEvent.keyCodeToString(keyCode))
        val current = keySequence.joinToString(",")

        if (ESCAPE_SEQUENCE == current) {
            keySequence.clear()
            return true // Show PIN dialog
        }
        return false
    }

    fun validatePin(pin: String): Boolean {
        if (SystemClock.elapsedRealtime() < lockoutUntil) return false

        val storedHash = encryptedPrefs.getString(PIN_HASH_KEY, null) ?: return false
        val inputHash = hashPin(pin)

        return if (inputHash == storedHash) {
            failedAttempts = 0
            analyticsReporter.report("admin_escape_success")
            true
        } else {
            failedAttempts++
            if (failedAttempts >= MAX_PIN_ATTEMPTS) {
                lockoutUntil = SystemClock.elapsedRealtime() + LOCKOUT_DURATION_MS
                analyticsReporter.report("admin_escape_lockout")
            }
            false
        }
    }

    private fun hashPin(pin: String): String {
        val salt = encryptedPrefs.getString("pin_salt", null)!!
        return Argon2.hash(pin, salt.toByteArray())
    }
}
```

### 2.6 Recovery Strategy if Kiosk Fails

```
IF LockTaskMode fails to engage:
  1. WatchdogService detects ShellActivity not in foreground (via UsageStatsManager)
  2. Wait 3 seconds (debounce legitimate transitions)
  3. Force re-launch ShellActivity with FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK
  4. Re-call startLockTask()
  5. Report kiosk_escape event to backend with device fingerprint

IF Device Owner is lost (factory reset or manual removal):
  1. App detects isDeviceOwnerApp() == false on next boot
  2. Falls back to "guided access" mode (overlay + intercepting all key events)
  3. Reports CRITICAL alert to backend
  4. Backend flags device for physical re-provisioning
  5. Device continues playback in degraded kiosk mode until re-provisioned

IF system UI appears unexpectedly:
  1. WindowFocusChangeListener detects hasFocus == false
  2. Immediately re-apply SYSTEM_UI_FLAG_IMMERSIVE_STICKY
  3. If persistent (>5 focus losses in 60s), force restart activity
```

### 2.7 Required Permissions

```xml
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
    tools:ignore="ProtectedPermissions" />
<uses-permission android:name="android.permission.REBOOT"
    tools:ignore="ProtectedPermissions" />

<!-- Device Owner grants these implicitly -->
<uses-permission android:name="android.permission.BIND_DEVICE_ADMIN" />
```

---

## 3. SECURE PAIRING FLOW

### 3.1 Device UUID Generation

```kotlin
object DeviceIdentityGenerator {

    /**
     * Generates a deterministic device UUID from hardware fingerprint.
     * Survives factory reset if Build.SERIAL is available (Device Owner).
     * Falls back to ANDROID_ID + random salt stored in encrypted prefs.
     */
    fun generateDeviceUuid(context: Context): String {
        val components = buildString {
            append(Build.MANUFACTURER)
            append(Build.MODEL)
            append(Build.BOARD)
            append(Build.HARDWARE)
            // SERIAL requires Device Owner or READ_PRIVILEGED_PHONE_STATE
            append(Build.getSerial())
            append(Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ANDROID_ID
            ))
        }

        // HMAC-SHA256 with app-specific key stored in Keystore
        val key = getOrCreateHmacKey()
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(key)
        val hash = mac.doFinal(components.toByteArray(Charsets.UTF_8))

        // Format as UUID v5-like
        return UUID.nameUUIDFromBytes(hash).toString()
    }

    private fun getOrCreateHmacKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val alias = "neofilm_device_identity_hmac"

        return if (keyStore.containsAlias(alias)) {
            (keyStore.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
        } else {
            val keyGen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
                "AndroidKeyStore"
            )
            keyGen.init(
                KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
                    .build()
            )
            keyGen.generateKey()
        }
    }
}
```

### 3.2 Pairing Sequence Diagram

```
┌──────────┐          ┌──────────┐          ┌──────────┐
│  TV App  │          │  Backend │          │  Admin   │
│          │          │  (API)   │          │  Portal  │
└────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │
     │ 1. POST /devices/provision/init           │
     │    { deviceUuid, hwFingerprint }          │
     │ ────────────────────►                     │
     │                     │                     │
     │ 2. { provisioningToken, expiresIn: 600 }  │
     │ ◄────────────────────                     │
     │                     │                     │
     │ 3. Generate QR code │                     │
     │    containing:      │                     │
     │    {                │                     │
     │      "t": <token>,  │                     │
     │      "u": <uuid>,   │                     │
     │      "ts": <epoch>, │                     │
     │      "sig": <hmac>  │                     │
     │    }                │                     │
     │ ┌─────────────┐    │                     │
     │ │  QR SCREEN  │    │                     │
     │ └─────────────┘    │                     │
     │                     │                     │
     │ 4. Poll: GET /devices/provision/status     │
     │    { provisioningToken }                   │
     │ ────────────────────►                     │
     │ ◄── { status: "waiting" } ────────────────│
     │                     │                     │
     │                     │  5. Admin scans QR / │
     │                     │     enters token     │
     │                     │  POST /devices/pair  │
     │                     │  { token, venueId,   │
     │                     │    deviceName }      │
     │                     │ ◄────────────────────│
     │                     │                     │
     │                     │  6. Validate token,  │
     │                     │     create Device,   │
     │                     │     generate JWT     │
     │                     │ ────────────────────►│
     │                     │  { deviceId, paired }│
     │                     │                     │
     │ 7. Poll returns:    │                     │
     │    { status:"paired",│                    │
     │      accessToken,   │                     │
     │      refreshToken,  │                     │
     │      deviceId,      │                     │
     │      venueId,       │                     │
     │      config }       │                     │
     │ ◄────────────────────                     │
     │                     │                     │
     │ 8. Store tokens     │                     │
     │    in Keystore      │                     │
     │ 9. Transition to    │                     │
     │    SYNCING state    │                     │
```

### 3.3 Token Storage in Android Keystore

```kotlin
class SecureTokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val KEY_ALIAS = "neofilm_token_encryption_key"
        private const val PREFS_NAME = "neofilm_secure_tokens"
        private const val ACCESS_TOKEN_KEY = "access_token"
        private const val REFRESH_TOKEN_KEY = "refresh_token"
        private const val TOKEN_EXPIRY_KEY = "token_expiry"
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .setRequestStrongBoxBacked(true) // Use hardware security module if available
        .build()

    private val encryptedPrefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    fun storeTokens(accessToken: String, refreshToken: String, expiresInSeconds: Long) {
        encryptedPrefs.edit()
            .putString(ACCESS_TOKEN_KEY, accessToken)
            .putString(REFRESH_TOKEN_KEY, refreshToken)
            .putLong(TOKEN_EXPIRY_KEY, System.currentTimeMillis() + (expiresInSeconds * 1000))
            .apply()
    }

    fun getAccessToken(): String? = encryptedPrefs.getString(ACCESS_TOKEN_KEY, null)
    fun getRefreshToken(): String? = encryptedPrefs.getString(REFRESH_TOKEN_KEY, null)
    fun isTokenExpired(): Boolean =
        System.currentTimeMillis() >= encryptedPrefs.getLong(TOKEN_EXPIRY_KEY, 0)

    fun clearTokens() {
        encryptedPrefs.edit().clear().apply()
    }
}
```

### 3.4 Token Rotation Strategy

```kotlin
class TokenRotationManager @Inject constructor(
    private val tokenStore: SecureTokenStore,
    private val apiClient: NeoFilmApiClient,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    companion object {
        private const val REFRESH_BUFFER_MS = 300_000L // Refresh 5 min before expiry
        private const val MAX_REFRESH_RETRIES = 3
        private const val RETRY_DELAY_MS = 5_000L
    }

    private val _authState = MutableStateFlow<AuthState>(AuthState.Unknown)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    private var rotationJob: Job? = null

    fun startRotationLoop(scope: CoroutineScope) {
        rotationJob?.cancel()
        rotationJob = scope.launch(ioDispatcher) {
            while (isActive) {
                val expiryMs = tokenStore.getTokenExpiryMs()
                val delayUntilRefresh = (expiryMs - System.currentTimeMillis() - REFRESH_BUFFER_MS)
                    .coerceAtLeast(0)

                delay(delayUntilRefresh)

                var success = false
                for (attempt in 1..MAX_REFRESH_RETRIES) {
                    try {
                        val refreshToken = tokenStore.getRefreshToken() ?: break
                        val response = apiClient.auth.refresh(RefreshTokenDto(refreshToken))
                        tokenStore.storeTokens(
                            response.accessToken,
                            response.refreshToken,
                            response.expiresIn
                        )
                        _authState.value = AuthState.Authenticated
                        success = true
                        break
                    } catch (e: Exception) {
                        if (attempt < MAX_REFRESH_RETRIES) {
                            delay(RETRY_DELAY_MS * attempt)
                        }
                    }
                }

                if (!success) {
                    _authState.value = AuthState.RequiresReAuth
                }
            }
        }
    }

    sealed class AuthState {
        object Unknown : AuthState()
        object Authenticated : AuthState()
        object RequiresReAuth : AuthState()
    }
}
```

### 3.5 Anti-Tampering & Replay Prevention

```kotlin
class PairingSecurityManager @Inject constructor(
    private val secureTimeProvider: SecureTimeProvider,
) {
    companion object {
        private const val MAX_CLOCK_DRIFT_MS = 30_000L // 30s max drift
        private const val QR_REFRESH_INTERVAL_MS = 60_000L // Refresh QR every 60s
        private const val NONCE_LENGTH = 32
    }

    /**
     * QR payload includes:
     * - provisioningToken (one-time, server-generated)
     * - deviceUuid (hardware-bound)
     * - timestamp (NTP-validated)
     * - nonce (random, single-use)
     * - signature (HMAC-SHA256 of above with provisioning key)
     */
    fun generateQrPayload(token: String, uuid: String): String {
        val nonce = ByteArray(NONCE_LENGTH).also { SecureRandom().nextBytes(it) }
        val timestamp = secureTimeProvider.getCurrentTimeMs()

        val payload = JSONObject().apply {
            put("t", token)
            put("u", uuid)
            put("ts", timestamp)
            put("n", Base64.encodeToString(nonce, Base64.NO_WRAP))
        }

        // Sign with device-local HMAC key
        val signature = hmacSign(payload.toString())
        payload.put("sig", signature)

        return payload.toString()
    }

    /**
     * Validates server response timestamp to prevent replay attacks.
     */
    fun validateServerTimestamp(serverTimestamp: Long): Boolean {
        val localTime = secureTimeProvider.getCurrentTimeMs()
        return abs(localTime - serverTimestamp) <= MAX_CLOCK_DRIFT_MS
    }
}

/**
 * NTP-based time provider to prevent clock manipulation attacks.
 */
class SecureTimeProvider @Inject constructor() {
    private var ntpOffset: Long = 0
    private var lastNtpSync: Long = 0

    suspend fun syncWithNtp() {
        try {
            val ntpClient = SntpClient()
            if (ntpClient.requestTime("time.google.com", 5000)) {
                ntpOffset = ntpClient.ntpTime - SystemClock.elapsedRealtime()
                lastNtpSync = SystemClock.elapsedRealtime()
            }
        } catch (_: Exception) {
            // Fall back to system time
        }
    }

    fun getCurrentTimeMs(): Long = SystemClock.elapsedRealtime() + ntpOffset

    fun isNtpSynced(): Boolean =
        lastNtpSync > 0 && (SystemClock.elapsedRealtime() - lastNtpSync) < 3_600_000
}
```

### 3.6 Device Revocation Logic

```kotlin
/**
 * Revocation is handled server-side. The device discovers revocation via:
 * 1. WebSocket receives "device_revoked" command
 * 2. Token refresh returns 403 with code DEVICE_REVOKED
 * 3. Heartbeat returns 403 with code DEVICE_REVOKED
 *
 * On revocation:
 */
class DeviceRevocationHandler @Inject constructor(
    private val tokenStore: SecureTokenStore,
    private val cacheManager: CacheManager,
    private val appStateManager: AppStateManager,
) {
    fun handleRevocation(reason: String) {
        // 1. Clear all tokens
        tokenStore.clearTokens()

        // 2. Clear cached content (may contain licensed material)
        cacheManager.purgeAll()

        // 3. Clear local schedule database
        // (keeps analytics queue for eventual reconciliation)

        // 4. Transition to unpaired state — shows QR code
        appStateManager.transitionTo(AppState.Unpaired)

        // 5. Log revocation event locally (will be sent on re-pair)
        LocalEventLogger.log(
            EventType.DEVICE_REVOKED,
            mapOf("reason" to reason, "timestamp" to System.currentTimeMillis())
        )
    }
}
```
