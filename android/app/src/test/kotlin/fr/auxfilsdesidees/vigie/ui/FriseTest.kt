package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.TideExtreme
import fr.auxfilsdesidees.vigie.data.VigieParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FriseTest {
  // 22/11/2026 at 14:18 in Lorient (UTC+1); the current hour starts at 14 h local.
  private val now = 1795353506L
  private val off = 3600
  private val hourNow = 1795352400L

  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  @Test
  fun `today starts now, the next days at 6 h, only when the data covers them whole`() {
    val monday6 = 1795410000L // 23/11 at 6 h local
    val tuesday6 = 1795496400L
    assertEquals(listOf(hourNow, monday6, tuesday6), Frise.dayStarts(now, off, hourNow + 72 * 3600))
    assertEquals(listOf(hourNow, monday6), Frise.dayStarts(now, off, tuesday6 + 4 * 3600))
    assertEquals(listOf(hourNow), Frise.dayStarts(now, off, 0L))
  }

  @Test
  fun `cover end is the later of the hourly weather and the sea`() {
    val p = VigieParser.point(fixture("point_hourly.json"))
    val s = VigieParser.spotHours(fixture("activities_plouharnel.json"))
    assertEquals(1795377600L, Frise.coverEnd(p, s))
    assertEquals(1795374000L, Frise.coverEnd(p, null))
  }

  @Test
  fun `a window has 24 hours, invents nothing and shows no verdict at night`() {
    val p = VigieParser.point(fixture("point_hourly.json"))
    val s = VigieParser.spotHours(fixture("activities_plouharnel.json"))
    val w = Frise.window(1795363200L, p, s)
    assertEquals(24, w.size)
    assertEquals(13.1, w[0].weather!!.tempC!!, 0.0)
    assertFalse(w[0].night)
    assertEquals("possible", w[0].verdicts["surf"])
    assertEquals("poor", w[0].verdicts["boat"])
    assertNull(w[0].verdicts["shore_fishing"]) // not in the fixture: unknown, not guessed
    assertTrue(w[1].night)
    assertNull(w[1].verdicts["surf"]) // the API computes it, the frise does not show it at night
    assertNull(w[5].weather) // beyond the served hours
  }

  @Test
  fun `without the hourly weather, the night comes from the spot's daylight`() {
    val p = VigieParser.point(fixture("point_lorient.json"))
    val s = VigieParser.spotHours(fixture("activities_plouharnel.json"))
    val w = Frise.window(1795363200L, p, s)
    assertNull(w[0].weather)
    assertFalse(w[0].night)
    assertTrue(w[1].night)
  }

  @Test
  fun `the tide follows a half cosine between the API's extremes`() {
    val ex = listOf(TideExtreme(0, false, -1.0), TideExtreme(1000, true, 1.0))
    assertEquals(-1.0, Frise.tideHeight(ex, 0)!!, 1e-9)
    assertEquals(0.0, Frise.tideHeight(ex, 500)!!, 1e-9)
    assertEquals(1.0, Frise.tideHeight(ex, 1000)!!, 1e-9)
    assertNull(Frise.tideHeight(ex, 1001))
    assertEquals(ex[1], Frise.nextExtreme(ex, 0))
    assertNull(Frise.nextExtreme(ex, 1000))
  }

  @Test
  fun `the reading counts whole hours from the current hour`() {
    assertEquals(0L, Frise.hoursFromNow(hourNow, now))
    assertEquals(7L, Frise.hoursFromNow(hourNow + 7 * 3600, now))
  }
}
