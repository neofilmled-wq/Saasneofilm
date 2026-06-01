package com.neofilm.tv

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.util.Log

/**
 * External-to-process keepalive — fires every WATCHDOG_INTERVAL_MS via
 * AlarmManager and makes sure AdOverlayService (and its kiosk watchdog)
 * is running.
 *
 * Because the system AlarmManager calls into this receiver via a brand-new
 * process if needed, this is the ONLY way to revive NeoFilm after Android
 * has killed the whole app process (e.g. after a long TNT session that
 * pushed the foreground service out of memory).
 *
 * On Fire OS there is no Doze mode, so 1-minute alarms generally fire on
 * schedule. Android may defer them a bit but rarely beyond a few minutes.
 */
class WatchdogAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WatchdogAlarmReceiver"
        const val ACTION_TICK = "com.neofilm.tv.WATCHDOG_TICK"
        private const val ALARM_REQUEST_CODE = 4242
        private const val WATCHDOG_INTERVAL_MS = 60_000L // 1 minute

        fun scheduleNext(context: Context) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(context, WatchdogAlarmReceiver::class.java).apply {
                action = ACTION_TICK
            }
            val pi = PendingIntent.getBroadcast(
                context, ALARM_REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val triggerAt = SystemClock.elapsedRealtime() + WATCHDOG_INTERVAL_MS
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setExactAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
                } else {
                    am.setExact(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi)
                }
                Log.d(TAG, "Next watchdog tick scheduled in ${WATCHDOG_INTERVAL_MS / 1000}s")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to schedule alarm: ${e.message}")
            }
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "Watchdog tick: ${intent.action}")
        try {
            val svcIntent = Intent(context, AdOverlayService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svcIntent)
            } else {
                context.startService(svcIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to (re)start AdOverlayService: ${e.message}")
        }
        // Always re-schedule the next tick even if start failed — the receiver
        // can be invoked from a fresh process and we want the chain to live on.
        scheduleNext(context)
    }
}
