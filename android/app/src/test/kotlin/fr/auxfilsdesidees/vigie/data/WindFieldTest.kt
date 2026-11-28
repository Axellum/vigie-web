package fr.auxfilsdesidees.vigie.data

import java.io.File
import javax.imageio.ImageIO
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.roundToInt
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The forecast wind read as the site reads it (`windField.test.ts`), on a real answer and its three images. */
class WindFieldTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  // The site's `/data/wind-field.json` for the API's answer of the site's end-to-end tests: ARPEGE and AROME, 22/11/2026 00 UTC.
  private val answer by lazy { WindField.answer(fixture("wind_field.json")) }

  private fun level(id: FieldLevelId) = answer.levels.first { it.id == id }

  /** The pixels of one of the site's images (`e2e/fixtures`, the same as the site's tests read), as Android's `getPixels`. */
  private fun pixels(id: FieldLevelId): IntArray {
    // The tests run in `android/app`: the site's fixtures are two folders up.
    val image = ImageIO.read(File("../../e2e/fixtures/wind-field-${id.id}.png"))
    return image.getRGB(0, 0, image.width, image.height, null, 0, image.width)
  }

  private val real by lazy { WindField.finestFirst(FieldLevelId.entries.map { WindField.grid(level(it), pixels(it)) }) }

  private fun at(grids: List<FieldGrid>, lon: Double, lat: Double): FloatArray? = FloatArray(2).takeIf { WindField.sampleWind(grids, lon, lat, it) }

  /** A small grid of the given components (rows from the north), as the site would list it. */
  private fun synthetic(u: List<List<Double>>, v: List<List<Double>>, id: FieldLevelId = FieldLevelId.Europe, west: Double = 0.0, north: Double? = null, step: Double = 1.0, scale: Double = 20.0): FieldGrid {
    val height = u.size
    val width = u[0].size
    val n = north ?: (height - 1).toDouble()
    val lvl =
      FieldLevel(id, "ARPEGE", 0, 0, GeoBox(west, n - (height - 1) * step, west + (width - 1) * step, n), width, height, step, false, scale, 3.0, "/data/wind-field/${id.id}/2026112200-2026112118.png")
    fun byte(ms: Double) = ((ms / scale) * 127.5 + 127.5).roundToInt()
    val argb =
      IntArray(width * height) { i ->
        val x = i % width
        val y = i / width
        if (u[y][x].isNaN()) 0xff000000.toInt() else (0xff shl 24) or (byte(u[y][x]) shl 16) or (byte(v[y][x]) shl 8) or 0xff
      }
    return WindField.grid(lvl, argb)
  }

  @Test
  fun `the site's answer gives the grids of the hour and their images on the site`() {
    assertEquals("ok", answer.status)
    assertEquals(1_795_305_600L, answer.valid)
    assertFalse(answer.stale)
    assertEquals(listOf("world" to "ARPEGE", "europe" to "ARPEGE", "france" to "AROME"), answer.levels.map { it.id.id to it.model })
    assertEquals(listOf(0.0, 3.0, 5.0), answer.levels.map { it.minZoom })
    val world = level(FieldLevelId.World)
    assertEquals(listOf(720, 361), listOf(world.width, world.height))
    assertEquals(0.5, world.step, 0.0)
    assertTrue(world.wholeWorld)
    assertEquals(26.0, world.scale, 0.0)
    assertEquals(GeoBox(-12.0, 37.5, 16.0, 55.4), level(FieldLevelId.France).box)
    assertEquals("/data/wind-field/france/2026112200-2026112118.png", level(FieldLevelId.France).image)
  }

  @Test
  fun `off, unavailable, and what is not an answer`() {
    assertEquals("off", WindField.answer("""{"status":"off","valid":null,"stale":false,"levels":[],"attribution":null}""").status)
    assertEquals("unavailable", WindField.answer("""{"status":"unavailable","valid":1,"levels":[]}""").status)
    assertEquals("unavailable", WindField.answer("""{"status":"ok","levels":[]}""").status)
    for (text in listOf("""{"detail":"Not Found"}""", "<html>", "[]")) {
      assertTrue(text, runCatching { WindField.answer(text) }.isFailure)
    }
  }

  @Test
  fun `a grid whose image is not one of the site's is left out`() {
    val raw = Json.parseToJsonElement(fixture("wind_field.json")).jsonObject["levels"]!!.jsonArray[2].jsonObject
    fun with(key: String, value: JsonPrimitive) = JsonObject(raw + (key to value))
    assertNotNull(WindField.level(raw))
    assertNull(WindField.level(with("image", JsonPrimitive("/data/wind-field/france/../../admin.png"))))
    assertNull(WindField.level(with("image", JsonPrimitive("https://elsewhere.example/a.png"))))
    // The image of another level.
    assertNull(WindField.level(with("image", JsonPrimitive("/data/wind-field/world/2026112200-2026112118.png"))))
    assertNull(WindField.level(with("id", JsonPrimitive("mars"))))
    assertNull(WindField.level(with("width", JsonPrimitive(0))))
  }

  @Test
  fun `the grids worth loading are the world always, Europe from zoom 3 and France from zoom 5 over their boxes`() {
    val france = GeoBox(-5.0, 42.0, 8.0, 51.0)
    val pacific = GeoBox(-170.0, -30.0, -120.0, 10.0)
    fun ids(view: GeoBox?, zoom: Double) = WindField.levelsWanted(answer, view, zoom).map { it.id.id }
    assertEquals(listOf("world"), ids(france, 1.0))
    assertEquals(listOf("world", "europe"), ids(france, 3.0))
    assertEquals(listOf("world", "europe", "france"), ids(france, 5.2))
    assertEquals(listOf("world"), ids(pacific, 6.0))
    assertEquals(listOf("world"), ids(null, 6.0))
    assertEquals(emptyList<FieldLevel>(), WindField.levelsWanted(null, france, 6.0))
  }

  @Test
  fun `the wind of a point is interpolated between the four nodes around it`() {
    val g = synthetic(listOf(listOf(0.0, 10.0), listOf(10.0, 20.0)), listOf(listOf(5.0, 5.0), listOf(-5.0, -5.0)))
    val out = FloatArray(2)
    assertTrue(WindField.sampleGrid(g, 0.5, 0.5, out))
    assertEquals(10.0, out[0].toDouble(), 0.5)
    assertEquals(0.0, out[1].toDouble(), 0.5)
    // The north-east node.
    assertTrue(WindField.sampleGrid(g, 1.0, 1.0, out))
    assertEquals(10.0, out[0].toDouble(), 0.5)
    assertFalse(WindField.sampleGrid(g, 1.01, 0.5, out))
    // Within half a step of the scale.
    val one = synthetic(listOf(listOf(13.7, -2.2)), listOf(listOf(0.4, 19.9)))
    assertTrue(abs(one.u[0] - 13.7) < 20 / 255.0 + 1e-6)
  }

  @Test
  fun `the coarser grid is taken where the finer has no value, the finer faded in over its edge`() {
    val coarse = synthetic(listOf(listOf(0.0, 0.0), listOf(0.0, 0.0)), listOf(listOf(0.0, 0.0), listOf(0.0, 0.0)), id = FieldLevelId.World, west = -10.0, north = 10.0, step = 20.0)
    val fine = synthetic(List(9) { y -> List(9) { x -> if (x == 0 && y == 0) Double.NaN else 8.0 } }, List(9) { List(9) { 0.0 } }, id = FieldLevelId.France, north = 8.0)
    val grids = WindField.finestFirst(listOf(coarse, fine))
    assertEquals(listOf(FieldLevelId.France, FieldLevelId.World), grids.map { it.id })
    assertEquals(8.0, fine.ramp, 0.0)
    assertEquals(0.5, WindField.edgeWeight(fine, 4.0, 4.0), 1e-9)
    // Half the fine (8), half the coarse (0).
    assertEquals(4.0, at(grids, 4.0, 4.0)!![0].toDouble(), 0.5)
    // By the corner without a value: the coarse.
    assertEquals(0.0, at(grids, 0.2, 7.8)!![0].toDouble(), 0.5)
    assertNull(at(grids, 20.0, 0.0))
  }

  @Test
  fun `the whole-world grid goes round the world`() {
    val world = real.first { it.id == FieldLevelId.World }
    val east = FloatArray(2)
    val west = FloatArray(2)
    assertTrue(WindField.sampleGrid(world, 179.9, 10.0, east))
    assertTrue(WindField.sampleGrid(world, -180.1, 10.0, west))
    assertEquals(east[0], west[0], 1e-4f)
    assertTrue(WindField.sampleGrid(world, 539.9, 10.0, west))
    assertEquals(east[0], west[0], 1e-4f)
  }

  @Test
  fun `the real grids of the hour read as the site reads them, AROME over France and ARPEGE beyond`() {
    val france = real.first { it.id == FieldLevelId.France }
    val brest = FloatArray(2)
    assertTrue(WindField.sampleGrid(france, -4.49, 48.39, brest))
    // Deep inside AROME: AROME alone.
    val both = at(real, -4.49, 48.39)!!
    assertEquals(brest[0], both[0], 1e-5f)
    assertEquals(brest[1], both[1], 1e-5f)
    for ((lon, lat) in listOf(-4.49 to 48.39, 2.35 to 48.86, -30.0 to 60.0, 140.0 to -40.0, 0.0 to 89.9, 0.0 to -89.9)) {
      val w = at(real, lon, lat)
      assertNotNull("$lon,$lat", w)
      assertTrue("$lon,$lat", hypot(w!![0].toDouble(), w[1].toDouble()) < 45)
    }
    // Outside AROME's domain (its blue below 128), the grid of France has no value: Europe's is taken.
    assertTrue(france.u.any { it.isNaN() })
  }

  @Test
  fun `the trails stay quiet below 40 km per hour, and keep an even density on every screen`() {
    assertEquals(0, WindField.flowClass(39.9 / 3.6))
    assertEquals(1, WindField.flowClass(40 / 3.6))
    assertEquals(2, WindField.flowClass(60 / 3.6))
    assertEquals(0.2, WindField.flowAlpha(0.0), 1e-9)
    assertEquals(0.66, WindField.flowAlpha(30.0), 1e-9)
    assertTrue(WindField.flowAlpha(5.0) < WindField.flowAlpha(10.0))
    assertEquals(346, WindField.flowCount(375.0, 600.0))
    assertEquals(1418, WindField.flowCount(1280.0, 720.0))
    assertEquals(150, WindField.flowCount(100.0, 100.0))
    assertEquals(3000, WindField.flowCount(4000.0, 3000.0))
  }

  @Test
  fun `the forecast of now is the whole hour nearest to it, as the API's`() {
    // 22/11/2026 00:29:59 and 00:30 UTC.
    assertEquals(1_795_305_600L, WindField.nearestHour(1_795_305_600_000L + 29 * 60_000 + 59_000))
    assertEquals(1_795_309_200L, WindField.nearestHour(1_795_305_600_000L + 30 * 60_000))
  }
}
