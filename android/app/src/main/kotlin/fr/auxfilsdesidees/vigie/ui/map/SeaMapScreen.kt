package fr.auxfilsdesidees.vigie.ui.map

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.graphics.Paint
import android.graphics.PointF
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
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
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInRoot
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.zIndex
import androidx.core.view.WindowCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.Favourites
import fr.auxfilsdesidees.vigie.data.Geo
import fr.auxfilsdesidees.vigie.data.GeoBox
import fr.auxfilsdesidees.vigie.data.MapActivity
import fr.auxfilsdesidees.vigie.data.MapBackground
import fr.auxfilsdesidees.vigie.data.MapWeather
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.SeaMap
import fr.auxfilsdesidees.vigie.data.Starred
import fr.auxfilsdesidees.vigie.data.TownWeather
import fr.auxfilsdesidees.vigie.data.WindField
import fr.auxfilsdesidees.vigie.data.WindUnit
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
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
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
 * tabs; the system's back, or the arrow, goes back to them. The layers button, right of the search, puts the IGN's plan
 * or its photographs under the pins instead, with their credits; the choice is kept. Its menu also turns on, as the site's
 * `/sea`, the wind measured (a badge per station or buoy, its card at the top) and the rain radar (the last 35 minutes,
 * its card at the bottom, with Play, a slider and the legend); both are off at first, the choice is kept.
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
  val weather by viewModel.weather.state.collectAsStateWithLifecycle()
  val towns by viewModel.townWeather.state.collectAsStateWithLifecycle()
  val flow by viewModel.windField.state.collectAsStateWithLifecycle()
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
  // Where the wind's badges were laid out last: the view and the zoom (again after each move, and while zooming).
  var windView by remember { mutableStateOf<Pair<GeoBox, Double>?>(null) }
  // The forecast wind's trails, still when the phone's animations are off (the site's "reduce motion"), or on a phone too old to
  // draw them as triangles (Android 9 and before): stroked one by one, they are drawn once after each move.
  val flowEngine = remember {
    val animationsOff = Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    WindFlow(still = animationsOff || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q)
  }

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
      // A badge of the wind: what it measured, in a note (the site's bubble).
      is MapLayers.Pick.Wind ->
        viewModel.weather.state.value.windMap?.points?.firstOrNull { it.id == pick.id }?.let { p ->
          val now = System.currentTimeMillis()
          val lines = WeatherWords.windLines(p, TimeZone.getDefault().getOffset(now) / 1000, viewModel.weather.state.value.unit)
          note = Note(lines.joinToString("\n"), title = WeatherWords.windName(p))
        }
      null -> viewModel.close()
    }
  }

  // The towns in view, read from the tiles once the map is drawn after a move or a new style (not again for the same view).
  val styleNow by rememberUpdatedState(style)
  val townsSeen = remember { arrayOfNulls<Any>(1) }
  // The part of the map not under the search and the chips (above) nor the cards (below), px from its top: the towns' pills go there.
  val free = remember { floatArrayOf(0f, Float.MAX_VALUE) }
  LaunchedEffect(mapView) {
    val m = mapView.awaitMap()
    mapView.addOnDidBecomeIdleListener {
      val s = styleNow ?: return@addOnDidBecomeIdleListener
      val c = m.cameraPosition
      val seen = Triple(s, c.target, c.zoom)
      if (seen == townsSeen[0]) return@addOnDidBecomeIdleListener
      townsSeen[0] = seen
      viewModel.townWeather.towns(
        if (c.zoom < TownWeather.MIN_ZOOM) emptyList() else TownPicker.inView(m, s, mapView.width, mapView.height, density.density, free[0], free[1])
      )
    }
    m.uiSettings.apply {
      // The credits are drawn by the app, always visible (below); MapLibre's own button and logo would repeat them.
      isAttributionEnabled = false
      isLogoEnabled = false
      isCompassEnabled = false
      isRotateGesturesEnabled = false
      isTiltGesturesEnabled = false
    }
    m.cameraPosition = CameraPosition.Builder().target(LatLng(camera[0], camera[1])).zoom(camera[2]).build()
    m.addOnCameraIdleListener {
      m.cameraPosition.target?.let { camera = listOf(it.latitude, it.longitude, m.cameraPosition.zoom) }
      val view = viewOf(m)
      viewModel.weather.move(view, m.cameraPosition.zoom)
      viewModel.townWeather.move(m.cameraPosition.zoom)
      viewModel.windField.move(view, m.cameraPosition.zoom)
      windView = view to m.cameraPosition.zoom
      flowEngine.moveEnd()
    }
    // While zooming, the badges are laid out again every third of a level, so that they never pile up for long.
    m.addOnCameraMoveListener {
      // No trail lags behind the base map: none is drawn while it moves.
      flowEngine.moveStart()
      val zoom = m.cameraPosition.zoom
      if (abs(zoom - (windView?.second ?: zoom)) >= WIND_RELAYOUT_ZOOM) windView = viewOf(m) to zoom
    }
    m.addOnMapClickListener { latLng ->
      onTap(m, latLng)
      true
    }
    map = m
    val first = viewOf(m)
    viewModel.weather.move(first, m.cameraPosition.zoom)
    viewModel.townWeather.move(m.cameraPosition.zoom)
    viewModel.windField.move(first, m.cameraPosition.zoom)
    windView = first to m.cameraPosition.zoom
  }
  // The base map chosen: its style set once, again when another background is chosen (the pins are added to it again).
  var styleSet by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(map, ui.style) {
    val m = map ?: return@LaunchedEffect
    val json = ui.style ?: return@LaunchedEffect
    if (json == styleSet) return@LaunchedEffect
    styleSet = json
    // The style before is no longer drawn: nothing is added to it while the next one loads.
    style = null
    m.setStyle(Style.Builder().fromJson(json)) { loaded ->
      MapLayers.add(loaded, context)
      style = loaded
    }
  }
  // On the IGN's plan, light, the clock and the icons of the system's bars are drawn dark; light again when the map closes.
  val view = LocalView.current
  DisposableEffect(ui.background, view) {
    val bars = view.context.activity()?.window?.let { WindowCompat.getInsetsController(it, view) }
    val light = ui.background == MapBackground.PlanIgn
    bars?.isAppearanceLightStatusBars = light
    bars?.isAppearanceLightNavigationBars = light
    onDispose {
      bars?.isAppearanceLightStatusBars = false
      bars?.isAppearanceLightNavigationBars = false
    }
  }
  var layersOpen by rememberSaveable { mutableStateOf(false) }
  LaunchedEffect(ui.backgroundFailed) { if (ui.backgroundFailed != null) note = Note(context.getString(R.string.map_background_failed), null) }
  LaunchedEffect(style, ui.pins, followedSpots) { style?.let { MapLayers.show(it, ui.pins, followedSpots, context) } }
  LaunchedEffect(style, followedPlaces) { style?.let { MapLayers.showPlaces(it, followedPlaces, context) } }
  // The rain radar: the image shown, all of them once played or slid.
  LaunchedEffect(style, weather.radar, weather.epoch, weather.preload) {
    val s = style ?: return@LaunchedEffect
    val radar = weather.radar
    MapLayers.showRadar(s, radar, weather.epoch, weather.preload) { frame -> viewModel.radarTiles(radar!!, frame) }
  }
  // The wind's badges kept on screen, the strongest first where two would touch.
  LaunchedEffect(style, weather.windMap, windView, weather.unit) {
    val s = style ?: return@LaunchedEffect
    val (view, zoom) = windView ?: return@LaunchedEffect
    val radius = MapWeather.badgeRadius(zoom)
    val points = weather.windMap?.points.orEmpty()
    val kept = if (points.isEmpty()) emptyList() else withContext(Dispatchers.Default) { MapWeather.declutter(points, view, zoom, radius) }
    MapLayers.showWind(s, kept, radius, weather.unit, context)
  }
  // The towns' pills at the moment chosen; none while the layer is off.
  val pills = remember(towns) { towns.pills }
  LaunchedEffect(style, pills) { style?.let { MapLayers.showTowns(it, pills, context) } }
  // While the map is shown: the radar, the wind and the towns asked again when old (every minute at most); the animation stops in the background.
  val owner = LocalLifecycleOwner.current
  LaunchedEffect(owner) {
    owner.repeatOnLifecycle(Lifecycle.State.STARTED) {
      try {
        while (true) {
          viewModel.weather.sync()
          viewModel.townWeather.sync()
          viewModel.windField.sync()
          delay(SYNC_MS)
        }
      } finally {
        viewModel.weather.pause()
      }
    }
  }
  // The forecast wind: its grids followed by the trails, about 30 images a second while the map is shown and the layer on;
  // nothing is computed while the app is in the background or the screen off (battery).
  val flowGrids = flow.shown
  LaunchedEffect(flowGrids) { flowEngine.setGrids(flowGrids.orEmpty()) }
  var flowTick by remember { mutableIntStateOf(0) }
  LaunchedEffect(owner, map, flowGrids != null) {
    val m = map
    if (m == null || flowGrids == null) {
      flowTick = flowEngine.version
      return@LaunchedEffect
    }
    owner.repeatOnLifecycle(Lifecycle.State.STARTED) {
      var last = 0L
      while (true) {
        val now = withFrameNanos { it }
        val dt = if (last == 0L) WindFlow.FRAME_MS / 1000.0 else (now - last) / 1e9
        last = now
        flowView(m, mapView, density.density)?.let { flowEngine.frame(it, dt) }
        flowTick = flowEngine.version
        // Still trails are drawn again only after a move: looked at a few times a second.
        delay(if (flowEngine.still) STILL_MS else WindFlow.FRAME_MS - FRAME_SLACK_MS)
      }
    }
  }
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
    // The forecast wind's trails, over the map and under its cards, with nothing to touch: a touch goes to the map below.
    if (flowGrids != null) {
      val inks = if (ui.background == MapBackground.PlanIgn) WindField.INKS_LIGHT else WindField.INKS_DARK
      val paint = remember { Paint(Paint.ANTI_ALIAS_FLAG).apply { strokeCap = Paint.Cap.ROUND } }
      val mesh = remember { FlowMesh() }
      Spacer(
        // A layer of its own: each image draws the trails again, not the rest of the screen.
        Modifier.fillMaxSize().graphicsLayer().drawBehind {
          // Read here, so that each image only draws again, without composing the screen.
          if (flowTick < 0) return@drawBehind
          drawFlow(drawContext.canvas.nativeCanvas, flowEngine, mesh, inks, density.density, paint)
        }
      )
    }

    // Above the cards and the bar at the foot of the map while the menu is open: it is long enough to reach them.
    Column(Modifier.zIndex(if (layersOpen) 1f else 0f).fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      TopBar(viewModel, onBack, onLayers = { layersOpen = !layersOpen }) { hit ->
        layersOpen = false
        goTo(hit.lat, hit.lon, if (hit.spot) SPOT_ZOOM else TOWN_ZOOM, open = true)
        val spot = hit.id?.let(viewModel::spot)
        viewModel.open(if (spot != null) SeaMapViewModel.Sheet.Spot(spot) else SeaMapViewModel.Sheet.Town(Place(hit.name, hit.lat, hit.lon, hit.detail)))
      }
      if (layersOpen)
        BackgroundMenu(
          ui,
          weather,
          towns,
          flow,
          Modifier.align(Alignment.End),
          onTowns = viewModel.townWeather::show,
          onRain = viewModel.weather::showRain,
          onWind = viewModel.weather::showWind,
          onFlow = viewModel.windField::show,
        ) {
          viewModel.chooseBackground(it)
          layersOpen = false
        }
      // While the menu is open, the chips and the wind's legend would be pushed under it, over the cards at the foot of the map.
      if (!layersOpen) {
        Chips(ui.activity, viewModel::choose)
        if (flow.on) FlowCard(flow, weather.unit, onHide = { viewModel.windField.show(false) }, Modifier.padding(horizontal = 12.dp))
        if (weather.wind) WindCard(weather, onUnit = viewModel.weather::setUnit, onHide = { viewModel.weather.showWind(false) }, Modifier.padding(horizontal = 12.dp))
        // The foot of the controls above the map, where the towns' pills may begin.
        Spacer(Modifier.height(0.dp).onGloballyPositioned { free[0] = it.positionInRoot().y })
      }
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

    Column(
      Modifier.align(Alignment.BottomStart).fillMaxWidth().onGloballyPositioned { free[1] = it.positionInRoot().y }.windowInsetsPadding(WindowInsets.navigationBars),
      verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Column(Modifier.padding(horizontal = 8.dp).padding(bottom = if (sheet == null) 8.dp else 0.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        note?.let { n -> NoteBar(n) { note = null } }
        if (sheet == null && weather.rain && weather.area != null) RadarCard(weather, viewModel.weather)
        if (sheet == null && towns.on && towns.near) MomentBar(towns, viewModel.townWeather::choose)
        if (sheet == null) {
          Row(verticalAlignment = Alignment.Bottom) {
            Legend(Modifier.weight(1f))
            Round(R.drawable.ic_locate, stringResource(R.string.map_locate)) { if (Locator.granted(context)) locate() else askPosition.launch(Locator.PERMISSION) }
          }
          if (locateFailed) Small(stringResource(R.string.map_locate_none), VigieColors.Warning)
        }
        // On the legend's glass, so that a pin under them never makes them hard to read; above the sheet when it is open.
        val (credits, licence) =
          when (ui.background) {
            MapBackground.Dark -> R.string.map_credits to OSM_COPYRIGHT
            MapBackground.PlanIgn -> R.string.map_credits_plan_ign to LICENCE_OUVERTE
            // The names and the sea come from the dark plan: OpenStreetMap's licence asks for the link.
            MapBackground.PhotoIgn -> R.string.map_credits_photo_ign to OSM_COPYRIGHT
          }
        Small(
          stringResource(credits),
          VigieColors.Text2,
          Modifier.background(VigieColors.Bar, RoundedCornerShape(10.dp))
            .clickable {
              try {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(licence)))
              } catch (err: ActivityNotFoundException) {
                // No browser: the credits stay on screen all the same.
              }
            }
            .padding(horizontal = 8.dp, vertical = 4.dp),
        )
        val rainShown = weather.rain && weather.area != null
        val meteo = WeatherWords.meteoFranceLayers(rain = rainShown, wind = weather.wind, flow = flowGrids != null)
        val townsCredit = if (towns.on && towns.near) stringResource(R.string.map_credits_towns) else null
        val meteoCredit = meteo?.let { stringResource(R.string.map_credits_meteo_france, it) }
        // The forecast's own credit, without a licence: the one of PIAF is not checked yet (the API's `SOURCES.md`).
        val piafCredit = if (rainShown && weather.radar?.hasNowcast == true) stringResource(R.string.map_credits_piaf) else null
        listOfNotNull(townsCredit, meteoCredit, piafCredit).joinToString(" · ").takeIf { it.isNotEmpty() }?.let {
          Small(
            it,
            VigieColors.Text2,
            Modifier.background(VigieColors.Bar, RoundedCornerShape(10.dp))
              .clickable {
                try {
                  context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(LICENCE_OUVERTE)))
                } catch (err: ActivityNotFoundException) {
                  // No browser: the credits stay on screen all the same.
                }
              }
              .padding(horizontal = 8.dp, vertical = 4.dp),
          )
        }
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

/** A note of the map: what the star did, and « Annuler » while it shows; or what a wind's badge measured, under its [title]. */
private class Note(val text: String, val title: String? = null, val undo: (() -> Unit)? = null)

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
    Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
      note.title?.let { Text(it, color = VigieColors.Text, fontSize = 15.sp, fontWeight = FontWeight.Bold) }
      Text(note.text, color = if (note.title == null) VigieColors.Text else VigieColors.Text2, fontSize = 14.sp)
    }
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
      is SeaMapViewModel.Sheet.Town -> sheet.place.name to Words.where(sheet.place.region)
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
private fun TopBar(viewModel: SeaMapViewModel, onBack: () -> Unit, onLayers: () -> Unit, onHit: (SeaMapViewModel.Hit) -> Unit) {
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
      Spacer(Modifier.size(8.dp))
      Round(R.drawable.ic_layers, stringResource(R.string.map_layers)) {
        focus.clearFocus()
        onLayers()
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

/**
 * The backgrounds of the map, under the layers button: the dark plan, the IGN's plan and its photographs, the one shown
 * with its mark, a wheel on the one being read. Under them, the weather layers, each with a box to tick: the wind measured
 * and the rain radar, with what they show (the menu stays open when one is ticked).
 */
@Composable
private fun BackgroundMenu(
  ui: SeaMapViewModel.Ui,
  weather: MapWeatherModel.State,
  towns: TownWeatherModel.State,
  flow: WindFieldModel.State,
  modifier: Modifier,
  onTowns: (Boolean) -> Unit,
  onRain: (Boolean) -> Unit,
  onWind: (Boolean) -> Unit,
  onFlow: (Boolean) -> Unit,
  onChoose: (MapBackground) -> Unit,
) {
  Column(
    modifier.padding(horizontal = 12.dp).widthIn(max = 320.dp).background(VigieColors.Bar.copy(alpha = 1f), RoundedCornerShape(18.dp)).border(1.dp, VigieColors.GlassBorder, RoundedCornerShape(18.dp)).verticalScroll(rememberScrollState()).padding(vertical = 6.dp)
  ) {
    Text(stringResource(R.string.map_background_title), color = VigieColors.Text3, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
    MapBackground.entries.forEach { b ->
      val (name, detail) =
        when (b) {
          MapBackground.Dark -> R.string.map_background_dark to R.string.map_background_dark_detail
          MapBackground.PlanIgn -> R.string.map_background_plan_ign to R.string.map_background_plan_ign_detail
          MapBackground.PhotoIgn -> R.string.map_background_photo_ign to R.string.map_background_photo_ign_detail
        }
      val on = b == ui.chosen
      Row(
        Modifier.fillMaxWidth().clickable(role = Role.RadioButton) { onChoose(b) }.padding(horizontal = 16.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) {
          when {
            on && ui.backgroundBusy -> CircularProgressIndicator(color = VigieColors.Accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
            on -> Box(Modifier.size(18.dp).border(2.dp, VigieColors.Accent, CircleShape).padding(4.dp).clip(CircleShape).background(VigieColors.Accent))
            else -> Box(Modifier.size(18.dp).border(2.dp, VigieColors.Text3, CircleShape))
          }
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
          Text(stringResource(name), color = VigieColors.Text, fontSize = 15.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal)
          Text(stringResource(detail), color = VigieColors.Text3, fontSize = 12.sp, lineHeight = 15.sp)
        }
      }
    }
    Box(Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().height(1.dp).background(VigieColors.GlassBorder))
    Text(stringResource(R.string.map_layers_title), color = VigieColors.Text3, fontSize = 13.sp, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
    LayerRow(stringResource(R.string.map_towns), stringResource(R.string.map_towns_detail), towns.on) { onTowns(!towns.on) }
    if (towns.on) {
      MenuNote(stringResource(if (towns.near) R.string.map_towns_hint else R.string.map_towns_zoom_in))
      if (towns.paused) MenuNote(stringResource(R.string.map_towns_paused))
      if (towns.failed) MenuNote(stringResource(R.string.map_towns_failed))
    }
    // The forecast wind, then the wind measured, as in the site's menu.
    LayerRow(stringResource(R.string.map_flow), stringResource(R.string.map_flow_detail), flow.on) { onFlow(!flow.on) }
    if (flow.on) {
      val valid = flow.valid
      when {
        flow.answer?.status == "off" -> MenuNote(stringResource(R.string.map_flow_off))
        flow.answer?.status == "unavailable" || (flow.status == WindFieldModel.Status.Failed && flow.answer == null) -> MenuNote(stringResource(R.string.map_flow_failed))
        valid != null -> {
          val now = System.currentTimeMillis()
          val old = flow.answer?.stale == true || valid != WindField.nearestHour(now)
          MenuNote(stringResource(if (old) R.string.map_flow_legend_old else R.string.map_flow_legend, Words.clock(valid, TimeZone.getDefault().getOffset(valid * 1000) / 1000)))
          FlowScale(weather.unit, Modifier.padding(start = 48.dp, end = 16.dp, bottom = 6.dp))
          MenuNote(stringResource(R.string.map_flow_note))
        }
        else -> MenuNote(stringResource(R.string.map_flow_loading))
      }
    }
    LayerRow(stringResource(R.string.map_wind), stringResource(R.string.map_wind_detail), weather.wind) { onWind(!weather.wind) }
    if (weather.wind) MenuNote(stringResource(R.string.map_wind_note))
    LayerRow(stringResource(R.string.map_rain), stringResource(R.string.map_rain_detail), weather.rain) { onRain(!weather.rain) }
    if (weather.rain) MenuNote(stringResource(if (weather.area != null) R.string.map_rain_hint else R.string.map_rain_none))
  }
}

/** A weather layer of the menu: its box ticked when it is shown, its name and what it is. */
@Composable
private fun LayerRow(name: String, detail: String, on: Boolean, onToggle: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().clickable(role = Role.Checkbox, onClick = onToggle).padding(horizontal = 16.dp, vertical = 9.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(
      Modifier.size(20.dp).clip(RoundedCornerShape(5.dp)).background(if (on) VigieColors.Accent else Color.Transparent).border(2.dp, if (on) VigieColors.Accent else VigieColors.Text3, RoundedCornerShape(5.dp)),
      contentAlignment = Alignment.Center,
    ) {
      if (on) Icon(painterResource(R.drawable.ic_check), contentDescription = null, tint = VigieColors.OnPill, modifier = Modifier.size(16.dp))
    }
    Spacer(Modifier.size(12.dp))
    Column(Modifier.weight(1f)) {
      Text(name, color = VigieColors.Text, fontSize = 15.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal)
      Text(detail, color = VigieColors.Text3, fontSize = 12.sp, lineHeight = 15.sp)
    }
  }
}

@Composable
private fun MenuNote(text: String) {
  Text(text, color = VigieColors.Text3, fontSize = 12.sp, lineHeight = 15.sp, modifier = Modifier.padding(start = 48.dp, end = 16.dp, bottom = 6.dp))
}

/** A card over the map (the site's `.card`): dark glass, a thin border, its parts close together. */
@Composable
private fun WeatherCard(modifier: Modifier, content: @Composable ColumnScope.() -> Unit) {
  Column(
    modifier.background(VigieColors.Bar, RoundedCornerShape(14.dp)).border(1.dp, VigieColors.GlassBorder, RoundedCornerShape(14.dp)).padding(start = 10.dp, end = 2.dp, top = 2.dp, bottom = 8.dp),
    verticalArrangement = Arrangement.spacedBy(5.dp),
    content = content,
  )
}

/** The head of a card: its title, and a cross that turns its layer off. */
@Composable
private fun CardHead(title: String, hide: String, onHide: () -> Unit) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Text(title, color = VigieColors.Text2, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
    Box(Modifier.size(36.dp).clip(CircleShape).clickable(role = Role.Button, onClick = onHide), contentAlignment = Alignment.Center) {
      Icon(painterResource(R.drawable.ic_close), hide, tint = VigieColors.Text3, modifier = Modifier.size(16.dp))
    }
  }
}

/** A line of a card: what is being read, what failed, what is missing. */
@Composable
private fun CardNote(text: String) {
  Text(text, color = VigieColors.Text3, fontSize = 12.sp, lineHeight = 15.sp, modifier = Modifier.padding(end = 8.dp))
}

/** The two inks of the forecast wind's trails, each with the strength from which it is drawn in the [unit] chosen (the site's `FlowScale`). */
@Composable
private fun FlowScale(unit: WindUnit, modifier: Modifier) {
  val strong = WeatherWords.flowStrong(WindField.STRONG_KMH[0], unit)
  val stronger = WeatherWords.flowStrong(WindField.STRONG_KMH[1], unit)
  val scale = stringResource(R.string.map_flow_scale, strong, stronger)
  Row(modifier.semantics(mergeDescendants = true) { contentDescription = scale }, horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.CenterVertically) {
    listOf(1 to strong, 2 to stronger).forEach { (ink, text) ->
      Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(width = 16.dp, height = 2.dp).clip(RoundedCornerShape(1.dp)).background(Color(WindField.INKS_DARK[ink])))
        Spacer(Modifier.size(6.dp))
        Text(text, color = VigieColors.Text3, fontSize = 11.5.sp, lineHeight = 14.sp, maxLines = 1)
      }
    }
  }
}

/**
 * The card of the forecast wind, under the chips while the layer is on: the hour of the forecast drawn, the two inks of a strong
 * wind and a cross that turns the layer off. Its legend in full is in the layers' menu, as on the site.
 */
@Composable
private fun FlowCard(flow: WindFieldModel.State, unit: WindUnit, onHide: () -> Unit, modifier: Modifier) {
  val valid = flow.valid
  WeatherCard(modifier.widthIn(max = 300.dp)) {
    CardHead(valid?.let { stringResource(R.string.map_flow_at, Words.clock(it, TimeZone.getDefault().getOffset(it * 1000) / 1000)) } ?: stringResource(R.string.map_flow), stringResource(R.string.map_flow_hide), onHide)
    when {
      flow.answer?.status == "off" -> CardNote(stringResource(R.string.map_flow_off))
      flow.answer?.status == "unavailable" || (flow.status == WindFieldModel.Status.Failed && flow.answer == null) -> CardNote(stringResource(R.string.map_flow_failed))
      valid == null || flow.shown == null -> CardNote(stringResource(R.string.map_flow_loading))
      else -> FlowScale(unit, Modifier.padding(end = 8.dp))
    }
  }
}

/** The trails of an image: in one go as triangles, or stroked one by one on Android 9 and before (still, drawn once a move). */
private fun drawFlow(canvas: android.graphics.Canvas, flow: WindFlow, mesh: FlowMesh, inks: IntArray, density: Float, paint: Paint) {
  val segments = flow.segments()
  if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
    mesh.build(segments, flow.segmentCount, inks, density)
    var from = 0
    while (from < mesh.count) {
      val n = minOf(FlowMesh.CHUNK, mesh.count - from)
      canvas.drawVertices(android.graphics.Canvas.VertexMode.TRIANGLES, n * 8, mesh.xy, from * 8, null, 0, mesh.colors, from * 4, mesh.indices, 0, n * 6, paint)
      from += n
    }
    return
  }
  for (k in 0 until flow.segmentCount) {
    val o = k * WindFlow.SEGMENT_FLOATS
    val ink = segments[o + 6].toInt()
    paint.color = inks[ink]
    paint.alpha = (segments[o + 4] * 255).roundToInt().coerceIn(0, 255)
    paint.strokeWidth = WindFlow.widthDp(ink) * density
    canvas.drawLine(segments[o], segments[o + 1], segments[o + 2], segments[o + 3], paint)
  }
}

/** Where the map lies on the screen for one image of the trails; null before it has a size. */
private fun flowView(m: MapLibreMap, view: View, density: Float): FlowView? {
  val target = m.cameraPosition.target ?: return null
  if (view.width < 2 || view.height < 2) return null
  // A degree to the east, or to the west near the antimeridian: its length in pixels sizes the whole map.
  val d = if (target.longitude > 0) -1.0 else 1.0
  val p0 = m.projection.toScreenLocation(target)
  val p1 = m.projection.toScreenLocation(LatLng(target.latitude, target.longitude + d))
  val pxPerDeg = (p1.x - p0.x) / d
  if (!(pxPerDeg > 0)) return null
  return FlowView(p0.x.toDouble(), p0.y.toDouble(), target.longitude, target.latitude, pxPerDeg, view.width, view.height, density.toDouble())
}

/**
 * The card of the wind measured, under the chips while the layer is on (the site's `WindCard`): the time of the newest
 * observation, the unit (km/h or knots, kept on the phone), the legend of the five colours and their limits in that unit, a
 * cross that turns the layer off.
 */
@Composable
private fun WindCard(weather: MapWeatherModel.State, onUnit: (WindUnit) -> Unit, onHide: () -> Unit, modifier: Modifier) {
  val data = weather.windMap
  val now = System.currentTimeMillis()
  val offset = TimeZone.getDefault().getOffset(now) / 1000
  val unit = weather.unit
  val legend = WeatherWords.windLegend(unit)
  WeatherCard(modifier.widthIn(max = 240.dp)) {
    CardHead(data?.measured?.let { stringResource(R.string.map_wind_at, Words.clock(it, offset)) } ?: stringResource(R.string.map_wind), stringResource(R.string.map_wind_hide), onHide)
    UnitChoice(unit, onUnit, Modifier.padding(end = 8.dp))
    Column(Modifier.padding(end = 8.dp).semantics { contentDescription = legend }) {
      Row(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp))) {
        (1..5).forEach { step -> Box(Modifier.weight(1f).fillMaxHeight().background(hexColour(MapWeather.WIND_COLOURS.getValue(step)))) }
      }
      Spacer(Modifier.height(2.dp))
      Marks(WeatherWords.windMarks(unit).mapIndexed { i, v -> Mark((i + 1) / 5f, v.toString(), 0) } + Mark(1f, WeatherWords.unitName(unit), 1))
    }
    when {
      weather.windStatus == MapWeatherModel.Status.Failed && data == null -> CardNote(stringResource(R.string.map_wind_failed))
      data == null -> CardNote(stringResource(R.string.map_wind_loading))
      data.points.isEmpty() -> CardNote(stringResource(R.string.map_wind_empty))
    }
  }
}

/** The two buttons of the wind's unit (the site's `.units`): the one chosen ringed and written in the accent colour. */
@Composable
private fun UnitChoice(unit: WindUnit, onUnit: (WindUnit) -> Unit, modifier: Modifier) {
  val label = stringResource(R.string.map_wind_unit)
  Row(modifier.fillMaxWidth().selectableGroup().semantics { contentDescription = label }, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    WindUnit.entries.forEach { u ->
      val on = u == unit
      Box(
        Modifier.weight(1f)
          .heightIn(min = 30.dp)
          .clip(RoundedCornerShape(50))
          .background(if (on) VigieColors.Accent.copy(alpha = 0.16f) else Color.Transparent)
          .border(1.dp, if (on) VigieColors.Accent else VigieColors.GlassBorder, RoundedCornerShape(50))
          .selectable(selected = on, role = Role.RadioButton) { onUnit(u) },
        contentAlignment = Alignment.Center,
      ) {
        Text(
          WeatherWords.unitName(u),
          color = if (on) VigieColors.Accent else VigieColors.Text3,
          fontSize = 12.sp,
          fontWeight = if (on) FontWeight.Bold else FontWeight.Normal,
          maxLines = 1,
        )
      }
    }
  }
}

/**
 * The card of the rain radar, above the legend while the layer is on and the map on an area of the radar (the site's
 * `RadarCard`): the time of the image, Play or Pause, a slider over the last 35 minutes, the legend of the intensities,
 * and « Mesuré par radar, pas une prévision. ». On France the slider goes on into the rain nowcast PIAF of the next hour:
 * two buttons go to the newest image measured or to the first forecast, a mark on the slider parts them, and the title
 * and the note say when an image is a forecast.
 */
@Composable
private fun RadarCard(weather: MapWeatherModel.State, model: MapWeatherModel) {
  val radar = weather.radar
  val hide = stringResource(R.string.map_rain_hide)
  WeatherCard(Modifier.fillMaxWidth().widthIn(max = 360.dp)) {
    val epoch = weather.epoch
    if (radar == null || epoch == null) {
      CardHead(stringResource(R.string.map_rain_title), hide) { model.showRain(false) }
      CardNote(stringResource(if (weather.radarStatus == MapWeatherModel.Status.Failed) R.string.map_rain_failed else R.string.map_rain_loading))
      return@WeatherCard
    }
    val offset = TimeZone.getDefault().getOffset(epoch * 1000) / 1000
    val time = Words.clock(epoch, offset)
    val lead = weather.frame?.leadMinutes
    CardHead(if (lead != null) stringResource(R.string.map_rain_nowcast_at, WeatherWords.lead(lead), time) else stringResource(R.string.map_rain_at, time), hide) {
      model.showRain(false)
    }
    if (radar.hasNowcast) PhaseChoice(forecast = lead != null, onObserved = { model.choose(radar.observedCount - 1) }, onForecast = { model.choose(radar.observedCount) })
    val frames = radar.timeline
    // Where the measured images end on the slider, as the site's mark between « Observé » and the forecast.
    val split = if (radar.hasNowcast) (radar.observedCount - 1) / (frames.size - 1).toFloat() else null
    Row(Modifier.padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
      Row(
        Modifier.height(32.dp)
          .clip(RoundedCornerShape(16.dp))
          .border(1.dp, VigieColors.GlassBorder, RoundedCornerShape(16.dp))
          .clickable(enabled = frames.size > 1, role = Role.Button) { model.togglePlay() }
          .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Icon(painterResource(if (weather.playing) R.drawable.ic_pause else R.drawable.ic_play), contentDescription = null, tint = VigieColors.Accent, modifier = Modifier.size(16.dp))
        Spacer(Modifier.size(5.dp))
        Text(stringResource(if (weather.playing) R.string.map_rain_pause else R.string.map_rain_play), color = VigieColors.Text, fontSize = 13.sp)
      }
      Spacer(Modifier.size(8.dp))
      if (frames.size > 1) {
        val slider = stringResource(R.string.map_rain_slider)
        Slider(
          value = weather.index.toFloat(),
          onValueChange = { model.choose(it.roundToInt()) },
          valueRange = 0f..(frames.size - 1).toFloat(),
          steps = frames.size - 2,
          // A quiet track: the thumb, in the accent, says which image is shown; a tick per image.
          colors =
            SliderDefaults.colors(
              thumbColor = VigieColors.Accent,
              activeTrackColor = VigieColors.Accent.copy(alpha = 0.35f),
              inactiveTrackColor = VigieColors.Rule.copy(alpha = 0.45f),
              activeTickColor = VigieColors.Accent,
              inactiveTickColor = VigieColors.Text3,
            ),
          modifier =
            Modifier.weight(1f)
              .height(32.dp)
              .drawBehind { split?.let { splitMark(it) } }
              .semantics {
                contentDescription = slider
                stateDescription = if (lead != null) "$time (${WeatherWords.lead(lead)})" else time
              },
        )
      }
    }
    val classes = radar.legend
    val legend = stringResource(R.string.map_rain_legend)
    val unit = stringResource(R.string.map_rain_unit)
    Column(Modifier.padding(end = 8.dp).semantics { contentDescription = legend + " : " + classes.joinToString(", ") { "≥ " + WeatherWords.rate(it.minMmH) } + " " + unit }) {
      Row(Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp))) {
        classes.forEach { c -> Box(Modifier.weight(1f).fillMaxHeight().background(hexColour(c.color).copy(alpha = c.alpha.toFloat()))) }
      }
      Spacer(Modifier.height(2.dp))
      Marks(
        WeatherWords.radarMarks(classes.size).map { i ->
          if (i == classes.lastIndex) Mark(1f, WeatherWords.rate(classes[i].minMmH) + " " + unit, 1) else Mark(i / classes.size.toFloat(), WeatherWords.rate(classes[i].minMmH), -1)
        }
      )
    }
    CardNote(stringResource(if (lead != null) R.string.map_rain_nowcast_note else R.string.map_rain_measured))
  }
}

/**
 * Where the ticks of Material's slider (1.4) start and end inside it: the first and the last image. Measured on the Pixel
 * (a capture at 1 440 px): with 2 dp, the mark stood 10 px before the tick of the newest image measured.
 */
private val TICK_INSET = 12.dp

/** The height of the mark: a little more than the track (16 dp), as the site's stands across its slider. */
private val SPLIT_HEIGHT = 24.dp

/** The site's `.split-mark`: 2 dp of the text's colour, a little see-through, on the tick at [at] (0 to 1), under the slider. */
private fun DrawScope.splitMark(at: Float) {
  val inset = TICK_INSET.toPx()
  val width = 2.dp.toPx()
  val height = SPLIT_HEIGHT.toPx()
  val x = inset + at * (size.width - 2 * inset)
  drawRect(VigieColors.Text.copy(alpha = 0.45f), topLeft = Offset(x - width / 2, (size.height - height) / 2), size = Size(width, height))
}

/**
 * The two parts of the radar's slider (the site's `.phase`): « Observé » goes to the newest image measured, « Prévision PIAF
 * +1 h » to the first forecast. The part shown is ringed and written in the accent colour, the forecast's ring dashed.
 */
@Composable
private fun PhaseChoice(forecast: Boolean, onObserved: () -> Unit, onForecast: () -> Unit) {
  Row(Modifier.padding(end = 8.dp).selectableGroup(), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
    PhasePart(stringResource(R.string.map_rain_phase_observed), on = !forecast, dashed = false, onObserved)
    Text("|", color = VigieColors.Rule, fontSize = 12.sp)
    PhasePart(stringResource(R.string.map_rain_phase_nowcast), on = forecast, dashed = true, onForecast)
  }
}

@Composable
private fun PhasePart(text: String, on: Boolean, dashed: Boolean, onClick: () -> Unit) {
  Box(
    Modifier.heightIn(min = 30.dp)
      .clip(RoundedCornerShape(50))
      .background(if (on) VigieColors.Accent.copy(alpha = 0.16f) else Color.Transparent)
      .drawBehind {
        if (!on) return@drawBehind
        val stroke = 1.dp.toPx()
        val dash = if (dashed) PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 3.dp.toPx())) else null
        drawRoundRect(
          VigieColors.Accent,
          topLeft = Offset(stroke / 2, stroke / 2),
          size = Size(size.width - stroke, size.height - stroke),
          cornerRadius = CornerRadius(size.height / 2),
          style = Stroke(stroke, pathEffect = dash),
        )
      }
      .selectable(selected = on, role = Role.RadioButton, onClick = onClick)
      .padding(horizontal = 10.dp),
    contentAlignment = Alignment.Center,
  ) {
    Text(text, color = if (on) VigieColors.Accent else VigieColors.Text3, fontSize = 12.sp, fontWeight = if (on) FontWeight.Bold else FontWeight.Normal, maxLines = 1)
  }
}

/** A mark under a legend's bar: its place along the bar (0 to 1), its text, aligned on it from the start (-1), the centre (0) or the end (1). */
private class Mark(val at: Float, val text: String, val align: Int)

/** The marks under a legend's bar, each at its place, kept inside the bar's width. */
@Composable
private fun Marks(marks: List<Mark>) {
  Layout(
    content = { marks.forEach { Text(it.text, color = VigieColors.Text3, fontSize = 10.5.sp, lineHeight = 12.sp, maxLines = 1) } },
    modifier = Modifier.fillMaxWidth(),
  ) { measurables, constraints ->
    val placed = measurables.map { it.measure(constraints.copy(minWidth = 0)) }
    val width = constraints.maxWidth
    layout(width, placed.maxOfOrNull { it.height } ?: 0) {
      placed.forEachIndexed { i, p ->
        val m = marks[i]
        val x =
          when (m.align) {
            -1 -> m.at * width
            0 -> m.at * width - p.width / 2f
            else -> m.at * width - p.width
          }
        p.placeRelative(x.roundToInt().coerceIn(0, (width - p.width).coerceAtLeast(0)), 0)
      }
    }
  }
}

private fun hexColour(hex: String): Color = Color(android.graphics.Color.parseColor(hex))

/** The box of the map in view, for the weather layers. */
private fun viewOf(m: MapLibreMap): GeoBox {
  val b = m.projection.visibleRegion.latLngBounds
  return GeoBox(b.longitudeWest, b.latitudeSouth, b.longitudeEast, b.latitudeNorth)
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

/**
 * The bar under the map while the towns' layer is on (the site's `MomentBar`): the moment the pills show, now, in 3, 6 and 9
 * hours, tomorrow at 8 and 14 h at each town's clock, the two days after; one pressed at a time, the hours at the phone's clock.
 */
@Composable
private fun MomentBar(towns: TownWeatherModel.State, onChoose: (Int) -> Unit) {
  val offset = TimeZone.getDefault().getOffset(towns.nowS * 1000) / 1000
  val label = stringResource(R.string.map_towns_moment)
  Row(
    Modifier.background(VigieColors.Bar, RoundedCornerShape(12.dp))
      .border(1.dp, VigieColors.GlassBorder, RoundedCornerShape(12.dp))
      .horizontalScroll(rememberScrollState())
      .padding(horizontal = 5.dp, vertical = 5.dp)
      .semantics { contentDescription = label },
    horizontalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    towns.choices.forEachIndexed { i, m ->
      val on = i == towns.moment
      Text(
        WeatherWords.moment(m, towns.nowS, offset),
        color = if (on) VigieColors.OnPill else VigieColors.Text,
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        modifier =
          Modifier.clip(RoundedCornerShape(8.dp))
            .background(if (on) VigieColors.Accent else Color.Transparent)
            .clickable(role = Role.Tab) { onChoose(i) }
            .padding(horizontal = 10.dp, vertical = 6.dp),
      )
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

private tailrec fun Context.activity(): Activity? =
  when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.activity()
    else -> null
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
/** The licence of the IGN's data (Licence Ouverte 2.0, Etalab). */
private const val LICENCE_OUVERTE = "https://www.etalab.gouv.fr/licence-ouverte-open-licence/"
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
/** The weather layers are asked again, when old, this often while the map is shown. */
private const val SYNC_MS = 60_000L
/** Still trails (the phone's animations off) are looked at this often, to be drawn again after a move. */
private const val STILL_MS = 250L
/** The trails' next image is asked a little before its time: the screen's next frame comes after. */
private const val FRAME_SLACK_MS = 8L
/** While zooming, the wind's badges are laid out again each time the zoom moves this much. */
private const val WIND_RELAYOUT_ZOOM = 0.33
/** A town of the base map this near a followed place of the same name is that place. */
private const val SAME_TOWN_KM = 5.0
