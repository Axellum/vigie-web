package fr.auxfilsdesidees.vigie.widget

import fr.auxfilsdesidees.vigie.data.HourVerdict
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.SpotHours
import fr.auxfilsdesidees.vigie.data.TideExtreme
import fr.auxfilsdesidees.vigie.ui.Vigil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The frise widget reads the hours as the app's « Heures » tab reads them. The read is of Sunday 22/11/2026 at 19 h 45
 * at the place (UTC+1); the hour under way starts at 19 h.
 */
class FriseModelTest {
  private val nb = ' '
  private val now = 1_795_373_156L
  private val hour = 1_795_370_400L // 19 h at the place
  private val lorient = Place("Lorient", 47.748, -3.370)

  private fun point(hours: List<HourWeather>) =
    PointNow(
      serverUtc = now,
      utcOffsetS = 3600,
      provider = "Météo-France (AROME, ARPEGE)",
      alertLevel = null,
      tempC = 12.0,
      feelsLikeC = 10.0,
      windKmh = 20.0,
      gustKmh = 40.0,
      windDeg = 270.0,
      rain1hMm = 0.0,
      weatherCode = 3,
      days = emptyList(),
      hours = hours,
      rainSoon = null,
    )

  private val hours = (0 until 30).map { i -> HourWeather(hour + i * 3600L, 12.0 - i * 0.2, if (i == 3) 1.5 else 0.0, 20.0 + i, 40.0, 270.0, 3, i in 13..20) }

  private val spot =
    SpotHours(
      id = "s",
      name = "Plage du Loch",
      activities = mapOf("surf" to (0 until 30).map { i -> HourVerdict(hour + i * 3600L, i in 13..20, if (i in 13..20) "good" else null) }),
      tide = listOf(TideExtreme(hour - 3600, false, 1.0), TideExtreme(hour + 5 * 3600, true, 4.0), TideExtreme(hour + 11 * 3600, false, 1.2), TideExtreme(hour + 17 * 3600, true, 4.1)),
      vigilanceKnown = true,
      alerts = emptyList(),
    )

  @Test
  fun `the frise holds the fourteen hours from the hour under way, now inside the first`() {
    val s = FriseModel.strip(Snapshot(lorient, point(hours), emptyList(), false), now)
    assertEquals(FriseModel.HOURS, s.hours.size)
    assertEquals(hour, s.startUtc)
    assertEquals(hour + 14 * 3600L, s.endUtc)
    assertEquals(0.7656f, s.nowFrac, 0.001f) // 19 h 45 min 56 s
    assertEquals(12.0, s.hours[0].weather!!.tempC!!, 1e-9)
    // No favourite spot read: no sea rows.
    assertNull(s.spot)
    assertTrue(s.sea.isEmpty())
  }

  @Test
  fun `the hours written are the multiples of three, the first two columns left to now`() {
    val s = FriseModel.strip(Snapshot(lorient, point(hours), emptyList(), false), now)
    // 19 h, 20 h, 21 h (column 2), 0 h (5), 3 h (8), 6 h (11), 9 h (12 h later is column 14: outside).
    assertEquals(listOf(2, 5, 8, 11), s.ticks.map { it.index })
    assertEquals(listOf("21${nb}h", "0${nb}h", "3${nb}h", "6${nb}h"), s.ticks.map { it.text })
    assertEquals(listOf(5), FriseModel.midnights(s.hours, 3600))
  }

  @Test
  fun `the favourite spot brings its tide and its surf, hour by hour, none at night`() {
    val s = FriseModel.strip(Snapshot(lorient, point(hours), emptyList(), false, favourite = spot), now)
    assertEquals("Plage du Loch", s.spot)
    assertEquals(FriseModel.HOURS, s.sea.size)
    assertNull(s.sea[0]) // 19 h: night
    assertEquals("good", s.sea[13]) // 8 h
    // The extremes inside the frise are the ones written on it.
    assertEquals(listOf(hour + 5 * 3600, hour + 11 * 3600), s.extremes.map { it.timeUtc })
  }

  @Test
  fun `the scales of the temperature and the rain are the hours tab's`() {
    assertEquals(10.0 to 14.0, FriseModel.tempScale(listOf(11.5, 12.5)))
    assertEquals(5.0 to 15.0, FriseModel.tempScale(listOf(5.0, 15.0)))
    assertEquals(1f, FriseModel.rainShare(4.0, 4.0), 1e-6f)
    assertEquals(20f / 34f, FriseModel.rainShare(0.5, 1.0), 1e-6f) // on 2 mm at least: half the height's range
  }

  @Test
  fun `the widget list's example is made up and starts at the phone's hour`() {
    val s = FriseModel.sample(now, 3600)
    assertEquals(hour, s.startUtc)
    assertEquals(FriseModel.HOURS, s.hours.size)
    assertEquals("Mon spot", s.spot)
    assertTrue(s.hours.all { it.weather != null })
    assertTrue(s.extremes.isNotEmpty())
  }

  @Test
  fun `the frise's header says the warnings in a few words`() {
    assertEquals("Aucune vigilance", WidgetModel.Warnings(Vigil.State.None, null, "Aucune vigilance en cours", null, "", 0).short)
    assertEquals("Vigilances non lues", WidgetModel.Warnings(Vigil.State.Unread, null, "Vigilances non lues", null, "", 0).short)
    assertEquals("Pas de vigilance lue ici", WidgetModel.Warnings(Vigil.State.NoSource, null, "Pas de vigilance officielle lue ici", null, "", 0).short)
  }
}
