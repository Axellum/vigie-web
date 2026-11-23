package fr.auxfilsdesidees.vigie

import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.togetherWith
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import fr.auxfilsdesidees.vigie.data.AppData
import fr.auxfilsdesidees.vigie.notify.PhoneBells
import fr.auxfilsdesidees.vigie.ui.BellLink
import fr.auxfilsdesidees.vigie.ui.HomeViewModel
import fr.auxfilsdesidees.vigie.ui.SettingsScreen
import fr.auxfilsdesidees.vigie.ui.VigieApp
import fr.auxfilsdesidees.vigie.ui.WarningsScreen
import fr.auxfilsdesidees.vigie.widget.WidgetRefresh
import kotlinx.coroutines.flow.MutableStateFlow

/**
 * Three destinations: the three tabs ([Main]), the page « Mes lieux et mes spots » ([Settings]) and the official warnings
 * of the place shown ([WarningsPage]). One view model for all, held by the activity, so a choice made in the settings is
 * on the tabs when the user comes back. Instant, by taste.
 *
 * [placeAsked] is the place a widget or a notification was touched for: the tabs come back and show it (with its warnings
 * for a notification), then it is cleared.
 */
@Composable
fun MainNavigation(baseUrl: String, placeAsked: MutableStateFlow<Asked?>) {
  val context = LocalContext.current.applicationContext
  val viewModel: HomeViewModel = viewModel {
    HomeViewModel(
      AppData.repository(context, baseUrl),
      AppData.places(context),
      // The widgets show what the app reads: a new read or a place removed redraws them.
      onChange = { WidgetRefresh.redraw(context) },
      bellLink = BellLink({ PhoneBells.run(context) }, { PhoneBells.test(context) }),
    )
  }
  val backStack = rememberNavBackStack(Main)
  val instant = { EnterTransition.None togetherWith ExitTransition.None }
  val asked by placeAsked.collectAsStateWithLifecycle()
  LaunchedEffect(asked) {
    val place = asked ?: return@LaunchedEffect
    viewModel.show(place.key)
    while (backStack.size > 1) backStack.removeLastOrNull()
    if (place.warnings) backStack.add(WarningsPage)
    placeAsked.value = null
  }

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
