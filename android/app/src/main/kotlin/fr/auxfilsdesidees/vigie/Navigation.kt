package fr.auxfilsdesidees.vigie

import androidx.compose.runtime.Composable
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberNavBackStack
import androidx.navigation3.ui.NavDisplay
import fr.auxfilsdesidees.vigie.ui.VigieApp

/** One destination for now (the three tabs); the spot page and the settings come as new keys next to [Main]. */
@Composable
fun MainNavigation(baseUrl: String) {
  val backStack = rememberNavBackStack(Main)

  NavDisplay(
    backStack = backStack,
    onBack = { backStack.removeLastOrNull() },
    entryProvider = entryProvider { entry<Main> { VigieApp(baseUrl) } },
  )
}
