package com.neofilm.tv

import android.app.admin.DeviceAdminReceiver
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.UserManager
import android.util.Log

/**
 * Device Admin / Device Owner receiver.
 *
 * Two modes:
 *  - Device Admin (legacy): user enables via Settings → Security. Unlocks force-lock
 *    and some policies but NOT silent app install.
 *  - Device Owner (the goal): provisioned ONCE via ADB on a factory-fresh device:
 *      adb shell dpm set-device-owner com.neofilm.tv.legacy/com.neofilm.tv.NeoFilmDeviceAdmin
 *    Unlocks PackageInstaller silent install, prevents uninstall, lets us lock
 *    factory reset and clear-data attempts from the locataire.
 *
 * onEnabled fires after Device Owner is granted (or Device Admin enabled) — at
 * that point we apply the kiosk lockdown policies in one shot.
 */
class NeoFilmDeviceAdmin : DeviceAdminReceiver() {
    companion object {
        private const val TAG = "NeoFilmDeviceAdmin"

        fun component(context: Context): ComponentName =
            ComponentName(context, NeoFilmDeviceAdmin::class.java)

        /**
         * Apply every kiosk-grade restriction we can. Idempotent. Safe to call
         * repeatedly — Android no-ops on already-set restrictions.
         *
         * Only effective when the app is Device Owner. When called as a plain
         * Device Admin, every call below throws SecurityException, which we
         * swallow individually so partial provisioning still applies what it can.
         */
        fun applyKioskPolicies(context: Context) {
            val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager ?: return
            val admin = component(context)
            val pkg = context.packageName

            if (!dpm.isDeviceOwnerApp(pkg)) {
                Log.w(TAG, "Not Device Owner — kiosk policies skipped. See android/keystore/README.md for provisioning.")
                return
            }

            safe("DISALLOW_UNINSTALL_APPS") {
                dpm.addUserRestriction(admin, UserManager.DISALLOW_UNINSTALL_APPS)
            }
            safe("DISALLOW_FACTORY_RESET") {
                dpm.addUserRestriction(admin, UserManager.DISALLOW_FACTORY_RESET)
            }
            safe("DISALLOW_SAFE_BOOT") {
                dpm.addUserRestriction(admin, UserManager.DISALLOW_SAFE_BOOT)
            }
            safe("DISALLOW_ADD_USER") {
                dpm.addUserRestriction(admin, UserManager.DISALLOW_ADD_USER)
            }
            safe("DISALLOW_MOUNT_PHYSICAL_MEDIA") {
                dpm.addUserRestriction(admin, UserManager.DISALLOW_MOUNT_PHYSICAL_MEDIA)
            }
            safe("DISALLOW_DEBUGGING_FEATURES") {
                // Locks ADB so a locataire can't `adb uninstall` our package.
                // We can still update OTA since we're Device Owner.
                dpm.addUserRestriction(admin, UserManager.DISALLOW_DEBUGGING_FEATURES)
            }
            // Block clear-data attempts on our own package — a guest who pokes
            // around Settings → Apps can't wipe our device token.
            safe("setUninstallBlocked") {
                dpm.setUninstallBlocked(admin, pkg, true)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                safe("setKeyguardDisabled") {
                    dpm.setKeyguardDisabled(admin, true)
                }
            }
            // Make NeoFilm the persistent foreground app — guests can press Home
            // but the launcher chooser stays restricted to NeoFilm.
            safe("setLockTaskPackages") {
                dpm.setLockTaskPackages(admin, arrayOf(pkg))
            }
            Log.i(TAG, "Kiosk policies applied")
        }

        private inline fun safe(label: String, block: () -> Unit) {
            try { block() } catch (e: Exception) {
                Log.w(TAG, "Policy $label failed: ${e.message}")
            }
        }
    }

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i(TAG, "Device Admin enabled — applying kiosk policies")
        applyKioskPolicies(context)
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.w(TAG, "Device Admin disabled — kiosk lockdown lifted")
    }

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        Log.i(TAG, "Device Owner provisioning complete — applying kiosk policies")
        applyKioskPolicies(context)
    }
}
