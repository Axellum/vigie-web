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
  fun `repository asks the point, the warnings, the overview and the favourite's hours and puts them together`() = runTest {
    val asked = mutableListOf<String>()
    val repo =
      VigieRepository(baseUrl = "https://example.test") { url ->
        asked += url
        when {
          "/v1/point" in url -> fixture("point_lorient.json")
          "/v1/vigilances" in url -> fixture("vigilances_ajaccio.json")
          "/v1/activities/overview" in url -> fixture("overview_three_spots.json")
          else -> fixture("activities_plouharnel.json")
        }
      }
    val snap = repo.load(LORIENT, SPOTS)
    assertEquals("Lorient", snap.place.name)
    assertEquals(14.0, snap.point.tempC!!, 0.0)
    assertEquals(2, snap.spots.size)
    assertEquals("La Grande Plage", snap.favourite?.name)
    assertEquals(2, snap.vigilances?.items?.size)
    assertTrue(asked.any { it.startsWith("https://example.test/v1/point?lat=47.7500&lon=-3.3700") })
    assertTrue(asked.contains("https://example.test/v1/vigilances?lat=47.7500&lon=-3.3700&lang=fr,en"))
    assertTrue(asked.contains("https://example.test/v1/activities/overview"))
    assertTrue(asked.contains("https://example.test/v1/activities/plouharnel-la-grande-plage?days=3"))
  }

  @Test
  fun `the favourite's hours or the warnings failing do not hide the rest`() = runTest {
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
    assertNull(snap.vigilances)
    assertEquals(2, snap.spots.size)
  }

  @Test
  fun `a place without spots asks the point and its warnings only`() = runTest {
    val asked = mutableListOf<String>()
    val repo =
      VigieRepository(baseUrl = "https://example.test") { url ->
        asked += url
        if ("/v1/vigilances" in url) fixture("vigilances_rabat.json") else fixture("point_lorient.json")
      }
    val snap = repo.load(LORIENT, emptyList())
    assertTrue(snap.spots.isEmpty())
    assertNull(snap.favourite)
    assertEquals(2, asked.size)
    assertTrue(asked.any { "/v1/vigilances?" in it })
  }

  @Test
  fun `the warnings of a point keep the French text, the times, the area and the credit`() {
    // Ajaccio, 22/11/2026 at 19 h 45: orange wind and yellow waves-flooding of Météo-France, one bulletin in French.
    val v = VigieParser.vigilances(fixture("vigilances_ajaccio.json"))
    assertTrue(v.covered)
    assertFalse(v.unavailable)
    assertEquals(listOf("ORANGE", "YELLOW"), v.items.map { it.level })
    val wind = v.items[0]
    assertEquals("wind", wind.phenomenon)
    assertEquals("Météo-France", wind.issuer)
    assertEquals("Vigilance orange vent", wind.event)
    assertEquals("Corse-du-Sud", wind.area)
    assertFalse(wind.river)
    assertEquals(1795363200L, wind.onsetUtc)
    assertEquals(1795446000L, wind.endUtc) // no `ends_utc`: the end of the bulletin, as the site's widget reads it
    assertTrue(wind.description!!.startsWith("Faits nouveaux"))
    assertEquals("https://vigilance.meteofrance.fr/fr", wind.web)
    assertTrue(wind.attribution!!.contains("Licence Ouverte 2.0"))
  }

  @Test
  fun `a river section has its distance and no hours, and a data feed is not offered as a link`() {
    // Montreuil-sur-Mer, 22/11/2026: the Canche in orange (Vigicrues), 0.56 km away; its link is the GeoJSON feed.
    val w = VigieParser.vigilances(fixture("vigilances_montreuil.json")).items.single()
    assertEquals("flood", w.phenomenon)
    assertTrue(w.river)
    assertEquals("Canche", w.area)
    assertEquals(0.56, w.distanceKm!!, 0.0)
    assertNull(w.onsetUtc)
    assertNull(w.endUtc)
    assertNull(w.web)
  }

  @Test
  fun `a country without a source reads as not covered`() {
    val v = VigieParser.vigilances(fixture("vigilances_rabat.json"))
    assertFalse(v.covered)
    assertTrue(v.items.isEmpty())
    val down = VigieParser.vigilances("""{"countries":["FR"],"vigilances":[],"coverage":[{"status":"unavailable"},{"status":"unavailable"}]}""")
    assertTrue(down.covered)
    assertTrue(down.unavailable)
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

  @Test
  fun `point reads what the home page shows`() {
    val p =
      VigieParser.point(
        """
        {"server_utc": 1795778400, "utc_offset_s": 3600,
         "coordinates": {"lat": 44.84, "lon": -0.58},
         "current": {"temp_c": 9.2, "humidity_pct": 81, "pressure_hpa": 1018.4, "uv_index": 1.2, "aqi_eu": 24},
         "daily": [{"date": "2026-11-27", "tmin": 4.0, "tmax": 12.0, "rain_mm": 1.2, "rain_probability_pct": 60, "wind_max": 24.5}],
         "hourly": [{"time_utc": 1795777200, "temp_c": 9.0, "precipitation_probability_pct": 35, "cloud_cover_pct": 72}],
         "rain_nowcast": {"interval_minutes": 15, "mm_per_step": [0, 0.1, 0, 0],
                          "rate_5m_mm_h": [0, 0, 0, 0.4, 0.4, 0, 0, 0, 0, 0, 0, 0], "start_utc": 1795778100},
         "pressure_history": [{"time_utc": 1795774800, "pressure_hpa": 1017.2}, {"time_utc": 1795764000, "pressure_hpa": 1016.0}],
         "short_term": {"interval_minutes": 15, "steps": [{"time_utc": 1795778100, "wind_gust_kmh": 38.0, "precipitation": "rain"}]},
         "avalanche": {"status": "active", "max_danger_level": 2, "valid_until": "2026-11-28T16:00:00+01:00", "region_name": "Aspe-Ossau"},
         "drought": {"status": "available", "max_level": "alerte", "restrictions_in_force": true},
         "air_quality": {"pollens": {"current": {"grass_grains_m3": 3.5, "status": "ok"},
                                     "daily": [{"date": "2026-11-27", "grass_max_grains_m3": 12.0, "birch_max_grains_m3": 0.5}]}}}
        """
      )
    assertEquals(44.84, p.lat!!, 0.0)
    assertEquals(81.0, p.humidityPct!!, 0.0)
    assertEquals(1018.4, p.pressureHpa!!, 0.0)
    assertEquals(24.0, p.aqiEu!!, 0.0)
    assertEquals(60.0, p.days[0].rainProbabilityPct!!, 0.0)
    assertEquals(24.5, p.days[0].windMaxKmh!!, 0.0)
    assertEquals(35.0, p.hours[0].rainProbabilityPct!!, 0.0)
    assertEquals(72.0, p.hours[0].cloudCoverPct!!, 0.0)
    assertEquals(12, p.rainSoon!!.rate5mMmH!!.size)
    assertEquals(1795778100L, p.rainSoon!!.startUtc)
    assertEquals(listOf(1795764000L, 1795774800L), p.pressureHistory.map { it.timeUtc }) // oldest first
    assertEquals(ShortStep(1795778100L, 38.0, "rain"), p.shortTerm!!.steps.single())
    assertEquals(Avalanche("active", 2, 1795878000L, "Aspe-Ossau"), p.season.avalanche)
    assertEquals(Drought("available", "alerte", true), p.season.drought)
    assertEquals(mapOf("grass" to 3.5), p.season.pollen!!.now)
    assertEquals(mapOf("grass" to 12.0, "birch" to 0.5), p.season.pollen!!.days.single().peaks)
  }

  @Test
  fun `point reads what the Details page shows`() {
    val p =
      VigieParser.point(
        """
        {"server_utc": 1795778400, "weather_attribution": "Source: Météo-France | Air quality: Copernicus",
         "rain_nowcast": {"interval_minutes": 15, "mm_per_step": [0, 0, 0, 0], "attribution": "Source: Météo-France, PIAF"},
         "short_term": {"interval_minutes": 15, "steps": [], "hail": {"level": "small_hail", "max_kg_m2": 0.4},
                        "visibility": {"level": "reduced", "min_m": 800}, "attribution": "Source: Météo-France, AROME-PI"},
         "probabilities": {"short_range": {"members": 35, "window_hours": 3,
                                           "windows": [{"to_utc": 1795780800, "rain_1mm_pct": 20, "gust_30kt_pct": 5, "storm_pct": 0},
                                                       {"rain_1mm_pct": 40}]},
                           "attribution": "Source: Météo-France, PE-AROME"}}
        """
      )
    assertEquals("Source: Météo-France, PIAF", p.rainSoon!!.attribution)
    assertEquals("small_hail", p.shortTerm!!.hailLevel)
    assertEquals("reduced", p.shortTerm.visibilityLevel)
    assertEquals("Source: Météo-France, AROME-PI", p.shortTerm.attribution)
    val pr = p.probabilities!!
    assertEquals(35, pr.members)
    assertEquals(3, pr.windowHours)
    assertEquals("Source: Météo-France, PE-AROME", pr.attribution)
    // A window without its end is left out; a chance the API does not give is absent.
    assertEquals(listOf(ChanceWindow(1795780800L, mapOf("rain_1mm_pct" to 20.0, "gust_30kt_pct" to 5.0, "storm_pct" to 0.0))), pr.windows)
    assertEquals("Source: Météo-France | Air quality: Copernicus", p.weatherAttribution)
    assertNull(VigieParser.point("""{"server_utc": 10}""").probabilities)
  }

  @Test
  fun `a day reads its hours of sunshine, absent when the API does not give them`() {
    val p =
      VigieParser.point(
        """{"server_utc": 10, "daily": [{"date": "2026-11-27", "tmin": 4, "tmax": 13, "sunshine_h": 7.8, "snowfall_cm": 0},
                                         {"date": "2026-11-28", "tmin": 5, "tmax": 12}]}"""
      )
    assertEquals(7.8, p.days[0].sunshineH!!, 0.0)
    assertNull(p.days[1].sunshineH)
  }

  @Test
  fun `a rate without a number leaves the 5-minute rates out, the steps stay`() {
    val p = VigieParser.point("""{"server_utc": 10, "rain_nowcast": {"mm_per_step": [0, 0, 0, 0], "rate_5m_mm_h": [0, null, 0]}}""")
    assertNull(p.rainSoon!!.rate5mMmH)
    assertEquals(4, p.rainSoon!!.mmPerStep.size)
    assertNull(p.rainSoon!!.startUtc)
    assertNull(p.shortTerm)
    assertEquals(SeasonData(), p.season)
  }

  @Test
  fun `ISO dates read with their zone, without java time`() {
    assertEquals(1795737600L, VigieParser.isoSeconds("2026-11-27T00:00:00Z"))
    assertEquals(1795885200L, VigieParser.isoSeconds("2026-11-28T18:00:00+01:00"))
    assertEquals(1795782600L, VigieParser.isoSeconds("2026-11-27T12:30"))
    assertEquals(1795746600L, VigieParser.isoSeconds("2026-11-27T00:00:00.123-0230"))
    assertNull(VigieParser.isoSeconds("27/11/2026"))
  }

  private companion object {
    val LORIENT = Place("Lorient", 47.75, -3.37)
    val SPOTS = listOf("plouharnel-la-grande-plage", "le-pouldu-plage-du-kerou", "portivy-plage-de-l-isthme", "beuzec-plage-de-la-torche")
  }
}
