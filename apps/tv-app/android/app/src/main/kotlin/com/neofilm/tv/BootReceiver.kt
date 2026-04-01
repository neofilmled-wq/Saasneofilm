package com.neofilm.tv

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Log.i("BootReceiver", "Received: ${intent.action}")
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_SCREEN_ON -> {
                // Launch MainActivity (which starts AdOverlayService)
                val launchIntent = Intent(context, MainActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                context.startActivity(launchIntent)

                // Also start AdOverlayService directly in case MainActivity is already running
                try {
                    val serviceIntent = Intent(context, AdOverlayService::class.java)
                    context.startForegroundService(serviceIntent)
                } catch (e: Exception) {
                    Log.e("BootReceiver", "Failed to start AdOverlayService: ${e.message}")
                }
            }
        }
    }
}
