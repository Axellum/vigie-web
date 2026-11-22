package fr.auxfilsdesidees.vigie

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.edit
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import fr.auxfilsdesidees.vigie.data.FolderShelf
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.OfflineCopies
import fr.auxfilsdesidees.vigie.data.PlacesStore
import fr.auxfilsdesidees.vigie.data.VigieRepository
import fr.auxfilsdesidees.vigie.ui.HomeViewModel
import fr.auxfilsdesidees.vigie.ui.SettingsScreen
import fr.auxfilsdesidees.vigie.ui.VigieApp
import fr.auxfilsdesidees.vigie.ui.WarningsScreen
import java.io.File

/**
 * Three destinations: the three tabs ([Main]), the page « Mes lieux et mes spots » ([Settings]) and the official warnings
 * of the place shown ([WarningsPage]). One view model for all, held by the activity, so a choice made in the settings is
 * on the tabs when the user comes back. Instant, by taste.
 */
@Composable
fun MainNavigation(baseUrl: String) {
  val context = LocalContext.current.applicationContext
  val viewModel: HomeViewModel = viewModel {
    // The last read of each place, in the app's own folder that the phone's backup leaves out (it is redone in seconds).
    val copies = OfflineCopies(FolderShelf(File(context.noBackupFilesDir, COPIES)))
    HomeViewModel(
      VigieRepository(baseUrl, copies = copies),
      PlacesStore(PrefsKeyValue(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE))),
    )
  }
  val backStack = rememberNavBackStack(Main)
  val instant = { EnterTransition.None togetherWith ExitTransition.None }

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    transitionSpec = { instant() },
    popTransitionSpec = { instant() },
    predictivePopTransitionSpec = { instant() },
    entryProvider =
      entryProvider {
        entry<Main> { VigieApp(viewModel, onSettings = { backStack.add(Settings) }, onWarnings = { backStack.add(WarningsPage) }) }
        entry<Settings> { SettingsScreen(viewModel) { backStack.removeLastOrNull() } }
        entry<WarningsPage> { WarningsScreen(viewModel) { backStack.removeLastOrNull() } }
      },
  )
}

private const val PREFS = "vigie"
private const val COPIES = "places"

/** The app's private preferences on the phone (never shared with another app). */
private class PrefsKeyValue(private val prefs: SharedPreferences) : KeyValue {
  override fun read(key: String): String? = prefs.getString(key, null)

  override fun write(key: String, value: String) = prefs.edit { putString(key, value) }
}
