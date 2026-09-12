package com.neofilm.coworking

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
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
    }

    companion object {
        private const val TAG = "NeoFilmCoworking"
    }
}
