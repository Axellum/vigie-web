package fr.auxfilsdesidees.vigie.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The pins of the sea map and its base map, on real answers trimmed to three spots: the overview of 21/11/2026, the
 * figures of the hour of 28/11/2026 (`/v1/surf/overview`) and the site's dark style of 28/11/2026, cut to four layers.
 */
class SeaMapTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private val overview = fixture("overview_three_spots.json")
  private val surf = fixture("surf_overview_three_spots.json")

  @Test
  fun `the surf pins carry the verdict, the swell of the hour and the tide`() {
    val pins = SeaMap.pins(overview, surf, MapActivity.Surf).associateBy { it.id }
    val trestel = pins.getValue("trevou-treguignec-plage-de-trestel")
    assertEquals("good", trestel.verdict)
    assertEquals(0, trestel.rank)
    // 1,0 m written as the site writes it: no trailing zero; 11,2 s to the second.
    assertEquals("1 m · 11 s", trestel.text)
    assertEquals("falling", trestel.tide)
    assertEquals(48.8225, trestel.lat, 0.0)
    val kerou = pins.getValue("le-pouldu-plage-du-kerou")
    assertEquals("possible", kerou.verdict)
    assertEquals(1, kerou.rank)
    assertEquals("1,4 m · 11 s", kerou.text)
    assertEquals("1,6 m · 10 s", pins.getValue("plouharnel-la-grande-plage").text)
  }

  @Test
  fun `the kite and the boat show the wind, shore fishing the third of the tide`() {
    val kite = SeaMap.pins(overview, surf, MapActivity.Kite).associateBy { it.id }
    assertEquals("poor", kite.getValue("trevou-treguignec-plage-de-trestel").verdict)
    assertEquals(2, kite.getValue("trevou-treguignec-plage-de-trestel").rank)
    assertEquals("26 km/h", kite.getValue("trevou-treguignec-plage-de-trestel").text)
    assertEquals("28 km/h", SeaMap.pins(overview, surf, MapActivity.Boat).single { it.id == "plouharnel-la-grande-plage" }.text)
    val fishing = SeaMap.pins(overview, surf, MapActivity.ShoreFishing).associateBy { it.id }
    assertEquals("tiers haut", fishing.getValue("trevou-treguignec-plage-de-trestel").text)
    assertEquals("tiers bas", fishing.getValue("le-pouldu-plage-du-kerou").text)
  }

  @Test
  fun `the kite and the boat say where the wind comes from, to 15 degrees, and the others do not`() {
    assertEquals(195, SeaMap.pins(overview, surf, MapActivity.Kite).single { it.id == "trevou-treguignec-plage-de-trestel" }.windFrom)
    assertEquals(180, SeaMap.pins(overview, surf, MapActivity.Boat).single { it.id == "plouharnel-la-grande-plage" }.windFrom)
    SeaMap.pins(overview, surf, MapActivity.Surf).forEach { assertNull(it.windFrom) }
    SeaMap.pins(overview, surf, MapActivity.ShoreFishing).forEach { assertNull(it.windFrom) }
    assertEquals(0, SeaMap.windStep(352.6))
    assertEquals(0, SeaMap.windStep(7.0))
    assertEquals(15, SeaMap.windStep(8.0))
    assertEquals(345, SeaMap.windStep(-15.0))
  }

  @Test
  fun `without the figures of the hour, the pins keep their verdict and nothing else`() {
    val pins = SeaMap.pins(overview, null, MapActivity.Surf)
    assertEquals(3, pins.size)
    pins.forEach {
      assertNull(it.text)
      assertNull(it.tide)
    }
    assertEquals(3, SeaMap.pins(overview, "not json", MapActivity.Surf).size)
  }

  @Test
  fun `a spot whose activity is not available has no pin, nor a verdict it does not know`() {
    val cut =
      overview.replaceFirst("\"available\": true", "\"available\": false").replaceFirst("\"verdict\": \"possible\"", "\"verdict\": \"maybe\"")
    val pins = SeaMap.pins(cut, surf, MapActivity.Surf)
    assertEquals(listOf("le-pouldu-plage-du-kerou", "plouharnel-la-grande-plage"), pins.map { it.id })
    assertNull(pins.first().verdict)
    assertEquals(3, pins.first().rank)
  }

  @Test
  fun `the bands of the verdicts are the site's blue ramp`() {
    assertEquals(3, SeaMap.band("good"))
    assertEquals(2, SeaMap.band("possible"))
    assertEquals(0, SeaMap.band("poor"))
    assertEquals(-1, SeaMap.band(null))
    assertEquals("#9fd3f5", SeaMap.BAND_COLOURS[SeaMap.band("good")])
  }

  @Test
  fun `the pins become points, and pins that look the same share one label`() {
    val pins = SeaMap.pins(overview, surf, MapActivity.Kite)
    val features = Json.parseToJsonElement(SeaMap.features(pins)).jsonObject.getValue("features").jsonArray.map { it.jsonObject }
    assertEquals(3, features.size)
    val trestel = features.first()
    assertEquals(listOf(-3.3552, 48.8225), trestel.getValue("geometry").jsonObject.getValue("coordinates").jsonArray.map { it.jsonPrimitive.content.toDouble() })
    val properties = trestel.getValue("properties").jsonObject
    assertEquals("trevou-treguignec-plage-de-trestel", properties.getValue("id").jsonPrimitive.content)
    assertEquals(0, properties.getValue("band").jsonPrimitive.content.toInt())
    assertEquals(2, properties.getValue("rank").jsonPrimitive.content.toInt())
    // Trestel and Kerou: poor, from 189° and 192° (195° to 15°), 26 km/h, the tide falling: one picture for both.
    assertEquals("vigie-pin:0:falling:195:26 km/h", properties.getValue("label").jsonPrimitive.content)
    assertEquals(properties.getValue("label"), features[1].getValue("properties").jsonObject.getValue("label"))
    // A pin without figures is a dot only.
    val bare = Json.parseToJsonElement(SeaMap.features(SeaMap.pins(overview, null, MapActivity.Kite))).jsonObject.getValue("features").jsonArray
    assertNull(bare.first().jsonObject.getValue("properties").jsonObject["label"])
  }

  @Test
  fun `numbers are written as the site writes them in French`() {
    assertEquals("2,5", SeaMap.number(2.5, 1))
    assertEquals("2,5", SeaMap.number(2.46, 1))
    assertEquals("12", SeaMap.number(11.5, 0))
    assertEquals("0", SeaMap.number(-0.04, 1))
    assertEquals("-0,7", SeaMap.number(-0.68, 1))
  }

  @Test
  fun `the base map is the site's, in French and in the site's colours`() {
    val style = Json.parseToJsonElement(SeaMap.styleForApp(fixture("basemap_dark.json"))).jsonObject
    val layers = style.getValue("layers").jsonArray.associateBy { it.jsonObject.getValue("id").jsonPrimitive.content }.mapValues { it.value.jsonObject }
    assertEquals(SeaMap.LAND, layers.getValue("background").getValue("paint").jsonObject.getValue("background-color").jsonPrimitive.content)
    assertEquals(SeaMap.WATER, layers.getValue("water").getValue("paint").jsonObject.getValue("fill-color").jsonPrimitive.content)
    // A name in English takes the French one where the tiles have it, the field of before otherwise.
    val name = layers.getValue("water_name").getValue("layout").jsonObject.getValue("text-field").jsonArray
    assertEquals(JsonPrimitive("coalesce"), name[0])
    assertEquals(JsonArray(listOf(JsonPrimitive("get"), JsonPrimitive("name:fr"))), name[1])
    assertEquals("case", name[2].jsonArray[0].jsonPrimitive.content)
    // A label that does not name a place in English is kept as served; the tiles and the fonts too.
    val source = Json.parseToJsonElement(fixture("basemap_dark.json")).jsonObject
    val untouched = source.getValue("layers").jsonArray.map { it.jsonObject }.single { it.getValue("id").jsonPrimitive.content == "road_oneway" }
    assertEquals(untouched, layers.getValue("road_oneway"))
    assertEquals(source.getValue("sources"), style.getValue("sources"))
    assertEquals(source.getValue("glyphs"), style.getValue("glyphs"))
  }

  @Test
  fun `the reader asks the site's style and the API's two overviews`() = runTest {
    val asked = mutableListOf<String>()
    val reader =
      SeaMapReader("https://api.test", "https://site.test") { url ->
        asked += url
        when {
          url.endsWith("/data/basemap/dark.json") -> fixture("basemap_dark.json")
          url.endsWith("/v1/activities/overview") -> overview
          else -> throw ApiException(503)
        }
      }
    assertEquals(SeaMap.styleForApp(fixture("basemap_dark.json")), reader.style())
    assertEquals(overview, reader.overview())
    // The figures of the hour failing leave the pins without them.
    assertNull(reader.surf())
    assertEquals(listOf("https://site.test/data/basemap/dark.json", "https://api.test/v1/activities/overview", "https://api.test/v1/surf/overview"), asked)
  }

  @Test
  fun `a followed spot is marked for its star, and the followed places get a picture of their name`() {
    val pins = SeaMap.pins(overview, surf, MapActivity.Surf)
    val features = Json.parseToJsonElement(SeaMap.features(pins, setOf("le-pouldu-plage-du-kerou"))).jsonObject.getValue("features").jsonArray.map { it.jsonObject.getValue("properties").jsonObject }
    assertEquals(listOf(null, "true", null), features.map { it["followed"]?.jsonPrimitive?.content })
    val places = Json.parseToJsonElement(SeaMap.placeFeatures(listOf(FollowedPlace(Place("Quiberon", 47.484, -3.119), emptyList())))).jsonObject.getValue("features").jsonArray
    val quiberon = places.single().jsonObject
    assertEquals("47.4840,-3.1190", quiberon.getValue("properties").jsonObject.getValue("key").jsonPrimitive.content)
    assertEquals("vigie-place:Quiberon", quiberon.getValue("properties").jsonObject.getValue("image").jsonPrimitive.content)
    assertEquals(listOf(-3.119, 47.484), quiberon.getValue("geometry").jsonObject.getValue("coordinates").jsonArray.map { it.jsonPrimitive.content.toDouble() })
  }

  @Test
  fun `a touch opens a town from the base map's town names, never from a country's or a region's`() {
    // The place layers of OpenFreeMap's dark style of 28/11/2026, their filters cut to the class.
    fun layer(id: String, filter: String) = """{"id":"$id","type":"symbol","source":"openmaptiles","source-layer":"place","filter":$filter}"""
    val style =
      """{"layers":[{"id":"water","type":"fill","source-layer":"water"},""" +
        layer("place_other", """["match",["get","class"],["hamlet","isolated_dwelling","neighbourhood"],true,false]""") + "," +
        layer("place_village", """["==",["get","class"],"village"]""") + "," +
        layer("place_city_large", """["all",["<=",["get","rank"],3],["==",["get","class"],"city"]]""") + "," +
        layer("place_state", """["==",["get","class"],"state"]""") + "," +
        layer("place_country_major", """["==",["get","class"],"country"]""") + "]}"
    assertEquals(listOf("place_other", "place_village", "place_city_large"), SeaMap.townLayers(style))
    assertEquals(emptyList<String>(), SeaMap.townLayers("not json"))
  }

  @Test
  fun `the weather of a town's sheet is the Accueil's point, through the map's gate`() = runTest {
    val asked = mutableListOf<String>()
    var now = 0L
    val waits = mutableListOf<Long>()
    val gate = PointGate(max = 1, clock = { now }, sleep = { waits += it; now += it })
    val reader = SeaMapReader("https://api.test", "https://site.test", gate) { url -> asked += url; fixture("point_lorient.json") }
    val town = Place("Capbreton", 43.642, -1.428)
    reader.point(town)
    reader.point(town)
    assertEquals(listOf("https://api.test/v1/point?lat=43.6420&lon=-1.4280&compact=false"), asked.distinct())
    assertEquals(2, asked.size)
    // The second waited for the minute of the first.
    assertEquals(listOf(60_000L), waits)
  }
}
