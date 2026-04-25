package com.neofilm.tv

import android.annotation.SuppressLint
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.TextureView
import android.view.WindowManager
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.graphics.drawable.BitmapDrawable
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.provider.Settings
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var offlineOverlay: LinearLayout
    private lateinit var offlineText: TextView
    private lateinit var statusBadge: TextView
    private lateinit var rootLayout: FrameLayout
    private val handler = Handler(Looper.getMainLooper())

    // ── Split-screen browser mode ──
    private var splitContainer: LinearLayout? = null
    private var browserWebView: WebView? = null
    private var isSplitMode = false

    // ── Native HLS player (bypasses WebView CORS) ──
    private var nativePlayerContainer: FrameLayout? = null
    private var nativeVideoView: android.widget.VideoView? = null

    private var tvAppUrl: String = ""
    private var isNetworkAvailable = true

    // ── DPAD secret: press Center 7 times within 3 seconds ──
    private var centerPressCount = 0
    private var lastCenterPressTime = 0L

    // ── Touch secret: tap top-left corner 7 times within 2 seconds ──
    private var cornerTapCount = 0
    private var lastCornerTapTime = 0L
    private val CORNER_TAP_SIZE_DP = 80

    // ── Long press on logo: 3 seconds long press top-left ──
    private var longPressStartTime = 0L
    private val LONG_PRESS_DURATION_MS = 3000L
    private var isLongPressing = false

    private val retryRunnable = Runnable { performRetry() }

    private lateinit var prefs: SharedPreferences

    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Fullscreen flags BEFORE setContentView (window flags only, no insetsController yet)
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Request overlay permission (needed for ad overlay over YouTube etc.)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !android.provider.Settings.canDrawOverlays(this)) {
            // Try granting via shell command first (works if ADB debugging is enabled)
            try {
                Runtime.getRuntime().exec("appops set $packageName SYSTEM_ALERT_WINDOW allow")
                Log.i(TAG, "Attempted to self-grant overlay permission via appops")
            } catch (_: Exception) {}

            // If still not granted, try opening settings
            if (!android.provider.Settings.canDrawOverlays(this)) {
                try {
                    startActivity(Intent(
                        android.provider.Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        android.net.Uri.parse("package:$packageName")
                    ))
                } catch (_: Exception) {
                    Log.w(TAG, "Overlay permission settings not available on this device")
                }
            }
        }

        // Load URL: custom pref > BuildConfig > emulator auto-detect
        tvAppUrl = resolveStartUrl()
        Log.i(TAG, "Resolved start URL: $tvAppUrl (isEmulator=${isEmulator()})")

        // Root layout
        rootLayout = FrameLayout(this)
        rootLayout.setBackgroundColor(Color.BLACK)

        // ── WebView ──
        webView = WebView(this).apply {
            isFocusable = true
            isFocusableInTouchMode = true
            requestFocus()
            setBackgroundColor(Color.BLACK)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                displayZoomControls = false
                builtInZoomControls = false
                setSupportMultipleWindows(false)
                // TV-friendly user agent
                userAgentString = "${settings.userAgentString} NEOFILM-TV/${BuildConfig.VERSION_NAME} AndroidTV"
            }
            // Force scale so page fills viewport on all resolutions
            // On 720p (1280px wide), scale = 1280/1920 * 100 = 66.67%
            // On 1080p, viewport matches so scale = 100
            // setInitialScale(0) = auto, but doesn't work well on old WebViews
            // We compute the correct scale at runtime
            val displayMetrics = resources.displayMetrics
            val screenWidthPx = displayMetrics.widthPixels
            val desiredScale = (screenWidthPx.toFloat() / 1920f * 100f).toInt()
            setInitialScale(if (desiredScale < 95) desiredScale else 0)
            // Disable overscroll glow
            overScrollMode = View.OVER_SCROLL_NEVER
            // Hardware layer for smooth rendering on TV hardware
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            // Disable text selection / copy-paste
            isLongClickable = false
            setOnLongClickListener { true }
            isHapticFeedbackEnabled = false

            webViewClient = NeoFilmWebViewClient()
            webChromeClient = NeoFilmChromeClient()

            // JavaScript bridge for native features (app launcher, etc.)
            addJavascriptInterface(NeoFilmBridge(), "NeoFilmAndroid")
        }

        // Enable WebView debugging in debug builds
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
            Log.d(TAG, "WebView remote debugging enabled (chrome://inspect)")
        }

        rootLayout.addView(webView, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        // ── Offline overlay ──
        offlineOverlay = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xFF111111.toInt())
            visibility = View.GONE
            val pad = dpToPx(40)
            setPadding(pad, dpToPx(30), pad, dpToPx(20))
        }

        // Header: NEOFILM logo text
        val logoText = TextView(this).apply {
            text = "NEOFILM"
            textSize = 32f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }
        offlineOverlay.addView(logoText, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dpToPx(8) })

        offlineText = TextView(this).apply {
            text = "Impossible de se connecter au serveur"
            textSize = 20f
            setTextColor(0xFFFF5722.toInt())
            gravity = Gravity.CENTER
            typeface = Typeface.DEFAULT_BOLD
        }
        offlineOverlay.addView(offlineText, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dpToPx(4) })

        val offlineHelper = TextView(this).apply {
            text = "Reconnexion automatique en cours..."
            textSize = 14f
            setTextColor(0xFF888888.toInt())
            gravity = Gravity.CENTER
        }
        offlineOverlay.addView(offlineHelper, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dpToPx(30) })

        // Separator
        offlineOverlay.addView(View(this).apply {
            setBackgroundColor(0xFF333333.toInt())
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(1)).apply {
            bottomMargin = dpToPx(20)
        })

        // "Applications" label
        val appsLabel = TextView(this).apply {
            text = "Applications"
            textSize = 18f
            setTextColor(0xFFCCCCCC.toInt())
            typeface = Typeface.DEFAULT_BOLD
        }
        offlineOverlay.addView(appsLabel, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { bottomMargin = dpToPx(12) })

        // Horizontal scroll for app icons
        val appsScroll = HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            tag = "appsScroll"
            isFocusable = false
        }
        val appsRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        // Add installed launchable apps
        val installedApps = getInstalledLaunchableApps()
        for (appInfo in installedApps) {
            val appItem = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                val itemPad = dpToPx(10)
                setPadding(itemPad, itemPad, itemPad, itemPad)
                isFocusable = true
                isFocusableInTouchMode = true
                setBackgroundResource(android.R.drawable.list_selector_background)
                setOnClickListener {
                    try {
                        val launchIntent = packageManager.getLaunchIntentForPackage(appInfo.activityInfo.packageName)
                        if (launchIntent != null) startActivity(launchIntent)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to launch app: ${e.message}")
                    }
                }
                setOnFocusChangeListener { v, hasFocus ->
                    v.setBackgroundColor(if (hasFocus) 0xFF333333.toInt() else Color.TRANSPARENT)
                }
            }

            val icon = ImageView(this).apply {
                setImageDrawable(appInfo.loadIcon(packageManager))
                val iconSize = dpToPx(48)
                layoutParams = LinearLayout.LayoutParams(iconSize, iconSize).apply {
                    bottomMargin = dpToPx(6)
                }
            }
            appItem.addView(icon)

            val label = TextView(this).apply {
                text = appInfo.loadLabel(packageManager).toString().take(12)
                textSize = 11f
                setTextColor(0xFFAAAAAA.toInt())
                gravity = Gravity.CENTER
                maxLines = 1
            }
            appItem.addView(label)

            appsRow.addView(appItem, LinearLayout.LayoutParams(
                dpToPx(80), ViewGroup.LayoutParams.WRAP_CONTENT
            ))
        }

        // Add Settings button
        val settingsItem = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            val itemPad = dpToPx(10)
            setPadding(itemPad, itemPad, itemPad, itemPad)
            isFocusable = true
            isFocusableInTouchMode = true
            setOnClickListener {
                showSettingsPinDialog()
            }
            setOnFocusChangeListener { v, hasFocus ->
                v.setBackgroundColor(if (hasFocus) 0xFF333333.toInt() else Color.TRANSPARENT)
            }
        }
        val settingsIcon = TextView(this).apply {
            text = "⚙"
            textSize = 36f
            gravity = Gravity.CENTER
            val iconSize = dpToPx(48)
            layoutParams = LinearLayout.LayoutParams(iconSize, iconSize)
        }
        settingsItem.addView(settingsIcon)
        val settingsLabel = TextView(this).apply {
            text = "Paramètres"
            textSize = 11f
            setTextColor(0xFFAAAAAA.toInt())
            gravity = Gravity.CENTER
            maxLines = 1
        }
        settingsItem.addView(settingsLabel)
        appsRow.addView(settingsItem, LinearLayout.LayoutParams(
            dpToPx(80), ViewGroup.LayoutParams.WRAP_CONTENT
        ))

        appsScroll.addView(appsRow)
        offlineOverlay.addView(appsScroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))

        rootLayout.addView(offlineOverlay, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        // ── Status badge (top-right) ──
        statusBadge = TextView(this).apply {
            textSize = 11f
            setTextColor(Color.WHITE)
            typeface = Typeface.MONOSPACE
            setBackgroundColor(0x99000000.toInt())
            val pad = dpToPx(6)
            setPadding(pad, dpToPx(3), pad, dpToPx(3))
            visibility = View.VISIBLE
        }
        val badgeParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            topMargin = dpToPx(8)
            marginEnd = dpToPx(8)
        }
        rootLayout.addView(statusBadge, badgeParams)

        setContentView(rootLayout)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Enable kiosk mode AFTER setContentView (insetsController needs DecorView)
        enableKioskMode()

        // ── Touch listener for secret tap pattern on entire root ──
        rootLayout.setOnTouchListener { _, event ->
            handleTouchForSecret(event)
            false // Don't consume — let WebView handle
        }

        // Register network callback
        registerNetworkCallback()
        updateStatusBadge()
        startAppLauncherTimer()

        // Start ad overlay service (overlay on top of any app)
        startAdOverlayService()

        // Launcher prompt disabled — use Launcher Manager or ADB to set as default
        // promptSetAsLauncher()

        // Check for OTA update
        checkForUpdate()


        // Initial load
        if (isNetworkConnected()) {
            Log.i(TAG, "Network available — loading $tvAppUrl")
            webView.loadUrl(tvAppUrl)
        } else {
            Log.w(TAG, "No network at startup")
            showOfflineOverlay()
        }
    }

    // ══════════════════════════════════════════════════
    // URL RESOLUTION + EMULATOR DETECTION
    // ══════════════════════════════════════════════════

    private fun resolveStartUrl(): String {
        // 1. SharedPreferences custom URL (user-set)
        val customUrl = prefs.getString(PREF_URL_KEY, null)
        if (!customUrl.isNullOrBlank()) {
            Log.i(TAG, "Using custom URL from SharedPreferences: $customUrl")
            return customUrl
        }

        // 2. BuildConfig default (different for debug/release)
        // In debug: already set to 10.0.2.2 for emulator
        // In release: set to https://tv.neofilm.io
        if (!BuildConfig.DEBUG) {
            Log.i(TAG, "Release build — using BuildConfig URL: ${BuildConfig.TV_APP_URL}")
            return BuildConfig.TV_APP_URL
        }

        // 3. Debug build: always use BuildConfig URL
        Log.i(TAG, "Debug build — using BuildConfig URL: ${BuildConfig.TV_APP_URL}")
        return BuildConfig.TV_APP_URL
    }

    /**
     * Reliable emulator detection using multiple signals.
     * Returns true if running on Android Studio emulator, Genymotion, etc.
     */
    private fun isEmulator(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("google_sdk")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MODEL.contains("sdk_gphone")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.BRAND.startsWith("generic")
                || Build.DEVICE.startsWith("generic")
                || Build.PRODUCT.contains("sdk")
                || Build.PRODUCT.contains("emulator")
                || Build.HARDWARE.contains("goldfish")
                || Build.HARDWARE.contains("ranchu")
                || Build.BOARD == "goldfish"
                || Build.HOST.contains("android-build")
                || "google_sdk" == Build.PRODUCT)
    }

    // ══════════════════════════════════════════════════
    // NETWORK MONITORING
    // ══════════════════════════════════════════════════

    private fun registerNetworkCallback() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        cm.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                handler.post {
                    Log.i(TAG, "Network available")
                    isNetworkAvailable = true
                    hideOfflineOverlay()
                    updateStatusBadge()
                    if (webView.url == null || webView.url == "about:blank") {
                        webView.loadUrl(tvAppUrl)
                    }
                }
            }

            override fun onLost(network: Network) {
                handler.post {
                    Log.w(TAG, "Network lost")
                    isNetworkAvailable = false
                    showOfflineOverlay()
                    updateStatusBadge()
                }
            }
        })
    }

    private fun isNetworkConnected(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun showOfflineOverlay() {
        offlineOverlay.visibility = View.VISIBLE
        webView.visibility = View.GONE
        // Tell ad service we're offline — don't show ads
        prefs.edit().putBoolean("webview_connected", false).apply()
        // Focus the first app item
        offlineOverlay.post {
            val appsScroll = offlineOverlay.findViewWithTag<HorizontalScrollView>("appsScroll")
            val appsRow = appsScroll?.getChildAt(0) as? LinearLayout
            appsRow?.getChildAt(0)?.requestFocus()
        }
        scheduleRetry()
    }

    private fun hideOfflineOverlay() {
        // Reload fresh page, then show WebView after 15s to let it render
        webView.loadUrl(tvAppUrl)
        handler.postDelayed({
            offlineOverlay.visibility = View.GONE
            webView.visibility = View.VISIBLE
            prefs.edit().putBoolean("webview_connected", true).apply()
        }, 15_000)
        handler.removeCallbacks(retryRunnable)
    }

    private fun scheduleRetry() {
        handler.removeCallbacks(retryRunnable)
        handler.postDelayed(retryRunnable, RETRY_DELAY_MS)
    }

    private fun performRetry() {
        Log.i(TAG, "Retry: loading $tvAppUrl behind overlay, will show after 15s if valid")
        // Load page behind overlay
        webView.loadUrl(tvAppUrl)
        // Wait 15s then check if page is valid before showing
        handler.postDelayed({
            webView.evaluateJavascript("document.body.innerText.substring(0, 300)") { content ->
                val c = content?.trim('"') ?: ""
                val isBad = c.contains("Synology", ignoreCase = true) || c.contains("introuvable", ignoreCase = true) || c.isBlank()
                if (isBad) {
                    Log.w(TAG, "Page still invalid after 15s — keeping overlay, scheduling next retry")
                    scheduleRetry()
                } else {
                    Log.i(TAG, "Page valid after 15s — showing WebView")
                    hideOfflineOverlay()
                }
            }
        }, 15_000)
    }

    // ══════════════════════════════════════════════════
    // STATUS BADGE (top-right overlay)
    // ══════════════════════════════════════════════════

    private fun updateStatusBadge() {
        // Hide badge in production, only show in debug builds
        if (!BuildConfig.DEBUG) {
            statusBadge.visibility = View.GONE
            return
        }
        val status = if (isNetworkAvailable) "● ONLINE" else "○ OFFLINE"
        statusBadge.text = status
        statusBadge.setTextColor(
            if (isNetworkAvailable) 0xFF4CAF50.toInt() else 0xFFFF5722.toInt()
        )
    }

    // ══════════════════════════════════════════════════
    // KIOSK MODE (modern API)
    // ══════════════════════════════════════════════════

    private fun enableKioskMode() {
        // Modern API (Android 11+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            // Fallback for API 26-29
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            )
        }

        // Lock task if device owner
        try {
            val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(this, NeoFilmDeviceAdmin::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.setLockTaskPackages(admin, arrayOf(packageName))
                startLockTask()
            }
        } catch (e: Exception) {
            Log.d(TAG, "Lock task not available: ${e.message}")
        }
    }

    // ══════════════════════════════════════════════════
    // SECRET ACCESS: DPAD (TV) + TOUCH (phone/tablet)
    // ══════════════════════════════════════════════════

    // ── ACTIVITY-LEVEL D-PAD INTERCEPTION ──
    // Override at Activity level so we intercept ALL key events before
    // Android routes them to any view (prevents native spatial navigation).

    override fun dispatchKeyEvent(event: KeyEvent?): Boolean {
        if (event == null) return super.dispatchKeyEvent(event)

        // When offline overlay is visible, let Android handle D-pad natively
        if (offlineOverlay.visibility == View.VISIBLE) {
            return super.dispatchKeyEvent(event)
        }

        val jsKey = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
            KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER -> "Enter"
            else -> null
        }

        if (jsKey != null) {
            if (event.action == KeyEvent.ACTION_DOWN) {
                // Secret DPAD trigger (7x OK) disabled — fired accidentally when
                // users clicked rapidly on channels. Admin access stays available
                // via the 7-tap top-left touch gesture only.

                // Direct spatial navigation in JS (bypasses React hooks
                // which fight each other when multiple useDpadNavigation exist)
                Log.d(TAG, "DPAD inject: $jsKey")
                // Matrix-based navigation — also dispatch KeyboardEvent for channel zapping
                // (dispatched AFTER our nav so React hooks don't interfere)
                webView.evaluateJavascript(
                    """(function(){
                        var dir = '$jsKey';
                        if (dir === 'Enter') {
                            var el = document.activeElement;
                            if (el && el.click) el.click();
                            return;
                        }
                        var all = Array.from(document.querySelectorAll('[data-tv-focusable]')).filter(function(e){
                            var s = getComputedStyle(e);
                            return s.display !== 'none' && s.visibility !== 'hidden' && !e.disabled;
                        });
                        if (all.length === 0) return;
                        var cur = document.activeElement;
                        var idx = all.indexOf(cur);
                        if (idx < 0) { all[0].focus(); return; }

                        // Descending from the top tab bar → pick the top-left-most visible
                        // focusable located below the tab bar, regardless of the active tab.
                        if (dir === 'ArrowDown' && cur.closest('[data-tv-nav-group="tabs"]')) {
                            var tabR = cur.getBoundingClientRect();
                            var below = all.filter(function(e){
                                var r = e.getBoundingClientRect();
                                return r.width > 0 && r.height > 0 && r.top > tabR.bottom + 4;
                            });
                            if (below.length > 0) {
                                below.sort(function(a, b){
                                    var ar = a.getBoundingClientRect();
                                    var br = b.getBoundingClientRect();
                                    if (Math.abs(ar.top - br.top) > 8) return ar.top - br.top;
                                    return ar.left - br.left;
                                });
                                below[0].focus();
                                below[0].scrollIntoView({behavior:'smooth',block:'nearest'});
                                return;
                            }
                        }

                        // Build matrix from data-tv-row / data-tv-col attributes
                        var curRow = parseInt(cur.getAttribute('data-tv-row') || '-1');
                        var curCol = parseInt(cur.getAttribute('data-tv-col') || '-1');
                        console.log('[NAV] cur=' + (cur.textContent||'').substring(0,20) + ' row=' + curRow + ' col=' + curCol + ' dir=' + dir + ' allCount=' + all.length);

                        if (curRow >= 0 && curCol >= 0) {
                            var targetRow = curRow, targetCol = curCol;
                            if (dir === 'ArrowUp') targetRow--;
                            if (dir === 'ArrowDown') targetRow++;
                            if (dir === 'ArrowLeft') targetCol--;
                            if (dir === 'ArrowRight') targetCol++;

                            // Find element at target position
                            var target = document.querySelector('[data-tv-focusable][data-tv-row="'+targetRow+'"][data-tv-col="'+targetCol+'"]');
                            // If not found, try same row different col or same col different row
                            if (!target && (dir === 'ArrowLeft' || dir === 'ArrowRight')) {
                                // Wrap or stay
                            }
                            if (target) {
                                target.focus();
                                target.scrollIntoView({behavior:'smooth',block:'nearest'});
                                return;
                            }
                        }

                        // Spatial fallback: find nearest focusable in the requested geometric direction
                        var cr = cur.getBoundingClientRect();
                        var cxFB = cr.left + cr.width / 2;
                        var cyFB = cr.top + cr.height / 2;
                        var best = null;
                        var bestScore = Infinity;
                        for (var i = 0; i < all.length; i++) {
                            var el = all[i];
                            if (el === cur) continue;
                            var r = el.getBoundingClientRect();
                            var ex = r.left + r.width / 2;
                            var ey = r.top + r.height / 2;
                            var dx = ex - cxFB;
                            var dy = ey - cyFB;
                            var inDir = (dir === 'ArrowUp' && dy < -4) ||
                                        (dir === 'ArrowDown' && dy > 4) ||
                                        (dir === 'ArrowLeft' && dx < -4) ||
                                        (dir === 'ArrowRight' && dx > 4);
                            if (!inDir) continue;
                            var primary = (dir === 'ArrowUp') ? -dy :
                                          (dir === 'ArrowDown') ? dy :
                                          (dir === 'ArrowLeft') ? -dx : dx;
                            var secondary = (dir === 'ArrowUp' || dir === 'ArrowDown') ? Math.abs(dx) : Math.abs(dy);
                            var score = primary + secondary * 2;
                            if (score < bestScore) { bestScore = score; best = el; }
                        }
                        if (best) { best.focus(); best.scrollIntoView({behavior:'smooth',block:'nearest'}); }
                    })()""".trimIndent(),
                    null
                )
                // Also dispatch KeyboardEvent for channel zapping in IptvPlayer
                webView.evaluateJavascript(
                    "window.dispatchEvent(new KeyboardEvent('keydown',{key:'$jsKey',keyCode:${event.keyCode},bubbles:true}))",
                    null
                )
            }
            return true // consume both ACTION_DOWN and ACTION_UP for all D-pad keys
        }

        return super.dispatchKeyEvent(event)
    }

    // Touch secret trigger (7 taps top-left OR long press 3s) fully disabled.
    // These apps ship to commercial end-users who must NOT access admin settings.
    @Suppress("UNUSED_PARAMETER")
    private fun handleTouchForSecret(event: MotionEvent) {
        // no-op
    }

    // ══════════════════════════════════════════════════
    // SETTINGS DIALOG
    // ══════════════════════════════════════════════════

    private fun showPinDialog() {
        val input = android.widget.EditText(this).apply {
            hint = "Code admin (6 chiffres)"
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or
                    android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
            val pad = dpToPx(20)
            setPadding(pad, dpToPx(12), pad, dpToPx(12))
        }

        android.app.AlertDialog.Builder(this)
            .setTitle("Accès administrateur")
            .setView(input)
            .setPositiveButton("OK") { _, _ ->
                if (input.text.toString() == SETTINGS_PIN) {
                    showSettingsDialog()
                } else {
                    Log.w(TAG, "Invalid admin PIN attempt")
                }
            }
            .setNegativeButton("Annuler", null)
            .show()
    }

    private fun showSettingsDialog() {
        // Build the settings layout
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val pad = dpToPx(20)
            setPadding(pad, dpToPx(12), pad, dpToPx(4))
        }

        // Info text
        val infoText = TextView(this).apply {
            text = buildString {
                append("Version: ${BuildConfig.VERSION_NAME} (${BuildConfig.BUILD_TYPE})\n")
                append("URL actuelle: $tvAppUrl\n")
                append("Émulateur: ${if (isEmulator()) "Oui" else "Non"}\n")
                append("User-Agent: ${webView.settings.userAgentString.takeLast(60)}")
            }
            textSize = 12f
            setTextColor(0xFF999999.toInt())
            typeface = Typeface.MONOSPACE
        }
        layout.addView(infoText)

        // Spacer
        layout.addView(View(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dpToPx(12)
            )
        })

        // URL input
        val urlInput = android.widget.EditText(this).apply {
            hint = "URL de l'application TV"
            setText(tvAppUrl)
            selectAll()
            textSize = 15f
        }
        layout.addView(urlInput)

        // Helper text
        val helperText = TextView(this).apply {
            text = buildString {
                append("Exemples :\n")
                append("• Émulateur : http://10.0.2.2:3004\n")
                append("• Device réel : http://192.168.x.x:3004\n")
                append("• Production : https://tv.neofilm.io")
            }
            textSize = 12f
            setTextColor(0xFF888888.toInt())
            val pad = dpToPx(4)
            setPadding(pad, dpToPx(8), pad, pad)
        }
        layout.addView(helperText)

        android.app.AlertDialog.Builder(this)
            .setTitle("Paramètres NeoFilm TV")
            .setView(layout)
            .setPositiveButton("Sauvegarder & recharger") { _, _ ->
                val newUrl = urlInput.text.toString().trim()
                if (isValidUrl(newUrl)) {
                    tvAppUrl = newUrl
                    prefs.edit().putString(PREF_URL_KEY, newUrl).apply()
                    Log.i(TAG, "URL updated to: $newUrl — clearing cache & reloading")
                    webView.clearCache(true)
                    webView.loadUrl(newUrl)
                    updateStatusBadge()
                } else {
                    Log.w(TAG, "Invalid URL rejected: $newUrl")
                    showToast("URL invalide. Doit commencer par http:// ou https://")
                }
            }
            .setNeutralButton("Reset défaut") { _, _ ->
                prefs.edit().remove(PREF_URL_KEY).apply()
                tvAppUrl = resolveStartUrl()
                Log.i(TAG, "URL reset to default: $tvAppUrl")
                webView.clearCache(true)
                webView.loadUrl(tvAppUrl)
                updateStatusBadge()
                showToast("URL réinitialisée : $tvAppUrl")
            }
            .setNegativeButton("Fermer", null)
            .show()
    }

    private fun isValidUrl(url: String): Boolean {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return false
        return try {
            val uri = android.net.Uri.parse(url)
            !uri.host.isNullOrBlank()
        } catch (_: Exception) {
            false
        }
    }

    private fun showToast(msg: String) {
        android.widget.Toast.makeText(this, msg, android.widget.Toast.LENGTH_LONG).show()
    }

    // ══════════════════════════════════════════════════
    // WEBVIEW CLIENTS
    // ══════════════════════════════════════════════════

    inner class NeoFilmWebViewClient : WebViewClient() {
        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: WebResourceError?
        ) {
            super.onReceivedError(view, request, error)
            if (request?.isForMainFrame == true) {
                val errorCode = error?.errorCode ?: -1
                val desc = error?.description ?: "unknown"
                Log.e(TAG, "WebView error [main frame]: code=$errorCode desc=$desc url=${request.url}")

                showOfflineOverlay()
            } else {
                Log.w(TAG, "WebView error [sub-resource]: ${request?.url} — ${error?.description}")
            }
        }

        override fun onReceivedHttpError(
            view: WebView?,
            request: WebResourceRequest?,
            errorResponse: android.webkit.WebResourceResponse?
        ) {
            super.onReceivedHttpError(view, request, errorResponse)
            if (request?.isForMainFrame == true) {
                val statusCode = errorResponse?.statusCode ?: 0
                Log.e(TAG, "HTTP error [main frame]: $statusCode url=${request.url}")
                if (statusCode >= 400) {
                    showOfflineOverlay()
                }
            }
        }

        override fun onPageFinished(view: WebView?, url: String?) {
            super.onPageFinished(view, url)
            Log.i(TAG, "Page loaded: $url")
            if (url == "about:blank" && isNetworkAvailable) {
                handler.postDelayed({
                    Log.d(TAG, "Blank page detected, reloading $tvAppUrl")
                    webView.loadUrl(tvAppUrl)
                }, 2000)
            }

            // Check if the loaded page is Synology error (not NeoFilm)
            if (url != null && !url.startsWith("about:")) {
                handler.postDelayed({
                    view?.evaluateJavascript("document.body.innerText.substring(0, 300)") { content ->
                        val c = content?.trim('"') ?: ""
                        val isSynology = c.contains("Synology", ignoreCase = true) || c.contains("introuvable", ignoreCase = true)
                        if (isSynology) {
                            Log.w(TAG, "Synology/error page detected — showing offline overlay")
                            showOfflineOverlay()
                        } else if (offlineOverlay.visibility == View.VISIBLE) {
                            Log.i(TAG, "NeoFilm page loaded — hiding offline overlay")
                            hideOfflineOverlay()
                        }
                    }
                }, 2000) // Wait 2s for page to render
            }

            // Inject viewport fix + CSS polyfills for old WebViews
            injectViewportFix(view)
            injectLegacyCssIfNeeded(view)
        }

        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
            // Keep all navigation inside the WebView
            return false
        }
    }

    /**
     * Inject a viewport meta tag to force the page to render at 1920px width
     * and scale down on smaller screens. This makes the layout identical on all resolutions.
     */
    private fun injectViewportFix(view: WebView?) {
        if (view == null) return
        val screenWidth = resources.displayMetrics.widthPixels
        if (screenWidth >= 1900) return // Already 1080p+, no fix needed

        val scale = screenWidth.toFloat() / 1920f
        Log.i(TAG, "Injecting viewport fix: screen=${screenWidth}px, scale=${scale}")

        view.evaluateJavascript("""
        (function() {
            if (window.__neofilm_viewport_fixed) return;
            window.__neofilm_viewport_fixed = true;
            var meta = document.querySelector('meta[name="viewport"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                document.head.appendChild(meta);
            }
            meta.content = 'width=1920, initial-scale=${scale}, user-scalable=no';
        })();
        """.trimIndent(), null)
    }

    /**
     * Detect old WebView (Chrome < 80) and inject CSS polyfills.
     * Chrome 74 doesn't support: clamp(), gap in flexbox, some CSS features.
     * We inject overrides to make the layout work.
     */
    private fun injectLegacyCssIfNeeded(view: WebView?) {
        if (view == null) return
        val ua = view.settings.userAgentString ?: return
        // Extract Chrome version from UA string: "Chrome/74.0.3729.186"
        val chromeVersionRegex = Regex("""Chrome/(\d+)""")
        val match = chromeVersionRegex.find(ua)
        val chromeVersion = match?.groupValues?.get(1)?.toIntOrNull() ?: return

        Log.i(TAG, "WebView Chrome version: $chromeVersion")

        if (chromeVersion >= 80) {
            Log.i(TAG, "WebView is modern (Chrome $chromeVersion) — no polyfills needed")
            return
        }

        Log.w(TAG, "Old WebView detected (Chrome $chromeVersion) — injecting CSS polyfills")

        // Inject polyfill CSS + JS to replace clamp() and add gap support
        val polyfillJs = """
        (function() {
            if (window.__neofilm_polyfill_applied) return;
            window.__neofilm_polyfill_applied = true;

            var style = document.createElement('style');
            style.textContent = [
                // Fix: viewport should fill screen
                'html, body { width: 100vw !important; height: 100vh !important; overflow: hidden !important; margin: 0 !important; padding: 0 !important; }',

                // Fix: flexbox gap polyfill — add margins instead
                '[class*="gap-"] > * { margin: 0.25rem; }',
                '.flex.gap-1 > *, .flex.gap-2 > * { margin: 0.15rem; }',
                '.flex.gap-3 > *, .flex.gap-4 > * { margin: 0.3rem; }',

                // Fix: grid gap
                '.grid { grid-gap: 0.5rem; }',

                // Fix: ensure full-screen layout
                '.tv-glass-shell { position: absolute !important; top: 1vh !important; left: 1vw !important; right: 1vw !important; bottom: 1vh !important; }',

                // Fix: home page layout — force proper sizing
                '.tv-page-enter { display: flex !important; width: 100% !important; height: 100% !important; }',

                // Fix: clamp fallback — use middle value
                // (actual clamp() calls in inline styles won't work, so we override key elements)
                '.tv-page-enter { padding: 1rem !important; gap: 0.8rem !important; font-size: 14px !important; }',
            ].join('\\n');
            document.head.appendChild(style);

            // Polyfill CSS.supports if missing
            if (!window.CSS || !window.CSS.supports) {
                window.CSS = window.CSS || {};
                window.CSS.supports = function() { return false; };
            }

            console.log('[NeoFilm] Legacy CSS polyfills injected for Chrome ' + $chromeVersion);
        })();
        """.trimIndent()

        view.evaluateJavascript(polyfillJs, null)
    }

    inner class NeoFilmChromeClient : WebChromeClient() {
        override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
            consoleMessage?.let {
                Log.d(TAG_JS, "[${it.messageLevel()}] ${it.message()} (${it.sourceId()}:${it.lineNumber()})")
            }
            return true
        }
    }

    // ══════════════════════════════════════════════════
    // LIFECYCLE
    // ══════════════════════════════════════════════════

    private var cameFromHome = false

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        // HOME button pressed → flag to navigate to Accueil
        if (intent?.hasCategory(Intent.CATEGORY_HOME) == true) {
            cameFromHome = true
        }
    }

    override fun onResume() {
        super.onResume()
        enableKioskMode()
        webView.onResume()
        browserWebView?.onResume()
        // Reset foreground app — we're back on NeoFilm
        prefs.edit().putString("last_foreground_app", packageName).apply()

        // Sync ad cache: check stored ads vs cache, download missing, clean stale
        val adsJson = prefs.getString("ads_data_json", null)
        if (!adsJson.isNullOrBlank()) {
            AdCacheManager.precacheAds(applicationContext, adsJson)
        }

        // Ad service restart handled by BootReceiver, not onResume (avoids loop when set as launcher)

        if (cameFromHome) {
            cameFromHome = false
            // Navigate to Accueil tab
            webView.evaluateJavascript(
                """(function(){
                    var accueil = document.querySelector('[data-tab="accueil"]') || document.querySelector('[href="/tv"]');
                    if (accueil) accueil.click();
                    else window.location.hash = '';
                })()""",
                null
            )
            Log.i(TAG, "HOME pressed → navigating to Accueil")
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
        browserWebView?.onPause()
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        browserWebView?.destroy()
        webView.destroy()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // If native HLS player is open, close it first
        if (nativePlayerContainer != null) {
            hideNativeHlsPlayer()
            return
        }
        // If in split mode, close the browser first
        if (isSplitMode) {
            exitSplitMode()
            return
        }
        // If browser WebView can go back, do that
        if (browserWebView?.canGoBack() == true) {
            browserWebView?.goBack()
            return
        }
        // Send a custom "back" event to the React app
        // React can handle it (close player, go back to tab, etc.)
        webView.evaluateJavascript(
            """(function(){
                var evt = new CustomEvent('neofilm-back');
                window.dispatchEvent(evt);
            })()""",
            null
        )
        Log.d(TAG, "Back button pressed → sent neofilm-back event to WebView")
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            enableKioskMode()
        }
    }

    // ══════════════════════════════════════════════════
    // ERROR FALLBACK (prevents black screen)
    // ══════════════════════════════════════════════════

    private fun showErrorFallback(errorCode: Int, description: String) {
        val html = """
            <!DOCTYPE html>
            <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
            <style>
                body { margin:0; background:#0a0a0f; color:#fff; font-family:system-ui;
                       display:flex; flex-direction:column; align-items:center;
                       justify-content:center; height:100vh; text-align:center; }
                h1 { font-size:3rem; font-weight:700; letter-spacing:-0.02em; }
                h1 span { color:#3b82f6; }
                .msg { font-size:1.2rem; opacity:0.6; margin-top:1rem; }
                .code { font-size:0.9rem; opacity:0.3; margin-top:2rem; font-family:monospace; }
                .retry { margin-top:2rem; font-size:1rem; opacity:0.5; }
                @keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }
                .dot { animation:pulse 1.5s infinite; }
            </style></head><body>
                <h1><span>NEO</span>FILM</h1>
                <div class="msg">Connexion au serveur en cours<span class="dot">...</span></div>
                <div class="retry">Nouvelle tentative dans quelques secondes</div>
                <div class="code">Erreur $errorCode: $description<br>URL: ${tvAppUrl}</div>
            </body></html>
        """.trimIndent()
        webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
    }

    // ══════════════════════════════════════════════════
    // UTILS
    // ══════════════════════════════════════════════════

    private fun extractYouTubeVideoId(url: String): String? {
        // Handle: youtube.com/watch?v=ID, youtu.be/ID, m.youtube.com/watch?v=ID
        val patterns = listOf(
            Regex("""(?:youtube\.com/watch\?.*v=|youtu\.be/|youtube\.com/shorts/)([a-zA-Z0-9_-]{11})""")
        )
        for (p in patterns) {
            val match = p.find(url)
            if (match != null) return match.groupValues[1]
        }
        return null
    }

    private fun dpToPx(dp: Int): Int {
        return TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            dp.toFloat(),
            resources.displayMetrics
        ).toInt()
    }

    // ══════════════════════════════════════════════════
    // PERIODIC APP LAUNCHER
    // ══════════════════════════════════════════════════

    private val APP_LAUNCH_INTERVAL_MS = 5 * 60 * 1000L // 5 minutes
    private val APP_AUTO_CLOSE_DELAY_MS = 15 * 1000L // 15 seconds
    private val appLauncherRunnable = object : Runnable {
        override fun run() {
            launchAppPeriodically("com.neofilm.testapp")
            handler.postDelayed(this, APP_LAUNCH_INTERVAL_MS)
        }
    }

    private fun startAppLauncherTimer() {
        handler.postDelayed(appLauncherRunnable, APP_LAUNCH_INTERVAL_MS)
        Log.i(TAG, "App launcher timer started: every ${APP_LAUNCH_INTERVAL_MS / 1000}s")
    }

    private fun launchAppPeriodically(packageName: String) {
        try {
            val launchIntent = packageManager.getLeanbackLaunchIntentForPackage(packageName)
                ?: packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
                Log.i(TAG, "Auto-launched app: $packageName (will close in ${APP_AUTO_CLOSE_DELAY_MS / 1000}s)")

                // L'app se ferme toute seule après 15s (finishAndRemoveTask)
                // Android ramène automatiquement l'app précédente
            } else {
                Log.w(TAG, "Auto-launch: no intent for $packageName")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Auto-launch failed: ${e.message}")
        }
    }

    private val SETTINGS_PIN = "190326"

    private fun showSettingsPinDialog() {
        val builder = android.app.AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
        builder.setTitle("Code d'accès")
        builder.setMessage("Entrez le code à 6 chiffres pour accéder aux paramètres")

        val input = android.widget.EditText(this).apply {
            inputType = android.text.InputType.TYPE_CLASS_NUMBER or android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD
            maxLines = 1
            hint = "000000"
            gravity = Gravity.CENTER
            textSize = 24f
            val pad = dpToPx(16)
            setPadding(pad, pad, pad, pad)
        }
        // Limit to 6 digits
        input.filters = arrayOf(android.text.InputFilter.LengthFilter(6))
        builder.setView(input)

        builder.setPositiveButton("Valider") { dialog, _ ->
            val entered = input.text.toString()
            if (entered == SETTINGS_PIN) {
                startActivity(Intent(Settings.ACTION_SETTINGS))
            } else {
                android.widget.Toast.makeText(this, "Code incorrect", android.widget.Toast.LENGTH_SHORT).show()
            }
            dialog.dismiss()
        }
        builder.setNegativeButton("Annuler") { dialog, _ -> dialog.cancel() }

        val dialog = builder.create()
        dialog.show()

        // Auto-focus the input and show keyboard
        input.requestFocus()
        dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
    }

    private fun getInstalledLaunchableApps(): List<ResolveInfo> {
        val mainIntent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val allApps = packageManager.queryIntentActivities(mainIntent, 0)
        val hiddenPackages = setOf(
            packageName, // Exclude ourselves
            "com.wolf.google.lm", // Launcher Manager
            "droidlogic.launcher", // Default TV launchers
            "com.google.android.tvlauncher",
            "com.google.android.leanbacklauncher"
        )
        return allApps.filter {
            it.activityInfo.packageName !in hiddenPackages
        }.sortedBy {
            it.loadLabel(packageManager).toString().lowercase()
        }.take(20) // Limit to 20 apps
    }

    // ══════════════════════════════════════════════════
    // JAVASCRIPT BRIDGE — exposes native Android features to the WebView
    // ══════════════════════════════════════════════════

    inner class NeoFilmBridge {

        /**
         * Returns a JSON array of installed launchable apps.
         * Each entry: { packageName, label, icon (base64 PNG) }
         */
        @JavascriptInterface
        fun getInstalledApps(): String {
            val pm = packageManager
            val seenPackages = mutableSetOf<String>()
            val allApps = mutableListOf<android.content.pm.ResolveInfo>()

            // 1. Leanback launcher apps (Android TV specific)
            val leanbackIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
            }
            for (ri in pm.queryIntentActivities(leanbackIntent, 0)) {
                val pkg = ri.activityInfo.packageName
                if (seenPackages.add(pkg)) allApps.add(ri)
            }

            // 2. Regular launcher apps (catches non-TV-optimized apps too)
            val launcherIntent = Intent(Intent.ACTION_MAIN).apply {
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
            for (ri in pm.queryIntentActivities(launcherIntent, 0)) {
                val pkg = ri.activityInfo.packageName
                if (seenPackages.add(pkg)) allApps.add(ri)
            }

            Log.i(TAG, "Bridge: found ${allApps.size} launchable apps (${seenPackages.size} unique packages)")

            val result = StringBuilder("[")
            var first = true
            for (resolveInfo in allApps) {
                val pkg = resolveInfo.activityInfo.packageName
                // Skip our own app
                if (pkg == packageName) continue

                val label = resolveInfo.loadLabel(pm).toString()
                Log.d(TAG, "Bridge: app=$pkg label=$label")

                // Convert icon to base64 (scaled down to 96px to save memory)
                var iconBase64 = ""
                try {
                    val drawable = resolveInfo.loadIcon(pm)
                    val size = 96
                    val bitmap = android.graphics.Bitmap.createBitmap(size, size, android.graphics.Bitmap.Config.ARGB_8888)
                    val canvas = android.graphics.Canvas(bitmap)
                    drawable.setBounds(0, 0, size, size)
                    drawable.draw(canvas)
                    val stream = java.io.ByteArrayOutputStream()
                    bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 80, stream)
                    iconBase64 = android.util.Base64.encodeToString(stream.toByteArray(), android.util.Base64.NO_WRAP)
                    bitmap.recycle()
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to encode icon for $pkg: ${e.message}")
                }

                if (!first) result.append(",")
                first = false
                // Escape label for JSON
                val escapedLabel = label.replace("\\", "\\\\").replace("\"", "\\\"")
                result.append("{\"packageName\":\"$pkg\",\"label\":\"$escapedLabel\",\"icon\":\"$iconBase64\"}")
            }
            result.append("]")
            Log.i(TAG, "Bridge: returning ${allApps.size - 1} apps (excluded self)")
            return result.toString()
        }

        /**
         * Launch an app by package name.
         */
        @JavascriptInterface
        fun launchApp(packageName: String): Boolean {
            // Protect Settings with PIN
            if (packageName == "com.android.tv.settings" || packageName == "com.android.settings") {
                handler.post { showSettingsPinDialog() }
                return true
            }
            return try {
                val launchIntent = packageManager.getLeanbackLaunchIntentForPackage(packageName)
                    ?: packageManager.getLaunchIntentForPackage(packageName)
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    startActivity(launchIntent)
                    Log.i(TAG, "Launched app: $packageName")
                    // Save for AdActivity return
                    prefs.edit().putString("last_foreground_app", packageName).apply()
                    true
                } else {
                    Log.w(TAG, "No launch intent for: $packageName")
                    false
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to launch $packageName: ${e.message}")
                false
            }
        }

        /**
         * Check if running inside Android WebView (vs browser).
         */
        @JavascriptInterface
        fun isAndroidTv(): Boolean = true

        /**
         * Returns the unique ANDROID_ID for this device.
         * Persists across app reinstalls (tied to device + app signing key).
         */
        @JavascriptInterface
        fun getAndroidId(): String {
            return android.provider.Settings.Secure.getString(
                contentResolver,
                android.provider.Settings.Secure.ANDROID_ID
            ) ?: ""
        }

        /**
         * Open a web page in a split-screen browser WebView (left side).
         * NeoFilm main WebView moves to the right (30%) for ads.
         */
        @JavascriptInterface
        fun openWebPage(url: String) {
            handler.post { enterSplitMode(url) }
        }

        /**
         * Open a web page in TRUE full-screen (100% of screen, NeoFilm hidden).
         * Used for TV channels (TF1, France 2, etc.)
         */
        @JavascriptInterface
        fun openWebPageFullscreen(url: String) {
            handler.post { enterFullscreenBrowserMode(url) }
        }

        /**
         * Close the split-screen browser and return to full-screen NeoFilm.
         */
        @JavascriptInterface
        fun closeWebPage() {
            handler.post { exitSplitMode() }
        }

        /**
         * Check if currently in split-screen browser mode.
         */
        @JavascriptInterface
        fun isSplitScreenActive(): Boolean = isSplitMode

        /**
         * Play an HLS/M3U8 stream using Android's native MediaPlayer.
         * This bypasses WebView CORS restrictions — works with any HLS CDN.
         */
        @JavascriptInterface
        fun openNativeHls(url: String) {
            Log.i(TAG, "Bridge: openNativeHls → $url")
            handler.post { showNativeHlsPlayer(url) }
        }

        /**
         * Close the native HLS player and return to normal TV display.
         */
        @JavascriptInterface
        fun closeNativeHls() {
            Log.i(TAG, "Bridge: closeNativeHls")
            handler.post { hideNativeHlsPlayer() }
        }

        /**
         * Called by the web app when the API is unreachable — show native offline overlay.
         */
        @JavascriptInterface
        fun setApiOffline() {
            Log.w(TAG, "Bridge: setApiOffline — showing offline overlay")
            handler.post { showOfflineOverlay() }
        }

        /**
         * Called by the web app when the API is back online — hide offline overlay.
         */
        @JavascriptInterface
        fun setApiOnline() {
            Log.i(TAG, "Bridge: setApiOnline — hiding offline overlay")
            handler.post { hideOfflineOverlay() }
        }

        /**
         * Called by the web app to tell the native side how many ads are available.
         * The AdOverlayService reads this from SharedPreferences to decide whether to show.
         */
        @JavascriptInterface
        fun setAdsAvailable(count: Int) {
            Log.i(TAG, "Bridge: setAdsAvailable($count)")
            prefs.edit().putInt("ads_available_count", count).apply()
        }

        @JavascriptInterface
        fun setAdsData(json: String) {
            Log.i(TAG, "Bridge: setAdsData(${json.take(100)}...)")
            prefs.edit().putString("ads_data_json", json).apply()
            // Pre-download ad videos in background
            AdCacheManager.precacheAds(applicationContext, json)
        }

        @JavascriptInterface
        fun showNativeVideo(url: String, x: Int, y: Int, width: Int, height: Int) {
            Log.i(TAG, "Bridge: showNativeVideo url=${url.takeLast(40)} x=$x y=$y w=$width h=$height")
            handler.post { showNativeVideo(url, x, y, width, height) }
        }

        @JavascriptInterface
        fun hideNativeVideo() {
            Log.i(TAG, "Bridge: hideNativeVideo")
            handler.post { hideNativeVideo() }
        }

        @JavascriptInterface
        fun setWebViewConnected(connected: Boolean) {
            Log.i(TAG, "Bridge: setWebViewConnected($connected)")
            prefs.edit().putBoolean("webview_connected", connected).apply()
        }

        @JavascriptInterface
        fun setDeviceCredentials(token: String, apiUrl: String, deviceId: String, screenId: String) {
            Log.i(TAG, "Bridge: setDeviceCredentials(deviceId=$deviceId, screenId=$screenId)")
            prefs.edit()
                .putString("device_token", token)
                .putString("api_url", apiUrl)
                .putString("device_id", deviceId)
                .putString("screen_id", screenId)
                .apply()
        }
    }

    // ══════════════════════════════════════════════════
    // NATIVE VIDEO OVERLAY (for old WebViews that can't play inline video)
    // ══════════════════════════════════════════════════

    private var adOverlayTexture: TextureView? = null
    private var adOverlayPlayer: android.media.MediaPlayer? = null
    private var adOverlayContainer: FrameLayout? = null

    private fun showNativeVideo(url: String, xPermille: Int, yPermille: Int, wPermille: Int, hPermille: Int) {
        hideNativeVideo()

        val screenW = resources.displayMetrics.widthPixels
        val screenH = resources.displayMetrics.heightPixels
        val x = screenW * xPermille / 1000
        val y = screenH * yPermille / 1000
        val width = screenW * wPermille / 1000
        val height = screenH * hPermille / 1000

        Log.i(TAG, "Native video overlay: screen=${screenW}x${screenH} pos=${x},${y} size=${width}x${height}")

        val container = FrameLayout(this)
        val tv = TextureView(this)
        container.addView(tv, FrameLayout.LayoutParams(width, height))

        val params = FrameLayout.LayoutParams(width, height).apply {
            leftMargin = x
            topMargin = y
        }
        rootLayout.addView(container, params)
        adOverlayContainer = container
        adOverlayTexture = tv

        tv.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(surface: android.graphics.SurfaceTexture, w: Int, h: Int) {
                val mp = android.media.MediaPlayer()
                adOverlayPlayer = mp
                try {
                    mp.setSurface(android.view.Surface(surface))
                    mp.setDataSource(url)
                    mp.isLooping = true
                    mp.setVolume(0f, 0f) // Muted — sidebar ad
                    mp.setOnPreparedListener { it.start() }
                    mp.setOnErrorListener { _, _, _ -> true }
                    mp.prepareAsync()
                    Log.i(TAG, "Native video overlay started: $url")
                } catch (e: Exception) {
                    Log.e(TAG, "Native video overlay failed: ${e.message}")
                }
            }
            override fun onSurfaceTextureSizeChanged(s: android.graphics.SurfaceTexture, w: Int, h: Int) {}
            override fun onSurfaceTextureDestroyed(s: android.graphics.SurfaceTexture): Boolean {
                try { adOverlayPlayer?.release() } catch (_: Exception) {}
                adOverlayPlayer = null
                return true
            }
            override fun onSurfaceTextureUpdated(s: android.graphics.SurfaceTexture) {}
        }
    }

    private fun hideNativeVideo() {
        try { adOverlayPlayer?.release() } catch (_: Exception) {}
        adOverlayPlayer = null
        adOverlayContainer?.let { rootLayout.removeView(it) }
        adOverlayContainer = null
        adOverlayTexture = null
    }

    // ══════════════════════════════════════════════════
    // SPLIT-SCREEN BROWSER MODE
    // ══════════════════════════════════════════════════

    @SuppressLint("SetJavaScriptEnabled")
    private fun enterSplitMode(url: String) {
        if (isSplitMode) {
            // Already in split mode — just navigate the browser
            browserWebView?.loadUrl(url)
            return
        }
        isSplitMode = true
        Log.i(TAG, "Entering split-screen mode: $url")

        // Remove main webView from rootLayout temporarily
        rootLayout.removeView(webView)

        // Create horizontal split container
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.BLACK)
        }

        // ── Left: Browser WebView (70%) ──
        val browser = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                userAgentString = "Mozilla/5.0 (Linux; Android ${Build.VERSION.RELEASE}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            }
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    if (view == null) return
                    val currentUrl = url ?: return

                    // YouTube — poll for URL changes (SPA navigation)
                    // When user clicks a video, URL changes to /watch?v=ID
                    // We detect that and switch to fullscreen embed
                    if (currentUrl.contains("youtube.com") && !currentUrl.contains("youtube.com/embed/")) {
                        view.evaluateJavascript("""
                            (function() {
                                if (window.__nfYtPoll) return;
                                window.__nfYtPoll = true;
                                var lastUrl = location.href;
                                var done = false;
                                var pollId;
                                function checkAndRedirect(url) {
                                    if (done) return;
                                    var match = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                                    if (!match) match = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
                                    if (match) {
                                        done = true;
                                        clearInterval(pollId);
                                        location.href = 'https://www.youtube.com/embed/' + match[1] + '?autoplay=1&controls=1&rel=0&modestbranding=1';
                                    }
                                }
                                pollId = setInterval(function() {
                                    if (location.href !== lastUrl) {
                                        lastUrl = location.href;
                                        checkAndRedirect(location.href);
                                    }
                                }, 300);
                                checkAndRedirect(location.href);
                            })();
                        """.trimIndent(), null)
                        return
                    }

                    // YouTube embed — just black bg
                    if (currentUrl.contains("youtube.com/embed/")) {
                        view.evaluateJavascript("""
                            (function() {
                                document.body.style.background = '#000';
                            })();
                        """.trimIndent(), null)
                        return
                    }

                    // time2replay — hide chrome
                    if (currentUrl.contains("time2replay")) {
                        view.evaluateJavascript("""
                            (function() {
                                if (window.__nf) return;
                                window.__nf = true;
                                var attempts = 0;
                                var poll = setInterval(function() {
                                    attempts++;
                                    var iframe = document.querySelector('iframe');
                                    if (iframe && iframe.offsetHeight > 0) {
                                        clearInterval(poll);
                                        var keep = new Set();
                                        var el = iframe;
                                        while (el) { keep.add(el); el = el.parentElement; }
                                        var bodyChildren = document.body.children;
                                        for (var i = 0; i < bodyChildren.length; i++) {
                                            if (!keep.has(bodyChildren[i])) {
                                                bodyChildren[i].style.visibility = 'hidden';
                                            }
                                        }
                                        document.body.style.background = '#000';
                                        document.documentElement.style.background = '#000';
                                        iframe.scrollIntoView({block:'start'});
                                    }
                                    if (attempts > 60) clearInterval(poll);
                                }, 500);
                            })();
                        """.trimIndent(), null)
                    }
                }

                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                    return false
                }
            }
            webChromeClient = WebChromeClient()
        }
        browserWebView = browser

        val browserParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 7f)
        container.addView(browser, browserParams)

        // ── Divider ──
        val divider = View(this).apply { setBackgroundColor(0xFF333333.toInt()) }
        container.addView(divider, LinearLayout.LayoutParams(dpToPx(2), ViewGroup.LayoutParams.MATCH_PARENT))

        // ── Right: NeoFilm main WebView (30%) ──
        val neofilmParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 3f)
        container.addView(webView, neofilmParams)

        splitContainer = container

        // Add split container to root (index 0, below overlays)
        rootLayout.addView(container, 0, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        // Tell NeoFilm frontend it's now in ad-only mode
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('neofilm-split-mode', { detail: { active: true, url: '$url' } }))",
            null
        )

        // Load the URL in the browser (convert YouTube to embed)
        val videoId = extractYouTubeVideoId(url)
        if (videoId != null) {
            val embedUrl = "https://www.youtube.com/embed/$videoId?autoplay=1&controls=1&rel=0&modestbranding=1"
            val html = """
                <html>
                <head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head>
                <body style="margin:0;padding:0;background:#000;overflow:hidden;">
                <iframe src="$embedUrl" style="position:fixed;top:0;left:0;width:100%;height:100%;border:0;" allow="autoplay;encrypted-media" allowfullscreen></iframe>
                </body></html>
            """.trimIndent()
            browser.loadDataWithBaseURL("https://www.youtube.com", html, "text/html", "UTF-8", null)
        } else {
            browser.loadUrl(url)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun enterFullscreenBrowserMode(url: String) {
        if (isSplitMode) {
            // Already in split mode — upgrade to fullscreen
            browserWebView?.loadUrl(url)
            return
        }
        isSplitMode = true
        Log.i(TAG, "Entering fullscreen browser mode: $url")

        rootLayout.removeView(webView)

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.BLACK)
        }

        val browser = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
                useWideViewPort = true
                loadWithOverviewMode = true
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                textZoom = 100  // Prevent any text-level zoom
                // Desktop UA — sites serve full desktop layout instead of zoomed mobile layout
                userAgentString = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                }
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = false
            }
            webChromeClient = WebChromeClient()
        }
        browserWebView = browser

        // Browser takes 100% of screen
        container.addView(browser, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        splitContainer = container
        rootLayout.addView(container, 0, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        browser.loadUrl(url)
    }

    // ══════════════════════════════════════════════════
    // NATIVE HLS PLAYER (bypasses WebView CORS)
    // ══════════════════════════════════════════════════

    @SuppressLint("ClickableViewAccessibility")
    private fun showNativeHlsPlayer(url: String) {
        hideNativeHlsPlayer() // clean up any previous instance

        val container = FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
        }

        val videoView = android.widget.VideoView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        container.addView(videoView)

        // Back button overlay (top-left)
        val backBtn = android.widget.Button(this).apply {
            text = "←"
            textSize = 22f
            setBackgroundColor(0xCC000000.toInt())
            setTextColor(Color.WHITE)
            setOnClickListener { hideNativeHlsPlayer() }
        }
        val backParams = FrameLayout.LayoutParams(dpToPx(64), dpToPx(48)).apply {
            gravity = Gravity.TOP or Gravity.START
            topMargin = dpToPx(16)
            marginStart = dpToPx(16)
        }
        container.addView(backBtn, backParams)

        rootLayout.addView(container, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        nativeVideoView = videoView
        nativePlayerContainer = container

        try {
            videoView.setVideoURI(android.net.Uri.parse(url))
            videoView.setOnPreparedListener { mp ->
                mp.isLooping = false
                mp.start()
                Log.i(TAG, "Native HLS prepared and started: $url")
            }
            videoView.setOnErrorListener { _, what, extra ->
                Log.e(TAG, "Native HLS error: what=$what extra=$extra url=$url")
                // Notify JS so it can show fallback
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('neofilm-native-player-error'))",
                    null
                )
                hideNativeHlsPlayer()
                true
            }
            videoView.start()
        } catch (e: Exception) {
            Log.e(TAG, "Native HLS exception: ${e.message}")
            hideNativeHlsPlayer()
        }
    }

    private fun hideNativeHlsPlayer() {
        try { nativeVideoView?.stopPlayback() } catch (_: Exception) {}
        adOverlayTexture = null
        nativePlayerContainer?.let {
            try { rootLayout.removeView(it) } catch (_: Exception) {}
        }
        nativePlayerContainer = null
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('neofilm-native-player-closed'))",
            null
        )
        Log.i(TAG, "Native HLS player closed")
    }

    private fun exitSplitMode() {
        if (!isSplitMode) return
        isSplitMode = false
        Log.i(TAG, "Exiting split-screen mode")

        // Remove the split container
        splitContainer?.let { container ->
            // Remove webView from the split container first
            container.removeView(webView)
            // Destroy browser WebView
            browserWebView?.destroy()
            browserWebView = null
            // Remove container from root
            rootLayout.removeView(container)
            splitContainer = null
        }

        // Re-add main webView to root (index 0, below overlays)
        rootLayout.addView(webView, 0, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))

        // Tell NeoFilm frontend to exit ad-only mode
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('neofilm-split-mode', { detail: { active: false } }))",
            null
        )
    }

    // ══════════════════════════════════════════════════
    // LAUNCHER SETUP
    // ══════════════════════════════════════════════════

    private fun promptSetAsLauncher() {
        // Check if we're already the default launcher
        val intent = Intent(Intent.ACTION_MAIN).apply { addCategory(Intent.CATEGORY_HOME) }
        val resolveInfo = packageManager.resolveActivity(intent, android.content.pm.PackageManager.MATCH_DEFAULT_ONLY)
        val currentLauncher = resolveInfo?.activityInfo?.packageName

        if (currentLauncher == packageName) {
            Log.i(TAG, "Already default launcher")
            return
        }

        Log.i(TAG, "Not default launcher (current: $currentLauncher) — prompting user")

        // On first launch, show the HOME chooser dialog
        val chooser = Intent(Intent.ACTION_MAIN).apply {
            addCategory(Intent.CATEGORY_HOME)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        try {
            startActivity(chooser)
        } catch (e: Exception) {
            Log.w(TAG, "Could not show launcher chooser: ${e.message}")
        }
    }

    // OTA UPDATE
    // ══════════════════════════════════════════════════

    private fun checkForUpdate() {
        Thread {
            try {
                val versionCode = BuildConfig.VERSION_CODE
                val variant = "legacy"
                val apiUrl = BuildConfig.TV_APP_URL.replace("/tv-legacy", "").replace("/tv", "")
                val url = java.net.URL("${apiUrl}/api/v1/tv/check-update?versionCode=$versionCode&variant=$variant")
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 10000

                val response = conn.inputStream.bufferedReader().readText()
                conn.disconnect()

                val json = org.json.JSONObject(response)
                val data = if (json.has("data")) json.getJSONObject("data") else json

                if (data.optBoolean("updateAvailable", false)) {
                    val apkUrl = data.optString("apkUrl", "")
                    val versionName = data.optString("versionName", "")
                    val isRequired = data.optBoolean("isRequired", true)

                    Log.i(TAG, "OTA update available: v$versionName (required=$isRequired) — $apkUrl")

                    if (apkUrl.isNotBlank()) {
                        handler.post { downloadAndInstallApk(apkUrl, versionName) }
                    }
                } else {
                    Log.i(TAG, "App is up to date (versionCode=$versionCode)")
                }
            } catch (e: Exception) {
                Log.w(TAG, "OTA check failed: ${e.message}")
            }
        }.start()
    }

    private fun downloadAndInstallApk(apkUrl: String, versionName: String) {
        // Show update overlay
        val updateOverlay = TextView(this).apply {
            text = "Mise à jour v$versionName en cours...\nNe pas éteindre l'appareil."
            setTextColor(android.graphics.Color.WHITE)
            setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 20f)
            gravity = android.view.Gravity.CENTER
            setBackgroundColor(android.graphics.Color.parseColor("#DD000000"))
            setPadding(40, 40, 40, 40)
        }
        rootLayout.addView(updateOverlay, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT
        ))

        Thread {
            try {
                val url = java.net.URL(apkUrl)
                val conn = url.openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 30000
                conn.readTimeout = 60000

                val apkFile = java.io.File(cacheDir, "neofilm-update.apk")
                conn.inputStream.use { input ->
                    apkFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                conn.disconnect()
                Log.i(TAG, "APK downloaded: ${apkFile.length()} bytes")

                // Install via intent
                handler.post {
                    try {
                        val uri = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.N) {
                            androidx.core.content.FileProvider.getUriForFile(
                                this, "$packageName.fileprovider", apkFile
                            )
                        } else {
                            android.net.Uri.fromFile(apkFile)
                        }

                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(uri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(intent)
                    } catch (e: Exception) {
                        Log.e(TAG, "Install failed: ${e.message}")
                        rootLayout.removeView(updateOverlay)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "APK download failed: ${e.message}")
                handler.post { rootLayout.removeView(updateOverlay) }
            }
        }.start()
    }

    // AD OVERLAY SERVICE
    // ══════════════════════════════════════════════════

    private fun startAdOverlayService() {
        Log.i(TAG, "Starting AdOverlayService (Activity-based, no overlay permission needed)")
        requestBatteryOptimizationExemption()
        val intent = Intent(this, AdOverlayService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun requestBatteryOptimizationExemption() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val pm = getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
                if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                    val intent = Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                        data = android.net.Uri.parse("package:$packageName")
                    }
                    try {
                        startActivity(intent)
                    } catch (e: Exception) {
                        Log.w(TAG, "Battery optimization intent not available: ${e.message}")
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to request battery optimization exemption: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "NeoFilmTV"
        private const val TAG_JS = "NeoFilmTV-JS"

        private const val TV_PORT = 3004

        private const val SECRET_PRESS_COUNT = 7
        private const val SECRET_WINDOW_MS = 3000L
        private const val TOUCH_SECRET_PRESS_COUNT = 7
        private const val TOUCH_SECRET_WINDOW_MS = 2000L
        private const val SETTINGS_PIN = "000000"

        private const val RETRY_DELAY_MS = 5_000L // Retry every 5s (was 10s)
        private const val PREFS_NAME = "neofilm_tv_prefs"
        private const val PREF_URL_KEY = "custom_url"
    }
}
