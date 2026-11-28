package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.GeoBox
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.MapWeather
import fr.auxfilsdesidees.vigie.data.Radar
import fr.auxfilsdesidees.vigie.data.RadarArea
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import fr.auxfilsdesidees.vigie.data.WindMap
import fr.auxfilsdesidees.vigie.data.WindUnit
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The two weather layers of the sea map, as the site's `/sea` (`radarLayer.svelte.ts`, `windLayer.svelte.ts`): off until
 * turned on in the layers' menu, the choice kept on the phone ([kept]). The radar's images are asked for the area in view
 * once it is close enough ([MapWeather.radarAreaOf]), again after [MapWeather.RADAR_REFRESH_MS] or for another area; the
 * wind for a box a little wider than the view ([MapWeather.windQueryBox]), again when the map leaves it or after
 * [MapWeather.WIND_REFRESH_MS]. A read that fails keeps what was read before and is tried again after a minute. Nothing is
 * asked of `/v1/point`: both come from the site.
 */
class MapWeatherModel(
  private val scope: CoroutineScope,
  private val reader: SeaMapReader,
  private val clock: () -> Long = System::currentTimeMillis,
  private val kept: KeyValue? = null,
) {
  enum class Status {
    Idle,
    Loading,
    Ok,
    Failed,
  }

  data class State(
    val rain: Boolean = false,
    val wind: Boolean = false,
    val view: GeoBox? = null,
    val zoom: Double = 0.0,
    /** The radar's images read last, maybe of another area than the one in view. */
    val loaded: Radar? = null,
    val radarStatus: Status = Status.Idle,
    /** The image chosen by the slider or the animation (epoch seconds); null follows the newest. */
    val chosen: Long? = null,
    val playing: Boolean = false,
    /** Set at the first Play or slider touch: from then on every image is drawn, so that none waits for its tiles. */
    val preload: Boolean = false,
    /** The wind read last, for a box wider than the view. */
    val windRead: WindMap? = null,
    val windStatus: Status = Status.Idle,
    /** The unit of the wind on the map, chosen in the card of the wind measured: its badges, its legend and the forecast's. */
    val unit: WindUnit = WindUnit.Kmh,
  ) {
    /** The radar's area in view; null far out, or where there is none. */
    val area: RadarArea?
      get() = MapWeather.radarAreaOf(view, zoom, loaded?.minZoom ?: 3.0)

    /** The images of the area in view, while the radar is on; null while they are asked, or for another area. */
    val radar: Radar?
      get() = loaded?.takeIf { rain && it.area == area }

    /** The image shown: the one chosen, else the newest; -1 without images. */
    val index: Int
      get() {
        val frames = radar?.frames ?: return -1
        return chosen?.let { frames.indexOf(it) }?.takeIf { it >= 0 } ?: frames.lastIndex
      }

    val epoch: Long?
      get() = radar?.frames?.getOrNull(index)

    /** The wind read for the view, while the layer is on. */
    val windMap: WindMap?
      get() = windRead?.takeIf { wind }
  }

  private val _state =
    MutableStateFlow(
      State(rain = kept?.read(RAIN_KEY) == ON, wind = kept?.read(WIND_KEY) == ON, unit = if (kept?.read(UNIT_KEY) == KNOTS) WindUnit.Kn else WindUnit.Kmh)
    )
  val state: StateFlow<State> = _state.asStateFlow()

  private var radarAt = 0L
  /** The area of the last radar read, good or failed. */
  private var radarFor: RadarArea? = null
  private var windAt = 0L
  private var windFailedAt = 0L
  private var radarJob: Job? = null
  private var windJob: Job? = null
  private var playJob: Job? = null

  fun showRain(on: Boolean) {
    kept?.write(RAIN_KEY, if (on) ON else OFF)
    if (!on) pause()
    _state.update { it.copy(rain = on) }
    sync()
  }

  fun showWind(on: Boolean) {
    kept?.write(WIND_KEY, if (on) ON else OFF)
    _state.update { it.copy(wind = on) }
    sync()
  }

  /** The unit of the wind, kept on the phone as the site keeps it in the browser. */
  fun setUnit(unit: WindUnit) {
    kept?.write(UNIT_KEY, if (unit == WindUnit.Kn) KNOTS else KMH)
    _state.update { it.copy(unit = unit) }
  }

  /** Where the map looks, after each move. */
  fun move(view: GeoBox?, zoom: Double) {
    _state.update { it.copy(view = view, zoom = zoom) }
    if (_state.value.area == null) pause()
    sync()
  }

  /** Asks what is missing or old. Called after each change, and every minute while the map is shown. */
  fun sync() {
    val s = _state.value
    val area = s.area
    if (s.rain && area != null && radarJob?.isActive != true) {
      // Another area than the one asked last: at once; the same: once its images can be new, or a minute after a failure.
      val wait = if (s.radarStatus == Status.Failed) MapWeather.RETRY_MS else MapWeather.RADAR_REFRESH_MS
      if (radarFor != area || s.radarStatus == Status.Idle || clock() - radarAt > wait) loadRadar(area)
    }
    val view = s.view
    if (s.wind && view != null && windJob?.isActive != true) {
      if (s.windStatus == Status.Failed && clock() - windFailedAt < MapWeather.RETRY_MS) return
      val read = s.windRead
      if (read != null && read.box.contains(view) && clock() - windAt < MapWeather.WIND_REFRESH_MS) return
      loadWind(MapWeather.windQueryBox(view))
    }
  }

  private fun loadRadar(area: RadarArea) {
    radarFor = area
    radarAt = clock()
    _state.update { it.copy(radarStatus = Status.Loading) }
    radarJob =
      scope.launch {
        try {
          val radar = reader.radar(area)
          // An image no longer listed is not chosen any more: the newest is shown.
          _state.update { it.copy(loaded = radar, radarStatus = Status.Ok, chosen = it.chosen?.takeIf { c -> c in radar.frames }) }
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          val held = _state.value.loaded?.area == area
          // Images held for this area stay shown, and are asked again in a minute.
          if (held) radarAt = clock() - MapWeather.RADAR_REFRESH_MS + MapWeather.RETRY_MS
          _state.update { it.copy(radarStatus = if (held) Status.Ok else Status.Failed) }
        }
        // The map moved to another area while the images came: that one is asked.
        if (_state.value.area != area) sync()
      }
  }

  private fun loadWind(box: GeoBox) {
    _state.update { it.copy(windStatus = Status.Loading) }
    windJob =
      scope.launch {
        try {
          val read = reader.wind(box)
          windAt = clock()
          _state.update { it.copy(windRead = read, windStatus = Status.Ok) }
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          windFailedAt = clock()
          _state.update { it.copy(windStatus = Status.Failed) }
        }
      }
  }

  /** Play from the oldest image (or from the one chosen), or pause. */
  fun togglePlay() {
    if (_state.value.playing) return pause()
    val s = _state.value
    val frames = s.radar?.frames ?: return
    if (frames.size < 2) return
    val from = if (s.index == frames.lastIndex || s.chosen == null) frames.first() else s.chosen
    _state.update { it.copy(playing = true, preload = true, chosen = from) }
    playJob?.cancel()
    playJob =
      scope.launch {
        while (true) {
          val now = _state.value
          val list = now.radar?.frames ?: break
          delay(if (now.index == list.lastIndex) MapWeather.LAST_STEP_MS else MapWeather.STEP_MS)
          val next = _state.value
          if (!next.playing) break
          val shown = next.radar?.frames ?: break
          _state.update { it.copy(chosen = shown[(next.index + 1) % shown.size]) }
        }
      }
  }

  fun pause() {
    playJob?.cancel()
    playJob = null
    if (_state.value.playing) _state.update { it.copy(playing = false) }
  }

  /** The image at [index] of the slider. */
  fun choose(index: Int) {
    pause()
    val frames = _state.value.radar?.frames ?: return
    _state.update { it.copy(chosen = frames[index.coerceIn(0, frames.lastIndex)], preload = true) }
  }

  companion object {
    const val RAIN_KEY = "map_rain"
    const val WIND_KEY = "map_wind"
    const val UNIT_KEY = "map_wind_unit"
    private const val KMH = "kmh"
    private const val KNOTS = "kn"
    private const val ON = "on"
    private const val OFF = "off"
  }
}
