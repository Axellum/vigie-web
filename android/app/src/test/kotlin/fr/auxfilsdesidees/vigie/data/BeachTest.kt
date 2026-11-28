package fr.auxfilsdesidees.vigie.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** Fixtures: real answers of the public API for the Plage des Corsaires (28/11/2026, 10 h at the place), trimmed; no network in tests. */
class BeachTest {
  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private val surf = fixture("beach_corsaires_surf.json")
  private val activities = fixture("beach_corsaires_activities.json")
  private val point = fixture("beach_corsaires_point.json")
  private val bathing = fixture("beach_corsaires_bathing.json")
  private val t0 = 1795856400L

  private class Memory : Shelf {
    val files = mutableMapOf<String, String>()

    override fun read(name: String) = files[name]

    override fun write(name: String, text: String) {
      files[name] = text
    }

    override fun delete(name: String) {
      files.remove(name)
    }

    override fun names() = files.keys.toList()
  }

  @Test
  fun `a beach kept from the four answers reads back whole`() {
    val b = BeachParser.beach(BeachParser.keep(surf, activities, point, bathing, t0 + 600)!!)!!
    assertEquals("biarritz-plage-des-corsaires", b.spot.id)
    assertEquals("Plage des Corsaires", b.spot.name)
    assertEquals(296.0, b.spot.facingDeg!!, 0.0)
    assertEquals("sand", b.spot.bottom)
    assertEquals(true, b.spot.lifeguarded)
    assertTrue(b.hasForecast && b.hasActivities)
    assertEquals(30, b.hours.size)
    val h0 = b.hours[0]
    assertEquals(t0, h0.timeUtc)
    assertEquals(2.5, h0.waveM!!, 0.0)
    assertEquals(308.0, h0.waveFromDeg!!, 0.0)
    assertEquals(23.0, h0.gustKmh!!, 0.0)
    assertEquals("offshore", h0.windRelative)
    assertEquals("falling", h0.tideTrend)
    assertEquals(listOf("surf", "kite", "boat", "shore_fishing"), b.activities.map { it.id })
    assertEquals("wind.too_light", b.activities[1].reason)
    assertTrue(b.activities[0].hours.isNotEmpty())
    assertEquals(b.extremes.sortedBy { it.timeUtc }, b.extremes)
    assertTrue(b.extremes.first().high)
    assertEquals(85.0, b.coefficients[0].value, 0.0)
    assertEquals(3, b.sun.size)
    assertEquals(15.7, b.waterC!!, 0.0)
    assertEquals(BathingSite("Les Corsaires", "Anglet", "excellent"), b.bathing)
    assertTrue(b.forecastCredit!!.contains("GIP Littoral"))
    assertEquals(t0 + 600, b.readUtc)
  }

  @Test
  fun `without the forecast and the verdicts nothing is kept`() {
    assertNull(BeachParser.keep(null, null, point, bathing, t0))
    assertNull(BeachParser.keep("not json", """{"detail":"Not Found"}""", point, bathing, t0))
  }

  @Test
  fun `the verdicts alone are a beach, without its forecast`() {
    val b = BeachParser.beach(BeachParser.keep(null, activities, null, null, t0)!!)!!
    assertFalse(b.hasForecast)
    assertTrue(b.hasActivities)
    assertTrue(b.hours.isEmpty())
    assertNull(b.waterC)
  }

  @Test
  fun `the water and the bathing site not read again come from the copy before`() {
    val first = BeachParser.keep(surf, activities, point, bathing, t0)!!
    val second = BeachParser.keep(surf, activities, null, null, t0 + 900, previous = first)!!
    assertEquals(15.7, BeachParser.beach(second)!!.waterC!!, 0.0)
    assertEquals(t0, BeachParser.readAt(second, "water_utc"))
    assertEquals("Les Corsaires", BeachParser.beach(second)!!.bathing!!.name)
    assertEquals(t0, BeachParser.readAt(second, "bathing_utc"))
    assertEquals(t0 + 900, BeachParser.beach(second)!!.readUtc)
  }

  @Test
  fun `a list of sites without one near the beach is an answer too`() {
    val none = """{"places":[],"attribution":"x"}"""
    val text = BeachParser.keep(surf, activities, point, none, t0)!!
    assertNull(BeachParser.beach(text)!!.bathing)
    assertEquals(t0, BeachParser.readAt(text, "bathing_utc"))
  }

  @Test
  fun `a bathing site behind the beach is a lake, not its sea`() {
    // The Corsaires face 296° (west-north-west): a site 600 m east is inland, the same 600 m west is on the sea.
    fun sites(lat: Double, lon: Double) = """{"places":[{"type":"bathing","name":"Étang","commune":"Anglet","quality":"good","lat":$lat,"lon":$lon}]}"""
    assertNull(BeachParser.beach(BeachParser.keep(surf, activities, point, sites(43.5074, -1.5300), t0)!!)!!.bathing)
    assertNotNull(BeachParser.beach(BeachParser.keep(surf, activities, point, sites(43.5074, -1.5450), t0)!!)!!.bathing)
    // Within 200 m it is the beach's whatever its side.
    assertNotNull(BeachParser.beach(BeachParser.keep(surf, activities, point, sites(43.5074, -1.5355), t0)!!)!!.bathing)
  }

  @Test
  fun `a broken or older copy reads as none`() {
    assertNull(BeachParser.beach("{"))
    assertNull(BeachParser.beach("""{"version":0,"spot":{}}"""))
  }

  @Test
  fun `the reader asks the four routes at the spot's point, then the water once an hour`() = runTest {
    val asked = mutableListOf<String>()
    var clock = t0 * 1000
    val shelf = Memory()
    val reader =
      BeachReader("https://api.test", shelf, clock = { clock }) { url ->
        asked += url
        when {
          "/v1/surf/spots/" in url -> surf
          "/v1/activities/" in url -> activities
          "/v1/point?" in url -> point
          "/v1/sea/places?" in url -> bathing
          else -> error(url)
        }
      }
    val b = reader.read("biarritz-plage-des-corsaires")
    assertEquals("Plage des Corsaires", b.spot.name)
    assertTrue("https://api.test/v1/surf/spots/biarritz-plage-des-corsaires?days=2" in asked)
    assertTrue("https://api.test/v1/activities/biarritz-plage-des-corsaires" in asked)
    assertTrue("https://api.test/v1/point?lat=43.5074&lon=-1.5375&compact=false&marine=true" in asked)
    assertTrue("https://api.test/v1/sea/places?type=bathing&near_lat=43.5074&near_lon=-1.5375&radius_km=2&limit=20" in asked)
    assertEquals(listOf("biarritz-plage-des-corsaires"), shelf.names())

    asked.clear()
    clock += 20 * 60_000
    assertEquals(15.7, reader.read("biarritz-plage-des-corsaires").waterC!!, 0.0)
    assertEquals(2, asked.size)
    assertTrue(asked.none { "/v1/point" in it || "/v1/sea/places" in it })

    asked.clear()
    clock += 60 * 60_000
    reader.read("biarritz-plage-des-corsaires")
    assertTrue(asked.any { "/v1/point" in it })
    assertTrue(asked.none { "/v1/sea/places" in it })
  }

  @Test
  fun `a failed read keeps the copy before`() = runTest {
    val shelf = Memory()
    var up = true
    val reader = BeachReader("https://api.test", shelf, clock = { t0 * 1000 }) { url ->
      if (!up) throw ApiException(429)
      when {
        "/v1/surf/spots/" in url -> surf
        "/v1/activities/" in url -> activities
        "/v1/point?" in url -> point
        else -> bathing
      }
    }
    reader.read("biarritz-plage-des-corsaires")
    up = false
    try {
      reader.read("biarritz-plage-des-corsaires")
      fail("a read where nothing answers fails")
    } catch (err: ApiException) {
      // expected
    }
    assertEquals("Plage des Corsaires", reader.saved("biarritz-plage-des-corsaires")!!.spot.name)
    reader.keepOnly(setOf("other-spot"))
    assertNull(reader.saved("biarritz-plage-des-corsaires"))
  }
}
