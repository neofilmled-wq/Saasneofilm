package com.neofilm.tv

import android.content.Context
import android.provider.Settings

/**
 * Stable per-device identifier used to ask the backend "is there an update for ME?".
 *
 * ANDROID_ID is the right choice on Fire Stick / Android TV:
 *  - Survives app reinstall (as long as the signing key stays the same — see android/keystore/)
 *  - Unique per device + per app signing identity (since Android 8)
 *  - Build.SERIAL is deprecated and returns "unknown" on API 26+
 */
object DeviceIdentity {
    fun getSerialNumber(context: Context): String =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
}
