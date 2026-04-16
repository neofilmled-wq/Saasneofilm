package com.neofilm.tv

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONArray

class AdActivity : Activity() {

    companion object {
        private const val TAG = "AdActivity"
        private const val SKIP_DELAY_MS = 5
    }

    private val handler = Handler(Looper.getMainLooper())
    private var returnToPackage: String = ""
    private lateinit var webView: WebView

    data class AdData(
        val fileUrl: String,
        val advertiserName: String,
        val durationMs: Long,
        val mimeType: String,
        val campaignId: String = "",
        val creativeId: String = ""
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        window.addFlags(WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON)

        returnToPackage = intent.getStringExtra("return_to_package") ?: ""

        val prefs = getSharedPreferences("neofilm_tv_prefs", MODE_PRIVATE)
        val allAds = parseAds(prefs.getString("ads_data_json", "[]") ?: "[]")

        if (allAds.isEmpty()) {
            Log.i(TAG, "No ads — closing")
            finishAndReturn()
            return
        }

        val selected = if (allAds.size == 1) listOf(allAds[0]) else allAds.shuffled().take(2)
        Log.i(TAG, "Starting ad sequence: ${selected.size} ad(s)")

        // Build JSON array for JS (include campaignId/creativeId for impression tracking)
        val adsJson = selected.joinToString(",") {
            """{"url":"${it.fileUrl}","name":"${it.advertiserName.replace("\"", "\\\"")}","campaignId":"${it.campaignId}","creativeId":"${it.creativeId}"}"""
        }

        // Get credentials for impression reporting
        val deviceToken = prefs.getString("device_token", "") ?: ""
        val apiUrl = prefs.getString("api_url", "") ?: ""
        val screenId = prefs.getString("screen_id", "") ?: ""
        val deviceId = prefs.getString("device_id", "") ?: ""

        webView = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.apply {
                javaScriptEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                domStorageEnabled = true
            }
            webChromeClient = WebChromeClient()
            webViewClient = WebViewClient()
            addJavascriptInterface(AdBridge(), "AdBridge")
        }

        setContentView(webView)

        val html = buildAdHtml(adsJson, SKIP_DELAY_MS, deviceToken, apiUrl, screenId, deviceId)
        webView.loadDataWithBaseURL("https://neofilmapi.alkaya.fr", html, "text/html", "utf-8", null)
    }

    private fun buildAdHtml(adsJson: String, skipDelay: Int, token: String, apiUrl: String, screenId: String, deviceId: String): String {
        return """
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;overflow:hidden;font-family:sans-serif}
#player{width:100vw;height:100vh;object-fit:contain;background:#000}
#badge{position:fixed;top:20px;left:30px;color:rgba(255,255,255,0.7);font-size:16px;z-index:10}
#skip{position:fixed;bottom:30px;right:30px;color:#fff;font-size:18px;font-weight:bold;
  background:rgba(0,0,0,0.8);padding:12px 24px;z-index:10;cursor:pointer;border:none;outline:none}
#skip:focus{outline:2px solid #fff}
#skip.hidden{display:none}
</style></head><body>
<div id="badge"></div>
<video id="player" playsinline></video>
<button id="skip" class="hidden"></button>
<script>
const ads = [$adsJson];
const SKIP_DELAY = $skipDelay;
const API_URL = '$apiUrl';
const TOKEN = '$token';
const SCREEN_ID = '$screenId';
const DEVICE_ID = '$deviceId';
let currentIndex = 0;
let skipTimer = null;
let countdown = SKIP_DELAY;
let canSkip = false;
let adStartTime = null;

function reportImpression(ad, startTime, endTime, skipped) {
    if (!API_URL || !TOKEN) return;
    var proofId = Date.now() + '-' + Math.random().toString(36).slice(2,10);
    var body = JSON.stringify({
        deviceId: DEVICE_ID,
        batchId: proofId,
        proofs: [{
            proofId: proofId,
            screenId: SCREEN_ID,
            campaignId: ad.campaignId || '',
            creativeId: ad.creativeId || '',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            durationMs: endTime.getTime() - startTime.getTime(),
            triggerContext: skipped ? 'CHANGE_APP' : 'SCHEDULED',
            appVersion: '1.0.0',
            mediaHash: 'none',
            signature: 'none'
        }]
    });
    fetch(API_URL + '/tv/ads/event/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
        body: body
    }).catch(function(){});
}

const player = document.getElementById('player');
const badge = document.getElementById('badge');
const skip = document.getElementById('skip');

function playAd(index) {
    if (index >= ads.length) {
        AdBridge.onAllAdsDone();
        return;
    }
    currentIndex = index;
    const ad = ads[index];
    badge.textContent = 'Publicite - ' + ad.name + ' (' + (index+1) + '/' + ads.length + ')';

    skip.className = 'hidden';
    canSkip = false;
    if (skipTimer) clearInterval(skipTimer);

    player.src = ad.url;
    player.load();
    player.play().catch(function(e) { console.log('play error', e); });
}

player.addEventListener('playing', function() {
    adStartTime = new Date();
    countdown = SKIP_DELAY;
    skip.textContent = 'Passer dans ' + countdown + 's';
    skip.className = '';

    skipTimer = setInterval(function() {
        countdown--;
        if (countdown <= 0) {
            clearInterval(skipTimer);
            skip.textContent = 'Passer  \u25B6\u25B6';
            canSkip = true;
            skip.focus();
        } else {
            skip.textContent = 'Passer dans ' + countdown + 's';
        }
    }, 1000);
});

player.addEventListener('ended', function() {
    if (skipTimer) clearInterval(skipTimer);
    if (adStartTime) reportImpression(ads[currentIndex], adStartTime, new Date(), false);
    playAd(currentIndex + 1);
});

player.addEventListener('error', function() {
    if (skipTimer) clearInterval(skipTimer);
    playAd(currentIndex + 1);
});

skip.addEventListener('click', function() {
    if (!canSkip) return;
    if (skipTimer) clearInterval(skipTimer);
    if (adStartTime) reportImpression(ads[currentIndex], adStartTime, new Date(), true);
    player.pause();
    playAd(currentIndex + 1);
});

// D-pad enter support
document.addEventListener('keydown', function(e) {
    if ((e.key === 'Enter' || e.keyCode === 13) && canSkip) {
        skip.click();
    }
});

// Start first ad
playAd(0);
</script>
</body></html>
"""
    }

    inner class AdBridge {
        @JavascriptInterface
        fun onAllAdsDone() {
            Log.i(TAG, "All ads done — returning")
            handler.post { finishAndReturn() }
        }
    }

    private fun finishAndReturn() {
        // Simply move to back — Android will show whatever was in front before (YouTube, etc.)
        moveTaskToBack(true)
        finish()
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) return true
        return super.onKeyDown(keyCode, event)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        try { webView.destroy() } catch (_: Exception) {}
        super.onDestroy()
    }

    private fun parseAds(json: String): List<AdData> {
        val result = mutableListOf<AdData>()
        try {
            val arr = JSONArray(json)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                val fileUrl = obj.optString("fileUrl", "")
                if (fileUrl.isBlank()) continue
                result.add(AdData(
                    fileUrl = fileUrl,
                    advertiserName = obj.optString("advertiserName", ""),
                    durationMs = obj.optLong("durationMs", 15000),
                    mimeType = obj.optString("mimeType", "video/mp4"),
                    campaignId = obj.optString("campaignId", ""),
                    creativeId = obj.optString("creativeId", "")
                ))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Parse error: ${e.message}")
        }
        return result
    }
}
