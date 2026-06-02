# NeoFilm TV — OTA Update Runbook

End-to-end guide for the over-the-air APK update system. **Read once before the
first deployment, refer back when something breaks.**

---

## 0. TL;DR

| What | Where | One-line action |
|---|---|---|
| **Keystore** | `apps/tv-app-legacy/android/keystore/` | Back it up TODAY. If lost, every Fire Stick is bricked. |
| **First-time Fire Stick setup** | Each device, once | Run the ADB block in §3 (~3 min/stick) |
| **Publish an update** | `https://<admin>/admin/tv-releases` | Upload APK, click *Publier*. Done. |
| **Devices pull it** | Automatic | ~Instant (via WebSocket) or within 6h (WorkManager) |
| **Install confirmation prompt?** | No, if Device Owner | Else system shows "Installer ?" — manual click |

---

## 1. One-time backend setup

After pulling this code:

```bash
# 1. Regenerate Prisma client (we added AppRelease fields + DeviceUpdateStatus model)
pnpm db:generate

# 2. Apply the new schema
pnpm db:push     # dev
# OR
pnpm db:migrate  # prod (creates a migration file)

# 3. Restart the API
pnpm dev:api
```

The route `POST /api/v1/admin/tv-releases` is now live. The Web Admin sidebar
has a new entry **Mises à jour TV** linking to `/admin/tv-releases`.

S3/MinIO requirement: APKs are stored in the `S3_BUCKET_UPLOADS` bucket under
`apks/legacy/`. No extra bucket needed — the existing one is reused.

---

## 2. Building a signed release APK

```bash
cd apps/tv-app-legacy/android
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk
```

The first run automatically picks up `keystore/signing.properties` and signs
the APK with the keystore. Verify:

```bash
keytool -printcert -jarfile app/build/outputs/apk/release/app-release.apk
# Subject must include: O=NeoFilm SAAS
```

If the SHA-256 differs from the SHA in the keystore, Android will refuse to
install the APK as an update. **Always sign with the same keystore.**

### Backup procedure (DO THIS NOW)

The keystore is at `android/keystore/neofilm-release.jks`. Password is in
`android/keystore/signing.properties`. Both are gitignored. Copy them to:

1. Your password manager (1Password, Bitwarden, etc.)
2. An offline encrypted USB drive
3. A second secure cloud location

If you lose them, you can never update existing installs again — you'd have to
publish under a new package name and re-pair every device.

---

## 3. Provisioning a Fire Stick (one-time, per device)

This step makes NeoFilm a **Device Owner**, which unlocks silent installs (no
"Installer ?" prompt). Without it, OTA still works but a person has to be in
front of the TV to click *Installer* every time.

### Requirements

- A computer with `adb` installed (Android Platform Tools).
- The Fire Stick must be **factory fresh** OR have no other accounts logged in
  on the package manager. Device Owner can only be set when there's exactly
  zero managed accounts.
- The Fire Stick and computer on the same WiFi.

### Steps

```bash
# 1. On the Fire Stick: Settings → My Fire TV → Developer Options → ADB Debugging: ON
# 2. Note its IP: Settings → My Fire TV → About → Network

# 3. From your computer
adb connect <FIRE_STICK_IP>:5555
# First time it prompts on TV to authorize — accept.

# 4. Install our APK
adb install -r app-release.apk

# 5. PROMOTE to Device Owner — this is THE critical step
adb shell dpm set-device-owner com.neofilm.tv.legacy/com.neofilm.tv.NeoFilmDeviceAdmin

# Expected output:
#   Success: Device owner set to package ComponentInfo{com.neofilm.tv.legacy/com.neofilm.tv.NeoFilmDeviceAdmin}

# 6. Reboot
adb reboot
```

The app boots, and on next launch `NeoFilmDeviceAdmin.applyKioskPolicies()`
runs, locking:

- Uninstall blocked
- Factory reset blocked
- Safe boot blocked
- Settings → Apps → NeoFilm → Clear data blocked
- ADB debugging blocked (yes, you lose ADB access after this — see §6 to
  recover)

### "Cannot set device owner — another admin already exists"

If `dpm set-device-owner` fails, the Fire Stick has an Amazon-managed account
or a leftover device admin. Fix:

```bash
# List current device admins
adb shell dumpsys device_policy | head -30

# Factory reset the Fire Stick
adb shell am start -a android.settings.BACKUP_AND_RESET_SETTINGS
# Then on TV: Reset to Factory Defaults
# Skip ALL account setup screens after reset.
# Then retry from step 1.
```

---

## 4. Publishing an update

### From the admin UI (the normal path)

1. Build the signed APK locally (`./gradlew assembleRelease`) — **bump
   `versionCode` in `app/build.gradle.kts`** before building. The number must
   be strictly greater than what's installed.
2. Go to `https://<admin>/admin/tv-releases` → click *Nouvelle release*.
3. Fill the form:
   - **versionName**: human-readable, e.g. `0.3.1`
   - **versionCode**: integer, e.g. `3`. Must be > current.
   - **Variant**: keep `legacy` for Fire Stick.
   - **Rollout %**: start at `10` for canary, then ramp via the patch endpoint.
   - **Forcée**: leave on. Means devices apply on next boot regardless.
   - **Release notes**: short summary; surfaces nowhere user-facing but useful
     for the admin history.
   - **Fichier APK**: pick the `.apk` you built.
4. Click *Publier*.

What happens next:

1. Browser computes SHA-256 of the file locally.
2. Browser uploads it directly to MinIO/S3 (presigned URL).
3. Browser POSTs the release metadata to the API.
4. API verifies the size matches the stored object.
5. API emits `tv:update:available` on the `/devices` WebSocket namespace,
   targeted to eligible devices.
6. Each React TV app receives the event, calls `NeoFilmAndroid.triggerUpdateCheck()`.
7. Native side downloads the APK, verifies the SHA-256, then either:
   - **If Device Owner** → installs silently via `PackageInstaller.Session`.
     The app restarts itself running the new version.
   - **Else** → opens the system installer screen.

### Progressive rollout

Default is 100%. To canary:

1. Publish at `rolloutPercent = 10`. Only 10% of devices (deterministic by
   serial hash) take the update.
2. Wait a few hours. Watch the *Mises à jour TV* → click row → check the
   install status table. Look for SUCCESS / FAILED.
3. If healthy, edit the release in the UI (toggle off / on, or call
   `PATCH /admin/tv-releases/:id { rolloutPercent: 50 }` directly), then 100%.
4. Devices that already took the update are unaffected by later bumps — they
   already have the new version.

Bucketing is stable: the same 10% of devices always get canary updates first.

### Targeting specific screens

For testing on a single Fire Stick in your office before fleet rollout:

```
PATCH /admin/tv-releases/:id
{ "targetScreenIds": ["scr_abc123"] }
```

Only the device assigned to that screen gets the update. Empty array = all.

### Pause a release

In the table, toggle *Active* off. Devices that haven't taken it yet skip it
entirely. Devices that already installed are unaffected.

---

## 5. What devices see

Booting sequence on a Fire Stick that's behind on updates:

1. BOOT_COMPLETED → `BootReceiver` launches `MainActivity` + schedules
   `UpdateWorker` (every 6h).
2. `MainActivity.onCreate` calls `UpdateManager.checkAndInstallIfAvailable()`
   on a background thread.
3. `UpdateManager` calls `GET /api/v1/tv/check-update?versionCode=X&serial=Y`.
4. Backend returns the latest matching `AppRelease`.
5. APK downloaded into `cacheDir/neofilm-update.apk`.
6. SHA-256 verified — mismatch aborts and reports `FAILED`.
7. `PackageInstaller.Session` opens, APK piped in, `commit()` called.
8. System swaps the running app for the new APK.
9. `InstallResultReceiver` fires `STATUS_SUCCESS`, reports back to API.
10. `BootReceiver` re-launches MainActivity since the system killed our
    process during the swap.

Total time on a 50 MB APK over WiFi: **~15-30 seconds, fully unattended**.

Throughout, the Watchdog (`AdOverlayService` + `WatchdogAlarmReceiver`)
ensures the app comes back even if any step crashes.

---

## 6. Troubleshooting

### "Device shows old version forever"

```bash
# Check if the Fire Stick is connected to the backend
# In the admin UI: /admin/devices — look for the device, check appVersion column

# Check the device's last OTA status (if any)
# Admin UI: /admin/tv-releases → click the release → look at the device row
```

If `appVersion` lags but no `DeviceUpdateStatus` exists:
- The device hasn't called `check-update` yet → it's offline or paused.
- Wait up to 6h for the WorkManager tick, OR remotely reboot the device:
  `DeviceGateway.sendCommandToDevice(deviceId, 'reboot')`.

If `DeviceUpdateStatus.status = FAILED`:
- Read `errorMessage`. Common causes:
  - `sha256 mismatch` → S3 file was modified after the release was created.
    Re-upload the same APK as a new release.
  - `INSTALL_FAILED_UPDATE_INCOMPATIBLE` → APK was signed with a different
    keystore. Sign with `keystore/neofilm-release.jks`.
  - `installer rejected the APK` → not a valid APK. Re-export from `assembleRelease`.

### "I want ADB back on a Fire Stick I provisioned"

You disabled ADB when you applied kiosk policies. The only ways back:

```bash
# From the same machine that did the original `adb connect`, you may still have
# an authorized session (Fire OS keeps the auth keys until factory reset).
adb shell pm clear com.neofilm.tv.legacy  # blocked by policy

# True recovery: factory reset.
# Hold Right + Back + Home on the remote for 10s with the Fire Stick on.
```

### "Update never reaches a 10% canary device"

The rollout bucket is computed from the device's ANDROID_ID. To verify a
specific device is in the canary group:

```javascript
// In the Node REPL or a quick test
const { isInRolloutBucket } = require('./modules/tv-releases/tv-releases.gateway');
isInRolloutBucket('<the device ANDROID_ID>', 10);  // true/false
```

If false, ramp to 50% or target the screen explicitly.

### "SHA-256 mismatch on download"

The S3 object was modified (or never finished uploading). Two ways:

1. Re-upload from the admin UI. The `versionCode` must be unique per variant,
   so bump `versionCode` for the new attempt.
2. Or compute the actual SHA-256 of the stored object and PATCH the release:

```bash
curl -o app.apk <apkUrl>
sha256sum app.apk
# Manually update the AppRelease.sha256 in DB (or via Prisma Studio)
```

---

## 7. Architecture diagram

```
                   ┌───────────────────────────────┐
                   │   Admin Web UI                │
                   │   /admin/tv-releases          │
                   └────────┬──────────────────────┘
                            │  1. POST upload-url
                            │  2. PUT to MinIO (presigned)
                            │  3. POST /admin/tv-releases
                            ▼
┌──────────────────────────────────────────────────┐
│  NestJS API                                      │
│  ┌────────────────────┐  ┌─────────────────────┐ │
│  │TvReleasesService   │  │ TvReleasesGateway   │ │
│  │ verify size + hash │  │ broadcasts          │ │
│  │ create AppRelease  │  │  tv:update:available│ │
│  └────────────────────┘  └─────────┬───────────┘ │
│  ┌────────────────────┐            │             │
│  │TvAuthService       │            │             │
│  │ checkUpdate()      │            │             │
│  │ recordUpdateStatus │            │             │
│  └────────────────────┘            │             │
└────────────────────────────────────┼─────────────┘
                                     │ Socket.IO /devices
                                     │
                ┌────────────────────┴─────────────┐
                │  Fire Stick (NeoFilm APK)        │
                │  ┌────────────────────────────┐  │
                │  │ React WebView              │  │
                │  │  use-device-socket         │  │
                │  │  → NeoFilmAndroid.bridge   │  │
                │  └─────────┬──────────────────┘  │
                │            │ JS bridge            │
                │  ┌─────────▼──────────────────┐  │
                │  │ UpdateManager (Kotlin)     │  │
                │  │ + UpdateWorker (every 6h)  │  │
                │  │ + BootReceiver             │  │
                │  │   → PackageInstaller       │  │
                │  │     (silent if Device Owner)│ │
                │  └────────────────────────────┘  │
                └──────────────────────────────────┘
```

---

## 8. Files touched

If you ever need to revisit the design:

**Android (Kotlin)**
- `apps/tv-app-legacy/android/keystore/*` — signing
- `apps/tv-app-legacy/android/app/build.gradle.kts` — signingConfigs + WorkManager dep
- `apps/tv-app-legacy/android/app/src/main/kotlin/com/neofilm/tv/UpdateManager.kt`
- `apps/tv-app-legacy/android/app/src/main/kotlin/com/neofilm/tv/UpdateWorker.kt`
- `apps/tv-app-legacy/android/app/src/main/kotlin/com/neofilm/tv/DeviceIdentity.kt`
- `apps/tv-app-legacy/android/app/src/main/kotlin/com/neofilm/tv/NeoFilmDeviceAdmin.kt`
- `apps/tv-app-legacy/android/app/src/main/kotlin/com/neofilm/tv/MainActivity.kt` (boot wiring + JS bridge)
- `apps/tv-app-legacy/android/app/src/main/kotlin/com/neofilm/tv/BootReceiver.kt`
- `apps/tv-app-legacy/android/app/src/main/AndroidManifest.xml`
- `apps/tv-app-legacy/android/app/src/main/res/xml/device_admin.xml`

**TV React app**
- `apps/tv-app-legacy/src/hooks/use-device-socket.ts` — tv:update:available handler

**Backend (NestJS)**
- `packages/api/src/modules/tv-releases/*` — new module
- `packages/api/src/modules/auth/tv-auth.service.ts` — checkUpdate + recordUpdateStatus
- `packages/api/src/modules/auth/tv-auth.controller.ts` — endpoints
- `packages/api/src/app.module.ts` — registration

**Database**
- `packages/database/prisma/schema.prisma` — AppRelease extended, DeviceUpdateStatus added

**Admin UI**
- `apps/web-admin/src/app/admin/tv-releases/page.tsx`
- `apps/web-admin/src/components/layout/sidebar.tsx` — nav entry
