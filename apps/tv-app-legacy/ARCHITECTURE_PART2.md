# NeoFilm Android TV — Part 2: Cloud Sync, TV UX Shell, Split-Screen Engine

---

## 4. CLOUD SYNC & REAL-TIME CONTROL

### 4.1 Connection State Machine

```
                    ┌──────────────┐
            ┌──────►│ DISCONNECTED │◄──────────────────────┐
            │       └──────┬───────┘                       │
            │              │ connect()                     │
            │              ▼                               │
            │       ┌──────────────┐                       │
            │       │ CONNECTING   │──── timeout ──────────┘
            │       │ (WebSocket)  │                       │
            │       └──────┬───────┘                       │
            │              │ onOpen()                      │
            │              ▼                               │
            │       ┌──────────────┐                       │
            │       │AUTHENTICATING│──── auth_fail ────────┘
            │       │ (send JWT)   │
            │       └──────┬───────┘
            │              │ auth_ok
            │              ▼
            │       ┌──────────────┐    heartbeat_timeout
        onClose()   │  CONNECTED   │────────────┐
        onError()   │  (healthy)   │            │
            │       └──────┬───────┘            │
            │              │ missed 3 beats     ▼
            │              ▼              ┌──────────────┐
            │       ┌──────────────┐     │  RECONNECTING│
            │       │  DEGRADED    │     │  (exp backoff)│
            │       │ (WS down,   │     └──────┬───────┘
            │       │  MQTT active)│            │
            │       └──────┬───────┘            │
            │              │ MQTT fail          │ retry success
            │              ▼                    │
            │       ┌──────────────┐            │
            └───────│   OFFLINE    │◄───────────┘
                    │ (local only) │    max retries exceeded
                    └──────────────┘
```

### 4.2 WebSocket Client

```kotlin
class NeoFilmWebSocketClient @Inject constructor(
    private val okHttpClient: OkHttpClient,
    private val tokenStore: SecureTokenStore,
    private val messageParser: WebSocketMessageParser,
    @WebSocketDispatcher private val dispatcher: CoroutineDispatcher,
) {
    companion object {
        private const val HEARTBEAT_INTERVAL_MS = 30_000L
        private const val HEARTBEAT_TIMEOUT_MS = 10_000L
        private const val MAX_RECONNECT_ATTEMPTS = Int.MAX_VALUE // Never stop trying
        private const val INITIAL_BACKOFF_MS = 1_000L
        private const val MAX_BACKOFF_MS = 300_000L // 5 min cap
        private const val BACKOFF_MULTIPLIER = 2.0
        private const val JITTER_FACTOR = 0.3
    }

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    private val _incomingMessages = MutableSharedFlow<ServerMessage>(
        replay = 0,
        extraBufferCapacity = 64,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val incomingMessages: SharedFlow<ServerMessage> = _incomingMessages.asSharedFlow()

    private var webSocket: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var reconnectAttempt = 0
    private val offlineQueue = ConcurrentLinkedQueue<ClientMessage>()

    fun connect(scope: CoroutineScope) {
        scope.launch(dispatcher) {
            performConnect()
        }
    }

    private suspend fun performConnect() {
        _connectionState.value = ConnectionState.CONNECTING

        val token = tokenStore.getAccessToken()
            ?: run {
                _connectionState.value = ConnectionState.DISCONNECTED
                return
            }

        val request = Request.Builder()
            .url("wss://ws.neofilm.io/v1/device")
            .addHeader("Authorization", "Bearer $token")
            .addHeader("X-Device-UUID", DeviceIdentityGenerator.cachedUuid)
            .build()

        webSocket = okHttpClient.newWebSocket(request, createListener())
    }

    private fun createListener() = object : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            _connectionState.value = ConnectionState.AUTHENTICATING
            // Server validates JWT on connection — auth_ok comes as first frame
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            val message = messageParser.parse(text)

            when (message) {
                is ServerMessage.AuthOk -> {
                    _connectionState.value = ConnectionState.CONNECTED
                    reconnectAttempt = 0
                    startHeartbeat()
                    drainOfflineQueue()
                }
                is ServerMessage.HeartbeatAck -> {
                    lastHeartbeatAckTime = SystemClock.elapsedRealtime()
                }
                else -> {
                    _incomingMessages.tryEmit(message)
                }
            }
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            heartbeatJob?.cancel()
            scheduleReconnect()
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(1000, null)
            heartbeatJob?.cancel()
            if (code != 1000) scheduleReconnect()
        }
    }

    fun send(message: ClientMessage) {
        if (_connectionState.value == ConnectionState.CONNECTED) {
            val json = messageParser.serialize(message)
            webSocket?.send(json) ?: offlineQueue.offer(message)
        } else {
            offlineQueue.offer(message)
        }
    }

    private fun drainOfflineQueue() {
        while (offlineQueue.isNotEmpty()) {
            val msg = offlineQueue.poll() ?: break
            send(msg)
        }
    }

    private var lastHeartbeatAckTime = 0L

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = CoroutineScope(dispatcher).launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)

                val heartbeat = ClientMessage.Heartbeat(
                    timestamp = System.currentTimeMillis(),
                    cpuUsage = SystemMetrics.cpuUsagePercent(),
                    memoryUsage = SystemMetrics.memoryUsagePercent(),
                    diskUsage = SystemMetrics.diskUsagePercent(),
                    uptimeSeconds = SystemMetrics.uptimeSeconds(),
                    appVersion = BuildConfig.VERSION_NAME,
                )
                send(heartbeat)

                // Check for heartbeat timeout
                delay(HEARTBEAT_TIMEOUT_MS)
                val elapsed = SystemClock.elapsedRealtime() - lastHeartbeatAckTime
                if (elapsed > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
                    // Server unresponsive — trigger reconnect
                    webSocket?.cancel()
                    scheduleReconnect()
                    return@launch
                }
            }
        }
    }

    private fun scheduleReconnect() {
        _connectionState.value = ConnectionState.RECONNECTING
        reconnectAttempt++

        val baseDelay = (INITIAL_BACKOFF_MS * BACKOFF_MULTIPLIER.pow(
            reconnectAttempt.coerceAtMost(20).toDouble()
        )).toLong().coerceAtMost(MAX_BACKOFF_MS)

        // Add jitter to prevent thundering herd across 100k devices
        val jitter = (baseDelay * JITTER_FACTOR * Random.nextDouble()).toLong()
        val delay = baseDelay + jitter

        CoroutineScope(dispatcher).launch {
            delay(delay)
            performConnect()
        }
    }
}

enum class ConnectionState {
    DISCONNECTED,
    CONNECTING,
    AUTHENTICATING,
    CONNECTED,
    RECONNECTING,
    DEGRADED,   // WS down, MQTT active
    OFFLINE,    // Both channels down
}
```

### 4.3 MQTT Fallback Client

```kotlin
class MqttFallbackClient @Inject constructor(
    private val tokenStore: SecureTokenStore,
    @MqttDispatcher private val dispatcher: CoroutineDispatcher,
) {
    companion object {
        private const val BROKER_URL = "ssl://mqtt.neofilm.io:8883"
        private const val QOS_COMMANDS = 2      // Exactly once for commands
        private const val QOS_CONFIG = 1        // At least once for config
        private const val QOS_HEARTBEAT = 0     // At most once for heartbeat
        private const val KEEP_ALIVE_SECONDS = 60
    }

    private var mqttClient: MqttAsyncClient? = null
    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    fun connect(deviceId: String) {
        val clientId = "neofilm-tv-$deviceId"

        val options = MqttConnectOptions().apply {
            isCleanSession = false // Persistent session for QoS 1/2
            keepAliveInterval = KEEP_ALIVE_SECONDS
            userName = "device:$deviceId"
            password = tokenStore.getAccessToken()?.toCharArray() ?: return
            isAutomaticReconnect = true
            connectionTimeout = 10
            maxInflight = 50

            // TLS with certificate pinning
            socketFactory = createPinnedSslSocketFactory()
        }

        mqttClient = MqttAsyncClient(BROKER_URL, clientId, MemoryPersistence())
        mqttClient?.connect(options, null, object : IMqttActionListener {
            override fun onSuccess(asyncActionToken: IMqttToken?) {
                _isConnected.value = true
                subscribeToTopics(deviceId)
            }

            override fun onFailure(asyncActionToken: IMqttToken?, exception: Throwable?) {
                _isConnected.value = false
                // MQTT auto-reconnect handles retries
            }
        })
    }

    private fun subscribeToTopics(deviceId: String) {
        val topics = arrayOf(
            "neofilm/devices/$deviceId/commands",    // Remote commands
            "neofilm/devices/$deviceId/config",      // Config updates
            "neofilm/devices/$deviceId/schedule",    // Schedule updates
            "neofilm/broadcast/emergency",           // Fleet-wide emergency
        )
        val qos = intArrayOf(QOS_COMMANDS, QOS_CONFIG, QOS_CONFIG, QOS_COMMANDS)

        mqttClient?.subscribe(topics, qos)

        mqttClient?.setCallback(object : MqttCallbackExtended {
            override fun messageArrived(topic: String, message: MqttMessage) {
                // Route to same handler as WebSocket messages
                handleIncomingMessage(topic, message.payload)
            }
            override fun connectComplete(reconnect: Boolean, serverURI: String) {
                _isConnected.value = true
                if (reconnect) subscribeToTopics(deviceId)
            }
            override fun connectionLost(cause: Throwable?) {
                _isConnected.value = false
            }
            override fun deliveryComplete(token: IMqttDeliveryToken?) {}
        })
    }
}
```

### 4.4 Unified Communication Manager

```kotlin
class CloudCommunicationManager @Inject constructor(
    private val webSocketClient: NeoFilmWebSocketClient,
    private val mqttClient: MqttFallbackClient,
    private val offlineQueueDao: OfflineQueueDao,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    private val _effectiveState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val effectiveState: StateFlow<ConnectionState> = _effectiveState.asStateFlow()

    fun initialize(scope: CoroutineScope, deviceId: String) {
        // Launch both channels
        webSocketClient.connect(scope)
        mqttClient.connect(deviceId)

        // Merge connection states
        scope.launch(ioDispatcher) {
            combine(
                webSocketClient.connectionState,
                mqttClient.isConnected,
            ) { wsState, mqttConnected ->
                when {
                    wsState == ConnectionState.CONNECTED -> ConnectionState.CONNECTED
                    mqttConnected -> ConnectionState.DEGRADED
                    else -> ConnectionState.OFFLINE
                }
            }.collect { state ->
                _effectiveState.value = state

                // When coming back online, drain offline queue
                if (state != ConnectionState.OFFLINE) {
                    drainPersistedQueue()
                }
            }
        }
    }

    /**
     * Remote command handlers — dispatched from incoming messages.
     */
    val commandHandlers = mapOf<String, suspend (JsonObject) -> Unit>(
        "reboot" to { _ -> SystemUtils.rebootDevice() },
        "cache_purge" to { _ -> cacheManager.purgeAll() },
        "force_sync" to { _ -> scheduleSyncManager.forceSync() },
        "update_config" to { payload -> configManager.applyRemoteConfig(payload) },
        "schedule_update" to { payload -> scheduleManager.applyScheduleUpdate(payload) },
        "show_message" to { payload -> overlayManager.showMessage(payload) },
        "device_revoked" to { payload -> revocationHandler.handleRevocation(payload.getString("reason")) },
        "request_screenshot" to { _ -> screenshotManager.captureAndUpload() },
        "request_diagnostics" to { _ -> diagnosticsManager.gatherAndSend() },
        "set_volume" to { payload -> audioManager.setVolume(payload.getInt("level")) },
        "ota_update" to { payload -> otaManager.triggerUpdate(payload) },
    )

    private suspend fun drainPersistedQueue() {
        val pending = offlineQueueDao.getAllPending()
        for (item in pending) {
            try {
                send(item.message)
                offlineQueueDao.markSent(item.id)
            } catch (e: Exception) {
                break // Stop draining on first failure
            }
        }
    }
}
```

### 4.5 Certificate Pinning

```kotlin
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(
        tokenStore: SecureTokenStore,
        certificatePinner: CertificatePinner,
    ): OkHttpClient {
        return OkHttpClient.Builder()
            .certificatePinner(
                CertificatePinner.Builder()
                    // Pin both leaf and intermediate CA
                    .add("api.neofilm.io", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
                    .add("api.neofilm.io", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=")
                    .add("ws.neofilm.io", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
                    .add("ws.neofilm.io", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=")
                    .add("cdn.neofilm.io", "sha256/CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=")
                    .build()
            )
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .connectionPool(ConnectionPool(5, 30, TimeUnit.SECONDS))
            .addInterceptor(AuthInterceptor(tokenStore))
            .addInterceptor(DeviceInfoInterceptor())
            .build()
    }
}
```

---

## 5. CUSTOM TV UX SHELL

### 5.1 Layout Hierarchy

```
ShellActivity (singleTask, landscape, fullscreen)
├── FrameLayout (root container, match_parent)
│   ├── PlayerContainer (SurfaceView — main content, z=0)
│   │   └── SurfaceView (ExoPlayer primary)
│   │
│   ├── ShellNavigationHost (NavHostFragment, z=1)
│   │   ├── HomeFragment
│   │   │   ├── HorizontalGridView (featured row — partner branding)
│   │   │   ├── HorizontalGridView (IPTV channels row)
│   │   │   ├── HorizontalGridView (streaming apps row)
│   │   │   ├── HorizontalGridView (local catalog row)
│   │   │   └── HorizontalGridView (info/services row)
│   │   │
│   │   ├── IptvFragment
│   │   │   ├── ChannelListView (vertical, left sidebar)
│   │   │   ├── EpgGridView (program guide, scrollable)
│   │   │   └── MiniPlayerView (PiP preview)
│   │   │
│   │   ├── CatalogFragment
│   │   │   ├── CategoryTabsView (horizontal)
│   │   │   └── ContentGridView (poster grid, Leanback VerticalGridSupportFragment)
│   │   │
│   │   └── SettingsFragment (admin-only, PIN-protected)
│   │       ├── DeviceInfoView
│   │       ├── NetworkDiagnosticsView
│   │       └── CacheManagementView
│   │
│   ├── AdOverlayContainer (z=2, GONE by default)
│   │   ├── SurfaceView / TextureView (ExoPlayer secondary)
│   │   └── AdInfoBadge (corner overlay)
│   │
│   ├── SystemOverlayContainer (z=3)
│   │   ├── ClockWidget
│   │   ├── WeatherWidget
│   │   └── NotificationToast
│   │
│   └── LoadingOverlay (z=4, GONE by default)
│       └── BrandedSpinner + StatusText
```

### 5.2 Navigation Graph

```kotlin
// nav_shell.xml — Simplified representation
// All destinations use fade transitions (150ms) for TV feel

NavGraph("shell") {
    startDestination = "home"

    fragment("home", HomeFragment::class) {
        action("home_to_iptv") { destination = "iptv" }
        action("home_to_catalog") { destination = "catalog" }
        action("home_to_app") { destination = "app_launcher" }
        deepLink("neofilm://home")
    }

    fragment("iptv", IptvFragment::class) {
        argument("channelId") { type = NavType.StringType; nullable = true }
        action("iptv_to_player") { destination = "fullscreen_player" }
        deepLink("neofilm://iptv/{channelId}")
    }

    fragment("catalog", CatalogFragment::class) {
        argument("category") { type = NavType.StringType; defaultValue = "all" }
        action("catalog_to_detail") { destination = "content_detail" }
    }

    fragment("content_detail", ContentDetailFragment::class) {
        argument("contentId") { type = NavType.StringType }
        action("detail_to_player") { destination = "fullscreen_player" }
    }

    fragment("fullscreen_player", FullscreenPlayerFragment::class) {
        argument("mediaUri") { type = NavType.StringType }
        argument("mediaType") { type = NavType.StringType }
    }

    fragment("settings", SettingsFragment::class) {
        // Only reachable via admin escape sequence
    }
}
```

### 5.3 Backend-Driven Layout System

```kotlin
/**
 * The shell layout is fully configurable from the backend.
 * Each venue/partner can have a custom layout configuration.
 */
data class ShellLayoutConfig(
    val version: Int,
    val theme: ThemeConfig,
    val homeRows: List<RowConfig>,
    val enabledSections: Set<Section>,
    val branding: BrandingConfig,
    val locale: String,
)

data class ThemeConfig(
    val primaryColor: String,      // Hex color
    val secondaryColor: String,
    val backgroundColor: String,
    val surfaceColor: String,
    val textColor: String,
    val accentColor: String,
    val logoUrl: String?,
    val backgroundImageUrl: String?,
    val fontFamily: String,        // "default" | "custom_url"
)

data class RowConfig(
    val id: String,
    val type: RowType,             // FEATURED, IPTV, APPS, CATALOG, CUSTOM
    val title: Map<String, String>, // Localized titles: {"fr": "...", "en": "..."}
    val items: List<RowItemConfig>,
    val style: RowStyle,
    val visible: Boolean,
    val order: Int,
)

enum class Section { HOME, IPTV, CATALOG, STREAMING_APPS, SERVICES }

class ShellLayoutManager @Inject constructor(
    private val layoutRepository: LayoutRepository,
    private val themeApplier: ThemeApplier,
) {
    private val _layout = MutableStateFlow<ShellLayoutConfig?>(null)
    val layout: StateFlow<ShellLayoutConfig?> = _layout.asStateFlow()

    suspend fun loadLayout(venueId: String) {
        // 1. Load from local cache first (instant render)
        val cached = layoutRepository.getCachedLayout(venueId)
        if (cached != null) _layout.value = cached

        // 2. Fetch latest from backend
        try {
            val remote = layoutRepository.fetchLayout(venueId)
            if (remote.version > (cached?.version ?: -1)) {
                _layout.value = remote
                layoutRepository.cacheLayout(venueId, remote)
            }
        } catch (_: Exception) {
            // Offline — use cached version
        }
    }
}
```

### 5.4 Focus Management Strategy

```kotlin
/**
 * TV navigation is D-pad based. Focus management is critical for UX.
 *
 * Strategy:
 * 1. Each row is a HorizontalGridView with internal focus handling
 * 2. Vertical navigation between rows handled by parent RecyclerView
 * 3. Focus memory: each row remembers its last focused position
 * 4. Focus search: custom FocusSearchStrategy prevents focus escaping visible area
 * 5. Focus speed: focus changes are hardware-accelerated (no layout passes)
 */
class TvFocusManager @Inject constructor() {

    private val focusMemory = HashMap<String, Int>() // rowId -> lastPosition

    fun configureFocusForRow(row: HorizontalGridView, rowId: String) {
        row.setOnChildSelectedListener { _, view, position ->
            focusMemory[rowId] = position
        }

        // Prevent focus from escaping the grid boundary
        row.windowAlignment = BaseGridView.WINDOW_ALIGN_LOW_EDGE
        row.windowAlignmentOffsetPercent = 0f
        row.itemAlignmentOffsetPercent = 0f

        // Smooth scrolling for D-pad
        row.setItemSpacing(resources.getDimensionPixelSize(R.dimen.card_spacing))
        row.focusScrollStrategy = BaseGridView.FOCUS_SCROLL_ALIGNED

        // Restore focus memory
        focusMemory[rowId]?.let { position ->
            row.selectedPosition = position
        }
    }

    /**
     * Custom focus search prevents focus from landing on invisible or
     * off-screen elements — critical for overlapping overlay zones.
     */
    fun installFocusGuard(rootView: ViewGroup) {
        rootView.descendantFocusability = ViewGroup.FOCUS_AFTER_DESCENDANTS

        rootView.setOnFocusSearchFailedListener { focused, direction ->
            // If focus tries to leave the shell area into ad overlay, block it
            if (isInAdOverlayZone(focused, direction)) {
                focused // Return same view to keep focus in place
            } else {
                null // Default behavior
            }
        }
    }
}
```

### 5.5 Performance Optimization Strategy

```
TARGET: 60fps rendering, <100ms input-to-visual response

1. VIEW RECYCLING
   - All rows use RecyclerView with ViewHolder pooling
   - Shared RecycledViewPool across rows with same card type
   - Pool size: 20 ViewHolders per card type (covers 2 full rows off-screen)

2. IMAGE LOADING
   - Glide with:
     · 50MB memory LRU cache
     · 200MB disk cache
     · Thumbnail pre-loading (low-res placeholder → full-res)
     · Crossfade transitions (200ms)
     · Skip memory cache for full-screen backgrounds (too large)
   - Pre-fetch next row's images when user approaches

3. LAYOUT OPTIMIZATION
   - All card layouts use ConstraintLayout (single measure pass)
   - No nested ScrollViews
   - Background images use hardware layers: view.setLayerType(LAYER_TYPE_HARDWARE)
   - Text rendering: pre-computed TextLayouts for static text

4. FRAME BUDGET MANAGEMENT (16.6ms per frame at 60fps)
   - Main thread work budget: <12ms (leave 4.6ms for system)
   - Heavy work offloaded:
     · JSON parsing → Default dispatcher
     · Image decoding → Glide's background threads
     · Layout inflation → AsyncLayoutInflater for off-screen items
   - StrictMode enabled in debug builds to catch disk/network on main thread

5. VSYNC-ALIGNED UPDATES
   - Config changes applied via Choreographer.postFrameCallback
   - Batch UI updates to single frame when multiple data changes arrive

6. OVERDRAW REDUCTION
   - Root background drawn once, child backgrounds transparent
   - Debug: Developer options → "Debug GPU overdraw" target: <2x everywhere
   - Card shadows: pre-rendered 9-patch instead of real-time elevation

7. HARDWARE ACCELERATION
   - Forced on for all activities: android:hardwareAccelerated="true"
   - ExoPlayer SurfaceView bypasses GPU compositor entirely
   - Canvas operations use hardware bitmaps where possible
```

### 5.6 Multi-Language Support

```kotlin
class LocaleManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configRepository: ConfigRepository,
) {
    companion object {
        val SUPPORTED_LOCALES = listOf("fr", "en", "es", "de", "it", "pt", "nl", "ar")
    }

    /**
     * Locale is determined by priority:
     * 1. Backend config for this venue (partner sets preferred language)
     * 2. Device system locale
     * 3. Default: "fr" (France primary market)
     */
    fun resolveLocale(): String {
        val venueLocale = configRepository.getVenueConfig()?.locale
        if (venueLocale != null && venueLocale in SUPPORTED_LOCALES) return venueLocale

        val systemLocale = Locale.getDefault().language
        if (systemLocale in SUPPORTED_LOCALES) return systemLocale

        return "fr"
    }

    /**
     * Localized strings for backend-driven content use Map<String, String>.
     * Falls back: requested locale → "en" → first available → key itself.
     */
    fun localize(texts: Map<String, String>, locale: String = resolveLocale()): String {
        return texts[locale]
            ?: texts["en"]
            ?: texts.values.firstOrNull()
            ?: ""
    }
}
```

---

## 6. SPLIT-SCREEN ADVERTISING ENGINE

### 6.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DISPLAY SURFACE (1920x1080 or 3840x2160)     │
│                                                                  │
│  ┌────────────────────────────────┐ ┌────────────────────────┐  │
│  │                                │ │                        │  │
│  │     MAIN CONTENT ZONE          │ │   AD ZONE              │  │
│  │     (65-75% width)             │ │   (25-35% width)       │  │
│  │                                │ │                        │  │
│  │  ┌────────────────────────┐    │ │  ┌──────────────────┐  │  │
│  │  │    SurfaceView         │    │ │  │  TextureView     │  │  │
│  │  │    ExoPlayer #1        │    │ │  │  ExoPlayer #2    │  │  │
│  │  │    (IPTV / VOD)        │    │ │  │  (Ad Creative)   │  │  │
│  │  └────────────────────────┘    │ │  └──────────────────┘  │  │
│  │                                │ │                        │  │
│  │  Audio: ACTIVE                 │ │  Audio: MUTED          │  │
│  │  Priority: PRIMARY             │ │  Priority: SECONDARY   │  │
│  │  Buffer: 30s video             │ │  Buffer: 10s video     │  │
│  └────────────────────────────────┘ └────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  OVERLAY BAR (optional, 48dp height, bottom)              │   │
│  │  Clock | Weather | Branding | Scrolling Ticker            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 SurfaceView vs TextureView Decision

| Criterion | SurfaceView | TextureView |
|-----------|-------------|-------------|
| Rendering | Dedicated hardware overlay | Standard View hierarchy |
| Performance | Best — bypasses GPU compositor | Good — composited with views |
| Alpha/Transform | Not supported | Full support (rotation, scale, alpha) |
| Z-ordering | Below or above View hierarchy only | Any Z-order |
| Memory | Lower (no GPU texture copy) | Higher (GPU texture backing) |
| **Decision** | **Main content (no animation needed)** | **Ad zone (needs animated transitions)** |

**Rationale:** The main content (IPTV/VOD) uses SurfaceView for maximum performance — it occupies a fixed region and doesn't need transforms. The ad zone uses TextureView because it needs animated slide-in/slide-out transitions and alpha fading between ad creatives.

### 6.3 Dual ExoPlayer Management

```kotlin
class DualPlayerManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val bandwidthMeter: DefaultBandwidthMeter,
) {
    private var primaryPlayer: ExoPlayer? = null
    private var secondaryPlayer: ExoPlayer? = null

    private val _primaryState = MutableStateFlow(PlayerState.IDLE)
    val primaryState: StateFlow<PlayerState> = _primaryState.asStateFlow()

    private val _secondaryState = MutableStateFlow(PlayerState.IDLE)
    val secondaryState: StateFlow<PlayerState> = _secondaryState.asStateFlow()

    fun initializePrimaryPlayer(): ExoPlayer {
        primaryPlayer?.release()

        primaryPlayer = ExoPlayer.Builder(context)
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                        /* minBufferMs = */ 15_000,
                        /* maxBufferMs = */ 50_000,     // 50s max buffer
                        /* bufferForPlaybackMs = */ 2_500,
                        /* bufferForPlaybackAfterRebufferMs = */ 5_000,
                    )
                    .setTargetBufferBytes(200 * 1024 * 1024) // 200MB cap
                    .setPrioritizeTimeOverSizeThresholds(true)
                    .build()
            )
            .setBandwidthMeter(bandwidthMeter)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                /* handleAudioFocus = */ true,
            )
            .setWakeMode(C.WAKE_MODE_NETWORK) // Keep WiFi alive during playback
            .setHandleAudioBecomingNoisy(true)
            .build()

        primaryPlayer?.addListener(createStateListener(_primaryState))
        return primaryPlayer!!
    }

    fun initializeSecondaryPlayer(): ExoPlayer {
        secondaryPlayer?.release()

        secondaryPlayer = ExoPlayer.Builder(context)
            .setLoadControl(
                DefaultLoadControl.Builder()
                    .setBufferDurationsMs(
                        /* minBufferMs = */ 5_000,
                        /* maxBufferMs = */ 15_000,     // 15s max — lower priority
                        /* bufferForPlaybackMs = */ 1_000,
                        /* bufferForPlaybackAfterRebufferMs = */ 2_000,
                    )
                    .setTargetBufferBytes(80 * 1024 * 1024) // 80MB cap
                    .build()
            )
            .setBandwidthMeter(bandwidthMeter)
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(C.USAGE_MEDIA)
                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                    .build(),
                /* handleAudioFocus = */ false, // Ad never takes audio focus
            )
            .build()

        // Ad player always muted by default
        secondaryPlayer?.volume = 0f

        secondaryPlayer?.addListener(createStateListener(_secondaryState))
        return secondaryPlayer!!
    }

    /**
     * Memory pressure: release secondary player entirely.
     * Ads fall back to static image display.
     */
    fun releaseSecondaryPlayer() {
        secondaryPlayer?.release()
        secondaryPlayer = null
        _secondaryState.value = PlayerState.RELEASED
    }

    fun releaseAll() {
        primaryPlayer?.release()
        secondaryPlayer?.release()
        primaryPlayer = null
        secondaryPlayer = null
    }

    private fun createStateListener(stateFlow: MutableStateFlow<PlayerState>) =
        object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                stateFlow.value = when (state) {
                    Player.STATE_IDLE -> PlayerState.IDLE
                    Player.STATE_BUFFERING -> PlayerState.BUFFERING
                    Player.STATE_READY -> PlayerState.READY
                    Player.STATE_ENDED -> PlayerState.ENDED
                    else -> PlayerState.ERROR
                }
            }

            override fun onPlayerError(error: PlaybackException) {
                stateFlow.value = PlayerState.ERROR
            }
        }
}

enum class PlayerState { IDLE, BUFFERING, READY, ENDED, ERROR, RELEASED }
```

### 6.4 Ad Rotation Engine

```kotlin
class AdRotationEngine @Inject constructor(
    private val scheduleRepository: ScheduleRepository,
    private val analyticsReporter: AnalyticsReporter,
    private val dualPlayerManager: DualPlayerManager,
    private val cacheManager: VideoCacheManager,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    companion object {
        private const val MIN_AD_DURATION_MS = 5_000L
        private const val MAX_AD_DURATION_MS = 60_000L
        private const val TRANSITION_DURATION_MS = 300L
        private const val PRELOAD_NEXT_AD_BEFORE_MS = 2_000L
    }

    private var rotationJob: Job? = null
    private var currentAdIndex = 0
    private var currentPlaylist: List<AdCreative> = emptyList()

    /**
     * Ad selection algorithm:
     * 1. Filter ads by current time window (schedule slots)
     * 2. Sort by priority (higher priority = shown first)
     * 3. Within same priority, round-robin for fair distribution
     * 4. Track impression counts for reporting
     * 5. Skip ads whose creative file is not cached (show next available)
     */
    fun startRotation(scope: CoroutineScope, adZoneView: TextureView) {
        rotationJob?.cancel()
        rotationJob = scope.launch(ioDispatcher) {
            while (isActive) {
                val playlist = scheduleRepository.getActiveAdsForCurrentSlot()

                if (playlist.isEmpty()) {
                    // No ads scheduled — show fallback (partner branding or blank)
                    showFallback(adZoneView)
                    delay(30_000) // Re-check every 30s
                    continue
                }

                currentPlaylist = playlist

                for ((index, ad) in playlist.withIndex()) {
                    if (!isActive) break
                    currentAdIndex = index

                    // Check if creative is cached
                    val localUri = cacheManager.getCachedUri(ad.creative.fileUrl)
                    if (localUri == null) {
                        // Not cached — skip, trigger background download
                        cacheManager.enqueueDownload(ad.creative.fileUrl, Priority.HIGH)
                        continue
                    }

                    // Pre-load next ad 2s before current ends
                    val nextAd = playlist.getOrNull((index + 1) % playlist.size)

                    // Play current ad
                    withContext(Dispatchers.Main) {
                        playAdWithTransition(adZoneView, localUri, ad)
                    }

                    // Report impression
                    analyticsReporter.reportAdImpression(
                        creativeId = ad.creative.id,
                        campaignId = ad.campaignId,
                        durationMs = ad.creative.durationMs ?: MIN_AD_DURATION_MS,
                        timestamp = System.currentTimeMillis(),
                    )

                    // Wait for ad duration
                    val duration = (ad.creative.durationMs?.toLong() ?: MIN_AD_DURATION_MS)
                        .coerceIn(MIN_AD_DURATION_MS, MAX_AD_DURATION_MS)

                    delay(duration)
                }
            }
        }
    }

    private suspend fun playAdWithTransition(
        adZoneView: TextureView,
        uri: Uri,
        ad: AdCreative,
    ) {
        // Fade out current (300ms)
        adZoneView.animate()
            .alpha(0f)
            .setDuration(TRANSITION_DURATION_MS)
            .awaitEnd()

        // Swap media source
        val player = dualPlayerManager.secondaryPlayer
            ?: dualPlayerManager.initializeSecondaryPlayer()
        player.setMediaItem(MediaItem.fromUri(uri))
        player.prepare()
        player.play()

        // Fade in new (300ms)
        adZoneView.animate()
            .alpha(1f)
            .setDuration(TRANSITION_DURATION_MS)
            .awaitEnd()
    }

    fun stopRotation() {
        rotationJob?.cancel()
        dualPlayerManager.secondaryPlayer?.stop()
    }
}

data class AdCreative(
    val campaignId: String,
    val creative: Creative,
    val priority: Int,
    val scheduleSlotId: String,
)
```

### 6.5 Split-Screen Layout Controller

```kotlin
class SplitScreenController @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val AD_ZONE_MIN_WIDTH_PERCENT = 0.25f
        private const val AD_ZONE_MAX_WIDTH_PERCENT = 0.35f
        private const val AD_ZONE_DEFAULT_WIDTH_PERCENT = 0.30f
        private const val ANIMATION_DURATION_MS = 500L
    }

    private var isAdZoneVisible = false

    /**
     * Smoothly animate split-screen entry.
     * Main content slides left, ad zone slides in from right.
     */
    fun showAdZone(
        mainContainer: View,
        adContainer: View,
        widthPercent: Float = AD_ZONE_DEFAULT_WIDTH_PERCENT,
    ) {
        if (isAdZoneVisible) return
        isAdZoneVisible = true

        val screenWidth = context.resources.displayMetrics.widthPixels
        val adWidth = (screenWidth * widthPercent).toInt()
        val mainWidth = screenWidth - adWidth

        // Set ad container initial position (off-screen right)
        adContainer.visibility = View.VISIBLE
        adContainer.translationX = adWidth.toFloat()
        adContainer.layoutParams = adContainer.layoutParams.apply { width = adWidth }

        // Animate main content shrinking
        val mainAnimator = ValueAnimator.ofInt(screenWidth, mainWidth).apply {
            duration = ANIMATION_DURATION_MS
            interpolator = DecelerateInterpolator()
            addUpdateListener { animator ->
                mainContainer.layoutParams = mainContainer.layoutParams.apply {
                    width = animator.animatedValue as Int
                }
                mainContainer.requestLayout()
            }
        }

        // Animate ad zone sliding in
        val adAnimator = ObjectAnimator.ofFloat(adContainer, "translationX", adWidth.toFloat(), 0f).apply {
            duration = ANIMATION_DURATION_MS
            interpolator = DecelerateInterpolator()
        }

        AnimatorSet().apply {
            playTogether(mainAnimator, adAnimator)
            start()
        }
    }

    /**
     * Smoothly hide ad zone — main content expands to full width.
     */
    fun hideAdZone(mainContainer: View, adContainer: View) {
        if (!isAdZoneVisible) return
        isAdZoneVisible = false

        val screenWidth = context.resources.displayMetrics.widthPixels
        val currentAdWidth = adContainer.width

        val mainAnimator = ValueAnimator.ofInt(mainContainer.width, screenWidth).apply {
            duration = ANIMATION_DURATION_MS
            interpolator = DecelerateInterpolator()
            addUpdateListener { animator ->
                mainContainer.layoutParams = mainContainer.layoutParams.apply {
                    width = animator.animatedValue as Int
                }
                mainContainer.requestLayout()
            }
        }

        val adAnimator = ObjectAnimator.ofFloat(
            adContainer, "translationX", 0f, currentAdWidth.toFloat()
        ).apply {
            duration = ANIMATION_DURATION_MS
            interpolator = AccelerateInterpolator()
            doOnEnd { adContainer.visibility = View.GONE }
        }

        AnimatorSet().apply {
            playTogether(mainAnimator, adAnimator)
            start()
        }
    }
}
```

### 6.6 4K Performance Considerations

```
RESOLUTION HANDLING:

┌─────────────────────────────────────────────┐
│ Device Resolution │ Main Zone    │ Ad Zone   │
├───────────────────┼──────────────┼───────────┤
│ 1080p (1920x1080) │ 1344x1080    │ 576x1080  │
│ 4K (3840x2160)    │ 2688x2160    │ 1152x2160 │
└───────────────────┴──────────────┴───────────┘

4K-SPECIFIC OPTIMIZATIONS:

1. AD CREATIVE RESOLUTION
   - Ads authored at 1080p, upscaled by GPU (TextureView handles this)
   - No 4K ad assets needed — saves bandwidth and storage
   - Main content plays at native resolution

2. DECODER SELECTION
   - Primary player: hardware decoder (MediaCodec), 4K HEVC/H.265 preferred
   - Secondary player: hardware decoder, 1080p H.264
   - Fallback: if dual hardware decode not supported, secondary uses software
     decode at 720p

3. FRAME DROP MITIGATION
   - Monitor dropped frames via ExoPlayer Analytics:
     player.addAnalyticsListener(object : AnalyticsListener {
         override fun onDroppedVideoFrames(eventTime, droppedFrames, elapsedMs) {
             if (droppedFrames > 5) {
                 // Reduce secondary player quality
                 reduceAdQuality()
             }
             if (droppedFrames > 15) {
                 // Switch ad zone to static image mode
                 disableVideoAds()
             }
         }
     })

4. GPU MEMORY
   - 4K SurfaceView: ~32MB (YUV420, hardware overlay, zero-copy)
   - 1080p TextureView: ~8MB (RGB, GPU texture)
   - Total GPU: ~40MB dedicated to split-screen rendering

5. THERMAL MANAGEMENT
   - Monitor CPU temperature via /sys/class/thermal/
   - If >80°C: reduce ad playback to static images
   - If >90°C: disable split-screen entirely, show full-screen content only
```

### 6.7 Emergency Blank Mode

```kotlin
/**
 * Emergency mode: immediately clear all ad content.
 * Triggered by:
 * - Backend command "emergency_blank"
 * - Campaign flagged as inappropriate
 * - Legal hold request
 */
class EmergencyAdController @Inject constructor(
    private val splitScreenController: SplitScreenController,
    private val adRotationEngine: AdRotationEngine,
    private val dualPlayerManager: DualPlayerManager,
) {
    fun activateEmergencyBlank(mainContainer: View, adContainer: View) {
        // 1. Stop ad rotation immediately
        adRotationEngine.stopRotation()

        // 2. Release secondary player
        dualPlayerManager.releaseSecondaryPlayer()

        // 3. Hide ad zone
        splitScreenController.hideAdZone(mainContainer, adContainer)

        // 4. Expand main content to full screen
        // (handled by hideAdZone animation)
    }
}
```
