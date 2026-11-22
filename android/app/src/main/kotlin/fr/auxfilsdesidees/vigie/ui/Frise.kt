package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.SpotHours
import fr.auxfilsdesidees.vigie.data.TideExtreme
import kotlin.math.PI
import kotlin.math.cos

/** One hour column of the frise: the weather of the hour (null while the API does not serve it), night or day, verdicts. */
data class FriseHour(
  val timeUtc: Long,
  val weather: HourWeather?,
  val night: Boolean,
  /** Activity id → verdict of the hour; null when unknown or at night (no verdict is shown at night). */
  val verdicts: Map<String, String?>,
)

/**
 * The frise of the « Heures » tab, as in the clickable prototype (direction D): 24 hours from now for today, from 6 h for
 * the next two days. Pure functions, tested on the JVM; times in UTC seconds, [offsetS] = the place's offset.
 */
object Frise {
  const val HOURS = 24

  /** The three activity rows of the frise, in the prototype's order. */
  val ACTIVITIES = listOf("surf", "boat", "shore_fishing")

  private fun hourFloor(t: Long): Long = Math.floorDiv(t, 3600L) * 3600L

  private fun dayKey(t: Long, offsetS: Int): Long = Words.dayKey(t, offsetS)

  /** The last hour the data covers (end excluded): the later of `hourly` and the favourite spot's verdicts. */
  fun coverEnd(point: PointNow, spot: SpotHours?): Long {
    val weather = point.hours.lastOrNull()?.timeUtc?.plus(3600) ?: 0L
    val sea = spot?.activities?.values?.mapNotNull { it.lastOrNull()?.timeUtc }?.maxOrNull()?.plus(3600) ?: 0L
    return maxOf(weather, sea)
  }

  /** Window starts: the current hour for today, then 6 h local of each of the next two days the data covers whole. */
  fun dayStarts(nowUtc: Long, offsetS: Int, coverEndUtc: Long): List<Long> {
    val out = mutableListOf(hourFloor(nowUtc))
    val today = dayKey(nowUtc, offsetS)
    for (k in 1..2) {
      val start = (today + k) * 86_400L + 6 * 3600L - offsetS
      if (start + HOURS * 3600L <= coverEndUtc) out += start
    }
    return out
  }

  /** The 24 hours from [startUtc], with what the API served for each (nothing invented for an hour it did not serve). */
  fun window(startUtc: Long, point: PointNow, spot: SpotHours?): List<FriseHour> {
    val weather = point.hours.associateBy { it.timeUtc }
    val verdicts = spot?.activities.orEmpty().mapValues { (_, hours) -> hours.associateBy { it.timeUtc } }
    return (0 until HOURS).map { i ->
      val t = startUtc + i * 3600L
      val w = weather[t]
      val daylight = verdicts.values.firstNotNullOfOrNull { it[t]?.daylight }
      val night = w?.isDay?.not() ?: (daylight == false)
      FriseHour(
        timeUtc = t,
        weather = w,
        night = night,
        verdicts = ACTIVITIES.associateWith { id -> verdicts[id]?.get(t)?.takeIf { it.daylight != false }?.verdict },
      )
    }
  }

  /** Tide height at [t] between two extremes (half cosine, as the prototype and the site); null outside the extremes. */
  fun tideHeight(extremes: List<TideExtreme>, t: Long): Double? {
    for (i in 0 until extremes.size - 1) {
      val a = extremes[i]
      val b = extremes[i + 1]
      if (t >= a.timeUtc && t <= b.timeUtc) {
        val k = (t - a.timeUtc).toDouble() / (b.timeUtc - a.timeUtc).coerceAtLeast(1)
        return (a.heightM + b.heightM) / 2 + (a.heightM - b.heightM) / 2 * cos(PI * k)
      }
    }
    return null
  }

  /** The first high or low water after [t]. */
  fun nextExtreme(extremes: List<TideExtreme>, t: Long): TideExtreme? = extremes.firstOrNull { it.timeUtc > t }

  /** Whole hours from the current hour to [t]: 0 = now. */
  fun hoursFromNow(t: Long, nowUtc: Long): Long = Math.floorDiv(t - hourFloor(nowUtc), 3600L)
}
