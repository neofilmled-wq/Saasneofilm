# NeoFilm Android TV — Part 3: Caching, Offline Mode, OTA Updates

---

## 7. VIDEO CACHING SYSTEM

### 7.1 Cache Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CACHE MANAGER                            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  METADATA INDEX                      │    │
│  │  Room DB table: cached_media                         │    │
│  │  ┌──────┬───────────┬──────┬────────┬────────────┐  │    │
│  │  │  URL │ localPath │ size │ sha256 │ lastAccess │  │    │
│  │  │      │           │      │        │ hitCount   │  │    │
│  │  │      │           │      │        │ expiresAt  │  │    │
│  │  │      │           │      │        │ priority   │  │    │
│  │  └──────┴───────────┴──────┴────────┴────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  DISK STORAGE                        │    │
│  │  Location: /data/data/com.neofilm.tv/cache/media/    │    │
│  │  Encryption: AES-256-GCM (file-level)                │    │
│  │  Max quota: configurable, default 2GB                │    │
│  │  Structure:                                          │    │
│  │    media/                                            │    │
│  │    ├── campaigns/                                    │    │
│  │    │   ├── <campaignId>/                             │    │
│  │    │   │   ├── <creativeId>.mp4.enc                  │    │
│  │    │   │   └── <creativeId>.jpg.enc                  │    │
│  │    │   └── ...                                       │    │
│  │    ├── iptv/                                         │    │
│  │    │   └── epg_cache.json.enc                        │    │
│  │    └── assets/                                       │    │
│  │        ├── logos/                                    │    │
│  │        └── themes/                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                  DOWNLOAD ENGINE                     │    │
│  │  WorkManager-based, supports:                        │    │
│  │  - Parallel downloads (max 3 concurrent)             │    │
│  │  - Resume on interruption (HTTP Range headers)       │    │
│  │  - Bandwidth throttling (nighttime: unlimited,       │    │
│  │    daytime: 50% max bandwidth)                       │    │
│  │  - Priority queue (HIGH/NORMAL/LOW)                  │    │
│  │  - Hash verification (SHA-256 post-download)         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Cache Manager Implementation

```kotlin
class VideoCacheManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val cacheDao: CachedMediaDao,
    private val downloadManager: MediaDownloadManager,
    private val fileEncryptor: FileEncryptor,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    companion object {
        private const val DEFAULT_QUOTA_BYTES = 2L * 1024 * 1024 * 1024 // 2GB
        private const val EVICTION_TRIGGER_PERCENT = 0.90 // Evict when 90% full
        private const val EVICTION_TARGET_PERCENT = 0.70  // Evict down to 70%
        private const val MIN_FREE_DISK_BYTES = 500L * 1024 * 1024 // 500MB system reserve
    }

    private var quotaBytes = DEFAULT_QUOTA_BYTES

    fun updateQuota(bytes: Long) { quotaBytes = bytes }

    /**
     * Returns local decrypted URI for playback, or null if not cached.
     */
    suspend fun getCachedUri(remoteUrl: String): Uri? = withContext(ioDispatcher) {
        val entry = cacheDao.getByUrl(remoteUrl) ?: return@withContext null

        val file = File(entry.localPath)
        if (!file.exists()) {
            cacheDao.delete(entry.url)
            return@withContext null
        }

        // Verify integrity on first access per session
        if (!entry.verified) {
            val hash = computeSha256(file)
            if (hash != entry.sha256) {
                // Corrupted — delete and re-download
                file.delete()
                cacheDao.delete(entry.url)
                enqueueDownload(remoteUrl, Priority.HIGH)
                return@withContext null
            }
            cacheDao.markVerified(entry.url)
        }

        // Update access metadata for LRU
        cacheDao.recordAccess(entry.url, System.currentTimeMillis())

        // Return decrypted content URI via FileProvider or pipe
        Uri.fromFile(file)
    }

    /**
     * Enqueue a media file for download with priority.
     */
    fun enqueueDownload(remoteUrl: String, priority: Priority) {
        downloadManager.enqueue(
            DownloadRequest(
                url = remoteUrl,
                destinationDir = getCacheDir(),
                priority = priority,
                onComplete = { localPath, sha256 ->
                    cacheDao.insert(CachedMediaEntity(
                        url = remoteUrl,
                        localPath = localPath,
                        sizeBytes = File(localPath).length(),
                        sha256 = sha256,
                        lastAccessedAt = System.currentTimeMillis(),
                        hitCount = 0,
                        priority = priority.ordinal,
                        verified = true,
                        createdAt = System.currentTimeMillis(),
                    ))
                }
            )
        )
    }

    /**
     * LRU eviction when disk quota exceeded.
     * Algorithm:
     * 1. Never evict items scheduled for playback in next 24h
     * 2. Score = (hitCount * 10) + recencyBonus - (sizeBytes / 1MB)
     * 3. Evict lowest score first until target reached
     */
    suspend fun performEviction() = withContext(ioDispatcher) {
        val totalSize = cacheDao.getTotalSizeBytes()
        if (totalSize < quotaBytes * EVICTION_TRIGGER_PERCENT) return@withContext

        val targetSize = (quotaBytes * EVICTION_TARGET_PERCENT).toLong()
        val protectedUrls = getProtectedUrls() // Next 24h schedule
        var currentSize = totalSize

        val candidates = cacheDao.getAllSortedByScore()
            .filter { it.url !in protectedUrls }

        for (candidate in candidates) {
            if (currentSize <= targetSize) break

            File(candidate.localPath).delete()
            cacheDao.delete(candidate.url)
            currentSize -= candidate.sizeBytes
        }
    }

    /**
     * Check system disk space — respect MIN_FREE_DISK_BYTES reserve.
     */
    fun getAvailableCacheSpace(): Long {
        val stat = StatFs(getCacheDir().path)
        val freeBytes = stat.availableBytes
        val usedByCache = cacheDao.getTotalSizeBytesSync()
        val quotaRemaining = quotaBytes - usedByCache
        val systemRemaining = (freeBytes - MIN_FREE_DISK_BYTES).coerceAtLeast(0)
        return minOf(quotaRemaining, systemRemaining)
    }

    fun purgeAll() {
        getCacheDir().deleteRecursively()
        getCacheDir().mkdirs()
        cacheDao.deleteAll()
    }

    private fun getCacheDir(): File =
        File(context.filesDir, "cache/media").also { it.mkdirs() }
}
```

### 7.3 Nighttime Smart Sync

```kotlin
class NighttimeSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val scheduleRepository: ScheduleRepository,
    private val cacheManager: VideoCacheManager,
    private val configRepository: ConfigRepository,
) : CoroutineWorker(appContext, params) {

    companion object {
        const val WORK_NAME = "nighttime_smart_sync"

        fun schedule(workManager: WorkManager, nightStartHour: Int = 2, nightEndHour: Int = 6) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresStorageNotLow(true)
                .build()

            // Calculate delay until next nighttime window
            val now = Calendar.getInstance()
            val nextRun = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, nightStartHour)
                set(Calendar.MINUTE, 0)
                if (before(now)) add(Calendar.DAY_OF_MONTH, 1)
            }
            val delayMs = nextRun.timeInMillis - now.timeInMillis

            val request = PeriodicWorkRequestBuilder<NighttimeSyncWorker>(
                repeatInterval = 24, TimeUnit.HOURS,
            )
                .setConstraints(constraints)
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
                .addTag("nighttime_sync")
                .build()

            workManager.enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request,
            )
        }
    }

    override suspend fun doWork(): Result {
        // 1. Fetch full schedule for next 7 days
        val upcomingSchedule = scheduleRepository.getScheduleForDays(7)

        // 2. Collect all creative URLs needed
        val requiredUrls = upcomingSchedule
            .flatMap { it.slots }
            .map { it.creative.fileUrl }
            .distinct()

        // 3. Identify missing from cache
        val missing = requiredUrls.filter { url ->
            cacheManager.getCachedUri(url) == null
        }

        // 4. Download with unlimited bandwidth (nighttime)
        var downloaded = 0
        for (url in missing) {
            if (isStopped) return Result.retry()

            try {
                cacheManager.enqueueDownload(url, Priority.NORMAL)
                downloaded++
                setProgress(workDataOf(
                    "downloaded" to downloaded,
                    "total" to missing.size,
                ))
            } catch (e: Exception) {
                // Continue with next file — don't fail entire batch
                continue
            }
        }

        // 5. Evict stale content no longer in any schedule
        val allScheduledUrls = requiredUrls.toSet()
        cacheManager.evictNotIn(allScheduledUrls)

        return Result.success(workDataOf("downloaded" to downloaded))
    }
}
```

### 7.4 Download Engine with Resume Support

```kotlin
class MediaDownloadManager @Inject constructor(
    private val okHttpClient: OkHttpClient,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    companion object {
        private const val MAX_CONCURRENT_DOWNLOADS = 3
        private const val CHUNK_SIZE = 8192
        private const val MAX_RETRIES = 3
    }

    private val semaphore = Semaphore(MAX_CONCURRENT_DOWNLOADS)
    private val activeDownloads = ConcurrentHashMap<String, Job>()

    suspend fun download(request: DownloadRequest): DownloadResult =
        withContext(ioDispatcher) {
            semaphore.acquire()
            try {
                executeDownload(request)
            } finally {
                semaphore.release()
            }
        }

    private suspend fun executeDownload(request: DownloadRequest): DownloadResult {
        val destFile = File(request.destinationDir, request.url.sha256Filename())
        val tempFile = File(destFile.path + ".tmp")

        var bytesDownloaded = if (tempFile.exists()) tempFile.length() else 0L

        for (attempt in 1..MAX_RETRIES) {
            try {
                val httpRequest = Request.Builder()
                    .url(request.url)
                    .apply {
                        if (bytesDownloaded > 0) {
                            addHeader("Range", "bytes=$bytesDownloaded-")
                        }
                    }
                    .build()

                val response = okHttpClient.newCall(httpRequest).await()
                val responseCode = response.code

                // 416 = Range Not Satisfiable — file already complete or invalid
                if (responseCode == 416) {
                    tempFile.delete()
                    bytesDownloaded = 0
                    continue
                }

                if (responseCode !in 200..299) {
                    throw IOException("Download failed: HTTP $responseCode")
                }

                val isResumed = responseCode == 206
                val body = response.body ?: throw IOException("Empty response body")

                val outputStream = if (isResumed) {
                    FileOutputStream(tempFile, true) // Append mode
                } else {
                    bytesDownloaded = 0
                    FileOutputStream(tempFile, false)
                }

                val digest = MessageDigest.getInstance("SHA-256")
                if (isResumed) {
                    // Hash existing bytes first
                    FileInputStream(tempFile).use { fis ->
                        val buf = ByteArray(CHUNK_SIZE)
                        // Read only already-downloaded portion for hash
                        var remaining = bytesDownloaded
                        while (remaining > 0) {
                            val read = fis.read(buf, 0, minOf(buf.size.toLong(), remaining).toInt())
                            if (read == -1) break
                            digest.update(buf, 0, read)
                            remaining -= read
                        }
                    }
                }

                body.byteStream().use { input ->
                    outputStream.use { output ->
                        val buffer = ByteArray(CHUNK_SIZE)
                        while (true) {
                            val bytesRead = input.read(buffer)
                            if (bytesRead == -1) break
                            output.write(buffer, 0, bytesRead)
                            digest.update(buffer, 0, bytesRead)
                            bytesDownloaded += bytesRead
                        }
                    }
                }

                val sha256 = digest.digest().toHexString()

                // Rename temp to final
                tempFile.renameTo(destFile)

                request.onComplete(destFile.absolutePath, sha256)
                return DownloadResult.Success(destFile.absolutePath, sha256, bytesDownloaded)

            } catch (e: IOException) {
                if (attempt == MAX_RETRIES) {
                    return DownloadResult.Failure(e, bytesDownloaded)
                }
                delay(1000L * attempt) // Brief retry delay
            }
        }

        return DownloadResult.Failure(IOException("Max retries exceeded"), bytesDownloaded)
    }
}

sealed class DownloadResult {
    data class Success(val path: String, val sha256: String, val totalBytes: Long) : DownloadResult()
    data class Failure(val error: Throwable, val bytesDownloaded: Long) : DownloadResult()
}
```

---

## 8. OFFLINE MODE

### 8.1 Offline State Machine

```
                ┌──────────────────┐
                │  ONLINE          │
                │  (normal ops)    │
                └────────┬─────────┘
                         │ network lost
                         ▼
                ┌──────────────────┐
                │  OFFLINE_RECENT  │  (< 1 hour)
                │  Full cached     │
                │  schedule plays  │
                │  Events queued   │
                └────────┬─────────┘
                         │ 1 hour elapsed
                         ▼
                ┌──────────────────┐
                │  OFFLINE_STALE   │  (1-24 hours)
                │  Cached schedule │
                │  Warning overlay │
                │  Events queued   │
                └────────┬─────────┘
                         │ 24 hours elapsed
                         ▼
                ┌──────────────────┐
                │  OFFLINE_EXPIRED │  (> 24 hours)
                │  Fallback content│
                │  (partner brand) │
                │  Events queued   │
                │  (max 10k items) │
                └────────┬─────────┘
                         │ 72 hours elapsed
                         ▼
                ┌──────────────────┐
                │  OFFLINE_CRITICAL│
                │  Static screen   │
                │  "Connecting..." │
                │  Auto-reboot     │
                │  every 30 min    │
                └──────────────────┘
```

### 8.2 Campaign Continuity Rules

```kotlin
class OfflinePolicyEngine @Inject constructor(
    private val scheduleRepository: ScheduleRepository,
    private val cacheManager: VideoCacheManager,
    private val configRepository: ConfigRepository,
) {
    /**
     * Offline playback rules:
     *
     * 1. SCHEDULE ADHERENCE
     *    - Continue following the cached schedule exactly
     *    - Time-based slots still trigger at correct times (local clock)
     *    - If creative file not cached, skip slot and play next available
     *
     * 2. AD CAMPAIGN RULES
     *    - Continue showing cached ads per schedule
     *    - Track impressions locally (will sync when online)
     *    - If campaign end_date has passed (per local clock), stop showing
     *    - If campaign start_date hasn't arrived, don't show early
     *
     * 3. PRIORITY OVERRIDE
     *    - If device has a "fallback_playlist" configured, use it when
     *      primary schedule's creatives are all unavailable
     *    - Fallback playlist is pre-cached at provisioning time
     *
     * 4. FRESHNESS RULES
     *    - Ads older than 7 days without server confirmation: demote priority
     *    - Schedule older than 48 hours: show "content may be outdated" subtle badge
     */
    fun getEffectiveSchedule(offlineDuration: Duration): List<ScheduleSlot> {
        val cached = scheduleRepository.getCachedSchedule()
        val now = System.currentTimeMillis()

        return cached.slots
            .filter { slot ->
                // Only show campaigns still within their date range
                slot.campaign.startDate.time <= now && slot.campaign.endDate.time >= now
            }
            .filter { slot ->
                // Only show if creative is actually cached on disk
                cacheManager.isCached(slot.creative.fileUrl)
            }
            .sortedByDescending { it.priority }
    }
}
```

### 8.3 Local Event Logging Queue

```kotlin
@Entity(tableName = "offline_event_queue")
data class OfflineEventEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val eventType: String,          // "ad_impression", "heartbeat", "error", etc.
    val payload: String,            // JSON serialized
    val timestamp: Long,
    val retryCount: Int = 0,
    val maxRetries: Int = 5,
    val status: String = "pending", // "pending", "sending", "sent", "failed"
    val createdAt: Long = System.currentTimeMillis(),
)

@Dao
interface OfflineEventDao {
    @Query("SELECT COUNT(*) FROM offline_event_queue WHERE status = 'pending'")
    suspend fun getPendingCount(): Int

    @Query("SELECT * FROM offline_event_queue WHERE status = 'pending' ORDER BY timestamp ASC LIMIT :limit")
    suspend fun getPendingBatch(limit: Int = 100): List<OfflineEventEntity>

    @Insert
    suspend fun insert(event: OfflineEventEntity)

    @Query("UPDATE offline_event_queue SET status = 'sent' WHERE id = :id")
    suspend fun markSent(id: Long)

    @Query("UPDATE offline_event_queue SET status = 'failed', retryCount = retryCount + 1 WHERE id = :id")
    suspend fun markFailed(id: Long)

    // Prevent unbounded growth — keep max 10,000 events
    @Query("""
        DELETE FROM offline_event_queue
        WHERE id NOT IN (
            SELECT id FROM offline_event_queue
            ORDER BY timestamp DESC
            LIMIT 10000
        )
    """)
    suspend fun trimToMax()

    // Purge events older than 7 days that were never sent
    @Query("DELETE FROM offline_event_queue WHERE status = 'failed' AND createdAt < :cutoff")
    suspend fun purgeOldFailed(cutoff: Long)
}

class OfflineEventSyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val eventDao: OfflineEventDao,
    private val apiClient: NeoFilmApiClient,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        var totalSent = 0

        while (true) {
            val batch = eventDao.getPendingBatch(100)
            if (batch.isEmpty()) break

            try {
                // Batch upload to backend
                apiClient.request<Unit>(RequestOptions(
                    method = "POST",
                    path = "/devices/events/batch",
                    body = batch.map { EventPayload(it.eventType, it.payload, it.timestamp) },
                ))

                // Mark all as sent
                batch.forEach { eventDao.markSent(it.id) }
                totalSent += batch.size

            } catch (e: Exception) {
                // Mark as failed, increment retry count
                batch.forEach { event ->
                    if (event.retryCount < event.maxRetries) {
                        eventDao.markFailed(event.id)
                    }
                }
                return Result.retry()
            }
        }

        // Cleanup
        eventDao.trimToMax()
        eventDao.purgeOldFailed(System.currentTimeMillis() - 7 * 24 * 3600 * 1000)

        return Result.success(workDataOf("sent" to totalSent))
    }
}
```

### 8.4 Conflict Resolution Strategy

```kotlin
/**
 * When coming back online after an offline period, resolve conflicts:
 *
 * SCHEDULE CONFLICTS:
 * - Server schedule always wins (authoritative source)
 * - Local modifications (if any) are discarded
 * - New schedule is applied immediately, current playback transitions gracefully
 *
 * ANALYTICS/EVENT CONFLICTS:
 * - Merge strategy: append-only (no conflicts possible)
 * - Events timestamped with device local time + NTP offset
 * - Server de-duplicates by (deviceId + eventType + timestamp) tuple
 * - Events with timestamps >7 days old are accepted but flagged for review
 *
 * CONFIGURATION CONFLICTS:
 * - Server configuration always wins
 * - Local config is overwritten entirely on sync
 * - If server config version <= local version, no-op (already applied)
 */
class ConflictResolver @Inject constructor(
    private val scheduleRepository: ScheduleRepository,
    private val configRepository: ConfigRepository,
    private val eventSyncWorker: OfflineEventSyncWorker,
) {
    suspend fun reconcileAfterReconnect() {
        coroutineScope {
            // 1. Sync events first (most time-sensitive for billing)
            launch { syncPendingEvents() }

            // 2. Fetch fresh schedule (server authoritative)
            launch { refreshSchedule() }

            // 3. Fetch latest config
            launch { refreshConfig() }
        }
    }

    private suspend fun refreshSchedule() {
        val serverSchedule = scheduleRepository.fetchFromServer()
        scheduleRepository.replaceLocalSchedule(serverSchedule)
    }

    private suspend fun refreshConfig() {
        val serverConfig = configRepository.fetchFromServer()
        if (serverConfig.version > configRepository.getLocalVersion()) {
            configRepository.replaceLocalConfig(serverConfig)
        }
    }
}
```

---

## 9. OTA UPDATE SYSTEM

### 9.1 Update Architecture

```
┌─────────────┐       ┌─────────────┐       ┌──────────────┐
│  NeoFilm    │       │   CDN       │       │  TV Device   │
│  Backend    │       │ (APK host)  │       │              │
└──────┬──────┘       └──────┬──────┘       └──────┬───────┘
       │                     │                     │
       │  1. Version check   │                     │
       │  (periodic + push)  │                     │
       │◄────────────────────────────── GET /ota/check
       │                     │              { currentVersion,
       │                     │                deviceModel,
       │                     │                apiLevel }
       │                     │                     │
       │  2. Update available│                     │
       │    { version,       │                     │
       │      cdnUrl,        │                     │
       │      sha256,        │                     │
       │      size,          │                     │
       │      releaseNotes,  │                     │
       │      minApiLevel,   │                     │
       │      forced,        │                     │
       │      rolloutPercent │                     │
       │      signature }    │                     │
       │─────────────────────────────────────────►│
       │                     │                     │
       │                     │  3. Download APK    │
       │                     │◄────────────────────│
       │                     │     (resume support)│
       │                     │─────────────────────►
       │                     │                     │
       │                     │  4. Verify          │
       │                     │     - SHA-256 match │
       │                     │     - APK signature │
       │                     │     - Min API level │
       │                     │                     │
       │  5. Report status   │                     │
       │◄────────────────────────────── POST /ota/status
       │   { version,        │           { downloaded }
       │     deviceId,       │                     │
       │     status }        │                     │
       │                     │                     │
       │                     │  6. Install         │
       │                     │     (Device Owner   │
       │                     │      silent install)│
       │                     │                     │
       │  7. Post-install    │                     │
       │     health check    │                     │
       │◄────────────────────────────── POST /ota/status
       │                     │           { installed, healthy }
```

### 9.2 OTA Manager Implementation

```kotlin
class OtaUpdateManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val apiClient: NeoFilmApiClient,
    private val downloadManager: MediaDownloadManager,
    private val securityManager: SecurityManager,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher,
) {
    companion object {
        private const val CHECK_INTERVAL_HOURS = 6L
        private const val INSTALL_WINDOW_START_HOUR = 3 // 3 AM
        private const val INSTALL_WINDOW_END_HOUR = 5   // 5 AM
        private const val MAX_DOWNLOAD_RETRIES = 5
        private const val ROLLBACK_HEALTH_CHECK_DELAY_MS = 120_000L // 2 min
    }

    private val _updateState = MutableStateFlow<OtaState>(OtaState.Idle)
    val updateState: StateFlow<OtaState> = _updateState.asStateFlow()

    /**
     * Periodic version check — runs every 6 hours.
     */
    suspend fun checkForUpdate(): UpdateInfo? = withContext(ioDispatcher) {
        try {
            val response = apiClient.request<UpdateCheckResponse>(RequestOptions(
                method = "GET",
                path = "/ota/check",
                query = mapOf(
                    "currentVersion" to BuildConfig.VERSION_NAME,
                    "versionCode" to BuildConfig.VERSION_CODE.toString(),
                    "deviceModel" to Build.MODEL,
                    "apiLevel" to Build.VERSION.SDK_INT.toString(),
                    "deviceId" to DeviceIdentityGenerator.cachedUuid,
                ),
            ))

            if (response.updateAvailable) {
                // Check if this device is in the rollout percentage
                val deviceHash = DeviceIdentityGenerator.cachedUuid.hashCode()
                    .absoluteValue % 100
                if (deviceHash < response.rolloutPercent) {
                    return@withContext response.toUpdateInfo()
                }
            }
            null
        } catch (e: Exception) {
            null // Silently fail — try again next interval
        }
    }

    /**
     * Download → Verify → Install pipeline.
     */
    suspend fun executeUpdate(update: UpdateInfo) {
        _updateState.value = OtaState.Downloading(0f)

        // 1. Download APK
        val apkFile = downloadApk(update)
            ?: run {
                _updateState.value = OtaState.Failed("Download failed")
                reportStatus(update.version, "download_failed")
                return
            }

        _updateState.value = OtaState.Verifying

        // 2. Verify SHA-256
        val fileHash = computeSha256(apkFile)
        if (fileHash != update.sha256) {
            apkFile.delete()
            _updateState.value = OtaState.Failed("Hash mismatch")
            reportStatus(update.version, "hash_mismatch")
            return
        }

        // 3. Verify APK signature
        if (!verifyApkSignature(apkFile, update.expectedSignature)) {
            apkFile.delete()
            _updateState.value = OtaState.Failed("Signature invalid")
            reportStatus(update.version, "signature_invalid")
            return
        }

        // 4. Check install window (for non-forced updates)
        if (!update.forced) {
            waitForInstallWindow()
        }

        _updateState.value = OtaState.Installing

        // 5. Silent install via Device Owner API
        val installed = silentInstall(apkFile)
        if (!installed) {
            _updateState.value = OtaState.Failed("Install failed")
            reportStatus(update.version, "install_failed")
            return
        }

        reportStatus(update.version, "installed")
        // App will restart automatically after install
    }

    /**
     * Device Owner silent install — no user interaction needed.
     */
    private suspend fun silentInstall(apkFile: File): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE)
            as DevicePolicyManager

        if (!dpm.isDeviceOwnerApp(context.packageName)) {
            // Fallback: PackageInstaller session (still silent for Device Owner)
            return installViaPackageInstaller(apkFile)
        }

        return try {
            val installer = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL
            )
            params.setAppPackageName(context.packageName)

            val sessionId = installer.createSession(params)
            val session = installer.openSession(sessionId)

            // Write APK to session
            session.openWrite("ota_update", 0, apkFile.length()).use { out ->
                FileInputStream(apkFile).use { input ->
                    input.copyTo(out)
                }
                session.fsync(out)
            }

            // Commit with broadcast receiver for result
            val intent = Intent(context, OtaInstallReceiver::class.java)
            val pendingIntent = PendingIntent.getBroadcast(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            session.commit(pendingIntent.intentSender)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Staged rollout: device determines if it's in the rollout group
     * using a deterministic hash of its UUID.
     * This ensures consistent behavior across checks without server state.
     */
    private fun isInRolloutGroup(rolloutPercent: Int): Boolean {
        val hash = DeviceIdentityGenerator.cachedUuid.hashCode().absoluteValue
        return (hash % 100) < rolloutPercent
    }

    private suspend fun waitForInstallWindow() {
        val now = Calendar.getInstance()
        val currentHour = now.get(Calendar.HOUR_OF_DAY)

        if (currentHour in INSTALL_WINDOW_START_HOUR until INSTALL_WINDOW_END_HOUR) {
            return // Already in window
        }

        // Calculate delay until next window
        val nextWindow = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, INSTALL_WINDOW_START_HOUR)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            if (before(now)) add(Calendar.DAY_OF_MONTH, 1)
        }

        val delayMs = nextWindow.timeInMillis - now.timeInMillis
        _updateState.value = OtaState.WaitingForWindow(nextWindow.time)
        delay(delayMs)
    }
}

sealed class OtaState {
    object Idle : OtaState()
    data class Downloading(val progress: Float) : OtaState()
    object Verifying : OtaState()
    data class WaitingForWindow(val installTime: Date) : OtaState()
    object Installing : OtaState()
    data class Failed(val reason: String) : OtaState()
}
```

### 9.3 Rollback Capability

```kotlin
class OtaRollbackManager @Inject constructor(
    private val apiClient: NeoFilmApiClient,
    private val healthChecker: DeviceHealthChecker,
) {
    companion object {
        private const val HEALTH_CHECK_DELAY_MS = 120_000L // 2 min post-install
        private const val HEALTH_CHECK_CRITERIA_UPTIME_MS = 60_000L
        private const val MAX_CRASH_COUNT_THRESHOLD = 3
    }

    /**
     * Post-update health check:
     * 1. Wait 2 minutes after install
     * 2. Verify app has been running stably
     * 3. Check critical subsystems (WebSocket, playback, watchdog)
     * 4. If unhealthy, report to backend for remote rollback
     *
     * Note: True APK rollback requires Device Owner to install the previous
     * version. The backend must host the previous APK version and push
     * a "rollback" OTA command.
     */
    suspend fun performPostUpdateHealthCheck() {
        delay(HEALTH_CHECK_DELAY_MS)

        val health = healthChecker.gatherHealth()

        val isHealthy = health.uptimeMs >= HEALTH_CHECK_CRITERIA_UPTIME_MS
            && health.crashCount <= MAX_CRASH_COUNT_THRESHOLD
            && health.webSocketConnected
            && health.playerFunctional
            && !health.isAnrDetected

        apiClient.request<Unit>(RequestOptions(
            method = "POST",
            path = "/ota/health",
            body = mapOf(
                "version" to BuildConfig.VERSION_NAME,
                "healthy" to isHealthy,
                "diagnostics" to health,
            ),
        ))

        if (!isHealthy) {
            // Backend will decide whether to push rollback OTA
            // Device continues operating in current version
            // Watchdog handles crash recovery in the meantime
        }
    }
}

data class DeviceHealth(
    val uptimeMs: Long,
    val crashCount: Int,
    val webSocketConnected: Boolean,
    val playerFunctional: Boolean,
    val isAnrDetected: Boolean,
    val memoryUsagePercent: Float,
    val diskUsagePercent: Float,
    val cpuTemperatureCelsius: Float?,
)
```

### 9.4 Version Compatibility Management

```kotlin
/**
 * Version compatibility matrix:
 *
 * ┌──────────────┬──────────────┬──────────────┐
 * │ App Version  │ Min API      │ Backend API  │
 * ├──────────────┼──────────────┼──────────────┤
 * │ 1.x          │ API 26       │ v1           │
 * │ 2.x          │ API 28       │ v1, v2       │
 * │ 3.x          │ API 30       │ v2           │
 * └──────────────┴──────────────┴──────────────┘
 *
 * Rules:
 * 1. OTA server checks device API level before offering update
 * 2. APK minSdkVersion prevents install on incompatible hardware
 * 3. Backend API versioning: app sends X-API-Version header
 * 4. Backend maintains backward compatibility for N-1 app version
 * 5. Forced update only when N-2 or older (security patches)
 */
```
