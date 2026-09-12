# NeoFilm TV Release Keystore

**CRITICAL — DO NOT LOSE THESE FILES.**

If `neofilm-release.jks` is lost or its password forgotten, **no future APK will ever update existing installations**. You would have to publish a new app under a different package name and re-pair every TV.

## Backup

1. Copy `neofilm-release.jks` AND `signing.properties` to:
   - A password manager (1Password, Bitwarden)
   - An offline encrypted USB
   - A second secure location (NOT this Git repo — they are gitignored)
2. Verify the backups work by restoring to a fresh machine and building once.

## Files

- `neofilm-release.jks` — RSA 4096-bit private key, valid 30 years (until ~2056)
- `signing.properties` — passwords and alias. Read by `build.gradle.kts`.

## Rotating the password

The keystore password can be changed without losing the key:

```bash
keytool -storepasswd -keystore neofilm-release.jks
keytool -keypasswd -alias neofilm -keystore neofilm-release.jks
```

Then update `signing.properties` accordingly.

## Verifying the APK is signed correctly

After building a release APK:

```bash
# Get the cert SHA-256 from the keystore
keytool -list -v -keystore neofilm-release.jks -alias neofilm

# Get the cert SHA-256 from the APK
apksigner verify --print-certs path/to/app-release.apk
```

The SHA-256 must match. If it doesn't, the APK will not install over an existing version.
