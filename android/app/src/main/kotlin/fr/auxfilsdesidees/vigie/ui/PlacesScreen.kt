package fr.auxfilsdesidees.vigie.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.Bell
import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.Geo
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PlaceHit
import fr.auxfilsdesidees.vigie.notify.PhoneAccount
import fr.auxfilsdesidees.vigie.notify.VigieNotifications
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import kotlinx.coroutines.launch

/**
 * The page « Mes lieux et mes spots » (sketch A, chosen by the author): the followed places (touch one to show it,
 * cross to stop following it), « Ajouter un lieu » by name or position, then the spots of the shown place (the star
 * marks the one drawn in the frise) and the nearest other spots to add.
 */
@Composable
internal fun SettingsScreen(viewModel: HomeViewModel, onBack: () -> Unit) {
  val app by viewModel.app.collectAsStateWithLifecycle()
  val catalogue by viewModel.catalogue.collectAsStateWithLifecycle()
  val bells by viewModel.bells.collectAsStateWithLifecycle()
  val context = LocalContext.current
  // A build without a Firebase config (the CI's) has no bell at all.
  val canNotify = remember { VigieNotifications.available(context) }
  LaunchedEffect(Unit) {
    viewModel.loadCatalogue()
    if (canNotify) viewModel.openBells()
  }
  var adding by rememberSaveable { mutableStateOf(false) }
  var exists by remember { mutableStateOf(false) }
  val choices = app.choices

  // The bells: the window of a place's bell, then Android's permission (Android 13 and later) when a bell turns on.
  var bellFor by rememberSaveable { mutableStateOf<Int?>(null) }
  var waiting by remember { mutableStateOf<Pair<Int, Bell>?>(null) }
  var denied by rememberSaveable { mutableStateOf(false) }
  val askPermission =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
      val (index, bell) = waiting ?: return@rememberLauncherForActivityResult
      waiting = null
      denied = !ok
      if (ok) viewModel.setBell(index, bell)
    }

  fun chooseBell(index: Int, bell: Bell?) {
    bellFor = null
    if (bell != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !VigieNotifications.allowed(context)) {
      waiting = index to bell
      askPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      denied = false
      viewModel.setBell(index, bell)
    }
  }

  // The account: the same permission before a code is asked.
  val account: AccountViewModel? =
    if (canNotify) viewModel { AccountViewModel(PhoneAccount.linking(context.applicationContext), PhoneAccount::describe) } else null
  val accountUi = account?.ui?.collectAsStateWithLifecycle()
  var accountDenied by rememberSaveable { mutableStateOf(false) }
  val askForAccount =
    rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
      accountDenied = !ok
      if (ok) {
        VigieNotifications.makeChannels(context)
        account?.begin()
      }
    }
  LaunchedEffect(account) { account?.open() }

  fun link() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !VigieNotifications.allowed(context)) {
      askForAccount.launch(Manifest.permission.POST_NOTIFICATIONS)
    } else {
      accountDenied = false
      VigieNotifications.makeChannels(context)
      account?.begin()
    }
  }

  SkyPage {
    Row(verticalAlignment = Alignment.CenterVertically) {
      IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back), tint = VigieColors.Text) }
      Text(stringResource(R.string.settings_title), color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
    }

    Section(stringResource(R.string.places_header))
    Glass {
      choices.places.forEachIndexed { i, f ->
        val shown = i == choices.current
        Row(
          Modifier.fillMaxWidth()
            .chosen(shown)
            .clickable { viewModel.select(i) }
            .heightIn(min = 56.dp)
            .padding(start = 10.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Column(Modifier.weight(1f)) {
            Text(f.place.label, color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
            val where = listOfNotNull(f.place.region, if (shown) stringResource(R.string.place_shown) else null).joinToString(" · ")
            if (where.isNotEmpty()) Text(where, color = if (shown) VigieColors.Accent else VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
          }
          if (canNotify) BellPill(f.bell, f.place.label) { bellFor = i }
          if (choices.places.size > 1) {
            IconButton(onClick = { viewModel.removePlace(i) }) {
              Icon(painterResource(R.drawable.ic_close), stringResource(R.string.place_remove, f.place.label), tint = VigieColors.Text3)
            }
          }
        }
      }
    }
    Text(stringResource(R.string.places_hint), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)

    if (!adding) {
      AccentAction(R.drawable.ic_add, stringResource(R.string.place_add)) { adding = true }
    } else {
      Glass {
        PlaceSearch(viewModel, picked = null) { place ->
          val spots = (catalogue as? CatalogueState.Ready)?.spots?.let { Geo.suggested(it, place.lat, place.lon) }.orEmpty()
          if (viewModel.addPlace(place, spots)) {
            adding = false
            exists = false
            viewModel.clearSearch()
          } else {
            exists = true
          }
        }
        if (exists) Text(stringResource(R.string.place_exists), color = VigieColors.Warning, style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.place_add_hint), color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
      }
    }

    if (canNotify) {
      NotificationsSection(bells, choices.belled.size, denied, viewModel::testBell)
      if (account != null && accountUi != null) {
        AccountSection(
          accountUi.value,
          accountDenied,
          onLink = ::link,
          onPoll = account::poll,
          onCancel = account::cancel,
          onUnlink = account::unlink,
          onTest = account::test,
        )
      }
      bellFor?.let { i ->
        choices.places.getOrNull(i)?.let { f -> BellDialog(f.place.label, f.bell, onChoose = { chooseBell(i, it) }, onClose = { bellFor = null }) }
      }
    }

    val f = choices.currentPlace ?: return@SkyPage
    val bySpot = (catalogue as? CatalogueState.Ready)?.spots?.associateBy { it.id }.orEmpty()
    Section(stringResource(R.string.spots_header, Words.near(f.place.nearName)))
    Text(stringResource(R.string.spots_star_hint), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
    Glass {
      if (f.spots.isEmpty()) Text(stringResource(R.string.spots_none), color = VigieColors.Text2, style = MaterialTheme.typography.bodyLarge)
      f.spots.forEachIndexed { k, id ->
        val spot = bySpot[id]
        val name = spot?.name ?: id
        SpotLine(spot, name, f.place) {
          val starred = k == 0
          IconButton(onClick = { viewModel.star(id) }) {
            Icon(
              painterResource(if (starred) R.drawable.ic_star else R.drawable.ic_star_outline),
              stringResource(if (starred) R.string.spot_starred else R.string.spot_star, name),
              tint = VigieColors.Accent,
            )
          }
          IconButton(onClick = { viewModel.unfollow(id) }) {
            Icon(painterResource(R.drawable.ic_close), stringResource(R.string.spot_remove, name), tint = VigieColors.Text3)
          }
        }
      }
    }

    Section(stringResource(R.string.spots_add_header, Words.near(f.place.nearName)))
    when (val c = catalogue) {
      CatalogueState.Idle,
      CatalogueState.Loading -> Text(stringResource(R.string.spots_loading), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
      is CatalogueState.Failed -> {
        Text(c.message, color = VigieColors.Warning, style = MaterialTheme.typography.bodyMedium)
        TextButton(onClick = { viewModel.loadCatalogue(force = true) }) { Text(stringResource(R.string.retry), color = VigieColors.Accent) }
      }
      is CatalogueState.Ready -> {
        var shownCount by rememberSaveable(f.key) { mutableIntStateOf(ADD_STEP) }
        val others = Geo.nearest(c.spots, f.place.lat, f.place.lon).filter { it.first.id !in f.spots }
        Glass {
          others.take(shownCount).forEach { (spot, _) ->
            SpotLine(spot, spot.name, f.place) {
              IconButton(onClick = { viewModel.follow(spot.id) }) {
                Icon(painterResource(R.drawable.ic_add), stringResource(R.string.spot_add, spot.name), tint = VigieColors.Accent)
              }
            }
          }
        }
        if (others.size > shownCount) {
          TextButton(onClick = { shownCount += ADD_STEP }) { Text(stringResource(R.string.spots_more), color = VigieColors.Accent) }
        }
      }
    }
    Credits(stringResource(R.string.credits_sea))
  }
}

private const val ADD_STEP = 6

/**
 * The place search, shared by the settings and the first launch: a field (the site's search, two letters at least),
 * its answers, and « Utiliser ma position » (the coarse permission, asked only when touched). [picked] is highlighted.
 */
@Composable
internal fun PlaceSearch(viewModel: HomeViewModel, picked: Place?, onPick: (Place) -> Unit) {
  val search by viewModel.search.collectAsStateWithLifecycle()
  var text by rememberSaveable { mutableStateOf(search.query) }
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val focus = LocalFocusManager.current
  val keyboard = LocalSoftwareKeyboardController.current
  var locating by remember { mutableStateOf(false) }
  var locateError by remember { mutableStateOf<Int?>(null) }
  val myPosition = stringResource(R.string.my_position)

  // A place chosen: the keyboard goes away, so the next step (« Suivant », the spots) is in sight.
  fun pick(place: Place) {
    focus.clearFocus()
    keyboard?.hide()
    onPick(place)
  }

  fun locate() {
    locating = true
    locateError = null
    scope.launch {
      val at = Locator.locate(context)
      locating = false
      if (at == null) locateError = R.string.locate_none
      else pick(Place("", Geo.roundKm(at.latitude), Geo.roundKm(at.longitude), here = true))
    }
  }
  val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) locate() else locateError = R.string.locate_denied }

  OutlinedTextField(
    value = text,
    onValueChange = {
      text = it
      viewModel.search(it)
    },
    modifier = Modifier.fillMaxWidth(),
    singleLine = true,
    placeholder = { Text(stringResource(R.string.search_hint), color = VigieColors.Text3) },
    leadingIcon = { Icon(painterResource(R.drawable.ic_search), contentDescription = null, tint = VigieColors.Text3) },
    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Search),
    shape = RoundedCornerShape(14.dp),
    colors =
      OutlinedTextFieldDefaults.colors(
        focusedTextColor = VigieColors.Text,
        unfocusedTextColor = VigieColors.Text,
        focusedBorderColor = VigieColors.Accent,
        unfocusedBorderColor = VigieColors.Rule,
        cursorColor = VigieColors.Accent,
        focusedContainerColor = Color.White.copy(alpha = 0.06f),
        unfocusedContainerColor = Color.White.copy(alpha = 0.06f),
      ),
  )
  val current = search.query == text
  when {
    text.trim().length == 1 -> Hint(stringResource(R.string.search_short))
    current && search.busy -> Hint(stringResource(R.string.search_busy))
    current && search.error != null -> Hint(search.error.orEmpty(), VigieColors.Warning)
    current && search.done && search.hits.isEmpty() -> Hint(stringResource(R.string.search_none))
  }
  if (current) search.hits.forEach { hit -> HitLine(hit, picked != null && samePoint(picked, hit)) { pick(Place(hit.name, hit.lat, hit.lon, Words.placeWhere(hit.region, hit.country).ifEmpty { null })) } }
  if (picked != null && picked.here) HitLine(PlaceHit(myPosition, null, null, picked.lat, picked.lon, null), true) {}

  AccentAction(R.drawable.ic_location, stringResource(if (locating) R.string.locating else R.string.locate)) {
    if (!locating) {
      if (Locator.granted(context)) locate() else ask.launch(Locator.PERMISSION)
    }
  }
  locateError?.let { Hint(stringResource(it), VigieColors.Warning) }
  if (picked?.here == true) Hint(stringResource(R.string.locate_follows))
  Credits(stringResource(R.string.credits_places))
}

/** A chosen line: an amber outline over a light amber tint (a tint alone reads grey over the dark glass). */
private fun Modifier.chosen(on: Boolean): Modifier {
  val shape = RoundedCornerShape(12.dp)
  return if (!on) clip(shape) else clip(shape).background(VigieColors.Accent.copy(alpha = 0.12f), shape).border(1.5.dp, VigieColors.Accent, shape)
}

private fun samePoint(p: Place, h: PlaceHit): Boolean = p.name == h.name && p.lat == h.lat && p.lon == h.lon

@Composable
private fun HitLine(hit: PlaceHit, selected: Boolean, onClick: () -> Unit) {
  Column(
    Modifier.fillMaxWidth()
      .chosen(selected)
      .clickable(onClick = onClick)
      .heightIn(min = 48.dp)
      .padding(horizontal = 10.dp, vertical = 6.dp),
    verticalArrangement = Arrangement.Center,
  ) {
    Text(hit.name, color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
    val where = listOf(Words.placeWhere(hit.region, hit.country), hit.population?.takeIf { it > 0 }?.let(Words::population).orEmpty()).filter { it.isNotEmpty() }
    if (where.isNotEmpty()) Text(where.joinToString(" · "), color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
  }
}

/** A spot of a list: its name, its commune and its distance to the place; [actions] at the end of the line. */
@Composable
internal fun SpotLine(spot: CatalogueSpot?, name: String, from: Place, actions: @Composable () -> Unit) {
  Row(Modifier.fillMaxWidth().heightIn(min = 52.dp), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
      Text(name, color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
      if (spot != null) {
        val km = Words.km(Geo.km(from.lat, from.lon, spot.lat, spot.lon))
        Text(listOfNotNull(spot.place, km).joinToString(" · "), color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
      }
    }
    actions()
  }
}

@Composable
private fun Hint(text: String, color: Color = VigieColors.Text3) {
  Text(text, color = color, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(horizontal = 4.dp))
}

@Composable
internal fun Section(text: String) {
  Text(text, color = VigieColors.Text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp))
}

/** An accent text action with its pictogram, at least 48 dp high. */
@Composable
internal fun AccentAction(@DrawableRes icon: Int, label: String, onClick: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = onClick).heightIn(min = 48.dp).padding(horizontal = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Icon(painterResource(icon), contentDescription = null, tint = VigieColors.Accent, modifier = Modifier.size(22.dp))
    Spacer(Modifier.width(10.dp))
    Text(label, color = VigieColors.Accent, style = MaterialTheme.typography.titleMedium)
  }
}

/** A full page over the sky, outside the tabs: scrolls, and stays clear of the system bars and the keyboard. */
@Composable
internal fun SkyPage(content: @Composable ColumnScope.() -> Unit) {
  Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(VigieColors.SkyTop, VigieColors.SkyBottom)))) {
    Column(
      Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Vertical)).verticalScroll(rememberScrollState())
        .padding(horizontal = evenSide() + 16.dp, vertical = 8.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
      content()
      Spacer(Modifier.height(12.dp))
    }
  }
}

/** The small dots under the place name on the Accueil: one per followed place, the shown one in amber. */
@Composable
internal fun PageDots(page: Int, count: Int, modifier: Modifier = Modifier) {
  Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
    repeat(count) { i -> Box(Modifier.size(7.dp).background(if (i == page) VigieColors.Accent else VigieColors.Text3.copy(alpha = 0.5f), CircleShape)) }
  }
}
