package fr.auxfilsdesidees.vigie.ui.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.data.BeachReader
import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.MapActivity
import fr.auxfilsdesidees.vigie.data.MapPin
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PlaceHit
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.SeaMap
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import fr.auxfilsdesidees.vigie.data.VigieParser
import fr.auxfilsdesidees.vigie.ui.BeachState
import fr.auxfilsdesidees.vigie.ui.Words
import java.text.Normalizer
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
 */
class SeaMapViewModel(
  private val reader: SeaMapReader,
  private val searchPlaces: suspend (String) -> List<PlaceHit>,
  private val beachReader: BeachReader = BeachReader(),
  private val clock: () -> Long = System::currentTimeMillis,
) : ViewModel() {
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
  fun spot(id: String): CatalogueSpot? =
    overview?.let { o -> runCatching { VigieParser.catalogue(o) }.getOrNull() }?.firstOrNull { it.id == id }

  data class Ui(
    val style: String? = null,
    val loading: Boolean = false,
    val failed: Boolean = false,
    val activity: MapActivity = MapActivity.Surf,
    val pins: List<MapPin> = emptyList(),
  )

  /** A line of the search: a spot of the map or a town of the site's search, and where to take the map. */
  data class Hit(val name: String, val detail: String?, val lat: Double, val lon: Double, val spot: Boolean)

  data class Search(val query: String = "", val hits: List<Hit> = emptyList(), val busy: Boolean = false, val done: Boolean = false)

  private val _ui = MutableStateFlow(Ui())
  val ui: StateFlow<Ui> = _ui.asStateFlow()
  private val _search = MutableStateFlow(Search())
  val search: StateFlow<Search> = _search.asStateFlow()

  private var overview: String? = null
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
            val style = if (_ui.value.style == null) async { reader.style() } else null
            val o = async { reader.overview() }
            val s = async { reader.surf() }
            val read = style?.await()
            overview = o.await()
            surf = s.await()
            readAt = clock()
            val pins = pinsOf(_ui.value.activity)
            _ui.update { it.copy(style = read ?: it.style, loading = false, pins = pins) }
          }
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          _ui.update { it.copy(loading = false, failed = it.style == null || overview == null) }
        }
      }
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
    return withContext(Dispatchers.Default) { runCatching { SeaMap.pins(o, s, activity) }.getOrDefault(emptyList()) }
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
          overview
            ?.let { o -> withContext(Dispatchers.Default) { runCatching { VigieParser.catalogue(o) }.getOrDefault(emptyList()) } }
            .orEmpty()
            .filter { fold(it.name).contains(words) || fold(it.place.orEmpty()).contains(words) }
            .take(SPOTS_SHOWN)
            .map { Hit(it.name, it.place, it.lat, it.lon, spot = true) }
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
    private const val KEPT = 8
    private const val SPOTS_SHOWN = 4
    private const val TOWNS_SHOWN = 4
    private val MARKS = Regex("\\p{M}+")
  }
}
