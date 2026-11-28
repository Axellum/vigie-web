package fr.auxfilsdesidees.vigie.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The answers of the Plages and Pistes tab, read and kept: made-up places in the shape of the API's answers. */
class NearbyTest {
  private class Memory : Shelf {
    val texts = linkedMapOf<String, String>()

    override fun read(name: String) = texts[name]

    override fun write(name: String, text: String) {
      texts[name] = text
    }

    override fun delete(name: String) {
      texts.remove(name)
    }

    override fun names() = texts.keys.toList()
  }

  private class Prefs : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String) = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  private val beaches =
    """{"count":3,"beaches":[
      {"id":"beach-far-1","name":"Plage du Lac","lat":10.05,"lon":-60.0,"water":"lake","distance_km":5.6,"source":"osm","ref":"way/1"},
      {"id":"beach-near-2","name":"Plage de l'Anse","lat":9.99,"lon":-60.0,"water":"sea","distance_km":1.1,"source":"ign","ref":"x"},
      {"id":"broken","name":null,"lat":10.0,"lon":-60.0,"water":"sea","distance_km":0.5}
    ],"attribution":"OSM and IGN"}"""

  private val areas =
    """{"count":1,"areas":[{"id":"ski-col-1","name":"Le Col (Bourg)","lat":45.0,"lon":6.0,"bbox":[5.9,44.9,6.1,45.1],"distance_km":2.4,
      "foot_m":1200,"top_m":2600,"lifts":9,"lift_kinds":{"drag":3,"chair":5,"gondola":1,"other":0}}],"attribution":"OSM"}"""

  private val avalanches =
    """{"status":"active","region_name":"Massif","max_danger_level":3,"attribution":"Météo-France, BRA","bulletins":[{
      "publication_time":"2026-11-28T14:56:00Z","valid_until":"2026-11-29T17:00:00Z","max_danger_level":3,
      "regions":[{"region_id":"R","name":"Massif"}],
      "danger_ratings":[{"level":2,"elevation":{"lower_bound":null,"upper_bound":3000}},{"level":3,"elevation":{"lower_bound":3000,"upper_bound":null}}],
      "avalanche_problems":[{"problem_type":"wind_slab","aspects":["N","NE"]},{"problem_type":"wet_snow","aspects":["S"]}],
      "avalanche_activity_highlights":"Above 3000 m, considerable.","snowpack_highlights":"  ",
      "tendency":[{"valid_from":"2026-11-29T23:00:00Z","highlights":"Indice de risque limité"}],
      "bulletin_url":"https://example.org/bra"}]}"""

  @Test
  fun `the beaches come nearest first, by the sea or not, a beach without a name left out`() {
    val c = NearbyParser.beaches(beaches)
    assertEquals(listOf("beach-near-2", "beach-far-1"), c.items.map { it.id })
    assertTrue(c.items[0].sea)
    assertFalse(c.items[1].sea)
    assertEquals("OSM and IGN", c.attribution)
  }

  @Test
  fun `an area has its lifts by kind and its heights`() {
    val a = NearbyParser.areas(areas).items.single()
    assertEquals(1200, a.footM)
    assertEquals(2600, a.topM)
    assertEquals(9, a.lifts)
    assertEquals(listOf(1, 5, 3), listOf(a.gondolas, a.chairs, a.drags))
  }

  @Test
  fun `the bulletin gives the level at a height, its problems and its trend`() {
    val b = NearbyParser.bulletin(avalanches)!!
    assertEquals("Massif", b.region)
    assertEquals(2, b.levelAt(2600))
    assertEquals(3, b.levelAt(3000))
    assertEquals(listOf("wind_slab", "wet_snow"), b.problems.map { it.type })
    assertEquals(listOf("N", "NE"), b.problems[0].aspects)
    assertEquals("Above 3000 m, considerable.", b.activity)
    assertNull(b.snowpack) // blank: nothing to quote
    assertEquals("Indice de risque limité", b.trend.single().text)
    assertEquals(1795877760L, b.publishedUtc)
    assertEquals("https://example.org/bra", b.url)
  }

  @Test
  fun `no bulletin where no service covers the point`() {
    assertNull(NearbyParser.bulletin("""{"status":"not_covered","bulletins":[]}"""))
  }

  @Test
  fun `the tide says the next waters, the bathing water is the nearest site within a kilometre`() {
    val t = NearbyParser.tide("""{"now":{"time_utc":1,"height_m":0.2,"trend":"rising","next_high":{"time_utc":5000,"kind":"high","height_m":2.0},"next_low":{"time_utc":9000,"kind":"low","height_m":-2.0}},"coefficients_estimated":[{"brest_high_water_utc":4000,"value":85}]}""")!!
    assertEquals(true, t.rising)
    assertEquals(5000L, t.nextHigh)
    assertEquals(85, t.coefficient)
    val sites =
      """{"places":[{"type":"bathing","quality":"good","lat":47.005,"lon":-3.0},{"type":"bathing","quality":"poor","lat":47.02,"lon":-3.0},{"type":"harbour","lat":47.0,"lon":-3.0}]}"""
    assertEquals("good", NearbyParser.bathingQuality(sites, 47.0, -3.0))
    assertNull(NearbyParser.bathingQuality(sites, 47.2, -3.0))
  }

  @Test
  fun `the point reads its sea, its UV, its snow, its 0 degree and its height`() {
    val p =
      VigieParser.point(
        """{"server_utc":100,"utc_offset_s":0,"coordinates":{"lat":45.0,"lon":6.0,"elevation_m":2600},
        "current":{"temp_c":-8.0},
        "daily":[{"date":"2026-11-28","tmin":-13,"tmax":-1,"uv_max":1.5,"snowfall_cm":2.5}],
        "hourly":[{"time_utc":0,"temp_c":-8,"feels_like_c":-13.3,"freezing_level_m":3070}],
        "marine":{"wave_height_m":1.74,"wave_direction_deg":79,"wave_period_s":7.0,"swell_wave_height_m":1.48,"swell_wave_direction_deg":78,
          "swell_wave_period_s":6.3,"ocean_current_velocity_kmh":1.7,"ocean_current_direction_deg":257,"sea_surface_temperature_c":29.2,"attribution":"Open-Meteo"}}"""
      )
    assertEquals(2600.0, p.elevationM!!, 0.0)
    assertEquals(1.5, p.days[0].uvMax!!, 0.0)
    assertEquals(2.5, p.days[0].snowfallCm!!, 0.0)
    assertEquals(3070.0, p.hours[0].freezingLevelM!!, 0.0)
    assertEquals(-13.3, p.hours[0].feelsLikeC!!, 0.0)
    val m = p.marine!!
    assertEquals(1.74, m.waveM!!, 0.0)
    assertEquals(257.0, m.currentToDeg!!, 0.0)
    assertEquals(29.2, m.waterC!!, 0.0)
    // A marine block with neither waves nor water is no sea.
    assertNull(VigieParser.point("""{"server_utc":1,"marine":{"stale":true}}""").marine)
  }

  @Test
  fun `a read is kept with its time and read back, the point waits at the gate, old copies go`() = runTest {
    var now = 1_000_000L
    val shelf = Memory()
    val asked = mutableListOf<String>()
    val gate = PointGate(max = 1, clock = { now }, sleep = { ms -> now += ms })
    val reader = NearbyReader("https://api", shelf, gate, clock = { now }, fetch = { url -> asked += url; "text of $url" })
    val (name, url) = NearbyReader.beaches("https://api", 47.123456, -3.98765)
    assertEquals("https://api/v1/beaches?near_lat=47.12&near_lon=-3.99&radius_km=14&limit=50", url)
    val got = reader.read(name, url)
    assertEquals(1000L, got.readUtc)
    assertEquals(got, reader.saved(name))
    // Two reads of `/v1/point` with a share of one a minute: the second waits a minute.
    val sea = NearbyReader.placeSea("https://api", 47.12, -3.98)
    reader.read(sea.first, sea.second)
    reader.read(sea.first, sea.second)
    assertEquals(1_060_000L, now)
    now += 3 * 86_400_000L
    reader.read("fresh", "https://api/v1/ski/areas?near_lat=1&near_lon=1")
    reader.prune()
    assertEquals(listOf("fresh"), shelf.names())
  }

  @Test
  fun `a star keeps a beach in order, a second one lets it go`() {
    val kept = KeptNearby(Prefs())
    kept.toggle("a")
    kept.toggle("b")
    assertEquals(listOf("a", "b"), kept.load())
    assertEquals(listOf("b"), kept.toggle("a"))
  }
}
