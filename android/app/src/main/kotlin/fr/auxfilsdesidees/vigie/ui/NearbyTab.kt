package fr.auxfilsdesidees.vigie.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.AvalancheBulletin
import fr.auxfilsdesidees.vigie.data.BeachTide
import fr.auxfilsdesidees.vigie.data.Catalogue
import fr.auxfilsdesidees.vigie.data.NearBeach
import fr.auxfilsdesidees.vigie.data.NearbyParser
import fr.auxfilsdesidees.vigie.data.NearbyReader
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.SkiArea
import fr.auxfilsdesidees.vigie.data.VigieParser
import fr.auxfilsdesidees.vigie.ui.board.AreasListView
import fr.auxfilsdesidees.vigie.ui.board.AroundBoardView
import fr.auxfilsdesidees.vigie.ui.board.BeachBoardView
import fr.auxfilsdesidees.vigie.ui.board.HomeBoard
import fr.auxfilsdesidees.vigie.ui.board.NearbyBoard
import fr.auxfilsdesidees.vigie.ui.board.NearbyChip
import fr.auxfilsdesidees.vigie.ui.board.NearbyChips
import fr.auxfilsdesidees.vigie.ui.board.SkiBoardView

/*
 * The fourth tab when it is not « Mer » (NearbyBoard.fourth): « Plages » by the sea, « Pistes » near a ski area. Its reads go
 * through [NearbyViewModel], each asked when the page shows it; the catalogues are read once a day, the sea of the place every
 * 15 minutes, a beach every 10, the top and the foot of an area every 15, its bulletin every 30. After a pull to refresh of the
 * place (its point read again), what the page shows is read again after a minute.
 */

private const val MIN = 60L

/** The catalogues of a place, read once a day: what makes the fourth tab « Plages » or « Pistes ». Nothing is asked where spots are followed. */
@Composable
internal fun AskCatalogues(place: Place, followsSpots: Boolean, nearby: NearbyViewModel) {
  LaunchedEffect(place.pointKey, followsSpots) {
    if (followsSpots) return@LaunchedEffect
    nearby.ask(NearbyReader.beaches(nearby.baseUrl, place.lat, place.lon), 24 * 60 * MIN, NearbyParser::beaches)
    nearby.ask(NearbyReader.areas(nearby.baseUrl, place.lat, place.lon), 24 * 60 * MIN, NearbyParser::areas)
  }
}

/** What the fourth tab is at [place], from the catalogues read so far. */
@Composable
internal fun fourthOf(place: Place, followsSpots: Boolean, nearby: NearbyViewModel): NearbyBoard.Fourth {
  val reads by nearby.reads.collectAsStateWithLifecycle()
  if (followsSpots) return NearbyBoard.Fourth.Sea
  val beaches = reads[NearbyReader.beaches(nearby.baseUrl, place.lat, place.lon).first].of<Catalogue<NearBeach>>()
  val areas = reads[NearbyReader.areas(nearby.baseUrl, place.lat, place.lon).first].of<Catalogue<SkiArea>>()
  return NearbyBoard.fourth(false, beaches?.items, areas?.items)
}

/** The page of the fourth tab under the head of the card: its chips, then the page of the chip chosen. */
@Composable
internal fun NearbyPage(fourth: NearbyBoard.Fourth, place: Place, placeRead: PointNow, nearby: NearbyViewModel) {
  val reads by nearby.reads.collectAsStateWithLifecycle()
  val kept by nearby.kept.collectAsStateWithLifecycle()
  val base = nearby.baseUrl
  // A pull to refresh reads the place again: what the page shows is then read again after a minute.
  val firstRead = remember(place.pointKey) { placeRead.serverUtc }
  val again = placeRead.serverUtc != firstRead
  fun age(normal: Long) = if (again) MIN else normal
  val now = System.currentTimeMillis() / 1000
  val loading = stringResource(R.string.sea_loading)
  val unread = stringResource(R.string.sea_unread)
  fun status(name: String) = if (reads[name]?.failed == true) unread else loading
  fun point(name: String): PointNow? = reads[name].of<PointNow>()
  Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    when (fourth) {
      NearbyBoard.Fourth.Beaches -> {
        val items = reads[NearbyReader.beaches(base, place.lat, place.lon).first].of<Catalogue<NearBeach>>()?.items.orEmpty()
        var selected by rememberSaveable(place.pointKey) { mutableStateOf<String?>(null) }
        var showAll by rememberSaveable(place.pointKey) { mutableStateOf(false) }
        val keptHere = kept.mapNotNull { id -> items.firstOrNull { it.id == id } }
        val opened = items.firstOrNull { it.id == selected }
        val chipBeaches = keptHere + listOfNotNull(opened?.takeIf { it !in keptHere })
        NearbyChips(
          listOf(NearbyChip("Autour")) + chipBeaches.map { NearbyChip(NearbyBoard.shortName(it.name), kept = it.id in kept) },
          if (opened == null) 0 else chipBeaches.indexOf(opened) + 1,
        ) { i -> selected = if (i == 0) null else chipBeaches[i - 1].id }
        if (opened == null) {
          val ask = NearbyReader.placeSea(base, place.lat, place.lon)
          LaunchedEffect(ask.first, again) { nearby.ask(ask, age(15 * MIN), VigieParser::point) }
          val around = point(ask.first)
          val note = around?.let { "lue ${Words.near(place.nearName)} à ${NearbyBoard.hm(it.serverUtc, it.utcOffsetS)}" } ?: ""
          AroundBoardView(
            readNote = note,
            around = around,
            aroundStatus = status(ask.first),
            beaches = items,
            lat = place.lat,
            lon = place.lon,
            kept = kept,
            showAll = showAll,
            onShowAll = { showAll = true },
            onOpen = { selected = it.id },
            onStar = { nearby.toggle(it.id) },
            now = now,
          )
        } else {
          val b = opened
          val ask = NearbyReader.beach(base, b)
          val tideAsk = NearbyReader.tide(base, b)
          val bathAsk = NearbyReader.bathing(base, b)
          val france = b.lat in 41.0..51.5 && b.lon in -5.5..9.8
          LaunchedEffect(ask.first, again) {
            nearby.ask(ask, age(10 * MIN), VigieParser::point)
            // The tide and the bathing water: Vigie has them in mainland France only (the sketch's rule).
            if (france) {
              nearby.ask(tideAsk, age(30 * MIN), NearbyParser::tide)
              nearby.ask(bathAsk, 24 * 60 * MIN) { NearbyParser.bathingQuality(it, b.lat, b.lon) }
            }
          }
          BeachBoardView(
            beach = b,
            where = "${NearbyBoard.km(b.distanceKm)} ${NearbyBoard.at(place.lat, place.lon, b.lat, b.lon)} · ${if (b.sea) "mer" else "lac ou rivière"}",
            kept = b.id in kept,
            onStar = { nearby.toggle(b.id) },
            point = point(ask.first),
            status = status(ask.first),
            tide = if (france) reads[tideAsk.first].of<BeachTide>() else null,
            quality = if (france) reads[bathAsk.first].of<String>() else null,
            now = now,
          )
        }
      }
      NearbyBoard.Fourth.Ski -> {
        val areas = reads[NearbyReader.areas(base, place.lat, place.lon).first].of<Catalogue<SkiArea>>()?.items.orEmpty()
        if (areas.isNotEmpty()) SkiPage(areas, place, kept, reads, nearby, ::age, again, now, ::status)
      }
      NearbyBoard.Fourth.Sea -> Unit
    }
  }
}

/** « Pistes »: the chips of the areas (the kept ones, else the nearest, and the next one), « + n autour » for the list, then the area. */
@Composable
private fun SkiPage(
  areas: List<SkiArea>,
  place: Place,
  kept: List<String>,
  reads: Map<String, NearbyRead>,
  nearby: NearbyViewModel,
  age: (Long) -> Long,
  again: Boolean,
  now: Long,
  status: (String) -> String,
) {
        val base = nearby.baseUrl
        val uri = LocalUriHandler.current
        fun point(name: String): PointNow? = reads[name].of<PointNow>()
        var selected by rememberSaveable(place.pointKey) { mutableStateOf<String?>(null) }
        var listOpen by rememberSaveable(place.pointKey) { mutableStateOf(false) }
        val keptHere = kept.mapNotNull { id -> areas.firstOrNull { it.id == id } }
        val first = keptHere.ifEmpty { listOf(areas.first()) }
        val next = areas.firstOrNull { it !in first }
        val opened = areas.firstOrNull { it.id == selected }
        val chipAreas = (first + listOfNotNull(next) + listOfNotNull(opened)).distinct()
        val rest = areas.size - chipAreas.size
        val shown = opened ?: chipAreas.first()
        NearbyChips(
          chipAreas.map { NearbyChip(NearbyBoard.shortName(it.name), kept = it.id in kept) } + if (rest > 0) listOf(NearbyChip("+ $rest autour", more = true)) else emptyList(),
          if (listOpen) chipAreas.size else chipAreas.indexOf(shown),
        ) { i ->
          if (i >= chipAreas.size) listOpen = !listOpen
          else {
            selected = chipAreas[i].id
            listOpen = false
          }
        }
        if (listOpen) {
          AreasListView(areas, kept, onOpen = { a -> selected = a.id; listOpen = false }, onStar = { nearby.toggle(it.id) })
        } else {
          val a = shown
          val topAsk = NearbyReader.height(base, a, a.topM)
          val footAsk = a.footM?.takeIf { a.topM != null && it < a.topM }?.let { NearbyReader.height(base, a, it) }
          val avAsk = NearbyReader.avalanches(base, a)
          LaunchedEffect(a.id, again) {
            nearby.ask(topAsk, age(15 * MIN), VigieParser::point)
            footAsk?.let { nearby.ask(it, age(15 * MIN), VigieParser::point) }
            nearby.ask(avAsk, age(30 * MIN), NearbyParser::bulletin)
          }
          SkiBoardView(
            area = a,
            kept = a.id in kept,
            onStar = { nearby.toggle(a.id) },
            top = point(topAsk.first),
            foot = footAsk?.let { point(it.first) },
            status = status(topAsk.first),
            bulletin = reads[avAsk.first].of<AvalancheBulletin>(),
            onBulletin = { url -> runCatching { uri.openUri(url) } },
            now = now,
          )
        }
}
