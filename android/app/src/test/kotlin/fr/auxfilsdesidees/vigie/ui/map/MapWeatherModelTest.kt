package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.GeoBox
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.MapWeather
import fr.auxfilsdesidees.vigie.data.RadarArea
import fr.auxfilsdesidees.vigie.data.RadarFrame
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import fr.auxfilsdesidees.vigie.data.WindUnit
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The weather layers of the sea map: off at first, kept on the phone, asked again only when old or for another view. */
@OptIn(ExperimentalCoroutinesApi::class)
class MapWeatherModelTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String): String? = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  private val brittany = GeoBox(-4.2, 47.1, -2.3, 48.4)
  private var now = 1_000_000L
  private val asked = mutableListOf<String>()
  private var fails = false
  /** The site's nowcast PIAF; null answers as the site without one (a 404). */
  private var nowcast: String? = null
  private val radarAsked
    get() = asked.filter { "/data/radar.json" in it }

  private val reader =
    SeaMapReader("https://api.test", "https://site.test") { url ->
      asked += url
      if (fails) throw java.io.IOException("offline")
      when {
        url.contains("/data/radar.json") -> fixture("radar_france.json")
        url.endsWith("/data/radar/france/nowcast") -> nowcast ?: throw java.io.IOException("404")
        url.contains("/data/wind.json") -> fixture("wind_bretagne.json")
        else -> error("unexpected $url")
      }
    }

  @Test
  fun `both layers are off at first and nothing is asked`() = runTest {
    val m = MapWeatherModel(backgroundScope, reader, { now })
    m.move(brittany, 8.0)
    runCurrent()
    assertFalse(m.state.value.rain)
    assertFalse(m.state.value.wind)
    assertTrue(asked.isEmpty())
  }

  @Test
  fun `the radar of the area in view, asked again after five minutes or for another area`() = runTest {
    val kept = Memory()
    val m = MapWeatherModel(backgroundScope, reader, { now }, kept)
    m.move(brittany, 8.0)
    m.showRain(true)
    runCurrent()
    // On France, the nowcast is asked with the radar; the site has none here: the radar is shown without it.
    assertEquals(setOf("https://site.test/data/radar.json?area=france", "https://site.test/data/radar/france/nowcast"), asked.toSet())
    assertEquals("on", kept.map[MapWeatherModel.RAIN_KEY])
    val s = m.state.value
    assertEquals(MapWeatherModel.Status.Ok, s.radarStatus)
    assertEquals(RadarArea.France, s.area)
    assertFalse(s.radar!!.hasNowcast)
    assertEquals(7, s.index)
    assertEquals(1795876500L, s.epoch)

    // A small move, a minute later: nothing new.
    now += 60_000
    m.move(GeoBox(-4.0, 47.2, -2.1, 48.5), 8.2)
    m.sync()
    runCurrent()
    assertEquals(1, radarAsked.size)

    // Five minutes after the read: asked again.
    now += MapWeather.RADAR_REFRESH_MS
    m.sync()
    runCurrent()
    assertEquals(2, radarAsked.size)

    // Guadeloupe: the radar of the Antilles, without a nowcast.
    m.move(GeoBox(-62.0, 15.8, -61.0, 16.6), 9.0)
    runCurrent()
    assertEquals("https://site.test/data/radar.json?area=antilles", asked.last())
    assertEquals(2, asked.count { it.endsWith("/nowcast") })

    // Far out: no radar, nothing asked.
    m.move(GeoBox(-40.0, 30.0, -30.0, 40.0), 5.0)
    runCurrent()
    assertNull(m.state.value.area)
    assertNull(m.state.value.radar)
    assertEquals(5, asked.size)

    // The choice is read back at the next opening.
    assertTrue(MapWeatherModel(backgroundScope, reader, { now }, kept).state.value.rain)
  }

  @Test
  fun `a radar that cannot be read says so, and is asked again a minute later`() = runTest {
    fails = true
    val m = MapWeatherModel(backgroundScope, reader, { now })
    m.move(brittany, 8.0)
    m.showRain(true)
    runCurrent()
    assertEquals(MapWeatherModel.Status.Failed, m.state.value.radarStatus)
    assertNull(m.state.value.radar)
    m.sync()
    runCurrent()
    assertEquals(1, radarAsked.size)
    fails = false
    now += MapWeather.RETRY_MS + 1
    m.sync()
    runCurrent()
    assertEquals(MapWeatherModel.Status.Ok, m.state.value.radarStatus)
    assertEquals(8, m.state.value.radar?.frames?.size)
  }

  @Test
  fun `play runs from the oldest image to the newest, which stays longer, and pause stops it`() = runTest {
    val m = MapWeatherModel(backgroundScope, reader, { now })
    m.move(brittany, 8.0)
    m.showRain(true)
    runCurrent()
    m.togglePlay()
    runCurrent()
    val s = m.state.value
    assertTrue(s.playing)
    assertTrue(s.preload)
    assertEquals(0, s.index)
    advanceTimeBy(MapWeather.STEP_MS + 1)
    assertEquals(1, m.state.value.index)
    advanceTimeBy(6 * MapWeather.STEP_MS)
    assertEquals(7, m.state.value.index)
    // The newest stays 1,5 s, then the animation starts again from the oldest.
    advanceTimeBy(MapWeather.STEP_MS + 1)
    assertEquals(7, m.state.value.index)
    advanceTimeBy(MapWeather.LAST_STEP_MS - MapWeather.STEP_MS)
    assertEquals(0, m.state.value.index)
    m.togglePlay()
    advanceTimeBy(5 * MapWeather.STEP_MS)
    assertFalse(m.state.value.playing)
    assertEquals(0, m.state.value.index)

    // The slider shows an image, and pauses.
    m.choose(3)
    assertEquals(3, m.state.value.index)
    m.choose(99)
    assertEquals(7, m.state.value.index)
  }

  @Test
  fun `with the nowcast, the slider goes on into the forecast, from the newest image measured, and play stops a while on it`() = runTest {
    nowcast = fixture("radar_france_nowcast.json")
    val m = MapWeatherModel(backgroundScope, reader, { now })
    m.move(brittany, 8.0)
    m.showRain(true)
    runCurrent()
    val s = m.state.value
    val r = s.radar!!
    assertTrue(r.hasNowcast)
    assertEquals(25, r.timeline.size)
    // The newest image measured is shown first, not the forecast.
    assertEquals(7, s.index)
    assertEquals(RadarFrame(1795876500L), s.frame)

    m.togglePlay()
    runCurrent()
    assertEquals(0, m.state.value.index)
    advanceTimeBy(MapWeather.STEP_MS + 1)
    assertEquals(1, m.state.value.index)
    advanceTimeBy(6 * MapWeather.STEP_MS)
    assertEquals(7, m.state.value.index)
    // The newest measured stays 1,5 s before the forecast.
    advanceTimeBy(MapWeather.STEP_MS + 1)
    assertEquals(7, m.state.value.index)
    advanceTimeBy(MapWeather.LAST_STEP_MS - MapWeather.STEP_MS)
    assertEquals(8, m.state.value.index)
    assertEquals(10, m.state.value.frame?.leadMinutes)
    advanceTimeBy(16 * MapWeather.STEP_MS)
    assertEquals(24, m.state.value.index)
    // The last forecast stays 1,5 s too, then the animation starts again from the oldest.
    advanceTimeBy(MapWeather.STEP_MS + 1)
    assertEquals(24, m.state.value.index)
    advanceTimeBy(MapWeather.LAST_STEP_MS - MapWeather.STEP_MS)
    assertEquals(0, m.state.value.index)

    // « Prévision PIAF » goes to the first forecast and pauses; « Observé » back to the newest measured.
    m.choose(r.observedCount)
    assertFalse(m.state.value.playing)
    assertEquals(RadarFrame(1795876800L, 10), m.state.value.frame)
    // Read again five minutes later: the forecast chosen is still there, still shown.
    now += MapWeather.RADAR_REFRESH_MS + 1
    m.sync()
    runCurrent()
    assertEquals(8, m.state.value.index)
    m.choose(r.observedCount - 1)
    assertEquals(RadarFrame(1795876500L), m.state.value.frame)
    m.choose(99)
    assertEquals(24, m.state.value.index)
  }

  @Test
  fun `the wind of a box around the view, asked again when the map leaves it or after six minutes`() = runTest {
    val kept = Memory()
    val m = MapWeatherModel(backgroundScope, reader, { now }, kept)
    m.move(brittany, 8.0)
    m.showWind(true)
    runCurrent()
    assertEquals(listOf("https://site.test/data/wind.json?bbox=-6,46,-1,50"), asked)
    assertEquals("on", kept.map[MapWeatherModel.WIND_KEY])
    assertEquals(4, m.state.value.windMap?.points?.size)

    // Inside the box read: nothing new.
    m.move(GeoBox(-5.0, 47.0, -2.0, 48.0), 8.0)
    runCurrent()
    assertEquals(1, asked.size)
    // Out of it: the new view's box.
    m.move(GeoBox(1.0, 43.0, 3.0, 44.0), 8.0)
    runCurrent()
    assertEquals("https://site.test/data/wind.json?bbox=0,42,4,45", asked.last())
    // Six minutes later: asked again.
    now += MapWeather.WIND_REFRESH_MS + 1
    m.sync()
    runCurrent()
    assertEquals(3, asked.size)

    // Off: the badges go, the read is kept for the next time.
    m.showWind(false)
    assertNull(m.state.value.windMap)
    assertEquals("off", kept.map[MapWeatherModel.WIND_KEY])
  }

  @Test
  fun `the wind's unit is km per hour at first, and the knots chosen are kept on the phone`() = runTest {
    val kept = Memory()
    val m = MapWeatherModel(backgroundScope, reader, { now }, kept)
    assertEquals(WindUnit.Kmh, m.state.value.unit)
    m.setUnit(WindUnit.Kn)
    assertEquals(WindUnit.Kn, m.state.value.unit)
    assertEquals("kn", kept.map[MapWeatherModel.UNIT_KEY])
    // Nothing is asked for a unit: the badges are only drawn again.
    assertTrue(asked.isEmpty())
    assertEquals(WindUnit.Kn, MapWeatherModel(backgroundScope, reader, { now }, kept).state.value.unit)
    m.setUnit(WindUnit.Kmh)
    assertEquals("kmh", kept.map[MapWeatherModel.UNIT_KEY])
  }
}
