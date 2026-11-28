package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.MapWeather
import fr.auxfilsdesidees.vigie.data.Moment
import fr.auxfilsdesidees.vigie.data.SeaMap
import fr.auxfilsdesidees.vigie.data.WindPoint
import fr.auxfilsdesidees.vigie.ui.Words
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The words of the map's weather layers, as the site's (`wind.*` and `radar.*` of `src/lib/i18n.ts`), with the app's
 * times (« 15 h 42 »). Pure: tested on the JVM.
 */
internal object WeatherWords {
  private const val NBSP = ' '

  /** « Bouée Gascogne », the station's name, or « Station de Météo-France » for one the API does not name. */
  fun windName(p: WindPoint): String = if (p.buoy) listOfNotNull("Bouée", p.name).joinToString(" ") else p.name ?: "Station de Météo-France"

  /** The lines under the name of a badge touched: the wind, the gusts, what measured it and when. */
  fun windLines(p: WindPoint, offsetS: Int): List<String> {
    val time = Words.clock(p.measured, offsetS)
    return listOfNotNull(
      if (p.fromDeg == null) "Vent ${Words.kmh(p.kmh)}, sans direction" else "Vent ${Words.kmh(p.kmh)} ${Words.windFrom(p.fromDeg)}",
      p.gustKmh?.let { "Rafales ${Words.kmh(it)}" },
      when {
        p.buoy -> "Bouée au large · mesure de $time"
        p.altM != null -> "Station à ${p.altM}${NBSP}m · mesure de $time"
        else -> "Station · mesure de $time"
      },
    )
  }

  /** A rain rate of the legend: « 0,1 », « 2 », « 64 ». */
  fun rate(mmH: Double): String = SeaMap.number(mmH, 1)

  /** The marks under the radar's legend: the first class, about each step of the scale, and the last. */
  fun radarMarks(classes: Int): List<Int> = listOf(0, 2, 5, classes - 1).filter { it in 0 until classes }.distinct()

  /** The figures under the wind's legend, in km/h: the limits of its five colours. */
  val windMarks: List<Int> = MapWeather.WIND_STEPS

  private val SHORT_DAY = DateTimeFormatter.ofPattern("EEE d", Locale.FRENCH)

  /**
   * A moment of the towns' bar, at the phone's clock ([offsetS], seconds east of UTC), as the site's `MomentBar`: « Maintenant »,
   * « 18 h », « Demain 8 h », « lun. 30 ».
   */
  fun moment(m: Moment, nowS: Long, offsetS: Int): String =
    when (m) {
      Moment.Now -> "Maintenant"
      is Moment.Hour -> hour(Math.floorMod(m.t + offsetS, 86_400L) / 3600)
      is Moment.Local -> "Demain ${hour(m.hour.toLong())}"
      is Moment.Day -> LocalDate.ofEpochDay(Math.floorDiv(nowS + offsetS, 86_400L) + m.days).format(SHORT_DAY)
    }

  private fun hour(h: Long) = "$h${NBSP}h"

  /** A strength of the forecast wind's scale: « 40 km/h et plus ». */
  fun flowStrong(kmh: Int): String = "${Words.kmh(kmh.toDouble())} et plus"

  /** The layers of Météo-France shown, for one credit: « Radar de pluie, vent mesuré et vent prévu »; null for none. */
  fun meteoFranceLayers(rain: Boolean, wind: Boolean, flow: Boolean): String? {
    val names = listOfNotNull("radar de pluie".takeIf { rain }, "vent mesuré".takeIf { wind }, "vent prévu".takeIf { flow })
    if (names.isEmpty()) return null
    val text = if (names.size == 1) names[0] else names.dropLast(1).joinToString(", ") + " et " + names.last()
    return text.replaceFirstChar { it.uppercaseChar() }
  }
}
