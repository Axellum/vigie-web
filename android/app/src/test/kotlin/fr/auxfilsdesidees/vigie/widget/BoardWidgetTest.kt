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
import fr.auxfilsdesidees.vigie.widget.BoardWidget.Forecast
import fr.auxfilsdesidees.vigie.widget.BoardWidget.Look
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The widgets drawn as the site's (2026-11-27) say what the card says, from the last read kept by the app: the frise for a
 * small widget, the card's home page for the place widget with the room for it. The read is of Friday 27/11/2026 at 15 h 10
 * in Bordeaux (UTC+1), rain within forty minutes.
 */
class BoardWidgetTest {
  private val nb = ' '
  private val midnight = 1_795_737_600L // 27/11/2026 at 0 h UTC
  private val server = midnight + 14 * 3600 + 10 * 60
  private val bordeaux = Place("Bordeaux", 44.84, -0.58)

  private val rates = listOf(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 0.9, 1.6, 2.4)

  private fun point(hours: Int = 30, rain: RainNowcast? = RainNowcast(15, listOf(0.0, 0.0, 0.1, 0.4), rates, server)) =
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
      rainSoon = rain,
    )

  private fun snapshot(p: PointNow = point(), vigilances: Vigilances? = Vigilances(true, false, emptyList(), null)) =
    Snapshot(bordeaux, p, emptyList(), false, vigilances = vigilances)

  @Test
  fun `the rain of the hour comes from the card's tile, its twelve bars and their hours`() {
    val v = BoardWidget.view("Bordeaux", snapshot(), server)
    val r = v.rain!!
    assertEquals("Pluie dans 40${nb}min", r.head)
    assertEquals("faible, puis modérée", r.sub)
    assertEquals(rates, r.bars.map { it.r })
    assertEquals(listOf("15${nb}h${nb}10", "15${nb}h${nb}35", "16${nb}h${nb}05"), r.marks)
    assertEquals("Pluie dans 40${nb}min" to "faible, puis modérée", v.sayHead to v.saySub)
    assertNull(v.age)
    assertEquals(3600, v.offsetS)
    assertNotNull(v.kind)
  }

  @Test
  fun `a dry hour and the next rain are said in one short sentence`() {
    assertEquals("Pas de pluie" to "avant demain vers 9${nb}h", BoardWidget.say("Pas de pluie dans l’heure", "Prochaine pluie demain vers 9${nb}h"))
    assertEquals("Pas de pluie" to "jusqu’à samedi 18${nb}h", BoardWidget.say("Pas de pluie dans l’heure", "Sec jusqu’à samedi 18${nb}h"))
    assertEquals("Pas de pluie dans l’heure" to "", BoardWidget.say("Pas de pluie dans l’heure", ""))
    assertEquals("Il pleut" to "forte", BoardWidget.say("Il pleut", "forte"))
  }

  @Test
  fun `an old read says its age and no rain of the hour`() {
    val v = BoardWidget.view("Bordeaux", snapshot(), server + 2 * 3600)
    assertNotNull(v.age)
    assertEquals("Pluie de l’heure non lue", v.rain!!.head)
    assertTrue(v.rain!!.bars.isEmpty())
  }

  @Test
  fun `without the rain of the hour there is no tile and no box`() {
    val v = BoardWidget.view("Bordeaux", snapshot(point(rain = null)), server)
    assertNull(v.rain)
    assertTrue(v.sayHead.isNotEmpty())
    assertEquals(false, BoardWidget.cardPlan(v.point, server, false, Forecast.Hours).tile)
  }

  @Test
  fun `the warning says the first hazard and its level, the others counted`() {
    val end = server + 15 * 3600
    val wind = Vigilance("w", "meteofrance", "Météo-France", "ORANGE", "wind", null, "Gironde", false, null, server - 3600, end, null, null, null, null, null, null)
    val rain = Vigilance("r", "meteofrance", "Météo-France", "YELLOW", "rain", null, "Gironde", false, null, server - 3600, end, null, null, null, null, null, null)
    val v = BoardWidget.view("Bordeaux", snapshot(vigilances = Vigilances(true, false, listOf(rain, wind), null)), server)
    assertEquals("Vent orange +1", BoardWidget.pill(v.warnings))
    assertEquals("Bordeaux, 12°, Pluie dans 40${nb}min faible, puis modérée, Vent orange +1", BoardWidget.describe(v))
    val one = BoardWidget.view("Bordeaux", snapshot(vigilances = Vigilances(true, false, listOf(wind), null)), server)
    assertEquals("Vent orange", BoardWidget.pill(one.warnings))
  }

  @Test
  fun `without a warning the quiet words stay`() {
    val v = BoardWidget.view("Bordeaux", snapshot(), server)
    assertNull(BoardWidget.pill(v.warnings))
    assertEquals(Vigil.State.None, v.warnings.state)
    assertTrue(BoardWidget.describe(v).endsWith(", Aucune vigilance"))
    assertNull(BoardWidget.pill(BoardWidget.view("Bordeaux", snapshot(vigilances = null), server).warnings))
  }

  @Test
  fun `the frise's columns start after the box of the hour, hour by hour or day by day`() {
    val p = point()
    val hours = BoardWidget.friseColumns(p, server, Forecast.Hours, 5, afterBox = true)
    assertEquals(5, hours.size)
    assertEquals(midnight + 15 * 3600, hours[0].ts)
    assertTrue(hours.all { it.low == null && it.name == null })
    // The shower of 16 h UTC is written under its hour.
    assertEquals(0.8, hours[1].mm!!, 1e-9)
    val alone = BoardWidget.friseColumns(p, server, Forecast.Hours, 6, afterBox = false)
    assertEquals(midnight + 14 * 3600, alone[0].ts)
    val days = BoardWidget.friseColumns(p, server, Forecast.Days, 5, afterBox = true)
    assertEquals(5, days.size)
    assertEquals(11.0, days[0].high, 1e-9) // tomorrow: the box is « now »
    assertEquals(6.0, days[0].low!!, 1e-9)
    // A day carries its rain, drawn at the foot of the taller frise.
    assertEquals(8.0, days[0].mm!!, 1e-9)
    val fromToday = BoardWidget.friseColumns(p, server, Forecast.Days, 6, afterBox = false)
    assertEquals("Auj.", fromToday[0].name)
    assertEquals(6, fromToday.size)
    // No days under two.
    assertTrue(BoardWidget.friseColumns(p.copy(days = p.days.take(1)), server, Forecast.Days, 5, afterBox = false).isEmpty())
    // An answer without today (AROME Outre-mer in the afternoon): tomorrow is not left out, nor named « Auj. ».
    val noToday = p.copy(days = p.days.drop(1))
    assertEquals(days, BoardWidget.friseColumns(noToday, server, Forecast.Days, 5, afterBox = true))
    assertTrue(BoardWidget.friseColumns(noToday, server, Forecast.Days, 6, afterBox = false).none { it.name == "Auj." })
  }

  @Test
  fun `the forecast kept in a widget's state is the hours unless it says the days`() {
    assertEquals(Forecast.Hours, BoardWidget.forecast(null))
    assertEquals(Forecast.Hours, BoardWidget.forecast("hours"))
    assertEquals(Forecast.Days, BoardWidget.forecast("days"))
    assertEquals("days", BoardWidget.key(Forecast.Days))
    assertEquals("hours", BoardWidget.key(Forecast.Hours))
  }

  @Test
  fun `the card's page needs the heights of the app's blocks`() {
    val p = point()
    val hours = BoardWidget.cardPlan(p, server, false, Forecast.Hours)
    // The place 20 + 6, now 68, the tile 8 + 56, the hours with their chance 8 + 206.
    assertEquals(372f, hours.need, 0.01f)
    assertEquals(false, hours.facts)
    assertTrue(hours.hours && hours.days.isEmpty())
    val days = BoardWidget.cardPlan(p, server, false, Forecast.Days)
    // The days with their chance and without a line of sunshine: 250.
    assertEquals(416f, days.need, 0.01f)
    assertEquals(6, days.days.size)
    val large = BoardWidget.cardPlan(p, server, true, Forecast.Days)
    assertTrue(large.facts && large.hours && large.days.isNotEmpty())
    assertEquals(630f, large.need, 0.01f)
    // The days are missing: the medium widget shows the hours.
    val noDays = BoardWidget.cardPlan(p.copy(days = emptyList()), server, false, Forecast.Days)
    assertTrue(noDays.hours)
  }

  @Test
  fun `the card is drawn at the scale the height and the width ask for, never under 0,7`() {
    val f = BoardWidget.cardFrame(372f, 276f, 280f)!!
    assertEquals(0.75f, f.scale, 0.001f)
    assertEquals(368f, f.width, 0.01f)
    assertEquals(0f, f.left, 0.01f)
    assertEquals((280 / 0.75f - 372) / 2, f.top, 0.01f)
    // Roomy: the app's size, the card no wider than its narrow layout, in the middle.
    val big = BoardWidget.cardFrame(372f, 900f, 600f)!!
    assertEquals(1f, big.scale, 0.001f)
    assertEquals(600f, big.width, 0.01f)
    assertEquals(150f, big.left, 0.01f)
    assertNull(BoardWidget.cardFrame(630f, 276f, 280f))
    assertNull(BoardWidget.cardFrame(372f, 150f, 280f))
    // Three cells wide on the Pixel: the card drawn smaller, 330 wide at least.
    val narrow = BoardWidget.cardFrame(372f, 272f, 392f)!!
    assertEquals(0.82f, narrow.scale, 0.001f)
    assertEquals(272 / 0.82f, narrow.width, 0.01f)
  }

  @Test
  fun `the look follows the room, one row, the frise, the card's page`() {
    assertEquals(Look.Line, BoardWidget.look(true, 330f, 80f, 372f, 630f))
    assertEquals(Look.Frise, BoardWidget.look(true, 330f, 180f, 372f, 630f))
    assertEquals(Look.Medium, BoardWidget.look(true, 330f, 280f, 372f, 630f))
    assertEquals(Look.Large, BoardWidget.look(true, 330f, 480f, 372f, 630f))
    assertEquals(Look.Medium, BoardWidget.look(true, 272f, 392f, 372f, 630f))
    // The frise widget is never the card.
    assertEquals(Look.FriseTall, BoardWidget.look(false, 330f, 480f, 372f, 630f))
    assertEquals(Look.Frise, BoardWidget.look(false, 330f, 180f, 372f, 630f))
    // Too narrow for the card: the frise.
    assertEquals(Look.FriseTall, BoardWidget.look(true, 150f, 480f, 372f, 630f))
  }

  @Test
  fun `a bar of the box of the hour rises with the square root of its rate`() {
    assertEquals(3f, BoardWidget.barHeight(0.0, 40f), 0.001f)
    assertEquals(40f, BoardWidget.barHeight(4.0, 40f), 0.001f)
    assertEquals(40f, BoardWidget.barHeight(9.0, 40f), 0.001f)
    assertEquals(22f, BoardWidget.barHeight(1.0, 40f), 0.001f)
  }

  @Test
  fun `the widget list's example has the rain of the hour and a whole page`() {
    val v = BoardWidget.sample(server, 3600)
    assertEquals("Mon lieu", v.name)
    assertEquals(12, v.rain!!.bars.size)
    assertEquals(3, v.rain!!.marks.size)
    assertNull(BoardWidget.pill(v.warnings))
    val plan = BoardWidget.cardPlan(v.point, server, true, Forecast.Hours)
    assertTrue(plan.tile && plan.hours && plan.days.size >= 5)
  }

  @Test
  fun `a civil date is written without java time`() {
    assertEquals("1970-01-01", BoardWidget.isoDate(0))
    assertEquals("2000-02-29", BoardWidget.isoDate(11_016))
    assertEquals("2026-11-27", BoardWidget.isoDate(midnight / 86_400))
  }
}
