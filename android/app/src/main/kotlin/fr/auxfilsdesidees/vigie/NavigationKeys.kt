package fr.auxfilsdesidees.vigie

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable data object Main : NavKey

@Serializable data object Settings : NavKey

/** The official warnings of the place shown, in full (opened from the banner of the Accueil, or by a notification). */
@Serializable data object WarningsPage : NavKey

/**
 * A followed place to show at once ([fr.auxfilsdesidees.vigie.data.FollowedPlace.key]): a widget touched opens the tabs on
 * it, a notification touched opens its warnings ([warnings]).
 */
data class Asked(val key: String, val warnings: Boolean = false)
