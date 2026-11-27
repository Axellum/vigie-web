package fr.auxfilsdesidees.vigie.widget

import fr.auxfilsdesidees.vigie.data.Day
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.RainNowcast
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.Vigilance
import fr.auxfilsdesidees.vigie.data.Vigilances
import fr.auxfilsdesidees.vigie.ui.Vigil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The widgets in the look of the card's home page (piste B) say what the card says, from the last read kept by the app.
 * The read is of Friday 27/11/2026 at 15 h 10 in Bordeaux (UTC+1), rain within forty minutes.
 */
class BoardWidgetTest {
  private val nb = ' '
  private val midnight = 1_795_737_600L // 27/11/2026 at 0 h UTC
  private val server = midnight + 14 * 3600 + 10 * 60
  private val bordeaux = Place("Bordeaux", 44.84, -0.58)

  private val rates = listOf(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 0.9, 1.6, 2.4)

  private fun point(hours: Int = 30) =
    PointNow(
      serverUtc = server,
      utcOffsetS = 3600,
      provider = "Météo-France (AROME, ARPEGE)",
      alertLevel = null,
      tempC = 12.4,
      feelsLikeC = 10.0,
      windKmh = 22.0,
      gustKmh = 41.0,
      windDeg = 250.0,
      rain1hMm = 0.0,
      weatherCode = 3,
      days =
        listOf(
          Day("2026-11-27", 3, 7.0, 13.0, 1.2, 60.0),
          Day("2026-11-28", 61, 6.0, 11.0, 8.0, 90.0),
          Day("2026-11-29", 2, 4.0, 10.0, 0.0, 10.0),
          Day("2026-11-30", 1, 2.0, 9.0, 0.0, 0.0),
          Day("2026-12-01", 3, 3.0, 10.0, 0.2, 20.0),
          Day("2026-12-02", 3, 4.0, 11.0, 0.0, 10.0),
        ),
      hours = (0 until hours).map { i -> HourWeather(midnight + (14 + i) * 3600L, 12.0 - i * 0.2, if (i == 2) 0.8 else 0.0, 20.0 + i, 35.0 + i, 250.0, if (i == 2) 61 else 3, i < 2, 40.0, 90.0) },
      rainSoon = RainNowcast(15, listOf(0.0, 0.0, 0.1, 0.4), rates, server),
    )

  private fun snapshot(p: PointNow = point(), vigilances: Vigilances? = Vigilances(true, false, emptyList(), null)) =
    Snapshot(bordeaux, p, emptyList(), false, vigilances = vigilances)

  @Test
  fun `the rain of the hour comes from the card's tile, its twelve bars and their hours`() {
    val v = BoardWidget.view("Bordeaux", snapshot(), server)
    assertEquals("Pluie dans 40${nb}min", v.rain.head)
    assertEquals("faible, puis modérée", v.rain.sub)
    assertEquals(rates, v.rain.bars.map { it.r })
    assertEquals(listOf("15${nb}h${nb}10", "15${nb}h${nb}35", "16${nb}h${nb}05"), v.rain.marks)
    assertEquals("16${nb}h${nb}05", v.rain.end)
    assertNull(v.age)
  }

  @Test
  fun `the columns are the card's slots, twelve by the hour and eight by three hours, and five days`() {
    val v = BoardWidget.view("Bordeaux", snapshot(), server)
    assertEquals(12, v.hourly.size)
    assertEquals(midnight + 14 * 3600, v.hourly[0].ts)
    assertTrue(v.hourly.zipWithNext().all { (a, b) -> b.ts - a.ts == 3600L })
    assertEquals(8, v.byThree.size)
    assertTrue(v.byThree.zipWithNext().all { (a, b) -> b.ts - a.ts == 3 * 3600L })
    // The first slot by three hours (14 h to 17 h UTC) holds the shower of 16 h: its rain is the sum of its three hours.
    assertEquals(0.8, v.byThree[0].mm!!, 1e-9)
    assertEquals(5, v.days.size)
    assertEquals("Auj.", v.days[0].name)
    assertEquals(3600, v.offsetS)
    assertNotNull(v.kind)
  }

  @Test
  fun `an old read says its age and no rain of the hour`() {
    val v = BoardWidget.view("Bordeaux", snapshot(), server + 2 * 3600)
    assertNotNull(v.age)
    assertEquals("Pluie de l’heure non lue", v.rain.head)
    assertTrue(v.rain.bars.isEmpty())
    assertNull(v.rain.end)
  }

  @Test
  fun `the pill says the first hazard and its level, the others counted`() {
    val end = server + 15 * 3600
    val wind = Vigilance("w", "meteofrance", "Météo-France", "ORANGE", "wind", null, "Gironde", false, null, server - 3600, end, null, null, null, null, null, null)
    val rain = Vigilance("r", "meteofrance", "Météo-France", "YELLOW", "rain", null, "Gironde", false, null, server - 3600, end, null, null, null, null, null, null)
    val v = BoardWidget.view("Bordeaux", snapshot(vigilances = Vigilances(true, false, listOf(rain, wind), null)), server)
    assertEquals("Vent orange +1", BoardWidget.pill(v.warnings))
    assertEquals("Bordeaux, 12°, Pluie dans 40${nb}min, Vent orange +1", BoardWidget.describe(v))
    val one = BoardWidget.view("Bordeaux", snapshot(vigilances = Vigilances(true, false, listOf(wind), null)), server)
    assertEquals("Vent orange", BoardWidget.pill(one.warnings))
  }

  @Test
  fun `without a warning there is no pill, the quiet words stay`() {
    val v = BoardWidget.view("Bordeaux", snapshot(), server)
    assertNull(BoardWidget.pill(v.warnings))
    assertEquals(Vigil.State.None, v.warnings.state)
    assertEquals("Bordeaux, 12°, Pluie dans 40${nb}min, Aucune vigilance", BoardWidget.describe(v))
    assertNull(BoardWidget.pill(BoardWidget.view("Bordeaux", snapshot(vigilances = null), server).warnings))
  }

  @Test
  fun `the format follows the room as the earlier widget`() {
    assertEquals(BoardWidget.Format.Compact, BoardWidget.format(356f, 100f))
    assertEquals(BoardWidget.Format.Medium, BoardWidget.format(356f, 210f))
    assertEquals(BoardWidget.Format.Medium, BoardWidget.format(200f, 430f))
    assertEquals(BoardWidget.Format.Large, BoardWidget.format(356f, 430f))
  }

  @Test
  fun `the surf is read hour by hour from the start of the frise`() {
    val sea = BoardWidget.Sea("Lacanau", emptyList(), midnight, listOf(null, "poor", "good"))
    assertNull(sea.surfAt(midnight + 1800))
    assertEquals("poor", sea.surfAt(midnight + 3600 + 1800))
    assertEquals("good", sea.surfAt(midnight + 2 * 3600))
    assertNull(sea.surfAt(midnight - 1))
    assertNull(sea.surfAt(midnight + 3 * 3600))
  }

  @Test
  fun `a flat day keeps a flat curve`() {
    assertEquals(10.0 to 14.0, BoardWidget.tempScale(listOf(12.0, 12.0, 12.0)))
    assertEquals(5.0 to 15.0, BoardWidget.tempScale(listOf(5.0, 15.0)))
  }

  @Test
  fun `the widget list's example has its columns, its days and rain within the hour`() {
    val v = BoardWidget.sample(server, 3600)
    assertEquals("Mon lieu", v.name)
    assertEquals(12, v.hourly.size)
    assertEquals(8, v.byThree.size)
    assertEquals(5, v.days.size)
    assertEquals(12, v.rain.bars.size)
    assertEquals(3, v.rain.marks.size)
    assertNull(BoardWidget.pill(v.warnings))
  }

  @Test
  fun `a civil date is written without java time`() {
    assertEquals("1970-01-01", BoardWidget.isoDate(0))
    assertEquals("2000-02-29", BoardWidget.isoDate(11_016))
    assertEquals("2026-11-27", BoardWidget.isoDate(midnight / 86_400))
  }
}
