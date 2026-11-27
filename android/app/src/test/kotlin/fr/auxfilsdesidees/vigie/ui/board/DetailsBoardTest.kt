package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.ChanceWindow
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.Probabilities
import fr.auxfilsdesidees.vigie.data.RainNowcast
import fr.auxfilsdesidees.vigie.data.ShortStep
import fr.auxfilsdesidees.vigie.data.ShortTerm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Details page says what the Home Assistant card says on its Details page. The read is of Friday 27/11/2026 at 12 h 20
 * at the place (UTC+1, 11 h 20 UTC), as in `HomeBoardTest`; the place is Bordeaux, the page 355 dp wide (a Pixel 6 Pro).
 */
class DetailsBoardTest {
  private val nb = ' '
  private val midnight = 1_795_737_600L // 27/11/2026 at 0 h UTC
  private val now = midnight + 11 * 3600 + 20 * 60
  private val hour = midnight + 11 * 3600
  private val w = 355f

  private fun point(
    hours: List<HourWeather> = emptyList(),
    rain: RainNowcast? = null,
    shortTerm: ShortTerm? = null,
    probabilities: Probabilities? = null,
    provider: String? = "Météo-France (AROME, ARPEGE)",
    serverUtc: Long = now,
    weatherAttribution: String? = null,
  ) =
    PointNow(
      serverUtc, 3600, provider, null, 12.0, 10.0, 20.0, 40.0, 270.0, 0.0, 3, emptyList(), hours, rain,
      lat = 44.84, lon = -0.58, shortTerm = shortTerm, probabilities = probabilities, weatherAttribution = weatherAttribution,
    )

  /** 30 hours from the hour before the one under way; [rain] gives the rain of an hour (index 0 = the hour under way). */
  private fun hours(rain: (Int) -> Double = { 0.0 }) =
    (-1 until 29).map { i -> HourWeather(hour + i * 3600L, 12.0, rain(i), 20.0 + i, 30.0, 270.0, 3, i in 0..5, rainProbabilityPct = 10.0, cloudCoverPct = 50.0) }

  /** AROME-PI by quarter hour from 11 h 15 UTC. */
  private fun steps(vararg s: Pair<Double?, String>) = ShortTerm(15, s.mapIndexed { i, (g, p) -> ShortStep(hour + 900 + i * 900L, g, p) })

  // -------------------------------------------------------------------------------------------------------- the page

  @Test
  fun `the page shows where there is something to show, as the card's bar of pages`() {
    assertTrue(DetailsBoard.available(point(hours = hours()), now)) // Météo-France and 12 hours or more
    assertFalse(DetailsBoard.available(point(hours = hours(), provider = "Open-Meteo"), now))
    assertTrue(DetailsBoard.available(point(provider = "Open-Meteo", shortTerm = steps(20.0 to "none")), now))
    assertFalse(DetailsBoard.available(point(), now))
  }

  @Test
  fun `the chips go to the first noon at least 12 hours ahead`() {
    val tomorrowNoon = midnight + 86_400 + 11 * 3600 // 12 h at the place
    assertEquals(tomorrowNoon, DetailsBoard.nextNoon(point(), now)) // 12 h 20: today's noon is past
    assertEquals(tomorrowNoon, DetailsBoard.nextNoon(point(), midnight + 22 * 3600)) // 23 h: 13 hours ahead
    assertEquals(tomorrowNoon, DetailsBoard.nextNoon(point(), midnight)) // 1 h: today's noon is 11 hours ahead only
    assertEquals(midnight + 11 * 3600, DetailsBoard.nextNoon(point(), midnight - 2 * 3600)) // 23 h the day before
  }

  // ------------------------------------------------------------------------------------------------------- the chips

  @Test
  fun `the rain until noon in periods, light, lull and dry`() {
    // Dry, then a light rain 2 hours, dry 1 hour, rain 1 hour, then dry until tomorrow noon.
    val p = point(hours = hours { i -> when (i) { 2, 3 -> 0.5; 5 -> 2.0; else -> 0.0 } })
    val c = DetailsBoard.chips(p, now)!!
    assertEquals("La pluie d’ici demain midi", c.title)
    assertEquals(
      listOf(
        DetailsBoard.Chip(false, "Sec", "14${nb}h"),
        DetailsBoard.Chip(true, "Pluie faible", "16${nb}h"),
        DetailsBoard.Chip(false, "Accalmie", "17${nb}h"),
        DetailsBoard.Chip(true, "Pluie", "18${nb}h"),
        DetailsBoard.Chip(false, "Sec", "12${nb}h"),
      ),
      c.chips,
    )
  }

  @Test
  fun `a dry quarter hour between two rains is part of the rain`() {
    val st = steps(10.0 to "rain", 10.0 to "rain", 10.0 to "none", 10.0 to "rain", 10.0 to "rain", 10.0 to "none", 10.0 to "none", 10.0 to "none")
    val c = DetailsBoard.chips(point(hours = hours(), shortTerm = st), now)!!
    assertEquals(listOf(DetailsBoard.Chip(true, "Pluie", "13${nb}h${nb}30"), DetailsBoard.Chip(false, "Sec", "12${nb}h")), c.chips)
    // Snow is said as snow, an unknown kind as precipitation.
    val snow = DetailsBoard.chips(point(hours = hours(), shortTerm = steps(10.0 to "snow", 10.0 to "none")), now)!!
    assertEquals("Neige", snow.chips[0].what)
    assertEquals("Précipitations", DetailsBoard.kindWord("graupel"))
  }

  // ------------------------------------------------------------------------------------------------ within the hour

  @Test
  fun `the hour to come, its bars and the hours under them`() {
    val rates = listOf(0.0, 0.0, 0.5, 1.2, 3.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
    val rn = RainNowcast(15, listOf(0.0, 0.4, 0.2, 0.0), rates, startUtc = now, attribution = "Source: Météo-France, PIAF")
    val m = DetailsBoard.minutes(point(rain = rn), now)!!
    assertEquals("Dans l’heure · toutes les 5${nb}min", m.title)
    assertEquals("radar PIAF · mm/h", m.source)
    assertEquals(12, m.bars.size)
    // Now, the first rain, then one in two away from it.
    assertEquals(listOf("maint.", "", "12${nb}h${nb}30", "", "12${nb}h${nb}40", "", "12${nb}h${nb}50", "", "13${nb}h", "", "13${nb}h${nb}10", ""), m.labels.map { it.text })
    assertEquals(listOf("accent", "plain", "first"), m.labels.take(3).map { it.role })
    assertEquals("Open-Meteo · mm/h", DetailsBoard.minutes(point(rain = rn.copy(attribution = "Open-Meteo")), now)!!.source)
    // An old copy says nothing of the hour.
    assertNull(DetailsBoard.minutes(point(rain = rn, serverUtc = now - 3600), now))
    assertEquals(3f, DetailsBoard.minuteBar(0.0))
    assertEquals(6f, DetailsBoard.minuteBar(0.5))
    assertEquals(48f, DetailsBoard.minuteBar(10.0))
  }

  // ------------------------------------------------------------------------------------------------ by quarter hour

  @Test
  fun `the quarter hours, their gusts and peak, their rain and their hours`() {
    val st = steps(20.0 to "none", 25.0 to "none", 40.0 to "rain", 55.0 to "rain", 30.0 to "none", 20.0 to "none", 18.0 to "none", 15.0 to "none")
    val q = DetailsBoard.quarter(point(shortTerm = st), now, w)!!
    assertEquals("Jusqu’à 14${nb}h${nb}15 · par quart d’heure", q.title)
    assertEquals("", q.right) // nothing to say of the hail and the visibility under 420
    val g = q.gusts!!
    assertNull(g.y80) // a scale of 10 to 60 km/h
    assertEquals(55.0, g.peak.v, 0.0)
    assertEquals("55 à 13${nb}h", g.peakText)
    assertEquals(13.6f, g.peak.y, 0.01f)
    assertEquals(20.6f, g.peakTop, 0.01f)
    assertFalse(g.unitOnLeft)
    assertEquals(listOf(Triple(false, 0, "sec"), Triple(true, 2, "pluie"), Triple(false, 4, "sec")), q.runs.map { Triple(it.wet, it.i0, it.text) })
    assertEquals(listOf(0 to "12${nb}h${nb}15", 3 to "13${nb}h", 7 to "14${nb}h"), q.marks)
    // Strong gusts: the line of 80 km/h; hail and visibility said when not « none ».
    val strong = st.copy(steps = st.steps.mapIndexed { i, s -> s.copy(gustKmh = if (i == 6) 85.0 else s.gustKmh) }, hailLevel = "small_hail", visibilityLevel = "none")
    val q2 = DetailsBoard.quarter(point(shortTerm = strong), now, w)!!
    assertTrue(q2.gusts!!.y80 != null)
    assertTrue(q2.gusts.unitOnLeft)
    assertEquals("grêle$nb: petite grêle", q2.right)
    assertEquals("grêle$nb: non · visibilité$nb: bonne", DetailsBoard.quarter(point(shortTerm = st.copy(hailLevel = "none", visibilityLevel = "none")), now, 480f)!!.right)
    // Past steps go; one step left is not a curve.
    assertNull(DetailsBoard.quarter(point(shortTerm = steps(20.0 to "none")), now, w))
  }

  // ------------------------------------------------------------------------------------------------------- 48 hours

  @Test
  fun `the hours hour by hour, the days apart, the wind every few hours`() {
    val h = DetailsBoard.hours48(point(hours = hours { if (it == 3) 1.0 else 0.05 }), now, w)!!
    assertEquals(29, h.hours.size)
    assertEquals("29${nb}h · heure par heure", h.title)
    assertEquals("mm · chance de pluie · vent", h.legend)
    assertEquals(listOf(12 to "Sam"), h.days) // local midnight, 12 hours on
    assertEquals(3, h.windEvery)
    assertEquals(listOf("12${nb}h", "18${nb}h", "0${nb}h", "6${nb}h", "12${nb}h"), h.hourLabels.map { it.second })
    assertEquals(0.0, h.hours[0].mm, 0.0) // under 0.1 mm: dry
    assertEquals(1.0, h.hours[3].mm, 0.0)
    assertTrue(h.hours[0].day && h.hours[0].sun != null)
    assertFalse(h.hours[8].day)
    assertEquals(6, DetailsBoard.hours48(point(hours = hours()), now, 200f)!!.windEvery)
    assertNull(DetailsBoard.hours48(point(hours = hours().take(10)), now, w))
    assertEquals(0f, DetailsBoard.hour48Bar(0.0))
    assertEquals(3f, DetailsBoard.hour48Bar(0.1))
    assertEquals(22f, DetailsBoard.hour48Bar(1.0))
    assertEquals(44f, DetailsBoard.hour48Bar(5.0))
  }

  // -------------------------------------------------------------------------------------------------------- chances

  @Test
  fun `the chances by window, the rows that have something to say`() {
    val windows =
      listOf(ChanceWindow(now - 600, mapOf("rain_1mm_pct" to 90.0))) + // past: left out
        (1..15).map { i ->
          ChanceWindow(
            hour + i * 3 * 3600L,
            mapOf("rain_1mm_pct" to 10.0 * i, "gust_30kt_pct" to 5.0, "gust_50kt_pct" to 0.0, "storm_pct" to 0.0, "snow_1mm_pct" to if (i == 2) 3.0 else 0.0),
          )
        }
    val c = DetailsBoard.chances(point(probabilities = Probabilities(35, 3, windows, null)), now, w)!!
    assertEquals("Chances par 3${nb}h", c.title)
    assertEquals("35 scénarios PE-AROME · fin du créneau", c.source)
    assertEquals(7, c.hours.size) // (355 − 84) / 34
    assertEquals("15${nb}h", c.hours[0])
    assertEquals(listOf("Pluie ≥${nb}1${nb}mm", "Rafales ≥${nb}56", "Orage", "Neige ≥${nb}1${nb}mm"), c.rows.map { it.label })
    assertEquals(10.0, c.rows[0].values[0]!!, 0.0)
    assertEquals(4, DetailsBoard.chances(point(probabilities = Probabilities(null, null, windows, null)), now, 200f)!!.hours.size)
    assertEquals("PE-AROME · fin du créneau", DetailsBoard.chances(point(probabilities = Probabilities(null, null, windows, null)), now, w)!!.source)
    assertNull(DetailsBoard.chances(point(probabilities = Probabilities(35, 3, windows.take(1), null)), now, w))
    assertEquals(0.08f, DetailsBoard.chanceAlpha(0.0), 1e-6f)
    assertEquals(0.9f, DetailsBoard.chanceAlpha(100.0), 1e-6f)
  }

  // -------------------------------------------------------------------------------------------------------- credits

  @Test
  fun `the credits name the providers and the models`() {
    val p =
      point(
        rain = RainNowcast(15, listOf(0.0), attribution = "Source: Météo-France, PIAF | Weather data by Open-Meteo.com"),
        shortTerm = steps(20.0 to "none"),
        probabilities = Probabilities(35, 3, listOf(ChanceWindow(now + 3600, emptyMap())), "Source: Météo-France"),
        weatherAttribution = "Air quality: CAMS (Copernicus Atmosphere Monitoring Service)",
      )
    assertEquals("Données$nb: Météo-France, Open-Meteo, Copernicus (PIAF, AROME-PI, PE-AROME) · relayées par Vigie", DetailsBoard.credits(p))
    assertNull(DetailsBoard.credits(point()))
  }
}
