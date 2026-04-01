# NeoFilm Android TV — Part 5: Appendices

---

## APPENDIX A: FULL PROJECT DIRECTORY STRUCTURE

```
apps/tv-app/android/
├── build.gradle.kts                          (root project config)
├── settings.gradle.kts                       (module declarations)
├── gradle.properties                         (JVM args, Android props)
├── gradle/
│   ├── libs.versions.toml                    (version catalog)
│   └── wrapper/
│       └── gradle-wrapper.properties
│
├── app/                                      ── Main application module
│   ├── build.gradle.kts
│   ├── proguard-rules.pro
│   └── src/
│       ├── main/
│       │   ├── AndroidManifest.xml
│       │   ├── kotlin/com/neofilm/tv/
│       │   │   ├── NeoFilmApplication.kt              (Hilt @HiltAndroidApp, crash handler)
│       │   │   ├── di/
│       │   │   │   ├── AppModule.kt                   (application-scoped bindings)
│       │   │   │   ├── DispatcherModule.kt            (coroutine dispatchers)
│       │   │   │   ├── NetworkModule.kt               (OkHttp, Retrofit, cert pinning)
│       │   │   │   └── DatabaseModule.kt              (Room, EncryptedPrefs)
│       │   │   ├── platform/
│       │   │   │   ├── BootReceiver.kt                (BOOT_COMPLETED receiver)
│       │   │   │   ├── NeoFilmDeviceAdmin.kt          (DeviceAdminReceiver / DPC)
│       │   │   │   ├── OtaInstallReceiver.kt          (PackageInstaller result)
│       │   │   │   └── ScheduledRebootReceiver.kt     (weekly maintenance reboot)
│       │   │   └── initializer/
│       │   │       └── AppInitializer.kt              (startup sequence orchestrator)
│       │   └── res/
│       │       ├── drawable/
│       │       ├── layout/
│       │       ├── values/
│       │       │   ├── strings.xml
│       │       │   ├── colors.xml
│       │       │   ├── dimens.xml
│       │       │   └── themes.xml
│       │       ├── values-fr/strings.xml
│       │       ├── values-en/strings.xml
│       │       ├── values-es/strings.xml
│       │       ├── values-de/strings.xml
│       │       ├── values-it/strings.xml
│       │       ├── values-pt/strings.xml
│       │       ├── values-nl/strings.xml
│       │       ├── values-ar/strings.xml
│       │       └── xml/
│       │           └── device_admin.xml
│       ├── debug/
│       │   └── AndroidManifest.xml                    (StrictMode, debug flags)
│       └── release/
│           └── AndroidManifest.xml                    (production overrides)
│
├── core/
│   ├── common/                               ── Shared utilities & base classes
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/core/common/
│   │       ├── extensions/
│   │       │   ├── CoroutineExtensions.kt             (awaitEnd, retryWithBackoff)
│   │       │   ├── FlowExtensions.kt                  (throttleFirst, debounceAfterFirst)
│   │       │   ├── ByteArrayExtensions.kt             (toHexString, sha256)
│   │       │   ├── StringExtensions.kt                (sha256Filename, truncate)
│   │       │   └── ContextExtensions.kt               (displayMetrics, connectivity)
│   │       ├── base/
│   │       │   ├── BaseViewModel.kt                   (error handling, loading state)
│   │       │   └── BaseFragment.kt                    (view binding boilerplate)
│   │       ├── result/
│   │       │   └── Result.kt                          (Success/Error/Loading sealed class)
│   │       ├── qualifiers/
│   │       │   └── DispatcherQualifiers.kt            (@IoDispatcher, @DefaultDispatcher, etc.)
│   │       └── constants/
│   │           └── AppConstants.kt                    (timeouts, limits, feature flags)
│   │
│   ├── network/                              ── Network communication layer
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/core/network/
│   │       ├── websocket/
│   │       │   ├── NeoFilmWebSocketClient.kt          (persistent WS connection)
│   │       │   ├── WebSocketMessageParser.kt          (JSON frame → sealed class)
│   │       │   ├── ServerMessage.kt                   (all server→device messages)
│   │       │   └── ClientMessage.kt                   (all device→server messages)
│   │       ├── mqtt/
│   │       │   ├── MqttFallbackClient.kt              (MQTT secondary channel)
│   │       │   └── MqttTopicRouter.kt                 (topic → handler mapping)
│   │       ├── rest/
│   │       │   ├── NeoFilmApiService.kt               (Retrofit interface)
│   │       │   ├── AuthInterceptor.kt                 (JWT bearer injection)
│   │       │   └── DeviceInfoInterceptor.kt           (X-Device-UUID, X-App-Version)
│   │       ├── connection/
│   │       │   ├── CloudCommunicationManager.kt       (WS + MQTT unified manager)
│   │       │   ├── ConnectionState.kt                 (state enum)
│   │       │   └── ConnectionMonitor.kt               (NetworkCallback observer)
│   │       └── dto/
│   │           ├── HeartbeatPayload.kt
│   │           ├── SchedulePayload.kt
│   │           ├── ConfigPayload.kt
│   │           ├── OtaPayload.kt
│   │           └── CommandPayload.kt
│   │
│   ├── security/                             ── Security & cryptography
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/core/security/
│   │       ├── SecureTokenStore.kt                    (Keystore + EncryptedPrefs)
│   │       ├── TokenRotationManager.kt                (auto-refresh loop)
│   │       ├── FileEncryptor.kt                       (AES-256-GCM file encryption)
│   │       ├── RootDetector.kt                        (multi-signal root check)
│   │       ├── TamperDetector.kt                      (APK signature, debug, emulator)
│   │       ├── SecurityManager.kt                     (orchestrator, severity actions)
│   │       ├── SecureTimeProvider.kt                  (NTP-based clock)
│   │       ├── SecureLogger.kt                        (redacted logging)
│   │       └── ScreenCapturePolicy.kt                 (FLAG_SECURE enforcement)
│   │
│   └── device/                               ── Device identity & hardware
│       ├── build.gradle.kts
│       └── src/main/kotlin/com/neofilm/tv/core/device/
│           ├── DeviceIdentityGenerator.kt             (hardware-bound UUID)
│           ├── SystemMetrics.kt                       (CPU, memory, disk, temp)
│           ├── SystemUtils.kt                         (reboot, screen brightness)
│           └── HardwareCapabilities.kt                (codec support, resolution, RAM)
│
├── domain/                                   ── Pure Kotlin business logic
│   ├── build.gradle.kts                      (NO Android dependency)
│   └── src/main/kotlin/com/neofilm/tv/domain/
│       ├── model/
│       │   ├── Device.kt                              (domain entity)
│       │   ├── Schedule.kt
│       │   ├── ScheduleSlot.kt
│       │   ├── Campaign.kt
│       │   ├── Creative.kt
│       │   ├── AdCreative.kt
│       │   ├── ShellLayout.kt
│       │   ├── ThemeConfig.kt
│       │   ├── DeviceConfig.kt
│       │   ├── UpdateInfo.kt
│       │   └── DeviceHealth.kt
│       ├── repository/
│       │   ├── ScheduleRepository.kt                  (interface)
│       │   ├── ConfigRepository.kt                    (interface)
│       │   ├── LayoutRepository.kt                    (interface)
│       │   ├── CacheRepository.kt                     (interface)
│       │   └── AnalyticsRepository.kt                 (interface)
│       ├── usecase/
│       │   ├── GetCurrentScheduleUseCase.kt
│       │   ├── GetActiveAdsUseCase.kt
│       │   ├── SyncScheduleUseCase.kt
│       │   ├── ReportAdImpressionUseCase.kt
│       │   ├── ApplyRemoteConfigUseCase.kt
│       │   ├── ResolvePairingUseCase.kt
│       │   ├── CheckUpdateUseCase.kt
│       │   └── PerformSecurityAuditUseCase.kt
│       └── policy/
│           ├── OfflinePolicyEngine.kt                 (campaign continuity rules)
│           └── AdSelectionPolicy.kt                   (priority, round-robin, fairness)
│
├── data/
│   ├── local/                                ── Local persistence
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/data/local/
│   │       ├── db/
│   │       │   ├── NeoFilmDatabase.kt                 (Room @Database)
│   │       │   ├── entity/
│   │       │   │   ├── CachedMediaEntity.kt
│   │       │   │   ├── ScheduleEntity.kt
│   │       │   │   ├── ScheduleSlotEntity.kt
│   │       │   │   ├── ConfigEntity.kt
│   │       │   │   ├── OfflineEventEntity.kt
│   │       │   │   ├── CrashLogEntity.kt
│   │       │   │   └── LayoutCacheEntity.kt
│   │       │   ├── dao/
│   │       │   │   ├── CachedMediaDao.kt
│   │       │   │   ├── ScheduleDao.kt
│   │       │   │   ├── ConfigDao.kt
│   │       │   │   ├── OfflineEventDao.kt
│   │       │   │   ├── CrashLogDao.kt
│   │       │   │   └── LayoutCacheDao.kt
│   │       │   └── converter/
│   │       │       └── Converters.kt                  (Date, JSON type converters)
│   │       └── prefs/
│   │           └── EncryptedPrefsWrapper.kt           (typed access to encrypted prefs)
│   │
│   ├── remote/                               ── Remote data sources
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/data/remote/
│   │       ├── api/
│   │       │   ├── DeviceApiService.kt                (Retrofit: /devices/*)
│   │       │   ├── ScheduleApiService.kt              (Retrofit: /schedules/*)
│   │       │   ├── OtaApiService.kt                   (Retrofit: /ota/*)
│   │       │   └── AnalyticsApiService.kt             (Retrofit: /devices/events/*)
│   │       ├── dto/
│   │       │   ├── ProvisionInitResponse.kt
│   │       │   ├── ProvisionStatusResponse.kt
│   │       │   ├── ScheduleResponse.kt
│   │       │   ├── ConfigResponse.kt
│   │       │   ├── UpdateCheckResponse.kt
│   │       │   └── EventBatchRequest.kt
│   │       └── mapper/
│   │           ├── ScheduleMapper.kt                  (DTO → domain model)
│   │           ├── ConfigMapper.kt
│   │           └── CreativeMapper.kt
│   │
│   └── repository/                           ── Repository implementations
│       ├── build.gradle.kts
│       └── src/main/kotlin/com/neofilm/tv/data/repository/
│           ├── ScheduleRepositoryImpl.kt              (offline-first, server-authoritative)
│           ├── ConfigRepositoryImpl.kt
│           ├── LayoutRepositoryImpl.kt
│           ├── CacheRepositoryImpl.kt
│           └── AnalyticsRepositoryImpl.kt
│
├── feature/
│   ├── shell/                                ── Main TV launcher UI
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/feature/shell/
│   │       ├── ShellActivity.kt                       (singleTask, kiosk, launcher)
│   │       ├── ShellViewModel.kt                      (state machine, layout observer)
│   │       ├── home/
│   │       │   ├── HomeFragment.kt                    (Leanback BrowseSupportFragment)
│   │       │   ├── HomeViewModel.kt
│   │       │   ├── adapter/
│   │       │   │   ├── RowAdapter.kt
│   │       │   │   ├── CardPresenter.kt               (Leanback Presenter)
│   │       │   │   └── FeaturedPresenter.kt
│   │       │   └── widget/
│   │       │       ├── ClockWidget.kt
│   │       │       └── WeatherWidget.kt
│   │       ├── iptv/
│   │       │   ├── IptvFragment.kt
│   │       │   ├── IptvViewModel.kt
│   │       │   ├── ChannelListAdapter.kt
│   │       │   └── EpgGridView.kt
│   │       ├── catalog/
│   │       │   ├── CatalogFragment.kt
│   │       │   ├── CatalogViewModel.kt
│   │       │   └── ContentDetailFragment.kt
│   │       ├── navigation/
│   │       │   ├── TvFocusManager.kt                  (D-pad navigation, focus memory)
│   │       │   └── NavGraphExtensions.kt
│   │       ├── theme/
│   │       │   ├── ThemeApplier.kt                    (dynamic theme from backend config)
│   │       │   └── LocaleManager.kt                   (multi-language resolver)
│   │       └── layout/
│   │           └── ShellLayoutManager.kt              (backend-driven layout renderer)
│   │
│   ├── pairing/                              ── Device pairing flow
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/feature/pairing/
│   │       ├── PairingActivity.kt
│   │       ├── PairingViewModel.kt
│   │       ├── QrCodeGenerator.kt                     (ZXing QR rendering)
│   │       └── PairingSecurityManager.kt              (nonce, HMAC, NTP validation)
│   │
│   ├── player/                               ── ExoPlayer management
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/feature/player/
│   │       ├── DualPlayerManager.kt                   (primary + secondary ExoPlayer)
│   │       ├── PlayerState.kt
│   │       ├── FullscreenPlayerFragment.kt
│   │       ├── FullscreenPlayerViewModel.kt
│   │       ├── datasource/
│   │       │   ├── EncryptedDataSource.kt             (decrypt cached media on-the-fly)
│   │       │   └── CacheAwareDataSourceFactory.kt     (local cache → network fallback)
│   │       └── analytics/
│   │           └── PlaybackAnalyticsListener.kt       (frame drops, rebuffer, errors)
│   │
│   ├── overlay/                              ── Split-screen ad overlay
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/feature/overlay/
│   │       ├── SplitScreenController.kt               (animated layout resize)
│   │       ├── AdRotationEngine.kt                    (priority queue, round-robin)
│   │       ├── AdOverlayService.kt                    (WindowManager overlay)
│   │       ├── EmergencyAdController.kt               (instant blank/kill)
│   │       └── AdImpressionTracker.kt                 (HMAC-signed diffusion logs)
│   │
│   └── settings/                             ── Admin escape / diagnostics
│       ├── build.gradle.kts
│       └── src/main/kotlin/com/neofilm/tv/feature/settings/
│           ├── SettingsFragment.kt
│           ├── SettingsViewModel.kt
│           ├── AdminEscapeManager.kt                  (key sequence + PIN)
│           ├── DiagnosticsView.kt                     (network, cache, device info)
│           └── CacheManagementView.kt                 (view/purge/quota)
│
├── service/
│   ├── watchdog/                             ── 24/7 watchdog service
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/service/watchdog/
│   │       ├── WatchdogService.kt                     (foreground, START_STICKY)
│   │       ├── AnrDetector.kt                         (main thread ping)
│   │       ├── MemoryMonitor.kt                       (heap growth tracking)
│   │       ├── ActivityMonitor.kt                     (kiosk enforcement)
│   │       ├── HealthReporter.kt                      (telemetry to backend)
│   │       ├── CrashLogWriter.kt                      (synchronous crash log)
│   │       ├── CrashLogUploader.kt                    (batch upload pending logs)
│   │       └── ScheduledRebootManager.kt              (weekly preventive reboot)
│   │
│   ├── sync/                                 ── Background sync
│   │   ├── build.gradle.kts
│   │   └── src/main/kotlin/com/neofilm/tv/service/sync/
│   │       ├── ScheduleSyncWorker.kt                  (periodic schedule refresh)
│   │       ├── NighttimeSyncWorker.kt                 (bulk pre-cache overnight)
│   │       ├── OfflineEventSyncWorker.kt              (drain event queue)
│   │       ├── ConflictResolver.kt                    (post-reconnect reconciliation)
│   │       └── SyncScheduler.kt                       (WorkManager coordinator)
│   │
│   └── ota/                                  ── OTA update service
│       ├── build.gradle.kts
│       └── src/main/kotlin/com/neofilm/tv/service/ota/
│           ├── OtaUpdateManager.kt                    (check → download → verify → install)
│           ├── OtaRollbackManager.kt                  (post-install health check)
│           ├── OtaCheckWorker.kt                      (periodic version check)
│           └── ApkSignatureVerifier.kt                (RSA/ECDSA signature validation)
│
└── cache/                                    ── Video cache engine
    ├── build.gradle.kts
    └── src/main/kotlin/com/neofilm/tv/cache/
        ├── VideoCacheManager.kt                       (LRU, quota, integrity)
        ├── MediaDownloadManager.kt                    (resume, parallel, priority queue)
        ├── CacheEvictionPolicy.kt                     (score-based, schedule-aware)
        └── DiskQuotaManager.kt                        (system reserve enforcement)
```

---

## APPENDIX B: GRADLE VERSION CATALOG

```toml
# gradle/libs.versions.toml

[versions]
agp = "8.7.3"
kotlin = "2.1.0"
coroutines = "1.9.0"
hilt = "2.54"
lifecycle = "2.8.7"
navigation = "2.8.5"
room = "2.6.1"
exoplayer = "1.5.1"          # Media3 ExoPlayer
okhttp = "4.12.0"
retrofit = "2.11.0"
glide = "4.16.0"
leanback = "1.2.0-alpha04"
security-crypto = "1.1.0-alpha06"
work = "2.10.0"
mqtt = "1.2.5"               # Eclipse Paho
zxing = "3.5.3"
sqlcipher = "4.6.1"
mockk = "1.13.13"
turbine = "1.2.0"
junit5 = "5.11.4"
detekt = "1.23.7"

[libraries]
# Kotlin & Coroutines
kotlin-stdlib = { module = "org.jetbrains.kotlin:kotlin-stdlib", version.ref = "kotlin" }
coroutines-core = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-core", version.ref = "coroutines" }
coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }

# Hilt DI
hilt-android = { module = "com.google.dagger:hilt-android", version.ref = "hilt" }
hilt-compiler = { module = "com.google.dagger:hilt-android-compiler", version.ref = "hilt" }
hilt-work = { module = "androidx.hilt:hilt-work", version = "1.2.0" }
hilt-testing = { module = "com.google.dagger:hilt-android-testing", version.ref = "hilt" }

# AndroidX Lifecycle
lifecycle-viewmodel = { module = "androidx.lifecycle:lifecycle-viewmodel-ktx", version.ref = "lifecycle" }
lifecycle-runtime = { module = "androidx.lifecycle:lifecycle-runtime-ktx", version.ref = "lifecycle" }
lifecycle-service = { module = "androidx.lifecycle:lifecycle-service", version.ref = "lifecycle" }

# Navigation
navigation-fragment = { module = "androidx.navigation:navigation-fragment-ktx", version.ref = "navigation" }
navigation-ui = { module = "androidx.navigation:navigation-ui-ktx", version.ref = "navigation" }

# Room Database
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }
room-testing = { module = "androidx.room:room-testing", version.ref = "room" }

# Media3 ExoPlayer
media3-exoplayer = { module = "androidx.media3:media3-exoplayer", version.ref = "exoplayer" }
media3-exoplayer-hls = { module = "androidx.media3:media3-exoplayer-hls", version.ref = "exoplayer" }
media3-exoplayer-dash = { module = "androidx.media3:media3-exoplayer-dash", version.ref = "exoplayer" }
media3-ui = { module = "androidx.media3:media3-ui", version.ref = "exoplayer" }
media3-datasource-okhttp = { module = "androidx.media3:media3-datasource-okhttp", version.ref = "exoplayer" }
media3-session = { module = "androidx.media3:media3-session", version.ref = "exoplayer" }

# Leanback (Android TV UI)
leanback = { module = "androidx.leanback:leanback", version.ref = "leanback" }
leanback-tab = { module = "androidx.leanback:leanback-tab", version.ref = "leanback" }
leanback-paging = { module = "androidx.leanback:leanback-paging", version.ref = "leanback" }

# Networking
okhttp = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
okhttp-logging = { module = "com.squareup.okhttp3:logging-interceptor", version.ref = "okhttp" }
okhttp-mockwebserver = { module = "com.squareup.okhttp3:mockwebserver", version.ref = "okhttp" }
retrofit = { module = "com.squareup.retrofit2:retrofit", version.ref = "retrofit" }
retrofit-moshi = { module = "com.squareup.retrofit2:converter-moshi", version.ref = "retrofit" }
moshi = { module = "com.squareup.moshi:moshi-kotlin", version = "1.15.2" }
moshi-codegen = { module = "com.squareup.moshi:moshi-kotlin-codegen", version = "1.15.2" }

# MQTT
mqtt-client = { module = "org.eclipse.paho:org.eclipse.paho.client.mqttv3", version.ref = "mqtt" }
mqtt-android = { module = "org.eclipse.paho:org.eclipse.paho.android.service", version = "1.1.1" }

# Security
security-crypto = { module = "androidx.security:security-crypto", version.ref = "security-crypto" }
sqlcipher = { module = "net.zetetic:sqlcipher-android", version.ref = "sqlcipher" }

# Image Loading
glide = { module = "com.github.bumptech.glide:glide", version.ref = "glide" }
glide-compiler = { module = "com.github.bumptech.glide:compiler", version.ref = "glide" }

# QR Code
zxing-core = { module = "com.google.zxing:core", version.ref = "zxing" }

# WorkManager
work-runtime = { module = "androidx.work:work-runtime-ktx", version.ref = "work" }
work-testing = { module = "androidx.work:work-testing", version.ref = "work" }

# Testing
junit5 = { module = "org.junit.jupiter:junit-jupiter", version.ref = "junit5" }
mockk = { module = "io.mockk:mockk", version.ref = "mockk" }
mockk-android = { module = "io.mockk:mockk-android", version.ref = "mockk" }
turbine = { module = "app.cash.turbine:turbine", version.ref = "turbine" }
truth = { module = "com.google.truth:truth", version = "1.4.4" }
robolectric = { module = "org.robolectric:robolectric", version = "4.14.1" }
espresso-core = { module = "androidx.test.espresso:espresso-core", version = "3.6.1" }
test-runner = { module = "androidx.test:runner", version = "1.6.2" }

[bundles]
coroutines = ["coroutines-core", "coroutines-android"]
lifecycle = ["lifecycle-viewmodel", "lifecycle-runtime"]
navigation = ["navigation-fragment", "navigation-ui"]
room = ["room-runtime", "room-ktx"]
media3 = ["media3-exoplayer", "media3-exoplayer-hls", "media3-exoplayer-dash", "media3-ui", "media3-datasource-okhttp"]
leanback = ["leanback", "leanback-tab", "leanback-paging"]
networking = ["okhttp", "retrofit", "retrofit-moshi", "moshi"]
testing = ["junit5", "mockk", "turbine", "truth", "coroutines-test"]

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-kapt = { id = "org.jetbrains.kotlin.kapt", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version = "2.1.0-1.0.29" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
detekt = { id = "io.gitlab.arturbosch.detekt", version.ref = "detekt" }
```

---

## APPENDIX C: ROOT BUILD.GRADLE.KTS

```kotlin
// build.gradle.kts (root)
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.kapt) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.detekt)
}

detekt {
    config.setFrom("$rootDir/config/detekt/detekt.yml")
    buildUponDefaultConfig = true
    allRules = false
}

subprojects {
    afterEvaluate {
        tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
            compilerOptions {
                jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
                freeCompilerArgs.addAll(
                    "-opt-in=kotlinx.coroutines.ExperimentalCoroutinesApi",
                    "-opt-in=kotlinx.coroutines.FlowPreview",
                )
            }
        }
    }
}
```

---

## APPENDIX D: APP MODULE BUILD.GRADLE.KTS

```kotlin
// app/build.gradle.kts
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.neofilm.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.neofilm.tv"
        minSdk = 26           // Android 8.0 Oreo — Android TV baseline
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "com.neofilm.tv.testing.HiltTestRunner"

        // Expected APK signing certificate SHA-256 for tamper detection
        buildConfigField(
            "String",
            "EXPECTED_SIGNATURE_SHA256",
            "\"${project.findProperty("release.signature.sha256") ?: "debug"}\""
        )
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: "keystore/release.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("KEY_ALIAS") ?: ""
            keyPassword = System.getenv("KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"

            buildConfigField("String", "WS_URL", "\"wss://ws.staging.neofilm.io/v1/device\"")
            buildConfigField("String", "API_URL", "\"https://api.staging.neofilm.io/v1\"")
            buildConfigField("String", "MQTT_URL", "\"ssl://mqtt.staging.neofilm.io:8883\"")
            buildConfigField("String", "CDN_URL", "\"https://cdn.staging.neofilm.io\"")
        }

        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = signingConfigs.getByName("release")

            buildConfigField("String", "WS_URL", "\"wss://ws.neofilm.io/v1/device\"")
            buildConfigField("String", "API_URL", "\"https://api.neofilm.io/v1\"")
            buildConfigField("String", "MQTT_URL", "\"ssl://mqtt.neofilm.io:8883\"")
            buildConfigField("String", "CDN_URL", "\"https://cdn.neofilm.io\"")
        }
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    // Internal modules
    implementation(project(":core:common"))
    implementation(project(":core:network"))
    implementation(project(":core:security"))
    implementation(project(":core:device"))
    implementation(project(":domain"))
    implementation(project(":data:local"))
    implementation(project(":data:remote"))
    implementation(project(":data:repository"))
    implementation(project(":feature:shell"))
    implementation(project(":feature:pairing"))
    implementation(project(":feature:player"))
    implementation(project(":feature:overlay"))
    implementation(project(":feature:settings"))
    implementation(project(":service:watchdog"))
    implementation(project(":service:sync"))
    implementation(project(":service:ota"))
    implementation(project(":cache"))

    // Hilt
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.work)

    // AndroidX
    implementation(libs.bundles.lifecycle)
    implementation(libs.bundles.navigation)

    // Testing
    testImplementation(libs.bundles.testing)
    testImplementation(libs.room.testing)
    testImplementation(libs.work.testing)
    testImplementation(libs.robolectric)
    androidTestImplementation(libs.hilt.testing)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(libs.test.runner)
    androidTestImplementation(libs.okhttp.mockwebserver)
}
```

---

## APPENDIX E: SETTINGS.GRADLE.KTS

```kotlin
// settings.gradle.kts
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolution {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "neofilm-tv"

include(":app")

// Core modules
include(":core:common")
include(":core:network")
include(":core:security")
include(":core:device")

// Domain (pure Kotlin)
include(":domain")

// Data layer
include(":data:local")
include(":data:remote")
include(":data:repository")

// Feature modules
include(":feature:shell")
include(":feature:pairing")
include(":feature:player")
include(":feature:overlay")
include(":feature:settings")

// Background services
include(":service:watchdog")
include(":service:sync")
include(":service:ota")

// Cache engine
include(":cache")
```

---

## APPENDIX F: PROGUARD RULES

```pro
# proguard-rules.pro

# === NeoFilm App ===
-keep class com.neofilm.tv.platform.** { *; }
-keep class com.neofilm.tv.NeoFilmApplication { *; }

# === Device Admin (must not be obfuscated) ===
-keep class com.neofilm.tv.platform.NeoFilmDeviceAdmin { *; }

# === Moshi JSON models ===
-keep @com.squareup.moshi.JsonClass class * { *; }
-keep class com.neofilm.tv.data.remote.dto.** { *; }
-keep class com.neofilm.tv.core.network.dto.** { *; }

# === Room ===
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-keep @androidx.room.Dao class *

# === MQTT ===
-keep class org.eclipse.paho.** { *; }

# === ExoPlayer (Media3) ===
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# === Hilt ===
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager { *; }

# === Retrofit ===
-keepattributes Signature
-keepattributes *Annotation*
-keep class retrofit2.** { *; }
-keepclasseswithmembers class * {
    @retrofit2.http.* <methods>;
}

# === OkHttp ===
-dontwarn okhttp3.**
-dontwarn okio.**

# === Security: keep class names for root detection ===
-keep class com.neofilm.tv.core.security.RootDetector { *; }
-keep class com.neofilm.tv.core.security.TamperDetector { *; }

# === Remove logging in release ===
-assumenosideeffects class android.util.Log {
    public static int d(...);
    public static int v(...);
    public static int i(...);
}
```

---

## APPENDIX G: ANDROIDMANIFEST.XML (COMPLETE)

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- ========== PERMISSIONS ========== -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.PACKAGE_USAGE_STATS"
        tools:ignore="ProtectedPermissions" />
    <uses-permission android:name="android.permission.REBOOT"
        tools:ignore="ProtectedPermissions" />

    <!-- ========== TV FEATURES ========== -->
    <uses-feature
        android:name="android.software.leanback"
        android:required="true" />
    <uses-feature
        android:name="android.hardware.touchscreen"
        android:required="false" />
    <uses-feature
        android:name="android.hardware.wifi"
        android:required="true" />
    <uses-feature
        android:name="android.hardware.ethernet"
        android:required="false" />

    <application
        android:name=".NeoFilmApplication"
        android:allowBackup="false"
        android:banner="@drawable/banner_tv"
        android:hardwareAccelerated="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:largeHeap="true"
        android:networkSecurityConfig="@xml/network_security_config"
        android:supportsRtl="true"
        android:theme="@style/Theme.NeoFilm"
        android:usesCleartextTraffic="false"
        tools:targetApi="35">

        <!-- ========== DEVICE ADMIN RECEIVER ========== -->
        <receiver
            android:name=".platform.NeoFilmDeviceAdmin"
            android:exported="true"
            android:permission="android.permission.BIND_DEVICE_ADMIN">
            <meta-data
                android:name="android.app.device_admin"
                android:resource="@xml/device_admin" />
            <intent-filter>
                <action android:name="android.app.action.DEVICE_ADMIN_ENABLED" />
                <action android:name="android.app.action.PROFILE_PROVISIONING_COMPLETE" />
            </intent-filter>
        </receiver>

        <!-- ========== BOOT RECEIVER ========== -->
        <receiver
            android:name=".platform.BootReceiver"
            android:directBootAware="true"
            android:enabled="true"
            android:exported="true">
            <intent-filter android:priority="999">
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
                <action android:name="android.intent.action.LOCKED_BOOT_COMPLETED" />
            </intent-filter>
        </receiver>

        <!-- ========== OTA INSTALL RECEIVER ========== -->
        <receiver
            android:name=".platform.OtaInstallReceiver"
            android:exported="false" />

        <!-- ========== SCHEDULED REBOOT RECEIVER ========== -->
        <receiver
            android:name=".platform.ScheduledRebootReceiver"
            android:exported="false" />

        <!-- ========== SHELL ACTIVITY (TV Launcher) ========== -->
        <activity
            android:name=".feature.shell.ShellActivity"
            android:configChanges="orientation|screenSize|keyboard|keyboardHidden|navigation"
            android:exported="true"
            android:launchMode="singleTask"
            android:screenOrientation="landscape"
            android:theme="@style/Theme.NeoFilm.Fullscreen">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.HOME" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.LAUNCHER" />
                <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- ========== PAIRING ACTIVITY ========== -->
        <activity
            android:name=".feature.pairing.PairingActivity"
            android:exported="false"
            android:launchMode="singleTop"
            android:screenOrientation="landscape"
            android:theme="@style/Theme.NeoFilm.Fullscreen" />

        <!-- ========== WATCHDOG SERVICE ========== -->
        <service
            android:name=".service.watchdog.WatchdogService"
            android:exported="false"
            android:foregroundServiceType="specialUse"
            android:stopWithTask="false">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Device health monitoring and kiosk enforcement for digital signage" />
        </service>

        <!-- ========== AD OVERLAY SERVICE ========== -->
        <service
            android:name=".feature.overlay.AdOverlayService"
            android:exported="false"
            android:foregroundServiceType="specialUse" />

        <!-- ========== WORK MANAGER INITIALIZER ========== -->
        <provider
            android:name="androidx.startup.InitializationProvider"
            android:authorities="${applicationId}.androidx-startup"
            android:exported="false"
            tools:node="merge">
            <meta-data
                android:name="androidx.work.WorkManagerInitializer"
                android:value="androidx.startup"
                tools:node="remove" />
        </provider>

    </application>
</manifest>
```

---

## APPENDIX H: NETWORK SECURITY CONFIG

```xml
<!-- res/xml/network_security_config.xml -->
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- No cleartext traffic anywhere -->
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>

    <!-- Pin certificates for NeoFilm domains -->
    <domain-config>
        <domain includeSubdomains="true">neofilm.io</domain>
        <pin-set expiration="2027-06-01">
            <!-- Primary leaf certificate pin -->
            <pin digest="SHA-256">AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=</pin>
            <!-- Backup intermediate CA pin -->
            <pin digest="SHA-256">BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=</pin>
        </pin-set>
    </domain-config>

    <!-- Debug overrides -->
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

---

## APPENDIX I: BACKEND API CONTRACTS (TV DEVICE ENDPOINTS)

These endpoints must be implemented in `@neofilm/api` (NestJS backend) to support the TV app:

```
PROVISIONING:
  POST   /v1/devices/provision/init      → { provisioningToken, expiresIn }
  GET    /v1/devices/provision/status     → { status, accessToken?, refreshToken?, deviceId?, config? }
  POST   /v1/devices/pair                 → { deviceId, venueId, config }

AUTHENTICATION:
  POST   /v1/auth/device/refresh          → { accessToken, refreshToken, expiresIn }

SCHEDULE:
  GET    /v1/devices/:id/schedule         → { schedule, slots[], creatives[] }
  GET    /v1/devices/:id/schedule/preview → { next7Days[] }

CONFIGURATION:
  GET    /v1/devices/:id/config           → { venueConfig, shellLayout, themeConfig }
  GET    /v1/devices/:id/layout           → { version, homeRows[], enabledSections[] }

EVENTS:
  POST   /v1/devices/events/batch         → { received: number }
  POST   /v1/devices/:id/heartbeat        → { ack: true }

OTA:
  GET    /v1/ota/check                    → { updateAvailable, version?, cdnUrl?, sha256?, rolloutPercent? }
  POST   /v1/ota/status                   → { received: true }
  POST   /v1/ota/health                   → { received: true }

DIAGNOSTICS:
  POST   /v1/devices/:id/diagnostics      → { received: true }
  POST   /v1/devices/:id/crash-logs       → { received: number }
  POST   /v1/devices/:id/security-events  → { received: number }

WEBSOCKET:
  WSS    /v1/device                        → Bidirectional (see message types below)

WEBSOCKET SERVER→DEVICE MESSAGES:
  auth_ok                                  → { type: "auth_ok" }
  heartbeat_ack                            → { type: "heartbeat_ack", serverTime: number }
  schedule_update                          → { type: "schedule_update", schedule: Schedule }
  config_update                            → { type: "config_update", config: Config }
  command                                  → { type: "command", action: string, payload: object }
  device_revoked                           → { type: "device_revoked", reason: string }

WEBSOCKET DEVICE→SERVER MESSAGES:
  heartbeat                                → { type: "heartbeat", metrics: Metrics }
  event                                    → { type: "event", eventType: string, payload: object }
  ack                                      → { type: "ack", commandId: string }
```

---

## APPENDIX J: DIFFUSION LOG ANTI-FRAUD (HMAC SIGNATURES)

Aligned with the existing `DiffusionLog` Prisma model that uses HMAC signature + mediaHash:

```kotlin
class DiffusionLogSigner @Inject constructor(
    private val secureTokenStore: SecureTokenStore,
) {
    /**
     * Creates an HMAC-signed diffusion log entry for each ad impression.
     * This proves the ad was actually played on this device at this time.
     *
     * The signature covers:
     * - deviceId
     * - creativeId
     * - campaignId
     * - screenId
     * - startedAt (ISO 8601)
     * - endedAt (ISO 8601)
     * - mediaHash (SHA-256 of the played media file)
     *
     * Matches the Prisma schema:
     *   model DiffusionLog {
     *     signature  String   // HMAC-SHA256
     *     mediaHash  String   // SHA-256 of creative file
     *   }
     */
    fun signDiffusionLog(
        deviceId: String,
        creativeId: String,
        campaignId: String,
        screenId: String,
        startedAt: String,
        endedAt: String,
        mediaHash: String,
    ): String {
        val payload = "$deviceId|$creativeId|$campaignId|$screenId|$startedAt|$endedAt|$mediaHash"

        val key = getSigningKey()
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(key)
        val signature = mac.doFinal(payload.toByteArray(Charsets.UTF_8))

        return Base64.encodeToString(signature, Base64.NO_WRAP)
    }

    private fun getSigningKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val alias = "neofilm_diffusion_signing_key"

        return if (keyStore.containsAlias(alias)) {
            (keyStore.getEntry(alias, null) as KeyStore.SecretKeyEntry).secretKey
        } else {
            val keyGen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
                "AndroidKeyStore",
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

---

## APPENDIX K: MEMORY & PERFORMANCE BUDGET SUMMARY

```
┌────────────────────────────────────────────────────────────────┐
│                PERFORMANCE BUDGET — TV HARDWARE                 │
│                (Typical: quad-core ARM, 2GB RAM)                │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  STARTUP TIME                                                   │
│  ├── Cold boot to first frame: < 8 seconds                     │
│  ├── Boot receiver → Activity launched: < 2 seconds             │
│  ├── Hilt DI initialization: < 500ms                            │
│  ├── Database open (encrypted): < 300ms                         │
│  ├── Security audit: < 200ms                                    │
│  ├── WebSocket connect: < 3 seconds                             │
│  └── First content playing: < 5 seconds (from cached schedule)  │
│                                                                 │
│  FRAME BUDGET (60fps = 16.67ms per frame)                       │
│  ├── Main thread work: < 12ms                                   │
│  ├── GPU draw: < 4ms                                            │
│  ├── Input-to-visual response: < 100ms                          │
│  ├── Screen transition animation: 150ms (fade)                  │
│  └── Split-screen animation: 500ms (slide)                      │
│                                                                 │
│  MEMORY BUDGET (targeting 1.5GB available to app)               │
│  ├── ExoPlayer primary: 200MB                                   │
│  ├── ExoPlayer secondary: 80MB                                  │
│  ├── UI layer (Glide + Views): 150MB                            │
│  ├── Room DB + WAL: 50MB                                        │
│  ├── Network buffers: 40MB                                      │
│  ├── Working memory: 150MB                                      │
│  ├── GC headroom: 180MB                                         │
│  └── TOTAL: ~850MB (56% of 1.5GB — safe margin)                │
│                                                                 │
│  NETWORK BUDGET                                                 │
│  ├── Heartbeat: ~500 bytes/30s = 1.4KB/min                     │
│  ├── WebSocket idle: ~2KB/min (ping/pong)                       │
│  ├── Schedule sync: ~5-50KB per sync                            │
│  ├── Event batch upload: ~1-10KB per batch                      │
│  ├── Ad creative download: 10-500MB per file                    │
│  ├── Nighttime bulk sync: up to 5GB/night                       │
│  └── Monthly overhead (excl. media): ~50MB                      │
│                                                                 │
│  DISK BUDGET                                                    │
│  ├── App APK: ~25MB                                             │
│  ├── Media cache: 2GB (configurable)                            │
│  ├── Room DB: 50MB max                                          │
│  ├── Crash logs: 15MB max (3 x 5MB rotating)                   │
│  ├── Offline event queue: ~10MB max                             │
│  ├── System reserve: 500MB (never touched)                      │
│  └── TOTAL: ~2.6GB allocated                                    │
│                                                                 │
│  CPU TARGETS                                                    │
│  ├── Idle (static screen): < 5%                                 │
│  ├── Single video playback: < 15%                               │
│  ├── Split-screen (dual player): < 35%                          │
│  ├── During sync/download: < 50%                                │
│  └── Sustained thermal limit: < 75°C                            │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## APPENDIX L: DEVICE COMPATIBILITY MATRIX

```
┌──────────────────────┬──────────┬───────┬────────┬──────────────┐
│ Device               │ API Level│ RAM   │ Storage│ Codec Support│
├──────────────────────┼──────────┼───────┼────────┼──────────────┤
│ Xiaomi Mi Box S      │ 28 (9)   │ 2GB   │ 8GB    │ H.264, H.265│
│ Xiaomi Mi Box 4      │ 28 (9)   │ 2GB   │ 8GB    │ H.264, H.265│
│ NVIDIA Shield TV     │ 30 (11)  │ 3GB   │ 16GB   │ H.264, H.265│
│ Amazon Fire TV Stick │ 30 (11)  │ 1GB   │ 8GB    │ H.264, H.265│
│ Google Chromecast GTV│ 31 (12)  │ 2GB   │ 8GB    │ H.264, H.265│
│ Mecool KM2 Plus      │ 33 (13)  │ 2GB   │ 16GB   │ H.264, H.265│
│ Formuler GTV         │ 30 (11)  │ 4GB   │ 32GB   │ H.264, H.265│
│ ADT-3 (dev ref)      │ 30 (11)  │ 2GB   │ 8GB    │ H.264, H.265│
├──────────────────────┴──────────┴───────┴────────┴──────────────┤
│ MINIMUM REQUIREMENTS: API 26, 1.5GB RAM, 8GB storage, H.264 HW │
│ RECOMMENDED:          API 28+, 2GB+ RAM, 16GB storage, H.265 HW│
└─────────────────────────────────────────────────────────────────┘
```

---

## APPENDIX M: DATA FLOW DIAGRAMS

### M.1 Ad Impression Lifecycle (End-to-End)

```
Advertiser                Backend                 TV Device
uploads creative          stores in DB +          downloads &
via web portal            pushes to CDN           caches locally
     │                        │                        │
     ▼                        ▼                        ▼
┌──────────┐          ┌──────────────┐         ┌──────────────┐
│ Creative │─upload──►│ Creative DB  │─sync──►│ Local Cache  │
│ (video)  │          │ + CDN        │         │ (encrypted)  │
└──────────┘          └──────────────┘         └──────┬───────┘
                                                      │
                            Schedule Engine            │
                      ┌──────────────────────┐        │
                      │ Time-slot matching    │        │
                      │ Priority resolution   │◄───────┘
                      │ Round-robin fairness  │
                      └──────────┬───────────┘
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │ ExoPlayer #2 plays   │
                      │ creative in ad zone   │
                      └──────────┬───────────┘
                                 │
                                 ▼
                      ┌──────────────────────┐
                      │ DiffusionLog created │
                      │ - HMAC signed        │
                      │ - mediaHash verified │
                      │ - timestamp (NTP)    │
                      └──────────┬───────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ Online?                 │
                    ▼ YES                     ▼ NO
             ┌───────────┐           ┌───────────────┐
             │ Send via  │           │ Queue locally  │
             │ WebSocket │           │ (Room DB)      │
             └─────┬─────┘           └───────┬───────┘
                   │                         │
                   ▼                         │ (on reconnect)
             ┌───────────────┐               │
             │ Backend       │◄──────────────┘
             │ validates HMAC│
             │ stores in     │
             │ DiffusionLog  │
             │ table         │
             └───────┬───────┘
                     │
                     ▼
             ┌───────────────┐
             │ Analytics +   │
             │ Billing       │
             │ (impression   │
             │  counted)     │
             └───────────────┘
```

### M.2 Device Lifecycle

```
     ┌───────────┐
     │ FACTORY   │
     │ (unboxed) │
     └─────┬─────┘
           │ NFC provisioning / ADB
           ▼
     ┌───────────┐
     │ PROVISIONED│  Device Owner set, DPC policies applied
     └─────┬─────┘
           │ First boot
           ▼
     ┌───────────┐
     │ UNPAIRED  │  QR code displayed, awaiting scan
     └─────┬─────┘
           │ Admin scans QR, assigns to venue
           ▼
     ┌───────────┐
     │ PAIRED    │  JWT issued, device registered in DB
     └─────┬─────┘
           │ Initial sync (schedule + config + media)
           ▼
     ┌───────────┐
     │ ACTIVE    │  Normal 24/7 operation
     │           │  - Playing content
     │           │  - Showing ads
     │           │  - Sending heartbeats
     │           │  - Receiving commands
     └─────┬─────┘
           │
     ┌─────┴──────────────────────────────┐
     │ Lifecycle events:                   │
     │ - OTA Update → restart → ACTIVE     │
     │ - Crash → watchdog restart → ACTIVE │
     │ - Offline → cached playback         │
     │ - Revoked → UNPAIRED (re-pair)      │
     │ - Decommission → factory reset      │
     └────────────────────────────────────┘
```
