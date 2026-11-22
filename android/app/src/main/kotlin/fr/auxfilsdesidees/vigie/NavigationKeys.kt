package fr.auxfilsdesidees.vigie

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable data object Main : NavKey

@Serializable data object Settings : NavKey

/** The official warnings of the place shown, in full (opened from the banner of the Accueil). */
@Serializable data object WarningsPage : NavKey
