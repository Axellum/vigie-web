package fr.auxfilsdesidees.vigie.widget

import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.TideExtreme
import fr.auxfilsdesidees.vigie.ui.Frise
import fr.auxfilsdesidees.vigie.ui.FriseHour
import fr.auxfilsdesidees.vigie.ui.Words
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sqrt

/**
 * What the frise widget draws: the app's « Heures » tab in small, the next [HOURS] hours from the current one (sky,
 * temperature, wind, rain), then the tide and the surf of the favourite spot when there is room. Read from the copy kept
 * by the app, as the hours tab reads it ([Frise.window]): nothing is invented for an hour the API did not serve. Pure:
 * tested on the JVM; times are UTC seconds, the hours are written in the place's time.
 */
object FriseModel {
  const val HOURS = 14

  /** The activity of the sea row: the surf of the favourite spot, as on the sketch chosen on 22/11/2026. */
  const val SEA_ACTIVITY = "surf"

  /** An hour written under the frise: the column it stands under and its words (« 3 h »). */
  data class Tick(val index: Int, val text: String)

  /**
   * One frise. [nowFrac] is where now stands in the first hour (0 to 1). [spot] is the favourite spot's name, null when
   * the place has none read: no sea rows then. [sea] holds the verdict of [SEA_ACTIVITY] hour by hour (null: unknown or
   * night).
   */
  data class Strip(
    val hours: List<FriseHour>,
    val offsetS: Int,
    val nowFrac: Float,
    val ticks: List<Tick>,
    val tide: List<TideExtreme>,
    val spot: String?,
    val sea: List<String?>,
  ) {
    val startUtc: Long
      get() = hours.first().timeUtc

    val endUtc: Long
      get() = startUtc + hours.size * 3600L

    /** The high and low waters inside the frise, written on its curve. */
    val extremes: List<TideExtreme>
      get() = tide.filter { it.timeUtc in startUtc..endUtc }
  }

  fun strip(s: Snapshot, nowUtc: Long): Strip {
    val start = Math.floorDiv(nowUtc, 3600L) * 3600L
    val off = s.point.utcOffsetS
    val hours = Frise.window(start, s.point, s.favourite).take(HOURS)
    val spot = s.favourite
    return Strip(
      hours = hours,
      offsetS = off,
      nowFrac = ((nowUtc - start) / 3600f).coerceIn(0f, 1f),
      ticks = ticks(hours, off),
      tide = spot?.tide.orEmpty(),
      spot = spot?.name,
      sea = if (spot != null) hours.map { it.verdicts[SEA_ACTIVITY] } else emptyList(),
    )
  }

  /** The hours written under the frise: every local hour a multiple of three, the first two columns left to « Maint. ». */
  fun ticks(hours: List<FriseHour>, offsetS: Int): List<Tick> =
    hours.indices
      .filter { i -> i >= 2 && Math.floorMod(hours[i].timeUtc + offsetS, 86_400L) / 3600 % 3 == 0L }
      .map { i -> Tick(i, Words.hour(hours[i].timeUtc, offsetS)) }

  /** The columns where a new day starts (local midnight), drawn as a dashed line. */
  fun midnights(hours: List<FriseHour>, offsetS: Int): List<Int> =
    hours.indices.filter { i -> i > 0 && Math.floorMod(hours[i].timeUtc + offsetS, 86_400L) < 3600 }

  /** The temperature's scale, lowest and highest, on 4 °C at least so that a flat day stays flat (as the hours tab). */
  fun tempScale(values: List<Double>): Pair<Double, Double> {
    var lo = values.min()
    var hi = values.max()
    if (hi - lo < 4) {
      val mid = (hi + lo) / 2
      lo = mid - 2
      hi = mid + 2
    }
    return lo to hi
  }

  /** The height of an hour's rain bar, 0 to 1: a square root of its share of the wettest hour (2 mm at least), as the hours tab. */
  fun rainShare(mm: Double, wettest: Double): Float {
    val top = maxOf(2.0, wettest)
    return ((6 + 28 * sqrt(min(mm, top) / top)) / 34).toFloat()
  }

  /**
   * The example the widget list shows (Android 15 and later): made-up hours from the phone's current hour, never a real
   * read; a mild day with a shower, a tide and a surf that improves.
   */
  fun sample(nowUtc: Long, offsetS: Int): Strip {
    val start = Math.floorDiv(nowUtc, 3600L) * 3600L
    val hours =
      (0 until HOURS).map { i ->
        val t = start + i * 3600L
        val local = Math.floorMod(t + offsetS, 86_400L) / 3600
        val day = local in 8..17
        val temp = 12.0 + 4 * cos((local - 15) / 24.0 * 2 * PI)
        val rain = if (i in 5..6) 0.8 + 0.6 * (i - 5) else 0.0
        val wind = 14.0 + 10 * (i / (HOURS - 1.0))
        val code = if (rain > 0) 61 else if (day) 2 else 1
        val surf = if (!day) null else if (i < 7) "poor" else if (i < 10) "possible" else "good"
        FriseHour(t, HourWeather(t, temp, rain, wind, wind * 1.7, 250.0, code, day), !day, mapOf(SEA_ACTIVITY to surf))
      }
    val tide = listOf(TideExtreme(start - 2 * 3600, false, 1.1), TideExtreme(start + 4 * 3600 + 1200, true, 3.9), TideExtreme(start + 10 * 3600 + 2400, false, 1.0), TideExtreme(start + 16 * 3600 + 3000, true, 4.1))
    return Strip(hours, offsetS, ((nowUtc - start) / 3600f).coerceIn(0f, 1f), ticks(hours, offsetS), tide, "Mon spot", hours.map { it.verdicts[SEA_ACTIVITY] })
  }
}
