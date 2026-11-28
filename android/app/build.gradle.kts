import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
}

/** `local.properties` (not committed): the SDK's path, and the path of the Firebase config below. */
val localProperties = Properties().apply {
  rootProject.file("local.properties").takeIf { it.isFile }?.reader()?.use { load(it) }
}

/**
 * The app's Firebase config (notifications through Firebase Cloud Messaging), kept outside this public
 * repository: its path comes from `vigie.firebase.config` in `local.properties` or from the environment
 * variable `VIGIE_FIREBASE_CONFIG`. Its values become the string resources the Google Services plugin would
 * make, which the Firebase docs allow to define by hand
 * (https://firebase.google.com/docs/android/google-services-plugin-and-file). Without the file (the CI), the
 * app is built without notifications: Firebase finds no options and the app does not offer them.
 */
val firebaseResources: Map<String, String> = run {
  val path = localProperties.getProperty("vigie.firebase.config") ?: System.getenv("VIGIE_FIREBASE_CONFIG")
  val config = path?.let { File(it) }?.takeIf { it.isFile } ?: return@run emptyMap()
  @Suppress("UNCHECKED_CAST")
  val json = groovy.json.JsonSlurper().parse(config) as Map<String, Any?>
  val project = json["project_info"] as Map<*, *>
  val client =
    (json["client"] as List<*>).map { it as Map<*, *> }.firstOrNull {
      val info = (it["client_info"] as Map<*, *>)["android_client_info"] as Map<*, *>
      info["package_name"] == "fr.auxfilsdesidees.vigie"
    } ?: error("$config has no client for fr.auxfilsdesidees.vigie")
  val apiKey = ((client["api_key"] as List<*>).first() as Map<*, *>)["current_key"]
  buildMap {
    put("google_app_id", (client["client_info"] as Map<*, *>)["mobilesdk_app_id"].toString())
    put("gcm_defaultSenderId", project["project_number"].toString())
    put("project_id", project["project_id"].toString())
    put("google_api_key", apiKey.toString())
    project["storage_bucket"]?.let { put("google_storage_bucket", it.toString()) }
  }
}

/**
 * The upload key of the builds sent to Google Play, which signs them again with the app's own key (Play App
 * Signing). Kept outside this public repository, and named by the environment only: `VIGIE_UPLOAD_KEYSTORE` (the
 * path of a PKCS12 keystore), `VIGIE_UPLOAD_ALIAS` (`upload` when unset) and `VIGIE_UPLOAD_KEYSTORE_PASSWORD`
 * (also the key's: a PKCS12 keystore has one password). Without `VIGIE_UPLOAD_KEYSTORE` (the CI), the release
 * build is left unsigned.
 */
val uploadKeystore: File? =
  System.getenv("VIGIE_UPLOAD_KEYSTORE")?.let { File(it) }?.also {
    require(it.isFile) { "VIGIE_UPLOAD_KEYSTORE names no file: $it" }
  }

/**
 * The version sent to Google Play, which takes a build only with a higher `versionCode` than the last one:
 * `./gradlew bundleRelease -Pvigie.versionCode=2 -Pvigie.versionName=1.1`. Unset, 1 and « 1.0 ».
 */
val vigieVersionCode: Int =
  providers.gradleProperty("vigie.versionCode").orNull?.let {
    requireNotNull(it.toIntOrNull()?.takeIf { code -> code > 0 }) { "vigie.versionCode is not a positive number: $it" }
  } ?: 1
val vigieVersionName: String = providers.gradleProperty("vigie.versionName").orNull ?: "1.0"

android {
  namespace = "fr.auxfilsdesidees.vigie"
  compileSdk = 37
  defaultConfig {
    applicationId = "fr.auxfilsdesidees.vigie"
    minSdk = 24
    targetSdk = 37
    versionCode = vigieVersionCode
    versionName = vigieVersionName
    firebaseResources.forEach { (name, value) -> resValue("string", name, value) }
  }

  signingConfigs {
    if (uploadKeystore != null) {
      create("upload") {
        storeFile = uploadKeystore
        storeType = "pkcs12"
        storePassword =
          System.getenv("VIGIE_UPLOAD_KEYSTORE_PASSWORD")
            ?: error("VIGIE_UPLOAD_KEYSTORE_PASSWORD is not set: the password of $uploadKeystore")
        keyAlias = System.getenv("VIGIE_UPLOAD_ALIAS") ?: "upload"
        keyPassword = storePassword
      }
    }
  }

  buildTypes {
    release {
      signingConfig = signingConfigs.findByName("upload")
      isMinifyEnabled = false
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
    }
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures {
    compose = true
    aidl = false
    buildConfig = false
    // The Firebase config's values, as string resources (see firebaseResources).
    resValues = true
    shaders = false
  }

  packaging {
    resources {
      excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
  }
}

kotlin {
  // Bytecode for Java 17, compiled by whatever JDK runs Gradle (17 or newer): no toolchain download.
  compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

dependencies {
  val composeBom = platform(libs.androidx.compose.bom)
  implementation(composeBom)
  androidTestImplementation(composeBom)

  // Core Android dependencies
  implementation(libs.androidx.core.ktx)
  implementation(libs.androidx.lifecycle.runtime.ktx)
  implementation(libs.androidx.activity.compose)

  // Arch Components
  implementation(libs.androidx.lifecycle.runtime.compose)
  implementation(libs.androidx.lifecycle.viewmodel.compose)

  // Compose
  implementation(libs.androidx.compose.ui)
  implementation(libs.androidx.compose.ui.tooling.preview)
  implementation(libs.androidx.compose.material3)
  // Tooling
  debugImplementation(libs.androidx.compose.ui.tooling)
  // Instrumented tests
  androidTestImplementation(libs.androidx.compose.ui.test.junit4)
  debugImplementation(libs.androidx.compose.ui.test.manifest)

  // Local tests: jUnit, coroutines, Android runner
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)

  // Instrumented tests: jUnit rules and runners
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.ext.junit)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.espresso.core)

  // Reading the Vigie API (JSON tree, no generated serializers needed)
  implementation(libs.kotlinx.serialization.json)

  // Navigation
  implementation(libs.androidx.navigation3.ui)
  implementation(libs.androidx.navigation3.runtime)
  implementation(libs.androidx.lifecycle.viewmodel.navigation3)

  // Home-screen widgets (Glance) and their refresh every half hour (WorkManager)
  implementation(libs.androidx.glance.appwidget)
  implementation(libs.androidx.work.runtime.ktx)

  // Notifications: Firebase Cloud Messaging (its config stays outside the repository, see above)
  implementation(platform(libs.firebase.bom))
  implementation(libs.firebase.messaging)
  // Play services bring Fragment 1.1.0, older than the activity-result API needs (1.3.0): the release build's
  // lint stops on it (InvalidFragmentVersionForActivityResult). The app has no fragment of its own.
  implementation(libs.androidx.fragment)

  // The sea map: MapLibre Native draws the site's base map (OpenFreeMap, vector tiles) and the pins of the spots
  implementation(libs.maplibre.android)
}
