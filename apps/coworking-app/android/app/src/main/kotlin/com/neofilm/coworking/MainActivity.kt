package com.neofilm.coworking

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import java.io.ByteArrayOutputStream

/**
 * NeoFilm Coworking — a HOME launcher wrapping the Next.js coworking front in a
 * full-screen WebView.
 *
 * - Runs as the device launcher (HOME) so the box boots straight into the ads.
 * - Exposes a small JS bridge (window.NeoFilmAndroid) to list + launch installed
 *   apps and read the ANDROID_ID.
 * - Back key is forwarded to the web app as a `neo-back` event (never exits the
 *   launcher) so the front can toggle its app grid.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            // Ads must autoplay without a user gesture.
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        webView.webViewClient = WebViewClient()
        webView.addJavascriptInterface(Bridge(), "NeoFilmAndroid")

        applyImmersive()

        Log.i(TAG, "Loading ${BuildConfig.CW_APP_URL}")
        webView.loadUrl(BuildConfig.CW_APP_URL)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersive()
    }

    private fun applyImmersive() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        )
    }

    /** Deliver a Play Integrity result to the web layer on the UI thread. */
    private fun deliverIntegrityResult(token: String?, error: String?) {
        val tokenArg = if (token != null) jsString(token) else "null"
        val errorArg = if (error != null) jsString(error) else "null"
        runOnUiThread {
            webView.evaluateJavascript(
                "window.__neoIntegrityResult && window.__neoIntegrityResult($tokenArg, $errorArg)",
                null,
            )
        }
    }

    /** Build a safely-escaped JS string literal (quotes included). */
    private fun jsString(s: String): String {
        val sb = StringBuilder("\"")
        for (c in s) when (c) {
            '\\' -> sb.append("\\\\")
            '"' -> sb.append("\\\"")
            '\n' -> sb.append("\\n")
            '\r' -> sb.append("\\r")
            else -> sb.append(c)
        }
        return sb.append("\"").toString()
    }

    /** Forward Back to the web app; never leave the launcher. */
    override fun dispatchKeyEvent(event: KeyEvent?): Boolean {
        if (event != null && event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('neo-back'))",
                    null
                )
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    inner class Bridge {
        @JavascriptInterface
        fun isAndroidTv(): Boolean = true

        @JavascriptInterface
        fun getAndroidId(): String =
            android.provider.Settings.Secure.getString(
                contentResolver,
                android.provider.Settings.Secure.ANDROID_ID,
            ) ?: ""

        /**
         * Integrity signals for the backend. Currently reports whether the app
         * runs on an emulator/VM so browser/VM clients can be hidden from live
         * screen surfaces. Returned as JSON, e.g. {"isEmulator":true}.
         */
        @JavascriptInterface
        fun getDeviceIntegrity(): String = "{\"isEmulator\":${isProbablyEmulator()}}"

        /** The APK package name (com.neofilm.coworking) - sent with the integrity
         *  token so the backend calls decodeIntegrityToken on the right app. */
        @JavascriptInterface
        fun getPackageName(): String = applicationContext.packageName

        /**
         * Request a Play Integrity token (classic API). Asynchronous: the result
         * is delivered back to the web layer through window.__neoIntegrityResult,
         * which the JS wrapper (getIntegrityToken) turns into a Promise.
         *
         *   window.__neoIntegrityResult(token: string | null, error: string | null)
         *
         * `setCloudProjectNumber` lets a SIDELOADED APK (not on the Play Store)
         * still obtain device-integrity verdicts, using our GCP project.
         */
        @JavascriptInterface
        fun requestIntegrityToken(nonce: String) {
            try {
                val manager = IntegrityManagerFactory.create(applicationContext)
                val request = IntegrityTokenRequest.builder()
                    .setNonce(nonce)
                    .setCloudProjectNumber(BuildConfig.PLAY_INTEGRITY_PROJECT_NUMBER)
                    .build()
                manager.requestIntegrityToken(request)
                    .addOnSuccessListener { response ->
                        deliverIntegrityResult(response.token(), null)
                    }
                    .addOnFailureListener { e ->
                        Log.w(TAG, "Integrity request failed: ${e.message}")
                        deliverIntegrityResult(null, e.message ?: "integrity_failed")
                    }
            } catch (e: Exception) {
                Log.e(TAG, "requestIntegrityToken error: ${e.message}")
                deliverIntegrityResult(null, e.message ?: "integrity_error")
            }
        }

        /**
         * Open the system Settings. Works on any Android TV box (Xiaomi, Nvidia,
         * generic Android TV) and Fire OS. The Settings app is a system app with no
         * regular launcher intent, so we use the standard ACTION_SETTINGS intent
         * first (resolves to the TV settings on stock Android TV), then fall back to
         * known settings packages across Android TV and Fire OS.
         */
        @JavascriptInterface
        fun openSystemSettings(): Boolean {
            try {
                startActivity(
                    Intent(android.provider.Settings.ACTION_SETTINGS)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
                return true
            } catch (e: Exception) {
                Log.w(TAG, "ACTION_SETTINGS failed, trying package fallbacks: ${e.message}")
            }
            for (pkg in listOf(
                "com.android.tv.settings",        // stock Android TV (Xiaomi, Nvidia…)
                "com.android.settings",           // generic Android
                "com.amazon.tv.settings.v2",      // Fire OS
                "com.amazon.tv.settings",         // Fire OS (older)
            )) {
                try {
                    val i = packageManager.getLeanbackLaunchIntentForPackage(pkg)
                        ?: packageManager.getLaunchIntentForPackage(pkg)
                    if (i != null) {
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        startActivity(i)
                        return true
                    }
                } catch (_: Exception) {
                }
            }
            Log.e(TAG, "openSystemSettings: no settings intent could be launched")
            return false
        }

        /** JSON array of launchable apps: [{ packageName, label, icon(base64 PNG) }]. */
        @JavascriptInterface
        fun getInstalledApps(): String {
            val pm = packageManager
            val seen = mutableSetOf<String>()
            val apps = mutableListOf<android.content.pm.ResolveInfo>()

            for (cat in listOf(Intent.CATEGORY_LEANBACK_LAUNCHER, Intent.CATEGORY_LAUNCHER)) {
                val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(cat) }
                for (ri in pm.queryIntentActivities(intent, 0)) {
                    val pkg = ri.activityInfo.packageName
                    if (seen.add(pkg)) apps.add(ri)
                }
            }

            val sb = StringBuilder("[")
            var first = true
            for (ri in apps) {
                val pkg = ri.activityInfo.packageName
                if (pkg == packageName) continue

                val label = ri.loadLabel(pm).toString()
                var iconB64 = ""
                try {
                    val drawable = ri.loadIcon(pm)
                    val size = 96
                    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
                    val canvas = Canvas(bmp)
                    drawable.setBounds(0, 0, size, size)
                    drawable.draw(canvas)
                    val stream = ByteArrayOutputStream()
                    bmp.compress(Bitmap.CompressFormat.PNG, 80, stream)
                    iconB64 = Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
                    bmp.recycle()
                } catch (e: Exception) {
                    Log.w(TAG, "icon encode failed for $pkg: ${e.message}")
                }

                val escaped = label.replace("\\", "\\\\").replace("\"", "\\\"")
                if (!first) sb.append(",")
                first = false
                sb.append("{\"packageName\":\"$pkg\",\"label\":\"$escaped\",\"icon\":\"$iconB64\"}")
            }
            sb.append("]")
            return sb.toString()
        }

        /** Launch an installed app by package name. */
        @JavascriptInterface
        fun launchApp(packageName: String): Boolean {
            return try {
                val intent = pmLaunchIntent(packageName) ?: return false
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                Log.i(TAG, "Launched $packageName")
                true
            } catch (e: Exception) {
                Log.e(TAG, "launch failed for $packageName: ${e.message}")
                false
            }
        }

        private fun pmLaunchIntent(pkg: String): Intent? =
            packageManager.getLeanbackLaunchIntentForPackage(pkg)
                ?: packageManager.getLaunchIntentForPackage(pkg)

        /**
         * Best-effort emulator/VM detection from Build properties. Covers the
         * common Android emulators (AVD/goldfish/ranchu), Genymotion, VirtualBox,
         * BlueStacks, Nox, etc. Not tamper-proof, but enough to flag casual VMs.
         */
        private fun isProbablyEmulator(): Boolean {
            val fp = (Build.FINGERPRINT ?: "").lowercase()
            val model = (Build.MODEL ?: "").lowercase()
            val product = (Build.PRODUCT ?: "").lowercase()
            val hardware = (Build.HARDWARE ?: "").lowercase()
            val manufacturer = (Build.MANUFACTURER ?: "").lowercase()
            val brand = (Build.BRAND ?: "").lowercase()
            val device = (Build.DEVICE ?: "").lowercase()

            val tokens = listOf(
                "generic", "unknown", "emulator", "sdk_gphone", "sdk_google",
                "google_sdk", "goldfish", "ranchu", "vbox", "genymotion",
                "bluestacks", "nox", "andy", "ttvm", "droid4x", "windroye",
            )
            fun anyHit(s: String) = tokens.any { s.contains(it) }

            return anyHit(fp) ||
                anyHit(model) ||
                anyHit(product) ||
                anyHit(hardware) ||
                anyHit(device) ||
                manufacturer.contains("genymotion") ||
                brand.startsWith("generic") ||
                fp.startsWith("generic") ||
                model.contains("android sdk built for")
        }
    }

    companion object {
        private const val TAG = "NeoFilmCoworking"
    }
}
