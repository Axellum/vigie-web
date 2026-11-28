package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.FieldLevelId
import fr.auxfilsdesidees.vigie.data.GeoBox
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import kotlin.coroutines.EmptyCoroutineContext
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The forecast wind's layer of the sea map: off at first, the list of the hour and only the images the view needs, again when old. */
@OptIn(ExperimentalCoroutinesApi::class)
class WindFieldModelTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String): String? = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  // 22/11/2026 00:10 UTC: the hour of the fixture is the nearest.
  private var now = 1_795_305_600_000L + 10 * 60_000
  private val asked = mutableListOf<String>()
  private var listFails = false
  private var imageStatus = 200

  private val reader =
    SeaMapReader(
      "https://api.test",
      "https://site.test",
      fetchBytes = { url ->
        asked += url
        if (imageStatus != 200) throw ApiException(imageStatus)
        ByteArray(0)
      },
    ) { url ->
      asked += url
      if (listFails) throw java.io.IOException("offline")
      require(url == "https://site.test/data/wind-field.json") { "unexpected $url" }
      fixture("wind_field.json")
    }

  /** Every image read as a calm wind, the size announced. */
  private val decode: (ByteArray, fr.auxfilsdesidees.vigie.data.FieldLevel) -> IntArray = { _, level -> IntArray(level.width * level.height) { 0xff8080ff.toInt() } }

  private fun model(scope: kotlinx.coroutines.CoroutineScope, kept: KeyValue? = Memory()) = WindFieldModel(scope, reader, decode, { now }, kept, EmptyCoroutineContext)

  private val image = { id: String -> "https://site.test/data/wind-field/$id/2026112200-2026112118.png" }
  private val brittany = GeoBox(-5.5, 46.5, -1.0, 49.0)

  @Test
  fun `off at first, nothing asked until it is turned on, the choice kept`() = runTest {
    val kept = Memory()
    val m = model(backgroundScope, kept)
    assertFalse(m.state.value.on)
    m.move(brittany, 8.0)
    runCurrent()
    assertEquals(emptyList<String>(), asked)
    assertNull(m.state.value.shown)
    m.show(true)
    assertEquals("on", kept.map[WindFieldModel.KEY])
    assertTrue(model(backgroundScope, kept).state.value.on)
  }

  @Test
  fun `the list of the hour, then only the images the view needs, the finest drawn first`() = runTest {
    val m = model(backgroundScope)
    m.move(GeoBox(-30.0, -20.0, 30.0, 20.0), 2.0)
    m.show(true)
    runCurrent()
    // Far out: the world's only.
    assertEquals(listOf("https://site.test/data/wind-field.json", image("world")), asked)
    assertEquals(listOf(FieldLevelId.World), m.state.value.shown!!.map { it.id })
    assertEquals(1_795_305_600L, m.state.value.valid)
    // Close to Brittany: Europe and France, the world's not again.
    asked.clear()
    m.move(brittany, 8.0)
    runCurrent()
    assertEquals(listOf(image("europe"), image("france")), asked)
    assertEquals(listOf(FieldLevelId.France, FieldLevelId.Europe, FieldLevelId.World), m.state.value.shown!!.map { it.id })
    // Moving around: nothing asked again.
    asked.clear()
    m.move(GeoBox(-4.0, 47.0, -2.0, 48.0), 9.0)
    m.sync()
    runCurrent()
    assertEquals(emptyList<String>(), asked)
    // Turned off: nothing drawn.
    m.show(false)
    assertNull(m.state.value.shown)
  }

  @Test
  fun `the list is asked again after 10 minutes, or a minute after the hour turned`() = runTest {
    val m = model(backgroundScope)
    m.move(brittany, 4.0)
    m.show(true)
    runCurrent()
    asked.clear()
    now += 9 * 60_000
    m.sync()
    runCurrent()
    assertEquals(emptyList<String>(), asked)
    now += 2 * 60_000
    m.sync()
    runCurrent()
    assertEquals(listOf("https://site.test/data/wind-field.json"), asked)
    // 00:30:30, 9 min 30 s after: the hour nearest is 1 h, not the one listed (0 h): asked again, then each minute until it comes.
    asked.clear()
    now += 9 * 60_000 + 30_000
    m.sync()
    runCurrent()
    assertEquals(listOf("https://site.test/data/wind-field.json"), asked)
    asked.clear()
    now += 30_000
    m.sync()
    runCurrent()
    assertEquals(emptyList<String>(), asked)
    now += 31_000
    m.sync()
    runCurrent()
    assertEquals(listOf("https://site.test/data/wind-field.json"), asked)
  }

  @Test
  fun `a list that fails is tried again after a minute, an earlier one staying drawn`() = runTest {
    val m = model(backgroundScope)
    m.move(brittany, 4.0)
    listFails = true
    m.show(true)
    runCurrent()
    assertEquals(WindFieldModel.Status.Failed, m.state.value.status)
    asked.clear()
    now += 30_000
    m.sync()
    runCurrent()
    assertEquals(emptyList<String>(), asked)
    listFails = false
    now += 31_000
    m.sync()
    runCurrent()
    assertEquals(WindFieldModel.Status.Ok, m.state.value.status)
    assertEquals(listOf(FieldLevelId.Europe, FieldLevelId.World), m.state.value.shown!!.map { it.id })
    // Failing again: the grids held stay drawn.
    listFails = true
    now += 11 * 60_000
    m.sync()
    runCurrent()
    assertEquals(WindFieldModel.Status.Ok, m.state.value.status)
    assertEquals(2, m.state.value.shown!!.size)
  }

  @Test
  fun `an image no longer listed has the list asked again, one that fails is tried again after a minute`() = runTest {
    val m = model(backgroundScope)
    m.move(brittany, 2.0)
    imageStatus = 404
    m.show(true)
    runCurrent()
    assertNull(m.state.value.shown)
    // The 404 sets the list's age back: the next look asks the list, the image a minute after it failed.
    asked.clear()
    imageStatus = 500
    m.sync()
    runCurrent()
    assertEquals(listOf("https://site.test/data/wind-field.json"), asked)
    asked.clear()
    m.sync()
    runCurrent()
    assertEquals(emptyList<String>(), asked)
    imageStatus = 200
    now += 61_000
    m.sync()
    runCurrent()
    assertEquals(listOf(image("world")), asked)
    assertEquals(listOf(FieldLevelId.World), m.state.value.shown!!.map { it.id })
  }
}
