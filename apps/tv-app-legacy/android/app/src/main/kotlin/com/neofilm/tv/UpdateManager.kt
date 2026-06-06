package com.neofilm.tv

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Centralised OTA pipeline.
 *
 * Flow:
 *   1. checkAndInstallIfAvailable() hits /tv/check-update with current versionCode + serial
 *   2. If updateAvailable → downloads APK to internal cache
 *   3. Verifies SHA-256 against the value the server sent
 *   4. Installs:
 *      - Device Owner mode → PackageInstaller silent install, zero UI, app relaunches
 *        automatically via BootReceiver / WatchdogAlarmReceiver
 *      - Otherwise → Intent.ACTION_VIEW fallback (user must click "Install")
 *   5. Reports outcome to /tv/update-status (best-effort)
 *
 * All network work happens off the main thread — call from a Worker or background Thread.
 */
object UpdateManager {
    private const val TAG = "NeoFilmUpdate"
    private const val INSTALL_ACTION = "com.neofilm.tv.INSTALL_RESULT"
    private const val UPDATE_FILE_NAME = "neofilm-update.apk"
    private const val DOWNLOAD_TIMEOUT_MS = 120_000
    private const val CONNECT_TIMEOUT_MS = 15_000

    /**
     * True while a PackageInstaller session is committed and we're waiting for
     * the system installer UI / silent install to resolve. MainActivity reads
     * this in onUserLeaveHint to skip the kiosk relaunch — otherwise the
     * watchdog brings NeoFilm back to the foreground and dismisses the system
     * install confirmation dialog before the user can tap "Install", which
     * means the OTA loops forever in PENDING.
     */
    @Volatile
    var installInProgress: Boolean = false

    data class UpdateInfo(
        val releaseId: String,
        val versionName: String,
        val versionCode: Int,
        val apkUrl: String,
        val sha256: String,
        val fileSize: Long,
        val isRequired: Boolean,
    )

    sealed class Result {
        object UpToDate : Result()
        object SkippedByRollout : Result()
        data class Installed(val versionName: String) : Result()
        data class Failed(val stage: String, val error: String) : Result()
    }

    /**
     * Synchronous — call from a background thread. Returns when install is dispatched
     * (silent install completes async; ACTION_VIEW returns immediately).
     */
    fun checkAndInstallIfAvailable(context: Context): Result {
        return try {
            val info = fetchUpdateInfo(context) ?: return Result.UpToDate

            Log.i(TAG, "Update available: v${info.versionName} (code ${info.versionCode}) — ${info.apkUrl}")
            reportStatus(context, info.releaseId, "DOWNLOADING", null)

            val apkFile = downloadApk(context, info)
                ?: return failAndReport(context, info.releaseId, "DOWNLOAD", "download failed").also {
                    Log.e(TAG, "APK download failed")
                }

            if (!verifySha256(apkFile, info.sha256)) {
                apkFile.delete()
                return failAndReport(context, info.releaseId, "VERIFY", "sha256 mismatch")
            }

            reportStatus(context, info.releaseId, "INSTALLING", null)

            // Always go through PackageInstaller — the same code path handles:
            //  - Device Owner: setRequireUserAction(NOT_REQUIRED) is honored → silent.
            //  - Not Device Owner + Android 12+: if we hold
            //    UPDATE_PACKAGES_WITHOUT_USER_ACTION and the new APK is signed with the
            //    same key as the installed one, the system ALSO accepts USER_ACTION_NOT_REQUIRED → silent.
            //  - Anything else: STATUS_PENDING_USER_ACTION fires → InstallResultReceiver
            //    launches the system confirmation screen as a fallback.
            Log.i(TAG, "Device Owner=${isDeviceOwner(context)} — committing via PackageInstaller")
            val installed = installSilently(context, apkFile, info.releaseId)

            if (installed) {
                // SUCCESS is reported by the InstallResultReceiver after the system
                // confirms install — here we just acknowledge dispatch.
                Result.Installed(info.versionName)
            } else {
                failAndReport(context, info.releaseId, "INSTALL", "installer rejected the APK")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Update flow crashed", e)
            Result.Failed("EXCEPTION", e.message ?: e.javaClass.simpleName)
        }
    }

    private fun fetchUpdateInfo(context: Context): UpdateInfo? {
        val versionCode = BuildConfig.VERSION_CODE
        val apiBase = BuildConfig.TV_APP_URL.replace("/tv-legacy", "").replace("/tv", "")
        val serial = DeviceIdentity.getSerialNumber(context)
        val variant = "legacy"
        val url = URL(
            "$apiBase/api/v1/tv/check-update?versionCode=$versionCode&variant=$variant&serial=$serial"
        )

        val conn = url.openConnection() as HttpURLConnection
        conn.connectTimeout = CONNECT_TIMEOUT_MS
        conn.readTimeout = CONNECT_TIMEOUT_MS
        try {
            if (conn.responseCode !in 200..299) {
                Log.w(TAG, "check-update returned HTTP ${conn.responseCode}")
                return null
            }
            val body = conn.inputStream.bufferedReader().readText()
            val root = JSONObject(body)
            val data = if (root.has("data")) root.getJSONObject("data") else root
            if (!data.optBoolean("updateAvailable", false)) return null

            return UpdateInfo(
                releaseId = data.optString("releaseId"),
                versionName = data.optString("versionName"),
                versionCode = data.optInt("versionCode"),
                apkUrl = data.optString("apkUrl"),
                sha256 = data.optString("sha256").lowercase(),
                fileSize = data.optLong("fileSize", -1),
                isRequired = data.optBoolean("isRequired", true),
            ).takeIf { it.apkUrl.isNotBlank() && it.sha256.isNotBlank() }
        } finally {
            conn.disconnect()
        }
    }

    private fun downloadApk(context: Context, info: UpdateInfo): File? {
        val file = File(context.cacheDir, UPDATE_FILE_NAME)
        if (file.exists()) file.delete()

        return try {
            val conn = URL(info.apkUrl).openConnection() as HttpURLConnection
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = DOWNLOAD_TIMEOUT_MS
            try {
                conn.inputStream.use { input ->
                    file.outputStream().use { out ->
                        input.copyTo(out, bufferSize = 64 * 1024)
                    }
                }
            } finally {
                conn.disconnect()
            }
            Log.i(TAG, "Downloaded ${file.length()} bytes to ${file.absolutePath}")
            file
        } catch (e: Exception) {
            Log.e(TAG, "Download failed", e)
            file.delete()
            null
        }
    }

    private fun verifySha256(file: File, expected: String): Boolean {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val read = input.read(buf)
                if (read <= 0) break
                md.update(buf, 0, read)
            }
        }
        val actual = md.digest().joinToString("") { "%02x".format(it) }
        val ok = actual.equals(expected, ignoreCase = true)
        if (!ok) Log.e(TAG, "SHA-256 mismatch: expected=$expected actual=$actual")
        return ok
    }

    /**
     * Device Owner silent install via PackageInstaller.
     * No UI is shown to the user when the app is a Device Owner. After commit(),
     * the system replaces the running app process with the new APK.
     */
    private fun installSilently(context: Context, apkFile: File, releaseId: String): Boolean {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }

        var sessionId = -1
        return try {
            installInProgress = true
            sessionId = installer.createSession(params)
            val session = installer.openSession(sessionId)
            session.use { s ->
                s.openWrite("neofilm.apk", 0, apkFile.length()).use { out ->
                    apkFile.inputStream().use { input -> input.copyTo(out) }
                    s.fsync(out)
                }

                val intent = Intent(INSTALL_ACTION).apply {
                    setPackage(context.packageName)
                    putExtra("releaseId", releaseId)
                }
                val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                    PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                else
                    PendingIntent.FLAG_UPDATE_CURRENT
                val pending = PendingIntent.getBroadcast(context, sessionId, intent, flags)
                s.commit(pending.intentSender)
            }
            Log.i(TAG, "PackageInstaller session $sessionId committed — awaiting system result")
            // Safety net: if the receiver never fires (system never replied) the
            // flag must still be cleared so the kiosk watchdog resumes. 90s
            // is plenty for any sane install path.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                if (installInProgress) {
                    Log.w(TAG, "Install result timeout — clearing installInProgress flag")
                    installInProgress = false
                }
            }, 90_000)
            true
        } catch (e: Exception) {
            installInProgress = false
            Log.e(TAG, "Silent install failed", e)
            if (sessionId >= 0) try { installer.abandonSession(sessionId) } catch (_: Exception) {}
            false
        }
    }

    /**
     * Manual ACTION_VIEW fallback. No longer called by the main flow (we go through
     * PackageInstaller exclusively now), but kept for diagnostics — can be invoked
     * from a debug menu if PackageInstaller starts failing.
     */
    @Suppress("unused")
    private fun installViaIntent(context: Context, apkFile: File): Boolean {
        return try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apkFile)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/vnd.android.package-archive")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "ACTION_VIEW install failed", e)
            false
        }
    }

    private fun isDeviceOwner(context: Context): Boolean {
        val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return false
        return try {
            dpm.isDeviceOwnerApp(context.packageName)
        } catch (e: Exception) {
            false
        }
    }

    private fun failAndReport(context: Context, releaseId: String, stage: String, error: String): Result.Failed {
        reportStatus(context, releaseId, "FAILED", "$stage: $error")
        return Result.Failed(stage, error)
    }

    fun reportStatus(context: Context, releaseId: String, status: String, errorMessage: String?) {
        if (releaseId.isBlank()) return
        Thread {
            try {
                val apiBase = BuildConfig.TV_APP_URL.replace("/tv-legacy", "").replace("/tv", "")
                val serial = DeviceIdentity.getSerialNumber(context)
                val url = URL("$apiBase/api/v1/tv/update-status")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = CONNECT_TIMEOUT_MS
                    readTimeout = CONNECT_TIMEOUT_MS
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                }
                val payload = JSONObject().apply {
                    put("serial", serial)
                    put("releaseId", releaseId)
                    put("status", status)
                    if (errorMessage != null) put("errorMessage", errorMessage)
                }
                conn.outputStream.use { it.write(payload.toString().toByteArray()) }
                conn.responseCode // trigger send
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, "update-status report failed: ${e.message}")
            }
        }.start()
    }

    /**
     * Manifest-registered receiver gets the PackageInstaller commit result and
     * forwards SUCCESS/FAILURE to the backend so the admin UI sees per-device status.
     */
    class InstallResultReceiver : android.content.BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -999)
            val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
            val releaseId = intent.getStringExtra("releaseId") ?: ""

            when (status) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    // Should not happen when Device Owner — system prompts user.
                    val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                    if (confirm != null) {
                        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        try { context.startActivity(confirm) } catch (e: Exception) {
                            Log.e(TAG, "Could not launch install confirmation", e)
                        }
                    }
                    reportStatus(context, releaseId, "PENDING", message)
                }
                PackageInstaller.STATUS_SUCCESS -> {
                    Log.i(TAG, "Install SUCCESS — system will restart the app")
                    installInProgress = false
                    reportStatus(context, releaseId, "SUCCESS", null)
                    // Wipe the cached APK to free space.
                    File(context.cacheDir, UPDATE_FILE_NAME).delete()
                }
                else -> {
                    Log.e(TAG, "Install FAILED status=$status msg=$message")
                    installInProgress = false
                    reportStatus(context, releaseId, "FAILED", "status=$status msg=$message")
                }
            }
        }
    }
}
