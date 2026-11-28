package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import fr.auxfilsdesidees.vigie.data.TownWeather
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The towns' layer of the sea map: on at first, the towns of a view asked in one request, again only when old. */
@OptIn(ExperimentalCoroutinesApi::class)
class TownWeatherModelTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String): String? = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  // 28/11/2026, 16 h 10 in France: the time of the fixture.
  private var now = 1795878600_000L
  private val asked = mutableListOf<String>()
  private var fails = false
  private var answer: String? = null

  private val reader =
    SeaMapReader("https://api.test", "https://site.test") { url ->
      asked += url
      if (fails) throw java.io.IOException("offline")
      require(url.contains("/data/towns.json")) { "unexpected $url" }
      answer ?: fixture("towns_france.json")
    }

  private val carnac = TownInView("Carnac@47.590,-3.060", "Carnac", 47.59, -3.06, 1_010_150.0)
  private val chamonix = TownInView("Chamonix-Mont-Blanc@45.920,6.870", "Chamonix-Mont-Blanc", 45.92, 6.87, 1_010_100.0)
  private val paris = TownInView("Paris@48.857,2.352", "Paris", 48.857, 2.352, 10.0)
  private val all = "https://site.test/data/towns.json?at=48.85,2.35&at=45.9,6.85&at=47.6,-3.05"

  @Test
  fun `on at first, the towns of the view asked in one request, drawn the most important first`() = runTest {
    val kept = Memory()
    val m = TownWeatherModel(backgroundScope, reader, { now }, kept)
    assertTrue(m.state.value.on)
    m.move(8.0)
    m.towns(listOf(paris, chamonix, carnac))
    runCurrent()
    assertEquals(listOf(all), asked)
    val pills = m.state.value.pills!!
    assertEquals(listOf("Paris", "Chamonix-Mont-Blanc", "Carnac"), pills.map { it.town.name })
    assertEquals(13.2, pills.last().reading.temp, 0.0)
    assertEquals(47.2, pills.last().reading.wind)

    // The same towns a minute later, or after a move: nothing new.
    now += 60_000
    m.towns(listOf(carnac, paris))
    m.sync()
    runCurrent()
    assertEquals(1, asked.size)
    // A quarter of an hour after the read: asked again.
    now += TownWeather.REFRESH_MS
    m.sync()
    runCurrent()
    assertEquals(2, asked.size)
    assertEquals("https://site.test/data/towns.json?at=47.6,-3.05&at=48.85,2.35", asked.last())

    // Off: no pill, the choice kept for the next opening.
    m.show(false)
    assertNull(m.state.value.pills)
    assertEquals("off", kept.map[TownWeatherModel.KEY])
    assertFalse(TownWeatherModel(backgroundScope, reader, { now }, kept).state.value.on)
  }

  @Test
  fun `far out, no town and nothing asked`() = runTest {
    val m = TownWeatherModel(backgroundScope, reader, { now })
    m.move(2.0)
    m.towns(listOf(paris))
    runCurrent()
    assertTrue(asked.isEmpty())
    assertEquals(emptyList<TownPill>(), m.state.value.pills)
  }

  @Test
  fun `the moment chosen in the bar`() = runTest {
    val m = TownWeatherModel(backgroundScope, reader, { now })
    m.move(8.0)
    m.towns(listOf(carnac))
    runCurrent()
    m.choose(1)
    // In 3 hours: drizzle, 4.7 mm.
    val r = m.state.value.pills!!.single().reading
    assertEquals("bruine", r.kind)
    assertTrue(TownWeather.rainShown(r))
    m.choose(42)
    assertEquals(7, m.state.value.moment)
  }

  @Test
  fun `a read that fails is said, and tried again a minute later, a cell left out too`() = runTest {
    fails = true
    val m = TownWeatherModel(backgroundScope, reader, { now })
    m.move(8.0)
    m.towns(listOf(carnac))
    runCurrent()
    assertTrue(m.state.value.failed)
    assertEquals(emptyList<TownPill>(), m.state.value.pills)
    m.sync()
    runCurrent()
    assertEquals(1, asked.size)
    fails = false
    now += TownWeather.RETRY_MS + 1
    m.sync()
    runCurrent()
    assertFalse(m.state.value.failed)
    assertEquals(1, m.state.value.pills!!.size)

    // The site's share of the day used up: Carnac's cell is not read; it stays without a pill, asked again a minute later only.
    answer = """{"towns":[],"attribution":null,"paused":true}"""
    val n = TownWeatherModel(backgroundScope, reader, { now })
    n.move(8.0)
    n.towns(listOf(carnac))
    runCurrent()
    assertTrue(n.state.value.paused)
    val before = asked.size
    n.sync()
    runCurrent()
    assertEquals(before, asked.size)
  }
}
