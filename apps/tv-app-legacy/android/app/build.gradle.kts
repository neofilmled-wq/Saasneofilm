import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Load signing config from ../keystore/signing.properties (gitignored).
// See android/keystore/README.md for the keystore backup procedure.
val signingPropsFile = rootProject.file("keystore/signing.properties")
val signingProps = Properties().apply {
    if (signingPropsFile.exists()) FileInputStream(signingPropsFile).use { load(it) }
}

android {
    namespace = "com.neofilm.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.neofilm.tv.legacy"
        minSdk = 26
        targetSdk = 35
        versionCode = 11
        versionName = "0.4.3"

        // Default URL (overridden per build type below)
        buildConfigField("String", "TV_APP_URL", "\"http://10.0.2.2:3004\"")
    }

    signingConfigs {
        if (signingProps.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(signingProps.getProperty("storeFile"))
                storePassword = signingProps.getProperty("storePassword")
                keyAlias = signingProps.getProperty("keyAlias")
                keyPassword = signingProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "TV_APP_URL", "\"https://neofilmapi.alkaya.fr/tv-legacy\"")
            isDebuggable = true
        }
        release {
            buildConfigField("String", "TV_APP_URL", "\"https://neofilmapi.alkaya.fr/tv-legacy\"")
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            // Sign with the release keystore. Without this, every build produces an
            // APK that Android refuses to install as an update (different signature).
            if (signingProps.isNotEmpty()) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.webkit:webkit:1.9.0")
    // Media3 / ExoPlayer — HLS + native Android codecs (HEVC software fallback).
    // Used by showNativeHlsPlayer to avoid the legacy MediaPlayer/VideoView
    // which can't parse most HLS manifests reliably.
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-exoplayer-hls:1.4.1")
    implementation("androidx.media3:media3-ui:1.4.1")
    // WorkManager — schedules the OTA update poll while the app is in background
    // and survives process death / reboot.
    implementation("androidx.work:work-runtime-ktx:2.9.1")
}
