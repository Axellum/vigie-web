package fr.auxfilsdesidees.vigie.ui.map

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
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
import fr.auxfilsdesidees.vigie.data.MapActivity
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.SeaMap
import fr.auxfilsdesidees.vigie.ui.ActivityGlyph
import fr.auxfilsdesidees.vigie.ui.Locator
import fr.auxfilsdesidees.vigie.ui.Words
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import kotlin.coroutines.resume
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
 * tabs ([start]); the system's back, or the arrow, goes back to them.
 */
@Composable
fun SeaMapScreen(viewModel: SeaMapViewModel, start: Place?, onBack: () -> Unit) {
  val ui by viewModel.ui.collectAsStateWithLifecycle()
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  LaunchedEffect(viewModel) { viewModel.load() }

  // Where the map looks, kept when the screen turns: the place shown at first.
  var camera by rememberSaveable { mutableStateOf(start?.let { listOf(it.lat, it.lon, START_ZOOM) } ?: FRANCE) }
  val mapView = rememberMapView()
  var map by remember { mutableStateOf<MapLibreMap?>(null) }
  var style by remember { mutableStateOf<Style?>(null) }
  var me by remember { mutableStateOf<Pair<Double, Double>?>(null) }
  var locateFailed by remember { mutableStateOf(false) }

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
    map = m
  }
  LaunchedEffect(map, ui.style) {
    val m = map ?: return@LaunchedEffect
    val json = ui.style ?: return@LaunchedEffect
    if (style != null) return@LaunchedEffect
    m.setStyle(Style.Builder().fromJson(json)) { loaded ->
      MapLayers.add(loaded)
      style = loaded
    }
  }
  LaunchedEffect(style, ui.pins) { style?.let { MapLayers.show(it, ui.pins, context) } }
  LaunchedEffect(style, me) {
    val s = style ?: return@LaunchedEffect
    me?.let { (lat, lon) -> MapLayers.showMe(s, lat, lon) }
  }

  fun goTo(lat: Double, lon: Double, zoom: Double) {
    map?.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(lat, lon), zoom))
  }

  fun locate() {
    scope.launch {
      val at = Locator.locate(context)
      locateFailed = at == null
      if (at != null) {
        me = at.latitude to at.longitude
        goTo(at.latitude, at.longitude, LOCATE_ZOOM)
      }
    }
  }
  val askPosition = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> if (ok) locate() else locateFailed = true }

  Box(Modifier.fillMaxSize().background(Color(LAND))) {
    AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())

    Column(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(top = 6.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      TopBar(viewModel, onBack) { hit -> goTo(hit.lat, hit.lon, if (hit.spot) SPOT_ZOOM else TOWN_ZOOM) }
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

    Column(
      Modifier.align(Alignment.BottomStart).fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).padding(8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
      Row(verticalAlignment = Alignment.Bottom) {
        Legend(Modifier.weight(1f))
        Round(R.drawable.ic_locate, stringResource(R.string.map_locate)) { if (Locator.granted(context)) locate() else askPosition.launch(Locator.PERMISSION) }
      }
      if (locateFailed) Small(stringResource(R.string.map_locate_none), VigieColors.Warning)
      // On the legend's glass, so that a pin under them never makes them hard to read.
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
