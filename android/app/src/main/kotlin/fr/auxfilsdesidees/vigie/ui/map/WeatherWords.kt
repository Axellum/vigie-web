package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.MapWeather
import fr.auxfilsdesidees.vigie.data.SeaMap
import fr.auxfilsdesidees.vigie.data.WindPoint
import fr.auxfilsdesidees.vigie.ui.Words

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
}
