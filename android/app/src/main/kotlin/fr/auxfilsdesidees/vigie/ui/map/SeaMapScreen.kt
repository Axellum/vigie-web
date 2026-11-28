package fr.auxfilsdesidees.vigie.ui.map

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.PointF
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.draggable
import androidx.compose.foundation.gestures.rememberDraggableState
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.Favourites
import fr.auxfilsdesidees.vigie.data.Geo
import fr.auxfilsdesidees.vigie.data.MapActivity
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.SeaMap
import fr.auxfilsdesidees.vigie.data.Starred
import fr.auxfilsdesidees.vigie.ui.ActivityGlyph
import fr.auxfilsdesidees.vigie.ui.BeachState
import fr.auxfilsdesidees.vigie.ui.Credits
import fr.auxfilsdesidees.vigie.ui.HomeViewModel
import fr.auxfilsdesidees.vigie.ui.Locator
import fr.auxfilsdesidees.vigie.ui.Words
import fr.auxfilsdesidees.vigie.ui.board.HomeBoardView
import fr.auxfilsdesidees.vigie.ui.board.SeaBoard
import fr.auxfilsdesidees.vigie.ui.board.SeaBoardView
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import java.util.TimeZone
import kotlin.coroutines.resume
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style

/**
 * The sea map, as the site's `/sea` (the sketches chosen by the author on 28/11/2026): the site's dark base map
 * (OpenFreeMap) in full screen, a pin per spot for the activity of the chip chosen, the search of a beach or a town, the
 * phone's position when asked for, and the credits of the base map, always shown. It opens on the place shown by the
 * tabs; the system's back, or the arrow, goes back to them.
 *
 * A touch on a spot, a followed place or a town of the base map opens its sheet from the bottom: the beach as the Mer tab
 * draws it, or the town's weather as the Accueil. Its star follows it ([Favourites]): the Accueil, the Mer tab and the
 * widgets read it, and a note says where it went, with « Annuler » for six seconds.
 */
@Composable
fun SeaMapScreen(viewModel: SeaMapViewModel, home: HomeViewModel, onBack: () -> Unit) {
  val ui by viewModel.ui.collectAsStateWithLifecycle()
  val app by home.app.collectAsStateWithLifecycle()
  val sheet by viewModel.sheet.collectAsStateWithLifecycle()
  val choices = app.choices
  val followedSpots = remember(choices) { Favourites.spots(choices) }
  val followedPlaces = remember(choices) { Favourites.places(choices) }
  val context = LocalContext.current
  val density = LocalDensity.current
  val scope = rememberCoroutineScope()
  LaunchedEffect(viewModel) { viewModel.load() }

  // Where the map looks, kept when the screen turns: the place shown at first.
  var camera by rememberSaveable { mutableStateOf(choices.currentPlace?.place?.let { listOf(it.lat, it.lon, START_ZOOM) } ?: FRANCE) }
  val mapView = rememberMapView()
  var map by remember { mutableStateOf<MapLibreMap?>(null) }
  var style by remember { mutableStateOf<Style?>(null) }
  var me by remember { mutableStateOf<Pair<Double, Double>?>(null) }
  var locateFailed by remember { mutableStateOf(false) }
  var tall by rememberSaveable { mutableStateOf(false) }
  var note by remember { mutableStateOf<Note?>(null) }
  var starring by remember { mutableStateOf(false) }

  /** The share of the screen the sheet takes, and how far down the top bar goes: the point touched stays between them. */
  fun sheetPx(): Double = mapView.height * (if (tall) SHEET_TALL else SHEET_SHORT).toDouble()
  val topPx = with(density) { TOP_BAR.toPx() }.toDouble()

  /** Takes the map to a point, above the sheet when one is open. */
  fun goTo(lat: Double, lon: Double, zoom: Double, open: Boolean) {
    val m = map ?: return
    val bottom = if (open) sheetPx() else 0.0
    m.animateCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder().target(LatLng(lat, lon)).zoom(zoom).padding(0.0, if (open) topPx else 0.0, 0.0, bottom).build()))
  }

  /** The point touched, brought above the sheet when the sheet would hide it; the map stays where it is otherwise. */
  fun reveal(m: MapLibreMap, at: PointF, lat: Double, lon: Double) {
    if (at.y < mapView.height - sheetPx() - with(density) { 24.dp.toPx() } && at.y > topPx) return
    goTo(lat, lon, m.cameraPosition.zoom, open = true)
  }

  val onTap by rememberUpdatedState<(MapLibreMap, LatLng) -> Unit> { m, latLng ->
    val at = m.projection.toScreenLocation(latLng)
    when (val pick = MapLayers.pick(m, ui.townLayers, at, with(density) { TOUCH.toPx() })) {
      is MapLayers.Pick.Spot ->
        viewModel.spot(pick.id)?.let {
          viewModel.open(SeaMapViewModel.Sheet.Spot(it))
          reveal(m, at, it.lat, it.lon)
        }
      is MapLayers.Pick.Followed ->
        choices.places.firstOrNull { it.key == pick.key }?.let {
          viewModel.open(SeaMapViewModel.Sheet.Town(it.place))
          reveal(m, at, it.place.lat, it.place.lon)
        }
      is MapLayers.Pick.Town -> {
        val place = townAt(choices, pick)
        viewModel.open(SeaMapViewModel.Sheet.Town(place))
        reveal(m, at, place.lat, place.lon)
      }
      null -> viewModel.close()
    }
  }

  LaunchedEffect(mapView) {
    val m = mapView.awaitMap()
    m.uiSettings.apply {
      // The credits are drawn by the app, always visible (below); MapLibre's own button and logo would repeat them.
      isAttributionEnabled = false
      isLogoEnabled = false
      isCompassEnabled = false
      isRotateGesturesEnabled = false
      isTiltGesturesEnabled = false
    }
    m.cameraPosition = CameraPosition.Builder().target(LatLng(camera[0], camera[1])).zoom(camera[2]).build()
    m.addOnCameraIdleListener { m.cameraPosition.target?.let { camera = listOf(it.latitude, it.longitude, m.cameraPosition.zoom) } }
    m.addOnMapClickListener { latLng ->
      onTap(m, latLng)
      true
    }
    map = m
  }
  LaunchedEffect(map, ui.style) {
    val m = map ?: return@LaunchedEffect
    val json = ui.style ?: return@LaunchedEffect
    if (style != null) return@LaunchedEffect
    m.setStyle(Style.Builder().fromJson(json)) { loaded ->
      MapLayers.add(loaded, context)
      style = loaded
    }
  }
  LaunchedEffect(style, ui.pins, followedSpots) { style?.let { MapLayers.show(it, ui.pins, followedSpots, context) } }
  LaunchedEffect(style, followedPlaces) { style?.let { MapLayers.showPlaces(it, followedPlaces, context) } }
  LaunchedEffect(style, me) {
    val s = style ?: return@LaunchedEffect
    me?.let { (lat, lon) -> MapLayers.showMe(s, lat, lon) }
  }
  LaunchedEffect(note) {
    if (note != null) {
      delay(NOTE_MS)
      note = null
    }
  }
  BackHandler(enabled = sheet != null) { viewModel.close() }

  fun locate() {
    scope.launch {
      val at = Locator.locate(context)
      locateFailed = at == null
      if (at != null) {
        me = at.latitude to at.longitude
        goTo(at.latitude, at.longitude, LOCATE_ZOOM, sheet != null)
      }
    }
  }
  val askPosition = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) locate() else locateFailed = true }

  fun starred(s: Starred): String =
    when (s) {
      is Starred.Joined -> context.getString(R.string.map_starred_joined, s.spotName, s.placeName)
      is Starred.WithPlace -> context.getString(R.string.map_starred_with_place, s.spotName, s.placeName)
      is Starred.Town -> context.getString(R.string.map_starred_town, s.placeName)
    }

  /** The star of the sheet: on, it follows the spot or the town; off, it takes them away. */
  fun star(shown: SeaMapViewModel.Sheet) {
    if (starring) return
    val c = home.app.value.choices
    when (shown) {
      is SeaMapViewModel.Sheet.Spot -> {
        val spot = shown.spot
        if (spot.id in Favourites.spots(c)) {
          home.unstarSpot(spot.id)?.let { u -> note = Note(context.getString(R.string.map_unstarred, spot.name)) { home.undoUnstar(u) } }
        } else {
          starring = true
          scope.launch {
            try {
              home.starSpot(spot)?.let { s -> note = Note(starred(s)) { home.undoStar(s) } }
            } finally {
              starring = false
            }
          }
        }
      }
      is SeaMapViewModel.Sheet.Town -> {
        val held = Favourites.placeAt(c, shown.place)
        if (held != null) {
          val words = if (held.spots.isNotEmpty()) R.string.map_unstarred_with_spots else R.string.map_unstarred
          home.unstarTown(held.key)?.let { u -> note = Note(context.getString(words, held.place.label)) { home.undoUnstar(u) } }
        } else {
          home.starTown(shown.place)?.let { s -> note = Note(starred(s)) { home.undoStar(s) } }
        }
      }
    }
  }

  Box(Modifier.fillMaxSize().background(Color(LAND))) {
    AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())

    Column(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      TopBar(viewModel, onBack) { hit ->
        goTo(hit.lat, hit.lon, if (hit.spot) SPOT_ZOOM else TOWN_ZOOM, open = true)
        val spot = hit.id?.let(viewModel::spot)
        viewModel.open(if (spot != null) SeaMapViewModel.Sheet.Spot(spot) else SeaMapViewModel.Sheet.Town(Place(hit.name, hit.lat, hit.lon, hit.detail)))
      }
      Chips(ui.activity, viewModel::choose)
    }

    if (ui.style == null || ui.failed) {
      Column(
        Modifier.align(Alignment.Center).padding(24.dp).background(VigieColors.Bar, RoundedCornerShape(18.dp)).padding(18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        if (ui.failed) {
          Text(stringResource(R.string.map_failed), color = VigieColors.Text)
          TextButton(onClick = viewModel::load) { Text(stringResource(R.string.retry), color = VigieColors.Accent) }
        } else {
          CircularProgressIndicator(color = VigieColors.Accent)
          Text(stringResource(R.string.map_loading), color = VigieColors.Text2)
        }
      }
    }

    Column(Modifier.align(Alignment.BottomStart).fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      Column(Modifier.padding(horizontal = 8.dp).padding(bottom = if (sheet == null) 8.dp else 0.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        note?.let { n -> NoteBar(n) { note = null } }
        if (sheet == null) {
          Row(verticalAlignment = Alignment.Bottom) {
            Legend(Modifier.weight(1f))
            Round(R.drawable.ic_locate, stringResource(R.string.map_locate)) { if (Locator.granted(context)) locate() else askPosition.launch(Locator.PERMISSION) }
          }
          if (locateFailed) Small(stringResource(R.string.map_locate_none), VigieColors.Warning)
        }
        // On the legend's glass, so that a pin under them never makes them hard to read; above the sheet when it is open.
        Small(
          stringResource(R.string.map_credits),
          VigieColors.Text2,
          Modifier.background(VigieColors.Bar, RoundedCornerShape(10.dp))
            .clickable {
              try {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(OSM_COPYRIGHT)))
              } catch (err: ActivityNotFoundException) {
                // No browser: the credits stay on screen all the same.
              }
            }
            .padding(horizontal = 8.dp, vertical = 4.dp),
        )
      }
      sheet?.let { shown ->
        val followed =
          when (shown) {
            is SeaMapViewModel.Sheet.Spot -> shown.spot.id in followedSpots
            is SeaMapViewModel.Sheet.Town -> Favourites.placeAt(choices, shown.place) != null
          }
        SheetView(
          shown,
          viewModel,
          followed = followed,
          starring = starring,
          tall = tall,
          onTall = { tall = it },
          onStar = { star(shown) },
          // A share of the screen, the same with or without a note above it.
          modifier = Modifier.height(LocalConfiguration.current.screenHeightDp.dp * (if (tall) SHEET_TALL else SHEET_SHORT)),
        )
      }
    }
  }
}

/** A note of the map: what the star did, and « Annuler » while it shows. */
private class Note(val text: String, val undo: (() -> Unit)?)

/**
 * The town of the base map touched: the followed place of that name a few kilometres away when there is one (its star is
 * on), else the town at the point of its label.
 */
private fun townAt(choices: Choices, pick: MapLayers.Pick.Town): Place =
  choices.places.firstOrNull { !it.place.here && it.place.name.equals(pick.name, ignoreCase = true) && Geo.km(pick.lat, pick.lon, it.place.lat, it.place.lon) <= SAME_TOWN_KM }?.place
    ?: Place(pick.name, round4(pick.lat), round4(pick.lon))

private fun round4(v: Double): Double = Math.round(v * 10_000) / 10_000.0

@Composable
private fun NoteBar(note: Note, onDone: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().background(VigieColors.Bar, RoundedCornerShape(14.dp)).border(1.dp, VigieColors.GlassBorder, RoundedCornerShape(14.dp)).padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Text(note.text, color = VigieColors.Text, fontSize = 14.sp, modifier = Modifier.weight(1f).padding(vertical = 8.dp))
    note.undo?.let { undo ->
      TextButton(
        onClick = {
          undo()
          onDone()
        }
      ) {
        Text(stringResource(R.string.map_undo), color = VigieColors.Accent, fontWeight = FontWeight.Bold)
      }
    }
  }
}

/**
 * The sheet of a spot or a town, from the bottom, instant: a handle (touched or pulled, it takes half the screen or most of
 * it; pulled down from half, it closes), the name, the star and the cross, then the beach as the Mer tab draws it or the
 * town's weather as the Accueil, with their credits.
 */
@Composable
private fun SheetView(
  sheet: SeaMapViewModel.Sheet,
  viewModel: SeaMapViewModel,
  followed: Boolean,
  starring: Boolean,
  tall: Boolean,
  onTall: (Boolean) -> Unit,
  onStar: () -> Unit,
  modifier: Modifier,
) {
  val (name, where) =
    when (sheet) {
      is SeaMapViewModel.Sheet.Spot -> sheet.spot.name to sheet.spot.place
      is SeaMapViewModel.Sheet.Town -> sheet.place.name to sheet.place.region
    }
  val shape = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
  var pulled by remember { mutableStateOf(0f) }
  val pull = rememberDraggableState { pulled += it }
  val handle = stringResource(R.string.map_sheet_size)
  Column(modifier.fillMaxWidth().clip(shape).background(VigieColors.Bar.copy(alpha = 1f)).border(1.dp, VigieColors.GlassBorder, shape)) {
    Box(
      Modifier.fillMaxWidth()
        .height(22.dp)
        .semantics { contentDescription = handle }
        .clickable(role = Role.Button) { onTall(!tall) }
        .draggable(
          pull,
          Orientation.Vertical,
          onDragStarted = { pulled = 0f },
          onDragStopped = {
            when {
              pulled < -PULL -> onTall(true)
              pulled > PULL && tall -> onTall(false)
              pulled > PULL -> viewModel.close()
            }
          },
        ),
      contentAlignment = Alignment.Center,
    ) {
      Box(Modifier.size(width = 36.dp, height = 4.dp).clip(CircleShape).background(VigieColors.Text3.copy(alpha = 0.6f)))
    }
    Row(Modifier.padding(start = 16.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
      Column(Modifier.weight(1f)) {
        Text(name, color = VigieColors.Text, fontSize = 18.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
        where?.takeIf { it.isNotBlank() }?.let { Text(it, color = VigieColors.Text3, fontSize = 13.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
      }
      Box(
        Modifier.size(44.dp).clip(CircleShape).clickable(enabled = !starring, role = Role.Button, onClick = onStar),
        contentAlignment = Alignment.Center,
      ) {
        if (starring) CircularProgressIndicator(color = VigieColors.Accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        else
          Icon(
            painterResource(if (followed) R.drawable.ic_star else R.drawable.ic_star_outline),
            stringResource(if (followed) R.string.map_unstar else R.string.map_star, name),
            tint = VigieColors.Accent,
            modifier = Modifier.size(26.dp),
          )
      }
      Box(Modifier.size(44.dp).clip(CircleShape).clickable(role = Role.Button, onClick = viewModel::close), contentAlignment = Alignment.Center) {
        Icon(painterResource(R.drawable.ic_close), stringResource(R.string.map_sheet_close), tint = VigieColors.Text3, modifier = Modifier.size(22.dp))
      }
    }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 6.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      when (sheet) {
        is SeaMapViewModel.Sheet.Spot -> SpotBody(sheet.spot, viewModel)
        is SeaMapViewModel.Sheet.Town -> TownBody(sheet.place, viewModel)
      }
    }
  }
}

/** A beach, as the Mer tab draws it: read when the sheet opens, again after ten minutes; at the phone's hour. */
@Composable
private fun SpotBody(spot: CatalogueSpot, viewModel: SeaMapViewModel) {
  val beaches by viewModel.beaches.collectAsStateWithLifecycle()
  val b = beaches[spot.id] ?: BeachState(reading = true)
  val now = System.currentTimeMillis() / 1000
  val status =
    when {
      b.beach != null -> null
      b.failed -> stringResource(R.string.sea_unread)
      else -> stringResource(R.string.sea_loading)
    }
  SeaBoardView(
    tabs = listOf(SeaBoard.shortName(spot.name) ?: spot.name),
    selected = 0,
    onSelect = {},
    name = b.beach?.spot?.name ?: spot.name,
    beach = b.beach,
    status = status,
    note = null,
    now = now,
    offsetS = TimeZone.getDefault().getOffset(now * 1000) / 1000,
    // The sheet's head says the beach's name already.
    named = false,
  )
  if (b.failed && !b.reading) TextButton(onClick = viewModel::retry) { Text(stringResource(R.string.retry), color = VigieColors.Accent) }
}

/** A town's weather, as the Accueil draws it (`/v1/point`, through the map's share): read when the sheet opens, again after ten minutes. */
@Composable
private fun TownBody(place: Place, viewModel: SeaMapViewModel) {
  val towns by viewModel.towns.collectAsStateWithLifecycle()
  val t = towns[place.pointKey] ?: SeaMapViewModel.TownState(reading = true)
  val p = t.point
  when {
    p != null -> {
      HomeBoardView(p, System.currentTimeMillis() / 1000)
      p.provider?.let { Credits(stringResource(R.string.credits_weather, it)) }
    }
    t.failed -> {
      Text(stringResource(R.string.map_town_failed), color = VigieColors.Text2, fontSize = 14.sp)
      TextButton(onClick = viewModel::retry) { Text(stringResource(R.string.retry), color = VigieColors.Accent) }
    }
    else -> Text(stringResource(R.string.sea_loading), color = VigieColors.Text2, fontSize = 14.sp, modifier = Modifier.padding(vertical = 8.dp))
  }
}
/** The back arrow and the search: the spots of the map first, then the towns of the site's search (two letters at least). */
@Composable
private fun TopBar(viewModel: SeaMapViewModel, onBack: () -> Unit, onHit: (SeaMapViewModel.Hit) -> Unit) {
  val search by viewModel.search.collectAsStateWithLifecycle()
  var text by rememberSaveable { mutableStateOf("") }
  // A line touched closes the list until the next letter typed (its name may be the very word searched: « Capbreton »).
  var closed by rememberSaveable { mutableStateOf(false) }
  val focus = LocalFocusManager.current
  fun pick(hit: SeaMapViewModel.Hit) {
    text = hit.name
    closed = true
    onHit(hit)
    focus.clearFocus()
  }
  Column(Modifier.padding(horizontal = 12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Round(R.drawable.ic_back, stringResource(R.string.back), onBack)
      Spacer(Modifier.size(8.dp))
      Row(
        Modifier.weight(1f).height(44.dp).background(VigieColors.Bar, RoundedCornerShape(22.dp)).border(1.dp, VigieColors.GlassBorder, RoundedCornerShape(22.dp)).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Icon(painterResource(R.drawable.ic_search), contentDescription = null, tint = VigieColors.Text3, modifier = Modifier.size(20.dp))
        Spacer(Modifier.size(8.dp))
        Box(Modifier.weight(1f)) {
          if (text.isEmpty()) Text(stringResource(R.string.map_search_hint), color = VigieColors.Text3, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
          BasicTextField(
            value = text,
            onValueChange = {
              text = it
              closed = false
              viewModel.search(it)
            },
            singleLine = true,
            textStyle = TextStyle(color = VigieColors.Text, fontSize = 15.sp),
            cursorBrush = SolidColor(VigieColors.Accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { search.hits.firstOrNull()?.let(::pick) ?: focus.clearFocus() }),
            modifier = Modifier.fillMaxWidth(),
          )
        }
        if (text.isNotEmpty()) {
          Icon(
            painterResource(R.drawable.ic_close),
            stringResource(R.string.map_search_clear),
            tint = VigieColors.Text3,
            modifier =
              Modifier.size(20.dp).clickable(role = Role.Button) {
                text = ""
                closed = false
                viewModel.search("")
              },
          )
        }
      }
    }
    val current = !closed && search.query == text && text.trim().length >= 2
    if (current && (search.hits.isNotEmpty() || search.done)) {
      Column(Modifier.fillMaxWidth().background(VigieColors.Bar, RoundedCornerShape(18.dp)).padding(vertical = 4.dp)) {
        if (search.hits.isEmpty()) Small(stringResource(R.string.map_search_none), VigieColors.Text3, Modifier.padding(12.dp))
        search.hits.forEach { hit ->
          Row(
            Modifier.fillMaxWidth()
              .clickable { pick(hit) }
              .padding(horizontal = 14.dp, vertical = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            if (hit.spot) ActivityGlyph("surf", VigieColors.Text3, 18.dp) else Icon(painterResource(R.drawable.ic_location), null, tint = VigieColors.Text3, modifier = Modifier.size(18.dp))
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f)) {
              Text(hit.name, color = VigieColors.Text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
              hit.detail?.let { Text(it, color = VigieColors.Text3, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis) }
            }
          }
        }
      }
    }
  }
}

/** The four activities, as the chips of `/sea`: the one chosen in the accent colour. */
@Composable
private fun Chips(chosen: MapActivity, onChoose: (MapActivity) -> Unit) {
  // Compact, so that the four fit across a phone at the usual text size; they scroll when the text is larger.
  Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
    MapActivity.entries.forEach { a ->
      val on = a == chosen
      val ink = if (on) VigieColors.OnPill else VigieColors.Text
      Row(
        Modifier.height(34.dp)
          .clip(RoundedCornerShape(17.dp))
          .background(if (on) VigieColors.Accent else VigieColors.Bar)
          .border(1.dp, if (on) VigieColors.Accent else VigieColors.GlassBorder, RoundedCornerShape(17.dp))
          .clickable(role = Role.Tab) { onChoose(a) }
          .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        ActivityGlyph(a.id, ink, 15.dp)
        Spacer(Modifier.size(5.dp))
        Text(Words.activity(a.id), color = ink, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1)
      }
    }
  }
}

/** The colours of the dots, each with its word (the charter: never a colour alone). */
@Composable
private fun Legend(modifier: Modifier) {
  Column(modifier.padding(end = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Row(
      Modifier.background(VigieColors.Bar, RoundedCornerShape(10.dp)).padding(horizontal = 8.dp, vertical = 4.dp),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
      listOf("good", "possible", "poor").forEach { v ->
        Box(Modifier.size(9.dp).clip(CircleShape).background(Color(android.graphics.Color.parseColor(SeaMap.BAND_COLOURS.getValue(SeaMap.band(v))))))
        Text(Words.verdict(v), color = VigieColors.Text2, fontSize = 11.sp)
        Spacer(Modifier.size(3.dp))
      }
    }
    Small(stringResource(R.string.map_legend), VigieColors.Text2, Modifier.background(VigieColors.Bar, RoundedCornerShape(10.dp)).padding(horizontal = 8.dp, vertical = 3.dp))
  }
}

@Composable
private fun Small(text: String, color: Color, modifier: Modifier = Modifier) {
  Text(
    text,
    color = color,
    fontSize = 10.5.sp,
    lineHeight = 13.sp,
    modifier = modifier.widthIn(max = 320.dp).background(Color(0x9E0A1220), RoundedCornerShape(6.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
  )
}

@Composable
private fun Round(icon: Int, label: String, onClick: () -> Unit) {
  Box(
    Modifier.size(44.dp).clip(CircleShape).background(VigieColors.Bar).border(1.dp, VigieColors.GlassBorder, CircleShape).clickable(role = Role.Button, onClick = onClick),
    contentAlignment = Alignment.Center,
  ) {
    Icon(painterResource(icon), label, tint = VigieColors.Text, modifier = Modifier.size(22.dp))
  }
}

/** A MapView that follows the screen's lifecycle (MapLibre asks for each step), destroyed with the screen. */
@Composable
private fun rememberMapView(): MapView {
  val context = LocalContext.current
  val mapView =
    remember {
      MapLibre.getInstance(context)
      MapView(context).apply { onCreate(Bundle()) }
    }
  val lifecycle = LocalLifecycleOwner.current.lifecycle
  DisposableEffect(lifecycle, mapView) {
    var started = false
    var resumed = false
    val observer = LifecycleEventObserver { _, event ->
      when (event) {
        Lifecycle.Event.ON_START -> mapView.onStart().also { started = true }
        Lifecycle.Event.ON_RESUME -> mapView.onResume().also { resumed = true }
        Lifecycle.Event.ON_PAUSE -> mapView.onPause().also { resumed = false }
        Lifecycle.Event.ON_STOP -> mapView.onStop().also { started = false }
        else -> Unit
      }
    }
    lifecycle.addObserver(observer)
    onDispose {
      lifecycle.removeObserver(observer)
      if (resumed) mapView.onPause()
      if (started) mapView.onStop()
      mapView.onDestroy()
    }
  }
  return mapView
}

private suspend fun MapView.awaitMap(): MapLibreMap = suspendCancellableCoroutine { cont -> getMapAsync { cont.resume(it) } }

/** The site's `--map-land` (dark), under the map while it loads. */
private const val LAND = 0xFF1B2A33
private const val START_ZOOM = 9.5
private const val SPOT_ZOOM = 12.5
private const val TOWN_ZOOM = 11.0
private const val LOCATE_ZOOM = 11.0
/** France as a whole, when no place is shown. */
private val FRANCE = listOf(46.6, 2.4, 4.8)
private const val OSM_COPYRIGHT = "https://www.openstreetmap.org/copyright"
/** The sheet: half the screen, or most of it once pulled up. */
private const val SHEET_SHORT = 0.5f
private const val SHEET_TALL = 0.82f
/** How far the top bar and the chips go down: a point touched under them is brought into view. */
private val TOP_BAR = 150.dp
/** The finger's reach around a touch, for a pin or a town's name. */
private val TOUCH = 14.dp
/** A pull of the handle longer than this, in pixels, changes the sheet's size. */
private const val PULL = 40f
private const val NOTE_MS = 6_000L
/** A town of the base map this near a followed place of the same name is that place. */
private const val SAME_TOWN_KM = 5.0
