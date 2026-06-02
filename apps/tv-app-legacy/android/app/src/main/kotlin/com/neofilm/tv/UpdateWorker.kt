package com.neofilm.tv

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * Periodic OTA check.
 *
 * Runs every ~6 hours on a CONNECTED network, regardless of whether the app is
 * in the foreground. Survives reboot (re-scheduled by BootReceiver) and process
 * death (WorkManager persists the request in its own DB).
 *
 * If a long-running TV session never reboots and the app stays in onCreate
 * forever, this is the path that actually pulls down the new APK.
 */
class UpdateWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        Log.i(TAG, "UpdateWorker tick")
        val outcome = UpdateManager.checkAndInstallIfAvailable(applicationContext)
        Log.i(TAG, "UpdateWorker outcome: $outcome")
        // Always return success — the worker should keep running on its schedule.
        // Errors are reported to the backend by UpdateManager itself.
        return Result.success()
    }

    companion object {
        private const val TAG = "NeoFilmUpdateWorker"
        private const val WORK_NAME = "neofilm-ota-check"

        /**
         * Idempotent — safe to call from onCreate, BootReceiver, or anywhere.
         * KEEP policy means the existing schedule wins if one is already enqueued.
         */
        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<UpdateWorker>(
                repeatInterval = 6, repeatIntervalTimeUnit = TimeUnit.HOURS,
                flexTimeInterval = 1, flexTimeIntervalUnit = TimeUnit.HOURS,
            )
                .setConstraints(constraints)
                .setInitialDelay(15, TimeUnit.MINUTES)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
            Log.i(TAG, "OTA periodic check scheduled (every ~6h)")
        }
    }
}
