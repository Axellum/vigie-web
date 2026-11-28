package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.AvalancheBulletin
import fr.auxfilsdesidees.vigie.data.AvalancheProblem
import fr.auxfilsdesidees.vigie.data.AvalancheTrend
import fr.auxfilsdesidees.vigie.data.BeachTide
import fr.auxfilsdesidees.vigie.data.DangerBand
import fr.auxfilsdesidees.vigie.data.Day
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Marine
import fr.auxfilsdesidees.vigie.data.NearBeach
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.SkiArea
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The words of the Plages and Pistes tab (the sketches chosen on 28/11/2026). The mountain is read on Saturday 28/11/2026 at
 * 18 h 10 at the place (UTC+1), the sea at 13 h 10 (UTC−4); the places are made up.
 */
class NearbyBoardTest {
  private val nb = ' '

  /** HomeBoard's clock writes its hours with plain spaces (« 15 h 56 »). */
  private val sp = ' '
  private val evening = 1795885800L // 28/11/2026 at 17 h 10 UTC
  private val alps = 3600

  private fun beach(km: Double, sea: Boolean = true) = NearBeach("b$km", "Plage $km", 0.0, 0.0, sea, km)

  private fun area(km: Double) = SkiArea("a$km", "Domaine", 45.0, 6.0, km, 1053, 2514, 16, gondolas = 4, chairs = 8, drags = 4)

  private fun point(temp: Double?, off: Int, days: List<Day> = emptyList(), hours: List<HourWeather> = emptyList(), marine: Marine? = null, uv: Double? = null) =
    PointNow(
      serverUtc = evening,
      utcOffsetS = off,
      provider = "Météo-France",
      alertLevel = null,
      tempC = temp,
      feelsLikeC = null,
      windKmh = 18.0,
      gustKmh = 38.0,
      windDeg = 84.0,
      rain1hMm = 0.0,
      weatherCode = 1,
      days = days,
      hours = hours,
      humidityPct = 64.0,
      uvIndex = uv,
      lat = 14.44,
      lon = -60.88,
      marine = marine,
    )

  private val bulletin =
    AvalancheBulletin(
      region = "Mont-Blanc",
      maxLevel = 3,
      bands = listOf(DangerBand(2, null, 3000), DangerBand(3, 3000, null)),
      problems = listOf(AvalancheProblem("wind_slab", listOf("N"))),
      activity = null,
      snowpack = null,
      trend = listOf(AvalancheTrend(1795993200L, "Indice de risque limité.")), // 29/11 at 23 h UTC: Monday 30 at the place
      publishedUtc = 1795877760L, // 14 h 56 UTC
      validUntilUtc = 1795971600L, // 29/11 at 17 h UTC
      url = null,
      attribution = "Météo-France, BRA",
    )

  @Test
  fun `the fourth tab is Mer where spots are followed, else Plages by the sea, Pistes near an area`() {
    assertEquals(NearbyBoard.Fourth.Sea, NearbyBoard.fourth(true, listOf(beach(0.5)), listOf(area(1.0))))
    assertEquals(NearbyBoard.Fourth.Beaches, NearbyBoard.fourth(false, listOf(beach(2.9)), listOf(area(1.0))))
    // A beach by a lake, or a sea beach farther than 3 km, does not make it « Plages ».
    assertEquals(NearbyBoard.Fourth.Ski, NearbyBoard.fourth(false, listOf(beach(1.0, sea = false), beach(3.5)), listOf(area(14.0))))
    assertEquals(NearbyBoard.Fourth.Sea, NearbyBoard.fourth(false, null, null))
  }

  @Test
  fun `names, distances and heights as the sketch writes them`() {
    assertEquals("Grande Anse des Salines", NearbyBoard.shortName("Plage de Grande Anse des Salines"))
    assertEquals("Anse Caritan", NearbyBoard.shortName("Plage d'Anse Caritan"))
    assertEquals("Brévent/Flégère", NearbyBoard.shortName("Brévent/Flégère (Chamonix)"))
    assertEquals("1,0${nb}km", NearbyBoard.km(1.0))
    assertEquals("2${nb}514${nb}m", NearbyBoard.metres(2514))
    assertEquals("au sud", NearbyBoard.at(14.44, -60.88, 14.40, -60.88))
    assertEquals("à l’ouest", NearbyBoard.at(14.44, -60.88, 14.44, -60.95))
    assertEquals("vers l’ouest", NearbyBoard.towards(257.0))
  }

  @Test
  fun `an area's line counts its lifts by kind`() {
    assertEquals("16 remontées (4 télécabines, 8 télésièges, 4 téléskis) · 1${nb}053 à 2${nb}514${nb}m · à 0,2${nb}km", NearbyBoard.areaLine(area(0.2)))
    assertEquals("à 3,0${nb}km", NearbyBoard.areaLine(SkiArea("x", "X", 0.0, 0.0, 3.0, null, null, null)))
  }

  @Test
  fun `the level on the area is the one at its heights, the highest named with its height`() {
    assertEquals(2, NearbyBoard.areaLevel(area(1.0), bulletin))
    assertEquals(3000, NearbyBoard.threshold(bulletin))
    assertEquals(3, NearbyBoard.areaLevel(SkiArea("x", "X", 0.0, 0.0, 1.0, null, null, null), bulletin))
  }

  @Test
  fun `the sentence of an area says the evening, the level and the snow to come`() {
    val days = listOf("2026-11-28" to 0.0, "2026-11-29" to 0.3, "2026-11-30" to 0.1, "2026-12-03" to 2.5).map { (d, s) -> Day(d, 1, -13.0, -1.0, 0.0, snowfallCm = s) }
    val top = point(-8.0, alps, days)
    val foot = point(1.0, alps)
    val text = NearbyBoard.areaSentence(area(0.2), top, foot, bulletin, evening, alps).joinToString("") { it.text }
    assertEquals("Ce soir -8° en haut, 1° en bas. Avalanches${nb}: 2 limité sur ce domaine, 3 au-dessus de 3${nb}000${nb}m. Peu de neige en vue${nb}: 2,5${nb}cm jeudi en haut.", text)
    val level = NearbyBoard.areaSentence(area(0.2), top, foot, bulletin, evening, alps).first { it.bold }
    assertEquals("jaune", level.tone)
  }

  @Test
  fun `the bulletin's line and its trend`() {
    assertEquals("Météo-France, publié à 15${sp}h${sp}56, jusqu’à demain 18${sp}h", NearbyBoard.bulletinLine(bulletin, evening, alps))
    assertEquals("Lundi" to "indice de risque limité", NearbyBoard.trend(bulletin, evening, alps))
  }

  @Test
  fun `the 0 degree of the hour under way, to 100 m`() {
    val p = point(1.0, alps, hours = listOf(HourWeather(evening - 600, 1.0, 0.0, 3.0, 5.0, 0.0, 0, false, freezingLevelM = 3070.0)))
    assertEquals(3100, NearbyBoard.freezingNow(p, evening))
    assertEquals("3,1", NearbyBoard.freezingKm(p, evening - 600))
    assertNull(NearbyBoard.freezingNow(point(1.0, alps), evening))
  }

  @Test
  fun `the sea around and the tiles of a beach, each only when known`() {
    val sea = Marine(1.74, 79.0, 7.0, 1.48, 78.0, 6.3, 1.7, 257.0, 29.2, "Open-Meteo, Copernicus")
    val now = evening
    val hours = (0 until 12).map { i -> HourWeather(now - 600 + i * 3600L, 28.0, if (i == 9) 0.4 else 0.0, 18.0, 35.0, 84.0, 1, true) }
    val p = point(29.0, -4 * 3600, listOf(Day("2026-11-28", 1, 25.0, 29.0, 2.4, uvMax = 7.0)), hours, sea, uv = 7.2)
    val minis = NearbyBoard.seaAround(p, now)
    assertEquals(listOf("1,7${nb}m", "1,5${nb}m", "29°", "18", "38", "UV 7", "sec"), minis.take(7).map { it.value })
    assertEquals("mer forte", minis[0].label)
    assertEquals("km/h d’est", minis[3].label)
    assertEquals("jusqu’à 22${sp}h", minis[6].label)
    val tiles = NearbyBoard.beachTiles(p, now, BeachTide(true, now + 3600, now + 7 * 3600, 85), "excellent")
    val keys = tiles.map { it.key }
    assertEquals(listOf("Mer", "Houle", "Eau", "Vent", "Air", "UV", "Averses", "Courant"), keys.take(8))
    assertTrue("Pleine mer" in keys && "Baignade" in keys)
    assertEquals("fort · 7 au plus", tiles.first { it.key == "UV" }.detail)
    assertEquals("vers l’ouest", tiles.first { it.key == "Courant" }.detail)
    assertEquals("monte · coef. 85", tiles.first { it.key == "Pleine mer" }.detail)
    // Without the sea: no wave, swell, water nor current; the sky stays.
    val dry = NearbyBoard.beachTiles(point(29.0, -4 * 3600, hours = hours), now, null, null).map { it.key }
    assertTrue(dry.none { it in listOf("Mer", "Houle", "Eau", "Courant") } && "Vent" in dry)
  }
}
