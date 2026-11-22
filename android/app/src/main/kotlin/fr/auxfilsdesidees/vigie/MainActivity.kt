package fr.auxfilsdesidees.vigie

import android.content.pm.ApplicationInfo
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import fr.auxfilsdesidees.vigie.data.VigieRepository
import fr.auxfilsdesidees.vigie.ui.theme.VigieTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // The sky is dark in every theme of the charter's default: light system icons over it.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    val baseUrl = localApi() ?: VigieRepository.BASE_URL
    setContent { VigieTheme { MainNavigation(baseUrl) } }
  }

  /**
   * A debug build only, for trying an API that is not deployed yet: `adb reverse tcp:8080 tcp:8080`, then
   * `adb shell am start -n fr.auxfilsdesidees.vigie/.MainActivity --es vigie_base_url http://127.0.0.1:8080`.
   * The loopback address alone is accepted; a release build ignores the extra.
   */
  private fun localApi(): String? {
    val debuggable = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    if (!debuggable) return null
    val url = intent?.getStringExtra(EXTRA_BASE_URL) ?: return null
    return url.trimEnd('/').takeIf { LOOPBACK.matches(it) }
  }

  companion object {
    const val EXTRA_BASE_URL = "vigie_base_url"
    private val LOOPBACK = Regex("""http://(127\.0\.0\.1|localhost):\d{2,5}""")
  }
}
