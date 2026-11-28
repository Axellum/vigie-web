package fr.auxfilsdesidees.vigie.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The weather of the map's towns, read as the site's home map reads it (`townWeather.ts`), on a real answer of the site. */
class TownWeatherTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  // `/data/towns.json?at=47.6,-3.05&at=45.9,6.85&at=48.85,2.35` (Carnac, Chamonix, Paris) of 28/11/2026, 16 h 10 in France.
  private val answer by lazy { TownWeather.towns(fixture("towns_france.json")) }
  private val nowS = 1795878600L
  private fun town(i: Int) = requireNotNull(answer.towns[i].second)

  @Test
  fun `a point falls in a cell of the grid, asked as the site asks it`() {
    assertEquals(TownCell(952, -61), TownWeather.cellOf(47.59, -3.06))
    assertEquals("47.6,-3.05", TownWeather.cellOf(47.59, -3.06).query)
    assertEquals("45.9,6.85", TownWeather.cellOf(45.92, 6.87).query)
    // Across the antimeridian, as the site's `snapToGrid`.
    assertEquals("0,180", TownWeather.cellOf(0.01, 180.01).query)
    assertEquals("0,-179.95", TownWeather.cellOf(0.01, 180.04).query)
    assertEquals(
      "https://site.test/data/towns.json?at=47.6,-3.05&at=48.85,2.35",
      TownWeather.url("https://site.test", listOf(TownWeather.cellOf(47.6, -3.05), TownWeather.cellOf(48.857, 2.352))),
    )
  }

  @Test
  fun `the site's answer is read cell by cell`() {
    assertFalse(answer.paused)
    assertTrue(answer.attribution!!.startsWith("Source: Météo-France"))
    assertEquals(listOf(TownCell(952, -61), TownCell(918, 137), TownCell(977, 47)), answer.towns.map { it.first })
    val carnac = town(0)
    assertEquals(3600L, carnac.utcOffsetS)
    assertEquals(TownNow(13.2, 23.4, 47.2, 184.0, 3), carnac.now)
    assertEquals(40, carnac.hours.size)
    assertEquals(TownHour(1795878000, 13.2, 0.3, 23.4, 45.4, 184.0, 51, true), carnac.hours.first())
    assertEquals(TownDay("2026-11-28", 63, 12.4, 13.8, 6.1, 27.0), carnac.days.first())
    // A cell the site could not read.
    val none = TownWeather.towns("""{"towns":[{"lat":47.6,"lon":-3.05,"weather":null}],"attribution":null,"paused":true}""")
    assertEquals(listOf(TownCell(952, -61) to null), none.towns)
    assertTrue(none.paused)
  }

  @Test
  fun `the moments of the bar`() {
    val next = 1795881600L
    assertEquals(
      listOf(Moment.Now, Moment.Hour(next + 2 * 3600), Moment.Hour(next + 5 * 3600), Moment.Hour(next + 8 * 3600), Moment.Local(1, 8), Moment.Local(1, 14), Moment.Day(2), Moment.Day(3)),
      TownWeather.moments(nowS),
    )
    // Tomorrow at 8 h in France is 7 h UTC.
    assertEquals(1795935600L, TownWeather.momentTime(Moment.Local(1, 8), nowS, 3600))
    assertEquals(1795878000L, TownWeather.momentTime(Moment.Now, nowS, 3600))
    assertNull(TownWeather.momentTime(Moment.Day(2), nowS, 3600))
  }

  @Test
  fun `now, the sky, the temperature, the rain of the next 3 hours and a strong gust`() {
    // Carnac: overcast, 13 °C, 0.5 mm in the next 3 hours, gusts at 47 km/h from the south.
    assertEquals(TownReading("couvert", 13.2, null, 0.5, 47.2, 184.0, true), TownWeather.readAt(town(0), Moment.Now, nowS)?.let { it.copy(rainMm = Math.round(it.rainMm * 100) / 100.0) })
    // Chamonix: sun, no rain, a breeze not shown.
    val chamonix = TownWeather.readAt(town(1), Moment.Now, nowS)!!
    assertEquals("soleil", chamonix.kind)
    assertEquals(1.6, chamonix.temp, 0.0)
    assertNull(chamonix.wind)
    assertFalse(TownWeather.rainShown(chamonix))
  }

  @Test
  fun `a coming hour, tomorrow morning at night, a later day`() {
    // In 3 hours at Carnac: drizzle at night, 4.7 mm in the 3 hours from then, the gusts under 45 km/h.
    val evening = TownWeather.readAt(town(0), Moment.Hour(1795888800), nowS)!!
    assertEquals("bruine", evening.kind)
    assertEquals(13.5, evening.temp, 0.0)
    assertEquals(4.68, evening.rainMm, 1e-9)
    assertNull(evening.wind)
    assertFalse(evening.day)
    assertEquals("4,7", TownWeather.rainFigure(evening.rainMm))
    // Tomorrow at 8 h: before sunrise, the moon.
    assertEquals("lune", TownWeather.readAt(town(0), Moment.Local(1, 8), nowS)?.kind)
    // Monday 1 December at Chamonix: the highest and the lowest of the day.
    assertEquals(TownReading("eclaircies", 9.3, 0.1, 0.0, null, null, true), TownWeather.readAt(town(1), Moment.Day(3), nowS))
    // Beyond the forecast: nothing.
    assertNull(TownWeather.readAt(town(1), Moment.Day(9), nowS))
    assertNull(TownWeather.readAt(town(1), Moment.Hour(nowS + 50 * 3600), nowS))
  }

  @Test
  fun `a pill's picture is drawn once for what it shows`() {
    val r = TownReading("couvert", 13.2, null, 0.5, 47.2, 184.0, true)
    assertEquals("vigie-town:couvert:13:-:0,5:47:185:Carnac", TownWeather.pillKey(r, "Carnac"))
    assertEquals(TownWeather.pillKey(r, "Carnac"), TownWeather.pillKey(r.copy(temp = 12.8, windDeg = 186.0), "Carnac"))
  }
}
