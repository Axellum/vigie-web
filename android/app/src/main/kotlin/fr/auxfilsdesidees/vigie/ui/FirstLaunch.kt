package fr.auxfilsdesidees.vigie.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.Geo
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

/**
 * The first launch (sketch C, chosen with A): step 1, the place (search or position); step 2, the spots near it, the
 * nearest within 60 km ticked (three at most). « C'est parti » saves both; everything can be changed later in the
 * settings page.
 */
@Composable
internal fun FirstLaunch(viewModel: HomeViewModel) {
  val catalogue by viewModel.catalogue.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { viewModel.loadCatalogue() }
  var step by rememberSaveable { mutableIntStateOf(1) }
  var picked by rememberSaveable(stateSaver = PlaceSaver) { mutableStateOf<Place?>(null) }
  // The ticked spots, null until the user touches one (the suggestion then stands).
  var ticked by rememberSaveable(picked?.lat, picked?.lon) { mutableStateOf<ArrayList<String>?>(null) }
  val place = picked

  SkyPage {
    Text(stringResource(R.string.first_step, step), color = VigieColors.Accent, style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
    if (step == 1 || place == null) {
      Text(stringResource(R.string.first_where), color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
      Text(stringResource(R.string.first_where_text), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
      Glass { PlaceSearch(viewModel, picked) { picked = it } }
      Spacer(Modifier.height(4.dp))
      MainButton(stringResource(R.string.first_next), enabled = place != null) { step = 2 }
    } else {
      Text(stringResource(R.string.first_spots, Words.near(place.nearName)), color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
      when (val c = catalogue) {
        CatalogueState.Idle,
        CatalogueState.Loading -> Text(stringResource(R.string.spots_loading), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
        is CatalogueState.Failed -> {
          Text(c.message, color = VigieColors.Warning, style = MaterialTheme.typography.bodyMedium)
          TextButton(onClick = { viewModel.loadCatalogue(force = true) }) { Text(stringResource(R.string.retry), color = VigieColors.Accent) }
        }
        is CatalogueState.Ready -> {
          val near = Geo.nearest(c.spots, place.lat, place.lon).take(NEAR_COUNT)
          val chosen = ticked ?: ArrayList(Geo.suggested(c.spots, place.lat, place.lon))
          Text(
            stringResource(if (chosen.isEmpty() && ticked == null) R.string.first_spots_far else R.string.first_spots_text),
            color = VigieColors.Text2,
            style = MaterialTheme.typography.bodyMedium,
          )
          Glass {
            near.forEach { (spot, _) ->
              val on = spot.id in chosen
              SpotLine(spot, spot.name, place) {
                Checkbox(
                  checked = on,
                  onCheckedChange = { ticked = ArrayList(if (on) chosen - spot.id else chosen + spot.id) },
                  colors = CheckboxDefaults.colors(checkedColor = VigieColors.Accent, uncheckedColor = VigieColors.Text3, checkmarkColor = VigieColors.OnPill),
                )
              }
            }
          }
        }
      }
      Spacer(Modifier.height(4.dp))
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { step = 1 }) { Text(stringResource(R.string.back), color = VigieColors.Text2) }
        Spacer(Modifier.weight(1f))
        MainButton(stringResource(R.string.first_done), enabled = true) {
          // The ticked spots in distance order: the nearest ticked one goes in the frise.
          val spots = (catalogue as? CatalogueState.Ready)?.spots?.let { all ->
            val chosen = ticked ?: Geo.suggested(all, place.lat, place.lon)
            Geo.nearest(all, place.lat, place.lon).map { it.first.id }.filter { it in chosen }
          }.orEmpty()
          viewModel.clearSearch()
          viewModel.addPlace(place, spots)
        }
      }
    }
  }
}

private const val NEAR_COUNT = 8

@Composable
private fun MainButton(label: String, enabled: Boolean, onClick: () -> Unit) {
  Button(
    onClick = onClick,
    enabled = enabled,
    modifier = Modifier.heightIn(min = 52.dp),
    shape = RoundedCornerShape(26.dp),
    colors =
      ButtonDefaults.buttonColors(
        containerColor = VigieColors.Accent,
        contentColor = VigieColors.OnPill,
        disabledContainerColor = VigieColors.Rule,
        disabledContentColor = VigieColors.Text3,
      ),
  ) {
    Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 18.dp))
  }
}

/** A chosen place survives a rotation or the app being put away: its name, point, region and « Ici » mark in a list. */
private val PlaceSaver =
  Saver<Place?, ArrayList<Any>>(
    save = { p -> if (p == null) arrayListOf() else arrayListOf(p.name, p.lat, p.lon, p.region.orEmpty(), p.here) },
    restore = { l ->
      if (l.size < 3) null
      else Place(l[0] as String, l[1] as Double, l[2] as Double, (l.getOrNull(3) as? String)?.ifEmpty { null }, l.getOrNull(4) as? Boolean ?: false)
    },
  )
