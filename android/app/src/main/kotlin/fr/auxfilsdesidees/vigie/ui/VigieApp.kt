package fr.auxfilsdesidees.vigie.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.ui.board.BoardPages
import fr.auxfilsdesidees.vigie.ui.board.DetailsBoard
import fr.auxfilsdesidees.vigie.ui.board.DetailsBoardView
import fr.auxfilsdesidees.vigie.ui.board.HomeBoardView
import fr.auxfilsdesidees.vigie.ui.board.SeaBoard
import fr.auxfilsdesidees.vigie.ui.board.SeaBoardView
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

/** The tabs, in the bar of the head of the card. « Détails » is there only when the place has details (as in the card). */
private enum class Tab(@StringRes val label: Int) {
  Home(R.string.tab_home),
  Details(R.string.tab_details),
  Hours(R.string.tab_hours),
  Sea(R.string.tab_sea),
}

/**
 * The app's frame, as the Home Assistant card (sketch 3, chosen by the author on 27/11/2026): nothing fixed around the card, no
 * bar at the bottom. The place, the time of the read, the warnings and the gear are in the head of the glass card, with the bar
 * Accueil · Détails · Heures · Mer; everything scrolls, the system bars included, and a tab is changed at the top of the page.
 * The tabs switch instantly (no animation, by taste). No place followed yet: the first-launch steps instead. Accueil and
 * Détails swipe between the followed places; Heures and Mer show the place shown last (their frise and cards keep the finger).
 * The gear and « Choisir des spots » open [onSettings]; the warning banner and the warning mark of the head open [onWarnings].
 */
@Composable
fun VigieApp(viewModel: HomeViewModel, sea: SeaViewModel, onSettings: () -> Unit, onWarnings: () -> Unit) {
  val app by viewModel.app.collectAsStateWithLifecycle()
  if (app.firstLaunch) {
    FirstLaunch(viewModel)
    return
  }
  var shown by rememberSaveable { mutableIntStateOf(0) }
  val tab = Tab.entries[shown]
  val onTab = { t: Tab -> shown = t.ordinal }
  Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(VigieColors.SkyTop, VigieColors.SkyBottom)))) {
    val place = app.choices.currentPlace
    if (place != null) {
      when (tab) {
        Tab.Home,
        Tab.Details -> HomePager(app, viewModel, tab, onTab, onSettings, onWarnings)
        Tab.Hours ->
          PlaceContent(app.stateOf(place), tab, viewModel::refresh) {
            CardHead(it, tab, onTab, null, onSettings, onWarnings)
            HoursTab(it, followsSpots = place.spots.isNotEmpty())
          }
        Tab.Sea ->
          PlaceContent(app.stateOf(place), tab, viewModel::refresh) {
            SeaTab(it, place, app.choices.places.flatMap { f -> f.spots }.toSet(), sea, tab, onTab, onSettings, onWarnings)
          }
      }
    }
  }
}

/**
 * Accueil and Détails: one page per followed place, swiped left and right. The pager starts on the place shown last and tells
 * the view model which page settled; it is not restored from a saved state, so a place chosen in the settings wins.
 */
@Composable
private fun HomePager(app: AppState, viewModel: HomeViewModel, tab: Tab, onTab: (Tab) -> Unit, onSettings: () -> Unit, onWarnings: () -> Unit) {
  val places = app.choices.places
  val count by rememberUpdatedState(places.size)
  val pager = remember { PagerState(currentPage = app.choices.current) { count } }
  LaunchedEffect(pager) { snapshotFlow { pager.settledPage }.collect { viewModel.select(it) } }
  LaunchedEffect(app.choices.current) { if (pager.currentPage != app.choices.current) pager.scrollToPage(app.choices.current) }
  HorizontalPager(pager, Modifier.fillMaxSize(), key = { places.getOrNull(it)?.key ?: it }) { page ->
    val f = places.getOrNull(page)
    if (f != null) {
      PlaceContent(app.stateOf(f), tab, viewModel::refresh) {
        // The warnings open for the place shown: its page is the current place once settled, select it anyway.
        HomeTab(it, Dots(page, places.size), tab, onTab, onSettings) {
          viewModel.select(page)
          onWarnings()
        }
      }
    }
  }
}

/**
 * What was read for a place: a wait, a failure with « Réessayer », or the [content] with « pull to refresh ». The page opens at
 * its top for each [tab]: the rain tile opens the Détails at the top of the card, not in the middle of it.
 */
@Composable
private fun PlaceContent(state: HomeState, tab: Tab, onRefresh: () -> Unit, content: @Composable (HomeState.Ready) -> Unit) {
  when (state) {
    HomeState.Loading -> Centered { CircularProgressIndicator(color = VigieColors.Accent); Text(stringResource(R.string.loading), color = VigieColors.Text2) }
    is HomeState.Failed ->
      Centered {
        Text(state.message, color = VigieColors.Text, textAlign = TextAlign.Center)
        TextButton(onClick = onRefresh) { Text(stringResource(R.string.retry), color = VigieColors.Accent) }
      }
    is HomeState.Ready -> Refreshable(state, tab, onRefresh) { content(state) }
  }
}

@Composable
private fun Centered(content: @Composable () -> Unit) {
  Column(
    Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Vertical))
      .padding(horizontal = evenSide()).padding(24.dp),
    verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    content()
  }
}

/** The left and right margin the system bars and the cutout need, the larger of the two on both sides: in landscape the camera's
 *  cutout is on one side only, and the card stood 145 px right of the middle (seen on the Pixel 6 Pro, 27/11/2026). Also the margin
 *  of the pages drawn on the sky ([SkyPage]: the places, the warnings, the first launch, the settings of a widget). */
@Composable
internal fun evenSide(): Dp {
  val insets = WindowInsets.safeDrawing
  val density = LocalDensity.current
  val direction = LocalLayoutDirection.current
  return with(density) { maxOf(insets.getLeft(density, direction), insets.getRight(density, direction)).toDp() }
}

/** The page that scrolls: the system bars are space inside it (the card goes under them as it scrolls), not a frame around. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Refreshable(state: HomeState.Ready, tab: Tab, onRefresh: () -> Unit, content: @Composable () -> Unit) {
  val scroll = rememberSaveable(tab, saver = ScrollState.Saver) { ScrollState(0) }
  val pull = rememberPullToRefreshState()
  PullToRefreshBox(
    isRefreshing = state.refreshing,
    onRefresh = onRefresh,
    modifier = Modifier.fillMaxSize(),
    state = pull,
    indicator = {
      PullToRefreshDefaults.Indicator(
        state = pull,
        isRefreshing = state.refreshing,
        modifier = Modifier.align(Alignment.TopCenter).windowInsetsPadding(WindowInsets.statusBars),
      )
    },
  ) {
    Column(
      Modifier.fillMaxSize().verticalScroll(scroll).windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Vertical))
        .padding(horizontal = evenSide() + 16.dp, vertical = 6.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
      content()
      Spacer(Modifier.height(8.dp))
    }
  }
}

// ------------------------------------------------------------------------------------------------------------ pieces

@Composable
internal fun Glass(modifier: Modifier = Modifier, padding: Dp = 16.dp, content: @Composable () -> Unit) {
  val shape = RoundedCornerShape(22.dp)
  Column(
    modifier.fillMaxWidth().background(VigieColors.Glass, shape).border(1.5.dp, VigieColors.GlassBorder, shape).padding(padding),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    content()
  }
}


/** The followed places of the Accueil: the page shown and how many, dots after the name in the head of the card. */
private class Dots(val page: Int, val count: Int)

/**
 * The head of the glass card, on every tab: the place (and its dots on the Accueil), when it was read, a mark for its
 * warnings, the gear; under them, the banner of the warnings in force (Accueil and Détails) and the bar of tabs. The [board]
 * of the Accueil, the Détails and the Mer goes on in the same card; Heures has its own cards under it.
 */
@Composable
private fun CardHead(
  state: HomeState.Ready,
  tab: Tab,
  onTab: (Tab) -> Unit,
  dots: Dots?,
  onSettings: () -> Unit,
  onWarnings: () -> Unit,
  board: (@Composable () -> Unit)? = null,
) {
  val snap = state.snapshot
  val p = snap.point
  // The official warnings of the place (`/v1/vigilances`), never `local_alert_level`, a level Vigie works out over a wide
  // radius: on 22/11/2026 it said green at Ajaccio while Météo-France had the wind in orange there.
  val vigil = Vigil.view(snap.vigilances, p.serverUtc)
  val read = readNote(state)
  val tabs = Tab.entries.filter { it != Tab.Details || DetailsBoard.available(p, System.currentTimeMillis() / 1000) }
  val shown = if (tab in tabs) tab else Tab.Home
  Glass(padding = 12.dp) {
    Column(if (board != null) Modifier.padding(bottom = 6.dp) else Modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
          Icon(painterResource(R.drawable.ic_location), contentDescription = null, tint = VigieColors.Text3, modifier = Modifier.size(18.dp))
          Spacer(Modifier.width(6.dp))
          Text(
            snap.place.label,
            color = VigieColors.Text,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
          )
          if (dots != null && dots.count > 1) {
            val label = stringResource(R.string.page_of, dots.page + 1, dots.count)
            Spacer(Modifier.width(8.dp))
            PageDots(dots.page, dots.count, Modifier.semantics { contentDescription = label })
          }
        }
        if (!read.ownLine) {
          Spacer(Modifier.width(8.dp))
          Text(read.text, color = read.color, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
        Spacer(Modifier.width(6.dp))
        VigilMark(vigil, onWarnings)
        Spacer(Modifier.width(6.dp))
        Box(
          Modifier.size(30.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f)).clickable(role = Role.Button, onClick = onSettings),
          contentAlignment = Alignment.Center,
        ) {
          Icon(painterResource(R.drawable.ic_settings), stringResource(R.string.settings_title), tint = VigieColors.Text, modifier = Modifier.size(18.dp))
        }
      }
      // A read kept on the phone says how old it is: « Données d'hier 18 h 05 · Pas de réponse du serveur… », on its own line.
      if (read.ownLine) Text(read.text, color = read.color, style = MaterialTheme.typography.labelMedium)
      if (vigil.state == Vigil.State.Warnings && (tab == Tab.Home || tab == Tab.Details)) WarningBanner(vigil, p.serverUtc, p.utcOffsetS, onWarnings)
      BoardPages(tabs.map { stringResource(it.label) }, tabs.indexOf(shown), { onTab(tabs[it]) })
    }
    board?.invoke()
  }
}

/**
 * The warnings of the place in the head, one mark: the green check when none is in force, grey when no official source is
 * read here or the read failed, the colour of the highest level when some are; that one opens the warnings.
 */
@Composable
private fun VigilMark(view: Vigil.View, onWarnings: () -> Unit) {
  val (icon, color, words) =
    when (view.state) {
      Vigil.State.None -> Triple(R.drawable.ic_check, VigieColors.Good, R.string.vigil_none)
      Vigil.State.NoSource -> Triple(R.drawable.ic_check, VigieColors.Text3, R.string.vigil_nosource)
      Vigil.State.Unread -> Triple(R.drawable.ic_warning, VigieColors.Text3, R.string.vigil_unread)
      Vigil.State.Warnings -> Triple(R.drawable.ic_warning, VigieColors.warning(view.level), R.string.vigil_open)
    }
  val open = view.state == Vigil.State.Warnings
  Box(
    Modifier.size(26.dp).clip(CircleShape).then(if (open) Modifier.clickable(role = Role.Button, onClick = onWarnings) else Modifier),
    contentAlignment = Alignment.Center,
  ) {
    Icon(painterResource(icon), stringResource(words), tint = color, modifier = Modifier.size(18.dp))
  }
}

/** What the head says of the read: short, in its row (« Relevé à 14 h 36 », « Mise à jour… »), or longer, on a line of its own. */
private class ReadNote(val text: String, val color: Color, val ownLine: Boolean)

@Composable
private fun readNote(state: HomeState.Ready): ReadNote {
  val p = state.snapshot.point
  val now = System.currentTimeMillis() / 1000
  val readTime = Words.readTime(p.serverUtc, now, p.utcOffsetS)
  val old = p.serverUtc > 0 && now - p.serverUtc >= Words.OLD_READ_S
  return when {
    state.error != null -> ReadNote(stringResource(R.string.old_data, readTime, state.error), VigieColors.Warning, true)
    state.refreshing && old -> ReadNote(stringResource(R.string.old_data_refreshing, readTime), VigieColors.Text3, true)
    state.refreshing -> ReadNote(stringResource(R.string.refreshing), VigieColors.Text3, false)
    else -> ReadNote(stringResource(R.string.read_at, Words.clock(p.serverUtc, p.utcOffsetS)), VigieColors.Text3, false)
  }
}

@Composable
internal fun Credits(text: String) {
  Text(text, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
}

// ----------------------------------------------------------------------------------------------------------- the tabs

/**
 * Accueil and Détails: the home and Details pages of the Home Assistant card, drawn natively (board/), in the card of the head:
 * now, the rain of the hour, the season, the next 24 hours and the days; the rain until noon, by 5 and 15 minutes, 48 hours
 * and the chances of the ensembles. As in the card, the rain tile opens the Détails; no swipe between the two (a swipe changes
 * the place). The clock is the phone's: a copy read without network shows its hours from now on.
 */
@Composable
private fun HomeTab(state: HomeState.Ready, dots: Dots, tab: Tab, onTab: (Tab) -> Unit, onSettings: () -> Unit, onWarnings: () -> Unit) {
  val snap = state.snapshot
  val p = snap.point
  val vigil = Vigil.view(snap.vigilances, p.serverUtc)
  val now = System.currentTimeMillis() / 1000
  val hasDetails = DetailsBoard.available(p, now)
  CardHead(state, tab, onTab, dots, onSettings, onWarnings) {
    if (hasDetails && tab == Tab.Details) DetailsBoardView(p, now) else HomeBoardView(p, now, onRain = if (hasDetails) ({ onTab(Tab.Details) }) else null)
  }
  if (p.provider != null) Credits(stringResource(R.string.credits_weather, p.provider))
  if (vigil.live.isNotEmpty()) Credits(stringResource(R.string.credits_vigil, Vigil.issuers(vigil.live)))
}

/**
 * Mer: the Sea page of the Home Assistant card (board/SeaBoard*), in the card of the head: a tab per followed spot of the place,
 * then the beach shown (its tide and water, its tiles, its activities hour by hour, the tide and the next hours). A beach is
 * read when it shows (its copy on the phone first): again after 10 minutes, or after a minute when the place is read again (a
 * pull to refresh). A copy shown because the read failed says how old it is. Without a spot: « Choisir des spots ».
 */
@Composable
private fun SeaTab(
  state: HomeState.Ready,
  place: FollowedPlace,
  followed: Set<String>,
  sea: SeaViewModel,
  tab: Tab,
  onTab: (Tab) -> Unit,
  onSettings: () -> Unit,
  onWarnings: () -> Unit,
) {
  val snap = state.snapshot
  val ids = place.spots
  LaunchedEffect(followed) { sea.keepOnly(followed) }
  if (ids.isEmpty()) {
    CardHead(state, tab, onTab, null, onSettings, onWarnings)
    Text(stringResource(R.string.sea_none_followed, Words.near(snap.place.nearName)), color = VigieColors.Text2, style = MaterialTheme.typography.bodyLarge)
    AccentAction(R.drawable.ic_add, stringResource(R.string.sea_choose), onSettings)
    return
  }
  var shown by rememberSaveable(place.key) { mutableIntStateOf(0) }
  val i = shown.coerceIn(0, ids.lastIndex)
  val id = ids[i]
  val beaches by sea.beaches.collectAsStateWithLifecycle()
  val b = beaches[id] ?: BeachState()
  val readAt = remember(id) { snap.point.serverUtc }
  LaunchedEffect(id, snap.point.serverUtc) { sea.ask(id, if (snap.point.serverUtc == readAt) 10 * 60L else 60L) }
  // The names of the overview, or the one the beach gives; « Plage 2 » without either, as the card.
  val names = ids.mapIndexed { j, s -> (if (j == i) b.beach?.spot?.name else null) ?: snap.spots.firstOrNull { it.id == s }?.name }
  val now = System.currentTimeMillis() / 1000
  val status =
    when {
      b.beach != null -> null
      b.failed -> stringResource(R.string.sea_unread)
      else -> stringResource(R.string.sea_loading)
    }
  val old = b.beach?.takeIf { b.failed && now - it.readUtc >= Words.OLD_READ_S }
  val note = old?.let { stringResource(R.string.sea_old, Words.readTime(it.readUtc, now, snap.point.utcOffsetS)) }
  CardHead(state, tab, onTab, null, onSettings, onWarnings) {
    SeaBoardView(
      tabs = names.mapIndexed { j, n -> SeaBoard.shortName(n) ?: SeaBoard.beachN(j) },
      selected = i,
      onSelect = { shown = it },
      name = names[i] ?: SeaBoard.beachN(i),
      beach = b.beach,
      status = status,
      note = note,
      now = now,
      offsetS = snap.point.utcOffsetS,
    )
  }
  AccentAction(R.drawable.ic_add, stringResource(R.string.sea_choose), onSettings)
}
