package fr.auxfilsdesidees.vigie.ui

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.ActivityVerdict
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.Spot
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

private enum class Tab(@StringRes val label: Int, @DrawableRes val icon: Int) {
  Home(R.string.tab_home, R.drawable.ic_tab_home),
  Hours(R.string.tab_hours, R.drawable.ic_tab_hours),
  Sea(R.string.tab_sea, R.drawable.ic_tab_sea),
}

/**
 * The app's frame: the sky behind everything, three tabs at the bottom, switched instantly (no animation, by taste). No
 * place followed yet: the first-launch steps instead. The Accueil swipes between the followed places; the Heures and
 * Mer tabs show the place shown last. The gear of the Accueil and « Choisir des spots » open [onSettings]; the warning
 * banner of the Accueil opens [onWarnings].
 */
@Composable
fun VigieApp(viewModel: HomeViewModel, onSettings: () -> Unit, onWarnings: () -> Unit) {
  val app by viewModel.app.collectAsStateWithLifecycle()
  if (app.firstLaunch) {
    FirstLaunch(viewModel)
    return
  }
  var tab by rememberSaveable { mutableIntStateOf(0) }
  Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(VigieColors.SkyTop, VigieColors.SkyBottom)))) {
    Scaffold(
      containerColor = Color.Transparent,
      bottomBar = {
        NavigationBar(containerColor = VigieColors.Bar) {
          Tab.entries.forEachIndexed { i, t ->
            NavigationBarItem(
              selected = tab == i,
              onClick = { tab = i },
              icon = { Icon(painterResource(t.icon), contentDescription = null) },
              label = { Text(stringResource(t.label)) },
              colors =
                NavigationBarItemDefaults.colors(
                  selectedIconColor = VigieColors.Accent,
                  selectedTextColor = VigieColors.Accent,
                  indicatorColor = VigieColors.Accent.copy(alpha = 0.18f),
                  unselectedIconColor = VigieColors.Text3,
                  unselectedTextColor = VigieColors.Text3,
                ),
            )
          }
        }
      },
    ) { padding ->
      val place = app.choices.currentPlace
      if (place != null) {
        when (Tab.entries[tab]) {
          Tab.Home -> HomePager(app, viewModel, padding, onSettings, onWarnings)
          Tab.Hours -> PlaceContent(app.stateOf(place), padding, viewModel::refresh) { HoursTab(it, followsSpots = place.spots.isNotEmpty()) }
          Tab.Sea -> PlaceContent(app.stateOf(place), padding, viewModel::refresh) { SeaTab(it.snapshot, place.spots.isEmpty(), onSettings) }
        }
      }
    }
  }
}

/**
 * The Accueil: one page per followed place, swiped left and right. The pager starts on the place shown last and tells the
 * view model which page settled; it is not restored from a saved state, so a place chosen in the settings wins.
 */
@Composable
private fun HomePager(app: AppState, viewModel: HomeViewModel, padding: PaddingValues, onSettings: () -> Unit, onWarnings: () -> Unit) {
  val places = app.choices.places
  val count by rememberUpdatedState(places.size)
  val pager = remember { PagerState(currentPage = app.choices.current) { count } }
  LaunchedEffect(pager) { snapshotFlow { pager.settledPage }.collect { viewModel.select(it) } }
  LaunchedEffect(app.choices.current) { if (pager.currentPage != app.choices.current) pager.scrollToPage(app.choices.current) }
  HorizontalPager(pager, Modifier.fillMaxSize().padding(padding), key = { places.getOrNull(it)?.key ?: it }) { page ->
    val f = places.getOrNull(page)
    if (f != null) {
      PlaceContent(app.stateOf(f), PaddingValues(0.dp), viewModel::refresh) {
        // The banner opens the warnings of the place shown: its page is the current place once settled, select it anyway.
        HomeTab(it, page, places.size, onSettings) {
          viewModel.select(page)
          onWarnings()
        }
      }
    }
  }
}

/** What was read for a place: a wait, a failure with « Réessayer », or the [content] with « pull to refresh ». */
@Composable
private fun PlaceContent(state: HomeState, padding: PaddingValues, onRefresh: () -> Unit, content: @Composable (HomeState.Ready) -> Unit) {
  when (state) {
    HomeState.Loading -> Centered(padding) { CircularProgressIndicator(color = VigieColors.Accent); Text(stringResource(R.string.loading), color = VigieColors.Text2) }
    is HomeState.Failed ->
      Centered(padding) {
        Text(state.message, color = VigieColors.Text, textAlign = TextAlign.Center)
        TextButton(onClick = onRefresh) { Text(stringResource(R.string.retry), color = VigieColors.Accent) }
      }
    is HomeState.Ready -> Refreshable(state, padding, onRefresh) { content(state) }
  }
}

@Composable
private fun Centered(padding: PaddingValues, content: @Composable () -> Unit) {
  Column(
    Modifier.fillMaxSize().padding(padding).padding(24.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    content()
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Refreshable(state: HomeState.Ready, padding: PaddingValues, onRefresh: () -> Unit, content: @Composable () -> Unit) {
  PullToRefreshBox(isRefreshing = state.refreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize().padding(padding)) {
    Column(
      Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 12.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
      content()
      Spacer(Modifier.height(8.dp))
    }
  }
}

// ------------------------------------------------------------------------------------------------------------ pieces

@Composable
internal fun Glass(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
  val shape = RoundedCornerShape(22.dp)
  Column(
    modifier.fillMaxWidth().background(VigieColors.Glass, shape).border(1.5.dp, VigieColors.GlassBorder, shape).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    content()
  }
}

@Composable
private fun Pill(text: String, color: Color) {
  Text(
    text,
    color = VigieColors.OnPill,
    style = MaterialTheme.typography.titleMedium,
    modifier = Modifier.background(color, RoundedCornerShape(50)).padding(horizontal = 12.dp, vertical = 4.dp),
  )
}

@Composable
private fun Fact(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
  Column(modifier) {
    Text(label, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
    Text(value, color = color, style = MaterialTheme.typography.titleMedium)
  }
}

@Composable
internal fun Freshness(state: HomeState.Ready) {
  val p = state.snapshot.point
  val time = Words.clock(p.serverUtc, p.utcOffsetS)
  when {
    state.error != null -> Text(stringResource(R.string.old_data, time, state.error), color = VigieColors.Warning, style = MaterialTheme.typography.labelMedium)
    state.refreshing -> Text(stringResource(R.string.refreshing), color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
    else -> Text(stringResource(R.string.read_at, time), color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
  }
}

@Composable
internal fun Credits(text: String) {
  Text(text, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
}

// ----------------------------------------------------------------------------------------------------------- the tabs

@Composable
private fun HomeTab(state: HomeState.Ready, page: Int, pages: Int, onSettings: () -> Unit, onWarnings: () -> Unit) {
  val snap = state.snapshot
  val p = snap.point
  val vigil = Vigil.view(snap.vigilances, p.serverUtc)
  Row(verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
      Text(snap.place.name, color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
      Freshness(state)
      if (pages > 1) {
        val label = stringResource(R.string.page_of, page + 1, pages)
        PageDots(page, pages, Modifier.padding(top = 6.dp).semantics { contentDescription = label })
      }
    }
    IconButton(onClick = onSettings, modifier = Modifier.background(Color.White.copy(alpha = 0.12f), CircleShape)) {
      Icon(painterResource(R.drawable.ic_settings), stringResource(R.string.settings_title), tint = VigieColors.Text)
    }
  }
  // The official warnings of the place (`/v1/vigilances`), never `local_alert_level`, a level Vigie works out over a wide
  // radius: on 22/11/2026 it said green at Ajaccio while Météo-France had the wind in orange there.
  WarningBanner(vigil, p.serverUtc, p.utcOffsetS, onWarnings)
  Glass {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Text(Words.degrees(p.tempC), color = VigieColors.temperature(p.tempC), style = MaterialTheme.typography.displayLarge)
      Spacer(Modifier.width(16.dp))
      Column {
        // `current` has no day/night flag: the first hour of `hourly` (the hour under way) tells it.
        Text(Words.weatherAt(p.weatherCode, p.hours.firstOrNull()?.isDay), color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
        if (p.feelsLikeC != null) Text(stringResource(R.string.feels_like, Words.degrees(p.feelsLikeC)), color = VigieColors.Text2, style = MaterialTheme.typography.bodyLarge)
      }
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
      Fact(stringResource(R.string.wind), "${Words.kmh(p.windKmh)} ${Words.windFrom(p.windDeg)}".trim(), VigieColors.Wind, Modifier.weight(1.4f))
      Fact(stringResource(R.string.gusts), Words.kmh(p.gustKmh), VigieColors.Wind, Modifier.weight(1f))
    }
    // The rain of the hour to come in the site widget's words (`rain_nowcast`), no longer the millimetres of the last hour.
    val rain = RainHour.view(p, System.currentTimeMillis() / 1000)
    Column {
      Text(RainHour.title(rain), color = if (rain.status == RainHour.Status.Unknown) VigieColors.Text3 else VigieColors.Rain, style = MaterialTheme.typography.titleMedium)
      RainHour.detail(rain)?.let { Text(it, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium) }
    }
  }
  if (p.days.isNotEmpty()) {
    Glass {
      Text(stringResource(R.string.next_days), color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
      p.days.take(5).forEachIndexed { i, d ->
        val name = Words.relativeDay(p.serverUtc + i * 86_400L, p.serverUtc, p.utcOffsetS).replaceFirstChar { it.uppercase() }
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
          Text(name, color = if (i == 0) VigieColors.Accent else VigieColors.Text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1.1f))
          Text(Words.weather(d.code), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1.3f))
          // the highest first, then the lowest, as the site's widget and the Home Assistant card write them
          Text(Words.degrees(d.tmaxC), color = VigieColors.temperature(d.tmaxC), style = MaterialTheme.typography.titleMedium, modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
          Text(Words.degrees(d.tminC), color = VigieColors.temperature(d.tminC), style = MaterialTheme.typography.titleMedium, modifier = Modifier.width(44.dp), textAlign = TextAlign.End)
          Text(Words.mm(d.rainMm), color = VigieColors.Rain, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.width(64.dp), textAlign = TextAlign.End)
        }
      }
    }
  }
  if (p.provider != null) Credits(stringResource(R.string.credits_weather, p.provider))
  if (vigil.live.isNotEmpty()) Credits(stringResource(R.string.credits_vigil, Vigil.issuers(vigil.live)))
}

@Composable
private fun SeaTab(snap: Snapshot, noneFollowed: Boolean, onSettings: () -> Unit) {
  Column {
    Text(stringResource(R.string.sea_title), color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
    Text(snap.place.name, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
  }
  if (noneFollowed) {
    Text(stringResource(R.string.sea_none_followed, Words.near(snap.place.name)), color = VigieColors.Text2, style = MaterialTheme.typography.bodyLarge)
  } else {
    if (snap.spotsStale) Text(stringResource(R.string.sea_stale), color = VigieColors.Warning, style = MaterialTheme.typography.bodyMedium)
    if (snap.spots.isEmpty()) Text(stringResource(R.string.sea_none), color = VigieColors.Text2, style = MaterialTheme.typography.bodyLarge)
    snap.spots.forEach { SpotCard(it, snap.point.serverUtc, snap.point.utcOffsetS) }
  }
  AccentAction(R.drawable.ic_add, stringResource(R.string.sea_choose), onSettings)
  if (!noneFollowed) {
    Text(stringResource(R.string.sea_rules), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
    Credits(stringResource(R.string.credits_sea))
  }
}

@Composable
private fun SpotCard(spot: Spot, nowUtc: Long, offsetS: Int) {
  Glass {
    Column {
      Text(spot.name, color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
      if (spot.place != null) Text(spot.place, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
    }
    spot.activities.forEach { ActivityRow(it, nowUtc, offsetS) }
  }
}

@Composable
private fun ActivityRow(a: ActivityVerdict, nowUtc: Long, offsetS: Int) {
  Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
      Text(Words.activity(a.id), color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
      Text(Words.verdictLine(a, nowUtc, offsetS), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
    }
    Spacer(Modifier.width(8.dp))
    if (a.available && a.verdict != null) Pill(Words.verdict(a.verdict), VigieColors.verdict(a.verdict))
  }
}
