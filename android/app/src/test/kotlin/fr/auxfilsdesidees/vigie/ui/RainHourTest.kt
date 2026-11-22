package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.VigieParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The rain of the hour, read as the site's widget reads it (`rainView` of vigie-web `src/lib/widget/model.ts`): a step
 * wetter than 0,05 mm is rain, the first wet step says now or in how long, a stale or old reading says nothing.
 * The `rain_nowcast` block has the shape `/v1/point?compact=false` served on 22/11/2026 (Lorient, Sydney).
 */
class RainHourTest {
  private val nb = ' '
  private val server = 1795373156L

  private fun point(steps: String?, provider: String = "Météo-France (AROME, ARPEGE)"): fr.auxfilsdesidees.vigie.data.PointNow {
    val nowcast =
      if (steps == null) ""
      else ", \"rain_nowcast\": {\"interval_minutes\": 15, \"mm_per_step\": $steps, \"rate_5m_mm_h\": null, \"rain_expected_60m\": false, \"max_mm_h\": 0.0}"
    return VigieParser.point(
      "{\"server_utc\": $server, \"utc_offset_s\": 3600, \"weather_provider\": \"$provider\", \"current\": {\"temp_c\": 9.0}, \"daily\": []$nowcast}"
    )
  }

  @Test
  fun `a dry hour says so, as the widget`() {
    val v = RainHour.view(point("[0.0, 0.0, 0.05, 0.0]"), server + 60)
    assertEquals(RainHour.Status.None, v.status)
    assertEquals("Pas de pluie dans l’heure", RainHour.title(v))
    assertEquals("prévision du modèle", RainHour.detail(v))
  }

  @Test
  fun `rain to come says in how long, for how long and how hard`() {
    val v = RainHour.view(point("[0.0, 0.3, 0.6, 0.0]"), server)
    assertEquals(RainHour.Status.Soon, v.status)
    assertEquals(15, v.inMin)
    assertEquals(30, v.forMin)
    assertEquals(2.4, v.maxMmH!!, 1e-9)
    assertEquals("Pluie dans 15${nb}min", RainHour.title(v))
    assertEquals("environ 30${nb}min · jusqu’à 2,4${nb}mm/h", RainHour.detail(v))
  }

  @Test
  fun `rain now counts its first wet run only`() {
    val v = RainHour.view(point("[0.1, 0.0, 0.5, 0.5]"), server)
    assertEquals(RainHour.Status.Now, v.status)
    assertEquals(0, v.inMin)
    assertEquals(15, v.forMin)
    assertEquals("Pluie en cours", RainHour.title(v))
    // the strongest wet step of the hour, not of the first run only (as the widget)
    assertEquals("environ 15${nb}min · jusqu’à 2${nb}mm/h", RainHour.detail(v))
  }

  @Test
  fun `a stale, old or missing reading is never said dry`() {
    assertEquals(RainHour.Status.Unknown, RainHour.view(point("[0.0, 0.0, 0.0, 0.0]", "Météo-France (stale cache)"), server).status)
    assertEquals(RainHour.Status.Unknown, RainHour.view(point("[0.0, 0.0, 0.0, 0.0]"), server + 31 * 60).status)
    assertEquals(RainHour.Status.None, RainHour.view(point("[0.0, 0.0, 0.0, 0.0]"), server + 29 * 60).status)
    val missing = RainHour.view(point(null), server)
    assertEquals(RainHour.Status.Unknown, missing.status)
    assertEquals("Pluie de l’heure non lue", RainHour.title(missing))
    assertNull(RainHour.detail(missing))
    // one step without a number: the hour is unread, not dry
    assertEquals(RainHour.Status.Unknown, RainHour.view(point("[0.0, null, 0.0, 0.0]"), server).status)
  }
}
