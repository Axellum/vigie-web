package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.FieldGrid
import fr.auxfilsdesidees.vigie.data.FieldLevel
import fr.auxfilsdesidees.vigie.data.FieldLevelId
import fr.auxfilsdesidees.vigie.data.GeoBox
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import fr.auxfilsdesidees.vigie.data.WindField
import fr.auxfilsdesidees.vigie.data.WindFieldAnswer
import kotlin.coroutines.CoroutineContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The « Vent prévu » layer of the sea map, as the site's (`windFieldLayer.svelte.ts`): off until it is turned on in the
 * layers' menu, the choice kept on the phone ([kept]). It asks the site for the grids of the hour (`/data/wind-field.json`)
 * and loads only the images the view needs: the world's always, Europe's from zoom 3, France's from zoom 5. The list is asked
 * again every 10 minutes and when the hour turns; an image is read once (its address holds its hour), on [work], by [decode]
 * (its pixels as Android's `Bitmap.getPixels` gives them). While a new hour's image loads, the grid of the hour before stays drawn.
 */
class WindFieldModel(
  private val scope: CoroutineScope,
  private val reader: SeaMapReader,
  private val decode: (ByteArray, FieldLevel) -> IntArray,
  private val clock: () -> Long = System::currentTimeMillis,
  private val kept: KeyValue? = null,
  private val work: CoroutineContext = Dispatchers.Default,
) {
  enum class Status {
    Idle,
    Loading,
    Ok,
    Failed,
  }

  data class State(
    val on: Boolean = false,
    val view: GeoBox? = null,
    val zoom: Double = 0.0,
    /** The site's answer: the grids of the hour. */
    val answer: WindFieldAnswer? = null,
    val status: Status = Status.Idle,
    /** The grid read for each level (perhaps of the hour before, until the new image has come). */
    val grids: Map<FieldLevelId, FieldGrid> = emptyMap(),
  ) {
    /** The levels the view needs. */
    val wanted: List<FieldLevel>
      get() = if (on) WindField.levelsWanted(answer, view, zoom) else emptyList()

    /** What the map draws, the finest first; null when nothing is to be drawn. */
    val shown: List<FieldGrid>?
      get() {
        if (!on) return null
        val held = wanted.mapNotNull { grids[it.id] }
        return if (held.isEmpty()) null else WindField.finestFirst(held)
      }

    /** The hour of the forecast drawn (epoch seconds), for the legend. */
    val valid: Long?
      get() = answer?.takeIf { it.status == "ok" }?.valid
  }

  private val _state = MutableStateFlow(State(on = kept?.read(KEY) == ON))
  val state: StateFlow<State> = _state.asStateFlow()

  private var at = 0L
  private val asking = HashSet<String>()
  private val failedImages = HashMap<String, Long>()

  fun show(on: Boolean) {
    kept?.write(KEY, if (on) ON else OFF)
    _state.update { it.copy(on = on) }
    sync()
  }

  /** Where the map looks, after each move: a finer grid the view needs is asked at once. */
  fun move(view: GeoBox?, zoom: Double) {
    _state.update { it.copy(view = view, zoom = zoom) }
    sync()
  }

  /** Asks the list when it is missing, old, or of another hour, then the images the view needs. Every minute while the map is shown. */
  fun sync() {
    val s = _state.value
    if (!s.on || s.status == Status.Loading) return
    val now = clock()
    val age = now - at
    val otherHour = s.answer?.valid != null && s.answer.valid != WindField.nearestHour(now)
    if (
      s.status == Status.Idle ||
        (s.status == Status.Failed && age > WindField.RETRY_MS) ||
        (s.status == Status.Ok && (age > WindField.REFRESH_MS || (otherHour && age > WindField.RETRY_MS)))
    )
      return loadList()
    for (level in s.wanted) {
      if (s.grids[level.id]?.image == level.image || level.image in asking) continue
      if (now - (failedImages[level.image] ?: Long.MIN_VALUE / 2) < WindField.RETRY_MS) continue
      loadImage(level)
    }
  }

  private fun loadList() {
    at = clock()
    _state.update { it.copy(status = Status.Loading) }
    scope.launch {
      try {
        val answer = reader.windField()
        _state.update { it.copy(answer = answer, status = Status.Ok) }
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        // The list held (an earlier answer) stays drawn.
        _state.update { it.copy(status = if (it.answer != null) Status.Ok else Status.Failed) }
      }
      sync()
    }
  }

  private fun loadImage(level: FieldLevel) {
    asking += level.image
    scope.launch {
      try {
        val bytes = reader.windFieldImage(level)
        val grid = withContext(work) { WindField.grid(level, decode(bytes, level)) }
        _state.update { it.copy(grids = it.grids + (level.id to grid)) }
        failedImages.remove(level.image)
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        // An image the site no longer lists (the hour turned): the list is asked again.
        if (err is ApiException && err.status == 404) at = 0
        failedImages[level.image] = clock()
      } finally {
        asking -= level.image
      }
    }
  }

  companion object {
    const val KEY = "map_flow"
    private const val ON = "on"
    private const val OFF = "off"
  }
}
