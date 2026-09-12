import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Load signing config from ../keystore/signing.properties (gitignored).
// Same keystore as the other NeoFilm apps → consistent signature for OTA.
val signingPropsFile = rootProject.file("keystore/signing.properties")
val signingProps = Properties().apply {
    if (signingPropsFile.exists()) FileInputStream(signingPropsFile).use { load(it) }
}

android {
    namespace = "com.neofilm.coworking"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.neofilm.coworking"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1"

        // Default URL (overridden per build type below)
        buildConfigField("String", "CW_APP_URL", "\"http://10.0.2.2:3006\"")
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
            buildConfigField("String", "CW_APP_URL", "\"https://neofilmapi.alkaya.fr/coworking\"")
            isDebuggable = true
        }
        release {
            buildConfigField("String", "CW_APP_URL", "\"https://neofilmapi.alkaya.fr/coworking\"")
            // Lean app — keep the JS bridge intact; no minification for now.
            isMinifyEnabled = false
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
}
