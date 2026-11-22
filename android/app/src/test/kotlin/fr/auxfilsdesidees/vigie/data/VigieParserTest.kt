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
  fun `point reads the hourly forecast when the API serves it, and stays empty otherwise`() {
    // point_hourly.json: vigie-api main run locally (ADR 0040), not yet the public API.
    val p = VigieParser.point(fixture("point_hourly.json"))
    assertEquals(3, p.hours.size)
    val h = p.hours[2]
    assertEquals(1795370400L, h.timeUtc)
    assertEquals(11.8, h.tempC!!, 0.0)
    assertEquals(0.1, h.rainMm!!, 0.0)
    assertEquals(286.0, h.windDeg!!, 0.0)
    assertEquals(51, h.weatherCode)
    assertEquals(false, h.isDay)
    assertTrue(VigieParser.point(fixture("point_lorient.json")).hours.isEmpty())
  }

  @Test
  fun `spot hours read the verdicts hour by hour, the tide and the warnings`() {
    val s = VigieParser.spotHours(fixture("activities_plouharnel.json"))
    assertEquals("plouharnel-la-grande-plage", s.id)
    assertEquals("La Grande Plage", s.name)
    assertEquals(setOf("surf", "boat"), s.activities.keys)
    val surf = s.activities.getValue("surf")
    assertEquals(4, surf.size)
    assertEquals(HourVerdict(1795363200L, true, "possible"), surf[0])
    assertEquals(false, surf[1].daylight)
    assertEquals(3, s.tide.size)
    assertTrue(s.tide[0].high)
    assertEquals(-1.84, s.tide[1].heightM, 0.0)
    assertTrue(s.vigilanceKnown)
    assertTrue(s.alerts.isEmpty())
  }

  @Test
  fun `unread warnings are not taken for no warning`() {
    val unread = VigieParser.spotHours("""{"spot": {"id": "x"}, "activities": [], "vigilance": {"status": "unknown", "alerts": []}}""")
    assertFalse(unread.vigilanceKnown)
    assertTrue(unread.tide.isEmpty())
    val alert =
      VigieParser.spotHours(
        """{"spot": {"id": "x"}, "vigilance": {"status": "ok", "alerts": [{"id": "a", "source": "s", "attribution": "c",
        "level": "ORANGE", "onset_utc": 10, "expires_utc": 20, "ends_utc": null}]}}"""
      )
    assertEquals(CoastAlert("ORANGE", 10L, 20L), alert.alerts.single())
  }

  @Test
  fun `repository asks the point, the overview and the favourite's hours and puts them together`() = runTest {
    val asked = mutableListOf<String>()
    val repo =
      VigieRepository(baseUrl = "https://example.test") { url ->
        asked += url
        when {
          "/v1/point" in url -> fixture("point_lorient.json")
          "/v1/activities/overview" in url -> fixture("overview_three_spots.json")
          else -> fixture("activities_plouharnel.json")
        }
      }
    val snap = repo.load(LORIENT, SPOTS)
    assertEquals("Lorient", snap.place.name)
    assertEquals(14.0, snap.point.tempC!!, 0.0)
    assertEquals(2, snap.spots.size)
    assertEquals("La Grande Plage", snap.favourite?.name)
    assertTrue(asked.any { it.startsWith("https://example.test/v1/point?lat=47.7500&lon=-3.3700") })
    assertTrue(asked.contains("https://example.test/v1/activities/overview"))
    assertTrue(asked.contains("https://example.test/v1/activities/plouharnel-la-grande-plage?days=3"))
  }

  @Test
  fun `the favourite's hours failing does not hide the rest`() = runTest {
    val repo =
      VigieRepository(baseUrl = "https://example.test") { url ->
        when {
          "/v1/point" in url -> fixture("point_lorient.json")
          "/v1/activities/overview" in url -> fixture("overview_three_spots.json")
          else -> throw ApiException(503)
        }
      }
    val snap = repo.load(LORIENT, SPOTS)
    assertNull(snap.favourite)
    assertEquals(2, snap.spots.size)
  }

  @Test
  fun `a place without spots asks the point only`() = runTest {
    val asked = mutableListOf<String>()
    val repo =
      VigieRepository(baseUrl = "https://example.test") { url ->
        asked += url
        fixture("point_lorient.json")
      }
    val snap = repo.load(LORIENT, emptyList())
    assertTrue(snap.spots.isEmpty())
    assertNull(snap.favourite)
    assertEquals(1, asked.size)
  }

  @Test
  fun `the catalogue keeps every spot with its point`() {
    val spots = VigieParser.catalogue(fixture("overview_three_spots.json"))
    assertEquals(3, spots.size)
    val kerou = spots.single { it.id == "le-pouldu-plage-du-kerou" }
    assertEquals("Plage du Kerou", kerou.name)
    assertEquals("Le Pouldu", kerou.place)
    assertEquals(47.7678, kerou.lat, 0.0)
  }

  @Test
  fun `the place search reads the site's answer and its credit`() {
    val (hits, credit) = VigieParser.places(fixture("places_quiber.json"))
    assertEquals(listOf("Quiberon", "Saint-Pierre-Quiberon"), hits.map { it.name })
    assertEquals("Brittany", hits[0].region)
    assertEquals("FR", hits[0].country)
    assertEquals(5430L, hits[0].population)
    assertTrue(credit!!.contains("GeoNames"))
  }

  @Test
  fun `the place search waits for two letters and uses the site, whatever the API`() = runTest {
    val asked = mutableListOf<String>()
    val repo =
      VigieRepository(baseUrl = "http://127.0.0.1:8080", siteUrl = "https://site.test") { url ->
        asked += url
        fixture("places_quiber.json")
      }
    assertTrue(repo.searchPlaces(" q ").first.isEmpty())
    assertTrue(asked.isEmpty())
    assertEquals(2, repo.searchPlaces("Saint Pierre").first.size)
    assertEquals("https://site.test/data/places.json?q=Saint+Pierre", asked.single())
  }

  @Test
  fun `the place search puts France first and keeps the site's order otherwise`() = runTest {
    // The site's answer for « Brest » on 22/11/2026: Belarus first (larger population), then Brittany, then six others.
    val repo = VigieRepository(baseUrl = "https://example.test") { fixture("places_brest.json") }
    val hits = repo.searchPlaces("Brest").first
    assertEquals(listOf("FR", "BY", "CZ", "DE", "SI", "SI", "SK", "HR"), hits.map { it.country })
    assertEquals("Brittany", hits[0].region)
  }

  @Test
  fun `the overview read by a refresh serves the spot choices for a while`() = runTest {
    var now = 0L
    val asked = mutableListOf<String>()
    val repo =
      VigieRepository(baseUrl = "https://example.test", clock = { now }) { url ->
        asked += url
        when {
          "/v1/point" in url -> fixture("point_lorient.json")
          "/v1/activities/overview" in url -> fixture("overview_three_spots.json")
          else -> fixture("activities_plouharnel.json")
        }
      }
    repo.load(LORIENT, SPOTS)
    repo.catalogue()
    assertEquals(1, asked.count { it.endsWith("/v1/activities/overview") })
    now += 11 * 60_000L
    repo.catalogue()
    assertEquals(2, asked.count { it.endsWith("/v1/activities/overview") })
  }

  private companion object {
    val LORIENT = Place("Lorient", 47.75, -3.37)
    val SPOTS = listOf("plouharnel-la-grande-plage", "le-pouldu-plage-du-kerou", "portivy-plage-de-l-isthme", "beuzec-plage-de-la-torche")
  }
}
