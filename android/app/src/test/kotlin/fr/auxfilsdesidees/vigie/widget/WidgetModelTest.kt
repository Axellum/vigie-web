package fr.auxfilsdesidees.vigie.widget

import fr.auxfilsdesidees.vigie.data.Day
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.RainNowcast
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.Vigilance
import fr.auxfilsdesidees.vigie.data.Vigilances
import fr.auxfilsdesidees.vigie.ui.RainHour
import fr.auxfilsdesidees.vigie.ui.Sky
import fr.auxfilsdesidees.vigie.ui.Vigil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The place widget says what the site's widget says (vigie-web `src/lib/widget/model.ts`, `PlaceView.svelte`) from the
 * last read kept by the app. The read is of Sunday 22/11/2026 at 19 h 45 at the place (UTC+1).
 */
class WidgetModelTest {
  private val nb = ' '
  private val server = 1_795_373_156L
  private val lorient = Place("Lorient", 47.748, -3.370)

  private fun point(
    rain: List<Double>? = listOf(0.0, 0.0, 0.0, 0.0),
    days: List<Day> = emptyList(),
    hours: List<HourWeather> = emptyList(),
  ) =
    PointNow(
      serverUtc = server,
      utcOffsetS = 3600,
      provider = "Météo-France (AROME, ARPEGE)",
      alertLevel = null,
      tempC = 15.2,
      feelsLikeC = 10.4,
      windKmh = 36.6,
      gustKmh = 62.8,
      windDeg = 270.0,
      rain1hMm = 0.0,
      weatherCode = 53,
      days = days,
      hours = hours,
      rainSoon = rain?.let { RainNowcast(15, it) },
    )

  private fun snapshot(p: PointNow = point(), vigilances: Vigilances? = Vigilances(true, false, emptyList(), null)) =
    Snapshot(lorient, p, emptyList(), false, vigilances = vigilances)

  @Test
  fun `the header and the wind say what the site's widget says`() {
    val v = WidgetModel.view("Lorient", snapshot(), server + 60)
    assertEquals("15°", v.temp)
    assertEquals("Bruine · ressenti 10°", v.condition)
    assertEquals(Sky.Rain, v.sky)
    val wind = v.wind!!
    assertEquals(37, wind.kmh)
    assertEquals("O", wind.dir)
    assertEquals(63, wind.gust)
    assertEquals("prévision du modèle", wind.note)
    assertNull(v.age)
  }

  @Test
  fun `a dry hour has its words and its low bars`() {
    val rain = WidgetModel.view("Lorient", snapshot(), server + 60).rain
    assertEquals(RainHour.Status.None, rain.status)
    assertEquals("Pas de pluie dans l’heure", rain.title)
    assertEquals("Pas de pluie", rain.short)
    assertEquals("prévision du modèle", rain.detail)
    assertEquals(List(4) { WidgetModel.Bar(8, WidgetModel.Tone.Dry) }, rain.bars)
  }

  @Test
  fun `a wet step rises with the square root of its rate, in its tone`() {
    // 0, 1,2, 2,4 and 4,8 mm/h: the strongest fills the bar, the others by the square root of their share.
    val bars = WidgetModel.bars(point(listOf(0.0, 0.3, 0.6, 1.2)))
    assertEquals(
      listOf(
        WidgetModel.Bar(8, WidgetModel.Tone.Dry),
        WidgetModel.Bar(50, WidgetModel.Tone.Rain),
        WidgetModel.Bar(71, WidgetModel.Tone.Rain),
        WidgetModel.Bar(100, WidgetModel.Tone.Heavy),
      ),
      bars,
    )
    // A light rain next to a downpour stays visible (22 % at least); the scale never goes under 3 mm/h.
    assertEquals(WidgetModel.Bar(22, WidgetModel.Tone.Light), WidgetModel.bars(point(listOf(0.06, 10.0)))[0])
    assertEquals(WidgetModel.Bar(37, WidgetModel.Tone.Light), WidgetModel.bars(point(listOf(0.1)))[0])
  }

  @Test
  fun `more steps than a home screen can draw share their bars, the wettest kept`() {
    val dry = WidgetModel.Bar(8, WidgetModel.Tone.Dry)
    val four = List(4) { dry }
    assertEquals(four, WidgetModel.fewer(four))
    val twelve = List(11) { dry } + WidgetModel.Bar(60, WidgetModel.Tone.Rain)
    val fewer = WidgetModel.fewer(twelve)
    assertEquals(6, fewer.size)
    assertEquals(WidgetModel.Bar(60, WidgetModel.Tone.Rain), fewer.last())
    assertEquals(dry, fewer.first())
  }

  @Test
  fun `an old read says its age and no longer the rain of the hour`() {
    val v = WidgetModel.view("Lorient", snapshot(point(listOf(0.0, 0.3, 0.6, 0.0))), server + 2 * 3600 + 60)
    assertEquals("Données de 19${nb}h${nb}45, il y a 2${nb}h", v.age)
    assertEquals("Données de 19${nb}h${nb}45", v.ageShort)
    assertEquals(RainHour.Status.Unknown, v.rain.status)
    assertEquals("Pluie de l’heure non lue", v.rain.title)
    assertEquals("Pluie non lue", v.rain.short)
    assertNull(v.rain.detail)
    assertTrue(v.rain.bars.isEmpty())
    // Still fresh a little under half an hour later.
    assertNull(WidgetModel.view("Lorient", snapshot(), server + 29 * 60).age)
  }

  @Test
  fun `the days start at the place's today, five at most, today first`() {
    val week = (21..28).map { Day("2026-11-$it", if (it == 22) 61 else 3, 8.0 + it % 3, 14.0 + it % 4, 0.0) }
    val days = WidgetModel.view("Lorient", snapshot(point(days = week)), server + 60).days
    assertEquals(listOf("Dim", "Lun", "Mar", "Mer", "Jeu"), days.map { it.label })
    assertEquals(listOf(true, false, false, false, false), days.map { it.today })
    assertEquals(Sky.Rain, days[0].sky)
    assertEquals(Sky.Cloud, days[1].sky)
    assertEquals(16.0, days[0].maxC!!, 1e-9)
    assertEquals(9.0, days[0].minC!!, 1e-9)
  }

  @Test
  fun `the official warnings read as the site's widget reads them`() {
    val end = 1_795_410_000L // Monday 23/11 at 6 h at the place
    val wind = Vigilance("w", "meteofrance", "Météo-France", "ORANGE", "wind", null, "Morbihan", false, null, server - 3600, end, null, null, null, null, null, null)
    val rain = Vigilance("r", "meteofrance", "Météo-France", "YELLOW", "rain", null, "Morbihan", false, null, server - 3600, end, null, null, null, null, null, null)
    val w = WidgetModel.view("Lorient", snapshot(vigilances = Vigilances(true, false, listOf(rain, wind), null)), server + 60).warnings
    assertEquals(Vigil.State.Warnings, w.state)
    assertEquals("ORANGE", w.level)
    assertEquals("Vigilance orange", w.title)
    assertEquals("jusqu'à demain 6${nb}h", w.until)
    assertEquals("Vent", w.detail)
    assertEquals(1, w.more)

    assertEquals("Aucune vigilance en cours", WidgetModel.view("Lorient", snapshot(), server).warnings.title)
    assertEquals("Vigilances non lues", WidgetModel.view("Lorient", snapshot(vigilances = null), server).warnings.title)
    assertEquals(
      "Pas de vigilance officielle lue ici",
      WidgetModel.view("Lorient", snapshot(vigilances = Vigilances(false, false, emptyList(), null)), server).warnings.title,
    )
  }

  @Test
  fun `the wind's eight points and the days of the calendar`() {
    assertEquals(listOf("N", "NE", "SO", "NO", "N", ""), listOf(0.0, 50.0, 225.0, 315.0, 337.6, null).map(WidgetModel::compass))
    assertEquals(20_779L, WidgetModel.dateKey("2026-11-22"))
    assertEquals(0L, WidgetModel.dateKey("1970-01-01"))
    assertEquals(11_016L, WidgetModel.dateKey("2000-02-29"))
    assertNull(WidgetModel.dateKey("22/11/2026"))
    assertEquals("Dim", WidgetModel.dayLabel(20_779L))
  }

  @Test
  fun `the widget list's example is made up, fresh, and starts at the phone's today`() {
    val v = WidgetModel.sample(server, 3600)
    assertEquals("Mon lieu", v.name)
    assertEquals("14°", v.temp)
    assertEquals("Éclaircies · ressenti 12°", v.condition)
    assertEquals(Sky.FewClouds, v.sky)
    assertEquals(RainHour.Status.None, v.rain.status)
    assertEquals(Vigil.State.None, v.warnings.state)
    assertEquals(listOf("Dim", "Lun", "Mar", "Mer", "Jeu"), v.days.map { it.label })
    assertTrue(v.days.first().today)
    assertNull(v.age)
  }

  @Test
  fun `night or day is the hour under way's`() {
    val hour = 1_795_370_400L // 19 h at the place, the hour under way
    val hours = listOf(HourWeather(hour - 3600, null, null, null, null, null, 0, true), HourWeather(hour, null, null, null, null, null, 0, false))
    assertEquals(false, WidgetModel.dayAt(point(hours = hours), server))
    val v = WidgetModel.view("Lorient", snapshot(point(hours = hours).copy(weatherCode = 0)), server)
    assertEquals(Sky.Moon, v.sky)
    assertEquals("Nuit claire · ressenti 10°", v.condition)
    assertFalse(WidgetModel.dayAt(point(hours = hours), hour + 10)!!)
  }
}
