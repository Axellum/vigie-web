import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.compose.compiler)
  alias(libs.plugins.kotlin.serialization)
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
  val props = Properties()
  rootProject.file("local.properties").takeIf { it.isFile }?.reader()?.use { props.load(it) }
  val path = props.getProperty("vigie.firebase.config") ?: System.getenv("VIGIE_FIREBASE_CONFIG")
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

android {
  namespace = "fr.auxfilsdesidees.vigie"
  compileSdk = 37
  defaultConfig {
    applicationId = "fr.auxfilsdesidees.vigie"
    minSdk = 24
    targetSdk = 37
    versionCode = 1
    versionName = "1.0"
    firebaseResources.forEach { (name, value) -> resValue("string", name, value) }
  }

  buildTypes {
    release {
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
}
