package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.Moment
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import fr.auxfilsdesidees.vigie.data.Town
import fr.auxfilsdesidees.vigie.data.TownCell
import fr.auxfilsdesidees.vigie.data.TownReading
import fr.auxfilsdesidees.vigie.data.TownWeather
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** A town of the base map in view, the most important first. [id] is its name and place, the same from one move to the next. */
data class TownInView(val id: String, val name: String, val lat: Double, val lon: Double, val order: Double) {
  val cell: TownCell get() = TownWeather.cellOf(lat, lon)
}

/** A pill to draw: a town and what it shows at the moment chosen. */
data class TownPill(val town: TownInView, val reading: TownReading)

/**
 * The « Météo des villes » layer of the sea map, as the site's home map (`townLayer.svelte.ts`): a pill for each town the base
 * map names in view ([TownPicker]), with the weather of the town's cell read through the site's `/data/towns.json`, at the
 * moment chosen in the bar under the map. On until it is turned off in the layers' menu, the choice kept on the phone ([kept]).
 * A cell is asked again after a quarter of an hour, one not read after a minute; the towns of a view are asked in one request.
 */
class TownWeatherModel(
  private val scope: CoroutineScope,
  private val reader: SeaMapReader,
  private val clock: () -> Long = System::currentTimeMillis,
  private val kept: KeyValue? = null,
) {
  /** The weather of a cell (null: the site could not read it), and when it was read. */
  data class Read(val town: Town?, val at: Long)

  data class State(
    val on: Boolean = true,
    val zoom: Double = 0.0,
    val towns: List<TownInView> = emptyList(),
    /** The moment shown: an index in [choices]. */
    val moment: Int = 0,
    val cells: Map<TownCell, Read> = emptyMap(),
    /** The site's share of the day is used up: some towns have no pill. */
    val paused: Boolean = false,
    val failed: Boolean = false,
    /** The current minute, so that « Maintenant » moves on with the map open (epoch seconds). */
    val nowS: Long = 0,
  ) {
    /** Whether the map is close enough for towns. */
    val near: Boolean
      get() = zoom >= TownWeather.MIN_ZOOM

    val choices: List<Moment>
      get() = TownWeather.moments(nowS)

    fun weatherOf(t: TownInView): Town? = cells[t.cell]?.town

    /** What the map draws, the most important first: null while the layer is off, none far out or before a town is read. */
    val pills: List<TownPill>?
      get() {
        if (!on) return null
        if (!near) return emptyList()
        val m = choices.getOrElse(moment) { choices.first() }
        return towns.mapNotNull { t -> weatherOf(t)?.let { TownWeather.readAt(it, m, nowS) }?.let { TownPill(t, it) } }
      }
  }

  private val _state = MutableStateFlow(State(on = kept?.read(KEY) != OFF, nowS = clock() / 1000))
  val state: StateFlow<State> = _state.asStateFlow()

  private val loading = HashSet<TownCell>()

  fun show(on: Boolean) {
    kept?.write(KEY, if (on) ON else OFF)
    _state.update { it.copy(on = on) }
    sync()
  }

  fun move(zoom: Double) {
    _state.update { it.copy(zoom = zoom) }
  }

  /** The towns the map names in view ([TownPicker.inView]), after each move once the tiles are there. */
  fun towns(list: List<TownInView>) {
    if (list == _state.value.towns) return
    _state.update { it.copy(towns = list) }
    sync()
  }

  /** The moment at [index] of the bar. */
  fun choose(index: Int) {
    _state.update { it.copy(moment = index.coerceIn(0, it.choices.lastIndex)) }
  }

  /** Asks the cells of the towns in view that are missing or old. Called after each change, and every minute while the map is shown. */
  fun sync() {
    val now = clock()
    _state.update { it.copy(nowS = now / 1000) }
    val s = _state.value
    if (!s.on || !s.near) return
    val due = LinkedHashSet<TownCell>()
    for (t in s.towns) {
      val cell = t.cell
      if (cell in due || cell in loading) continue
      val known = s.cells[cell]
      if (known != null && now - known.at < (if (known.town != null) TownWeather.REFRESH_MS else TownWeather.RETRY_MS)) continue
      due += cell
    }
    due.toList().chunked(TownWeather.PER_REQUEST).forEach(::load)
  }

  private fun load(cells: List<TownCell>) {
    loading += cells
    scope.launch {
      try {
        val answer = reader.towns(cells)
        val at = clock()
        val read = answer.towns.associate { (cell, town) -> cell to Read(town, at) }
        // A cell the answer leaves out counts as not read: asked again in a minute, not at each sync.
        val missing = cells.filter { it !in read }.associateWith { Read(null, at) }
        _state.update { s -> s.copy(cells = s.cells + missing + read, paused = answer.paused, failed = false) }
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        // Asked again after a minute; what was read before stays drawn.
        val now = clock()
        _state.update { s ->
          s.copy(
            cells = s.cells + cells.map { c -> c to (s.cells[c]?.town?.let { Read(it, now - TownWeather.REFRESH_MS + TownWeather.RETRY_MS) } ?: Read(null, now)) },
            failed = true,
          )
        }
      } finally {
        loading -= cells.toSet()
      }
    }
  }

  companion object {
    const val KEY = "map_towns"
    private const val ON = "on"
    private const val OFF = "off"
  }
}
