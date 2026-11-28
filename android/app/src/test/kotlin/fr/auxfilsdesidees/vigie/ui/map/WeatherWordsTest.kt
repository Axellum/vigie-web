package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.WindPoint
import org.junit.Assert.assertEquals
import org.junit.Test

class WeatherWordsTest {
  private val nb = ' '
  // 28/11/2026 at 14:36 UTC, 15 h 36 in France.
  private val measured = 1795876560L
  private val off = 3600
  private val lorient = WindPoint("56185001", "Lorient-Lann Bihoue", 47.76, -3.44, 45, 29.9, 46.4, 190.0, measured, false)

  @Test
  fun `a badge touched says what was measured, where and when`() {
    assertEquals("Lorient-Lann Bihoue", WeatherWords.windName(lorient))
    assertEquals(listOf("Vent 30${nb}km/h du sud", "Rafales 46${nb}km/h", "Station à 45${nb}m · mesure de 15${nb}h${nb}36"), WeatherWords.windLines(lorient, off))
    val buoy = lorient.copy(id = "buoy-6200001", name = "Gascogne", altM = null, gustKmh = null, fromDeg = 225.0, buoy = true)
    assertEquals("Bouée Gascogne", WeatherWords.windName(buoy))
    assertEquals(listOf("Vent 30${nb}km/h de sud-ouest", "Bouée au large · mesure de 15${nb}h${nb}36"), WeatherWords.windLines(buoy, off))
    val calm = lorient.copy(name = null, altM = null, kmh = 3.2, gustKmh = null, fromDeg = null)
    assertEquals("Station de Météo-France", WeatherWords.windName(calm))
    assertEquals(listOf("Vent 3${nb}km/h, sans direction", "Station · mesure de 15${nb}h${nb}36"), WeatherWords.windLines(calm, off))
  }

  @Test
  fun `the moments of the towns' bar, at the phone's clock`() {
    // 28/11/2026, 16 h 10 in France.
    val now = 1795878600L
    assertEquals(
      listOf("Maintenant", "19${nb}h", "22${nb}h", "1${nb}h", "Demain 8${nb}h", "Demain 14${nb}h", "lun. 30", "mar. 1"),
      fr.auxfilsdesidees.vigie.data.TownWeather.moments(now).map { WeatherWords.moment(it, now, off) },
    )
  }

  @Test
  fun `the legends' figures`() {
    assertEquals(listOf("0,1", "0,5", "1", "2", "64"), listOf(0.1, 0.5, 1.0, 2.0, 64.0).map(WeatherWords::rate))
    assertEquals(listOf(0, 2, 5, 8), WeatherWords.radarMarks(9))
    assertEquals(listOf(0, 2), WeatherWords.radarMarks(3))
    assertEquals(listOf(20, 30, 40, 60), WeatherWords.windMarks)
  }
}
