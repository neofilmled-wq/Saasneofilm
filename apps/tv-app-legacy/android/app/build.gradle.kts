plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.neofilm.tv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.neofilm.tv.legacy"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.2.0"

        // Default URL (overridden per build type below)
        buildConfigField("String", "TV_APP_URL", "\"http://10.0.2.2:3004\"")
    }

    buildTypes {
        debug {
            buildConfigField("String", "TV_APP_URL", "\"https://kiki.alkaya.fr/tv-legacy\"")
            isDebuggable = true
        }
        release {
            buildConfigField("String", "TV_APP_URL", "\"https://kiki.alkaya.fr/tv-legacy\"")
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
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
