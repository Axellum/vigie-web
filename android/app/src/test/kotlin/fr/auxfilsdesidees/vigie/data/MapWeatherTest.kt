package fr.auxfilsdesidees.vigie.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The radar and the wind of the sea map, read as the site serves them (answers of 28/11/2026). */
class MapWeatherTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private val brittany = GeoBox(-4.2, 47.1, -2.3, 48.4)

  @Test
  fun `the radar's images, oldest first, its legend and where to draw it`() {
    val r = MapWeather.radar(fixture("radar_france.json"), RadarArea.France)
    assertEquals(8, r.frames.size)
    assertEquals(1795874400L, r.frames.first())
    assertEquals(1795876500L, r.frames.last())
    assertEquals(listOf(0.1, 0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0), r.legend.map { it.minMmH })
    assertEquals("#a6cee3", r.legend.first().color)
    assertEquals(0.67, r.legend.first().alpha, 1e-9)
    assertEquals(GeoBox(-9.97, 37.45, 17.57, 53.67), r.bounds)
    assertEquals(3.0, r.minZoom, 0.0)
    assertEquals(10.0, r.maxZoom, 0.0)
    assertFalse(r.stale)
    assertEquals("https://site.test/data/radar/france/1795876500/{z}/{x}/{y}.png", MapWeather.radarTiles("https://site.test", RadarArea.France, 1795876500L))
  }

  @Test
  fun `an answer without images is not a radar`() {
    for (text in listOf("<html>maintenance</html>", "{}", """{"frames":[],"legend":[{"minMmH":0.1,"color":"#a6cee3","alpha":1}]}""", """{"frames":[1795874400],"legend":[]}""")) {
      assertTrue(text, runCatching { MapWeather.radar(text, RadarArea.France) }.isFailure)
    }
  }

  @Test
  fun `the wind of the stations and the buoys, a point without a wind left out`() {
    val box = GeoBox(-6.0, 44.0, -1.0, 50.0)
    val w = MapWeather.wind(fixture("wind_bretagne.json"), box)
    assertEquals(box, w.box)
    assertEquals(listOf("56185001", "29075001", "buoy-6200001", "56000999"), w.points.map { it.id })
    val lorient = w.points.first()
    assertEquals("Lorient-Lann Bihoue", lorient.name)
    assertEquals(29.9, lorient.kmh, 0.0)
    assertEquals(46.4, lorient.gustKmh!!, 0.0)
    assertEquals(190.0, lorient.fromDeg!!, 0.0)
    assertEquals(45, lorient.altM)
    assertFalse(lorient.buoy)
    val buoy = w.points[2]
    assertTrue(buoy.buoy)
    assertNull(buoy.altM)
    val calm = w.points.last()
    assertNull(calm.name)
    assertNull(calm.fromDeg)
    assertEquals(1795876560L, w.measured)
    assertTrue(runCatching { MapWeather.wind("<html></html>", box) }.isFailure)
  }

  @Test
  fun `the radar is shown over France, over the centre of an overseas mosaic, never far out`() {
    assertEquals(RadarArea.France, MapWeather.radarAreaOf(brittany, 8.0))
    assertNull(MapWeather.radarAreaOf(brittany, 2.5))
    assertNull(MapWeather.radarAreaOf(null, 8.0))
    // Guadeloupe, Saint-Denis de La Réunion, Nouméa
    assertEquals(RadarArea.Antilles, MapWeather.radarAreaOf(GeoBox(-62.0, 15.8, -61.0, 16.6), 9.0))
    assertEquals(RadarArea.Reunion, MapWeather.radarAreaOf(GeoBox(55.2, -21.2, 55.7, -20.7), 10.0))
    assertEquals(RadarArea.NewCaledonia, MapWeather.radarAreaOf(GeoBox(166.2, -22.5, 166.7, -22.0), 10.0))
    // The open Atlantic, and a view across the antimeridian whose centre is in the Pacific.
    assertNull(MapWeather.radarAreaOf(GeoBox(-40.0, 30.0, -30.0, 40.0), 5.0))
    assertNull(MapWeather.radarAreaOf(GeoBox(175.0, -20.0, -175.0, -10.0), 5.0))
    // Across the antimeridian, with its centre (171° E) over New Caledonia.
    assertEquals(RadarArea.NewCaledonia, MapWeather.radarAreaOf(GeoBox(160.0, -25.0, -178.0, -15.0), 4.0))
  }

  @Test
  fun `the box of the wind asked is in whole degrees with a margin`() {
    val box = MapWeather.windQueryBox(brittany)
    assertEquals(GeoBox(-6.0, 46.0, -1.0, 50.0), box)
    assertEquals("-6,46,-1,50", MapWeather.windBox(box))
    assertTrue(box.contains(brittany))
    assertFalse(box.contains(GeoBox(-7.0, 47.0, -2.0, 48.0)))
    // A whole country: a quarter of its height around it.
    assertEquals(GeoBox(-8.0, 38.0, 12.0, 54.0), MapWeather.windQueryBox(GeoBox(-5.0, 41.0, 9.0, 51.0)))
  }

  @Test
  fun `the colour steps, the gust and the size of a badge`() {
    assertEquals(listOf(1, 2, 2, 3, 4, 4, 5), listOf(19.9, 20.0, 29.4, 30.0, 40.0, 59.9, 60.0).map(MapWeather::windStep))
    val p = WindPoint("a", "A", 47.0, -3.0, 10, 29.9, 40.0, 190.0, 0, false)
    assertFalse(MapWeather.gustShown(p))
    assertTrue(MapWeather.gustShown(p.copy(gustKmh = 45.0)))
    assertFalse(MapWeather.gustShown(p.copy(gustKmh = null)))
    assertEquals(listOf(10, 12, 12, 14), listOf(5.9, 6.0, 7.9, 8.0).map(MapWeather::badgeRadius))
    assertEquals("vigie-wind:2:30:s:-:12", MapWeather.badgeKey(p, 12))
    assertEquals("vigie-wind:2:30:b:45:12", MapWeather.badgeKey(p.copy(buoy = true, gustKmh = 45.2), 12))
    assertEquals("vigie-beak:2:12", MapWeather.beakKey(p, 12))
  }

  @Test
  fun `badges that would touch keep the strongest, those off the view are left out`() {
    val strong = WindPoint("strong", null, 47.70, -3.40, null, 40.0, null, 270.0, 0, false)
    val near = WindPoint("near", null, 47.71, -3.41, null, 20.0, null, 270.0, 0, false)
    val far = WindPoint("far", null, 48.30, -2.40, null, 10.0, null, null, 0, false)
    val out = WindPoint("out", null, 43.0, 5.0, null, 80.0, null, 0.0, 0, true)
    val kept = MapWeather.declutter(listOf(near, far, strong, out), brittany, 8.0, 14)
    assertEquals(listOf("strong", "far"), kept.map { it.id })
    // Close in, the two neighbours part: both are kept.
    assertEquals(listOf("strong", "near", "far"), MapWeather.declutter(listOf(near, far, strong), brittany, 14.0, 14).map { it.id })
  }

  @Test
  fun `the badges as GeoJSON, the beak turned toward where the wind goes`() {
    val w = MapWeather.wind(fixture("wind_bretagne.json"), GeoBox(-6.0, 44.0, -1.0, 50.0))
    val features = Json.parseToJsonElement(MapWeather.windFeatures(w.points, 10)).jsonObject["features"]!!.jsonArray
    assertEquals(4, features.size)
    val lorient = features[0].jsonObject["properties"]!!.jsonObject
    assertEquals("56185001", lorient["id"]!!.jsonPrimitive.content)
    assertEquals("vigie-wind:2:30:s:46:10", lorient["badge"]!!.jsonPrimitive.content)
    assertEquals("vigie-beak:2:10", lorient["beak"]!!.jsonPrimitive.content)
    assertEquals(10.0, lorient["rot"]!!.jsonPrimitive.content.toDouble(), 0.0)
    val calm = features[3].jsonObject["properties"]!!.jsonObject
    assertFalse(calm.containsKey("beak"))
    assertFalse(calm.containsKey("rot"))
  }
}
