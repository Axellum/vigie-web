package fr.auxfilsdesidees.vigie

import android.Manifest
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import fr.auxfilsdesidees.vigie.data.AppData
import fr.auxfilsdesidees.vigie.data.VigieRepository
import fr.auxfilsdesidees.vigie.notify.Bells
import fr.auxfilsdesidees.vigie.notify.PhoneBells
import fr.auxfilsdesidees.vigie.notify.VigieNotifications
import fr.auxfilsdesidees.vigie.ui.theme.VigieTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
  /** The place a widget or a notification was touched for: the app opens on it (see [MainNavigation]). */
  private val placeAsked = MutableStateFlow<Asked?>(null)

  /** A debug build only: the notification permission, then the token in the log (see [debugToken]). */
  private val askNotifications =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { debugToken() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // The sky is dark in every theme of the charter's default: light system icons over it.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    val baseUrl = localApi() ?: VigieRepository.BASE_URL
    if (savedInstanceState == null) {
      placeAsked.value = asked(intent)
      if (debuggable()) PhoneBells.useLocalSite(this, localSite())
    }
    setContent { VigieTheme { MainNavigation(baseUrl, placeAsked) } }
    if (savedInstanceState == null && debuggable() && intent?.getBooleanExtra(EXTRA_DEBUG_TOKEN, false) == true) {
      askDebugToken()
    }
  }

  /**
   * A debug build only, to try Firebase Cloud Messaging before the app has its own screen for it:
   * `adb shell am start -S -n fr.auxfilsdesidees.vigie/.MainActivity --ez vigie_debug_token true` asks the
   * notification permission, makes the two categories and writes the token in the log (tag `VigieNotify`).
   */
  private fun askDebugToken() {
    if (!VigieNotifications.available(this)) {
      Log.w(DEBUG_TAG, "No Firebase config in this build: no notifications")
      return
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !VigieNotifications.allowed(this)) {
      askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      debugToken()
    }
  }

  private fun debugToken() {
    lifecycleScope.launch {
      VigieNotifications.makeChannels(this@MainActivity)
      runCatching { VigieNotifications.token(this@MainActivity) }
        .onSuccess { Log.d(DEBUG_TAG, "allowed=${VigieNotifications.allowed(this@MainActivity)} token=$it") }
        .onFailure { Log.w(DEBUG_TAG, "No token", it) }
    }
  }

  private fun debuggable(): Boolean = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0

  /** A widget or a notification touched while the app is open: the same activity shows its place. */
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    asked(intent)?.let { placeAsked.value = it }
  }

  /**
   * The place asked by the launch: a widget's key, or the point of a notification's place (its `data.place`, which
   * Android puts in the extras when it shows the message itself) for its warnings. A place no longer followed: none.
   */
  private fun asked(intent: Intent?): Asked? {
    intent ?: return null
    intent.getStringExtra(EXTRA_PLACE)?.let { return Asked(it) }
    val point = intent.getStringExtra(VigieNotifications.EXTRA_POINT) ?: return null
    return Bells.placeOf(AppData.places(this).load(), point)?.let { Asked(it.key, warnings = true) }
  }

  /**
   * A debug build only, for trying the bells against a local site: `adb reverse tcp:4174 tcp:4174`, then
   * `--es vigie_site_url http://127.0.0.1:4174`. The bells go there until the next start without the extra.
   */
  private fun localSite(): String? = intent?.getStringExtra(EXTRA_SITE_URL)?.trimEnd('/')?.takeIf { LOOPBACK.matches(it) }

  /**
   * A debug build only, for trying an API that is not deployed yet: `adb reverse tcp:8080 tcp:8080`, then
   * `adb shell am start -n fr.auxfilsdesidees.vigie/.MainActivity --es vigie_base_url http://127.0.0.1:8080`.
   * The loopback address alone is accepted; a release build ignores the extra.
   */
  private fun localApi(): String? {
    if (!debuggable()) return null
    val url = intent?.getStringExtra(EXTRA_BASE_URL) ?: return null
    return url.trimEnd('/').takeIf { LOOPBACK.matches(it) }
  }

  companion object {
    const val EXTRA_BASE_URL = "vigie_base_url"
    const val EXTRA_SITE_URL = "vigie_site_url"
    const val EXTRA_DEBUG_TOKEN = "vigie_debug_token"
    private const val DEBUG_TAG = "VigieNotify"

    /** The key of a followed place ([fr.auxfilsdesidees.vigie.data.FollowedPlace.key]) to show at once. */
    const val EXTRA_PLACE = "vigie_place"
    private val LOOPBACK = Regex("""http://(127\.0\.0\.1|localhost):\d{2,5}""")
  }
}
