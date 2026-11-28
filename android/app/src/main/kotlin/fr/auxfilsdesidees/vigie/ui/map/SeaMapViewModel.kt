package fr.auxfilsdesidees.vigie.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.data.BeachReader
import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.MapActivity
import fr.auxfilsdesidees.vigie.data.MapBackground
import fr.auxfilsdesidees.vigie.data.MapPin
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PlaceHit
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.RadarArea
import fr.auxfilsdesidees.vigie.data.SeaMap
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import fr.auxfilsdesidees.vigie.data.VigieParser
import fr.auxfilsdesidees.vigie.ui.BeachState
import fr.auxfilsdesidees.vigie.ui.Words
import java.text.Normalizer
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The sea map's state, held by the activity: the base map's style read once, the verdicts and the figures of every spot read
 * again when the map opens after [FRESH_MS], the activity chosen and its pins, and the search. A read that fails keeps
 * what was read before; the map says it failed only when it has nothing to show.
 *
 * The sheet of a spot or a town touched ([sheet]) reads its beach ([beaches], with [beachReader], kept in memory only) or
 * its weather ([towns], `/v1/point` through the map's gate): again after [FRESH_MS], never more often.
 *
 * The base map is the site's dark plan, or the IGN's plan or photographs when chosen ([chooseBackground]): the choice is
 * kept on the phone ([kept]); each style is read once. When the IGN cannot be read, the dark plan is shown, and said so.
 *
 * The rain radar and the wind measured, layers of the same menu, are held by [weather].
 */
class SeaMapViewModel(
  private val reader: SeaMapReader,
  private val searchPlaces: suspend (String) -> List<PlaceHit>,
  private val beachReader: BeachReader = BeachReader(),
  private val clock: () -> Long = System::currentTimeMillis,
  /** Where the overview and the style are parsed: off the main thread (a test gives its own). */
  private val work: CoroutineContext = Dispatchers.Default,
  /** Where the background chosen is kept (the app's settings); nowhere in a test. */
  private val kept: KeyValue? = null,
) : ViewModel() {
  /** The weather layers of the map: the rain radar and the wind measured, off until chosen, the choice kept on the phone. */
  val weather = MapWeatherModel(viewModelScope, reader, clock, kept)

  /** The address of the tiles of one radar image. */
  fun radarTiles(area: RadarArea, epoch: Long): String = reader.radarTiles(area, epoch)

  /** What the sheet shows: a spot of the map (its Mer page) or a town (its Accueil). */
  sealed interface Sheet {
    data class Spot(val spot: CatalogueSpot) : Sheet

    data class Town(val place: Place) : Sheet
  }

  /** The weather of a town's sheet: the last good read (null before one), whether it is being read, whether it failed. */
  data class TownState(val point: PointNow? = null, val readAt: Long = 0, val reading: Boolean = false, val failed: Boolean = false)

  private val _sheet = MutableStateFlow<Sheet?>(null)
  val sheet: StateFlow<Sheet?> = _sheet.asStateFlow()
  private val _beaches = MutableStateFlow<Map<String, BeachState>>(emptyMap())
  val beaches: StateFlow<Map<String, BeachState>> = _beaches.asStateFlow()
  private val _towns = MutableStateFlow<Map<String, TownState>>(emptyMap())
  val towns: StateFlow<Map<String, TownState>> = _towns.asStateFlow()
  private var sheetJob: Job? = null

  /** Opens the sheet of [sheet] and reads what it shows, when it was not read in the last [FRESH_MS]. */
  fun open(sheet: Sheet) {
    _sheet.value = sheet
    sheetJob?.cancel()
    sheetJob =
      viewModelScope.launch {
        when (sheet) {
          is Sheet.Spot -> readBeach(sheet.spot.id)
          is Sheet.Town -> readTown(sheet.place)
        }
      }
  }

  fun close() {
    _sheet.value = null
    sheetJob?.cancel()
  }

  /** Reads the sheet's beach or town again (its retry), whatever its age. */
  fun retry() {
    val sheet = _sheet.value ?: return
    when (sheet) {
      is Sheet.Spot -> _beaches.update { it - sheet.spot.id }
      is Sheet.Town -> _towns.update { it - sheet.place.pointKey }
    }
    open(sheet)
  }

  private suspend fun readBeach(id: String) {
    val known = _beaches.value[id]?.beach
    if (known != null && clock() / 1000 - known.readUtc < FRESH_MS / 1000) return
    _beaches.update { it + (id to (it[id] ?: BeachState()).copy(reading = true, failed = false)) }
    try {
      val beach = beachReader.read(id)
      _beaches.update { it + (id to BeachState(beach)) }
      // A few beaches in memory, the last ones opened.
      _beaches.update { all -> if (all.size <= KEPT) all else all.entries.sortedByDescending { it.value.beach?.readUtc ?: 0 }.take(KEPT).associate { it.key to it.value } }
    } catch (err: CancellationException) {
      _beaches.update { it + (id to (it[id] ?: BeachState()).copy(reading = false)) }
      throw err
    } catch (err: Exception) {
      _beaches.update { it + (id to (it[id] ?: BeachState()).copy(reading = false, failed = true)) }
    }
  }

  private suspend fun readTown(place: Place) {
    val key = place.pointKey
    val known = _towns.value[key]
    if (known?.point != null && clock() - known.readAt < FRESH_MS) return
    _towns.update { it + (key to (it[key] ?: TownState()).copy(reading = true, failed = false)) }
    try {
      val point = reader.point(place)
      _towns.update { it + (key to TownState(point, clock())) }
      _towns.update { all -> if (all.size <= KEPT) all else all.entries.sortedByDescending { it.value.readAt }.take(KEPT).associate { it.key to it.value } }
    } catch (err: CancellationException) {
      _towns.update { it + (key to (it[key] ?: TownState()).copy(reading = false)) }
      throw err
    } catch (err: Exception) {
      _towns.update { it + (key to (it[key] ?: TownState()).copy(reading = false, failed = true)) }
    }
  }

  /** The spot of the map of this [id], to open its sheet or to star it; null when the overview does not have it. */
  fun spot(id: String): CatalogueSpot? = catalogue.firstOrNull { it.id == id }

  data class Ui(
    val style: String? = null,
    val loading: Boolean = false,
    val failed: Boolean = false,
    val activity: MapActivity = MapActivity.Surf,
    val pins: List<MapPin> = emptyList(),
    /** The layers of the base map that name the towns, a touch on which opens a town's sheet. */
    val townLayers: List<String> = emptyList(),
    /** The base map of [style] (the one chosen, before the first style is read). */
    val background: MapBackground = MapBackground.Dark,
    /** The background touched last: [background] once read, another one while it is read ([backgroundBusy]). */
    val chosen: MapBackground = background,
    /** A background chosen is being read. */
    val backgroundBusy: Boolean = false,
    /** The background chosen that could not be read: the dark plan is shown instead. */
    val backgroundFailed: MapBackground? = null,
  )

  /** A line of the search: a spot of the map or a town of the site's search, and where to take the map. */
  data class Hit(val name: String, val detail: String?, val lat: Double, val lon: Double, val spot: Boolean, val id: String? = null)

  data class Search(val query: String = "", val hits: List<Hit> = emptyList(), val busy: Boolean = false, val done: Boolean = false)

  private val _ui = MutableStateFlow(MapBackground.of(kept?.read(BACKGROUND_KEY)).let { Ui(background = it, chosen = it) })
  val ui: StateFlow<Ui> = _ui.asStateFlow()
  private val _search = MutableStateFlow(Search())
  val search: StateFlow<Search> = _search.asStateFlow()

  private var dark: String? = null
  private var planIgn: String? = null
  private var photos: String? = null
  private var backgroundJob: Job? = null
  private var overview: String? = null
  private var catalogue: List<CatalogueSpot> = emptyList()
  private var surf: String? = null
  private var readAt = 0L
  private var loadJob: Job? = null
  private var searchJob: Job? = null

  /** Reads what the map lacks, or what is older than [FRESH_MS]. */
  fun load() {
    if (loadJob?.isActive == true) return
    if (_ui.value.style != null && overview != null && clock() - readAt < FRESH_MS) return
    loadJob =
      viewModelScope.launch {
        _ui.update { it.copy(loading = true, failed = false) }
        try {
          coroutineScope {
            val style = if (dark == null) async { reader.style() } else null
            val o = async { reader.overview() }
            val s = async { reader.surf() }
            style?.await()?.let { dark = it }
            overview = o.await()
            surf = s.await()
            readAt = clock()
            val spots = overview?.let { text -> withContext(work) { runCatching { VigieParser.catalogue(text) }.getOrNull() } }
            val first = catalogue.isEmpty()
            if (spots != null) catalogue = spots
            // A search typed before the spots were read is run again with them.
            if (first && catalogue.isNotEmpty() && _search.value.query.trim().length >= 2) search(_search.value.query)
            val pins = pinsOf(_ui.value.activity)
            _ui.update { it.copy(loading = false, pins = pins) }
          }
          if (_ui.value.style == null) show(_ui.value.background)
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          _ui.update { it.copy(loading = false, failed = it.style == null || overview == null) }
        }
      }
  }

  /** Shows [background] and keeps it on the phone: the next opening shows it too. */
  fun chooseBackground(background: MapBackground) {
    kept?.write(BACKGROUND_KEY, background.id)
    val now = _ui.value
    if (background == now.background && background == now.chosen && !now.backgroundBusy) return
    backgroundJob?.cancel()
    if (dark == null) {
      // Nothing read yet: the map opens on it once the dark plan is read.
      _ui.update { it.copy(background = background, chosen = background, backgroundFailed = null) }
      return
    }
    _ui.update { it.copy(chosen = background, backgroundBusy = true, backgroundFailed = null) }
    backgroundJob = viewModelScope.launch { show(background) }
  }

  /** The style of [background], read or built once; the dark plan's when the IGN cannot be read. */
  private suspend fun show(background: MapBackground) {
    val base = dark ?: return
    val style =
      try {
        when (background) {
          MapBackground.Dark -> base
          MapBackground.PhotoIgn -> photos ?: withContext(work) { SeaMap.styleWithPhotos(base) }.also { photos = it }
          MapBackground.PlanIgn -> planIgn ?: reader.planIgn().also { planIgn = it }
        }
      } catch (err: CancellationException) {
        _ui.update { it.copy(chosen = it.background, backgroundBusy = false) }
        throw err
      } catch (err: Exception) {
        null
      }
    val shown = if (style == null) MapBackground.Dark else background
    val json = style ?: base
    val towns = withContext(work) { SeaMap.townLayers(json) }
    _ui.update { it.copy(style = json, background = shown, chosen = shown, townLayers = towns, backgroundFailed = background.takeIf { style == null }, backgroundBusy = false) }
  }

  fun choose(activity: MapActivity) {
    if (activity == _ui.value.activity) return
    _ui.update { it.copy(activity = activity) }
    viewModelScope.launch {
      val pins = pinsOf(activity)
      if (_ui.value.activity == activity) _ui.update { it.copy(pins = pins) }
    }
  }

  private suspend fun pinsOf(activity: MapActivity): List<MapPin> {
    val o = overview ?: return emptyList()
    val s = surf
    return withContext(work) { runCatching { SeaMap.pins(o, s, activity) }.getOrDefault(emptyList()) }
  }

  /**
   * The spots of the map whose name or town holds the words typed (accents aside), then the towns of the site's search.
   * Two letters at least; the site is asked 300 ms after the last letter.
   */
  fun search(query: String) {
    searchJob?.cancel()
    if (query.trim().length < 2) {
      _search.value = Search(query)
      return
    }
    _search.value = Search(query, busy = true)
    searchJob =
      viewModelScope.launch {
        delay(300)
        val words = fold(query.trim())
        val spots =
          catalogue
            .filter { fold(it.name).contains(words) || fold(it.place.orEmpty()).contains(words) }
            .take(SPOTS_SHOWN)
            .map { Hit(it.name, it.place, it.lat, it.lon, spot = true, id = it.id) }
        val towns =
          try {
            searchPlaces(query).take(TOWNS_SHOWN).map { Hit(it.name, Words.placeWhere(it.region, it.country).ifEmpty { null }, it.lat, it.lon, spot = false) }
          } catch (err: CancellationException) {
            throw err
          } catch (err: Exception) {
            emptyList()
          }
        _search.value = Search(query, spots + towns, busy = false, done = true)
      }
  }

  private fun fold(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD).replace(MARKS, "").lowercase()

  companion object {
    /** The verdicts and the figures of the hour, read again when the map opens later than this. */
    const val FRESH_MS = 10 * 60_000L
    /** The key of the background chosen, in the app's settings. */
    const val BACKGROUND_KEY = "map_background"
    private const val KEPT = 8
    private const val SPOTS_SHOWN = 4
    private const val TOWNS_SHOWN = 4
    private val MARKS = Regex("\\p{M}+")
  }
}
