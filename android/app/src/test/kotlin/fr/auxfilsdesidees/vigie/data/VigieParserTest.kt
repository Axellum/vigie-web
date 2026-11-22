package fr.auxfilsdesidees.vigie.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Fixtures: real answers of the public API (22/11/2026, Lorient and two spots), trimmed; no network in tests. */
class VigieParserTest {
  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  @Test
  fun `point reads the current weather and the days, ignoring unknown fields`() {
    val p = VigieParser.point(fixture("point_lorient.json"))
    assertEquals(1795353506L, p.serverUtc)
    assertEquals(3600, p.utcOffsetS)
    assertEquals("GREEN", p.alertLevel)
    assertEquals(14.0, p.tempC!!, 0.0)
    assertEquals(8.8, p.feelsLikeC!!, 0.0)
    assertEquals(59.4, p.gustKmh!!, 0.0)
    assertEquals(287.0, p.windDeg!!, 0.0)
    assertEquals(0, p.weatherCode)
    assertEquals(3, p.days.size)
    assertEquals("2026-11-22", p.days[0].date)
    assertEquals(61, p.days[0].code)
    assertEquals(5.0, p.days[0].rainMm!!, 0.0)
  }

  @Test
  fun `point keeps a missing block as null instead of inventing it`() {
    val p = VigieParser.point("""{"server_utc": 10, "utc_offset_s": 0, "current": null}""")
    assertNull(p.tempC)
    assertNull(p.weatherCode)
    assertNull(p.alertLevel)
    assertTrue(p.days.isEmpty())
  }

  @Test
  fun `overview keeps only the followed spots, in the followed order`() {
    val ids = listOf("plouharnel-la-grande-plage", "missing-spot", "le-pouldu-plage-du-kerou")
    val (spots, stale) = VigieParser.overview(fixture("overview_three_spots.json"), ids)
    assertFalse(stale)
    assertEquals(listOf("plouharnel-la-grande-plage", "le-pouldu-plage-du-kerou"), spots.map { it.id })
    val surf = spots[0].activities.first { it.id == "surf" }
    assertEquals("good", surf.verdict)
    assertEquals("possible", surf.now)
    assertEquals(1795420800L, surf.bestStartUtc)
    assertEquals(1795438800L, surf.bestEndUtc)
    val fishing = spots[1].activities.first { it.id == "shore_fishing" }
    assertEquals("poor", fishing.verdict)
    assertEquals("low_water.outside_window", fishing.reason)
    assertNull(fishing.bestStartUtc)
  }

  @Test
  fun `repository asks the point and the overview and puts them together`() = runTest {
    val asked = mutableListOf<String>()
    val repo =
      VigieRepository(baseUrl = "https://example.test") { url ->
        asked += url
        if ("/v1/point" in url) fixture("point_lorient.json") else fixture("overview_three_spots.json")
      }
    val snap = repo.load()
    assertEquals("Lorient", snap.place.name)
    assertEquals(14.0, snap.point.tempC!!, 0.0)
    assertEquals(2, snap.spots.size)
    assertTrue(asked.any { it.startsWith("https://example.test/v1/point?lat=47.7500&lon=-3.3700") })
    assertTrue(asked.contains("https://example.test/v1/activities/overview"))
  }
}
