package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.Avalanche
import fr.auxfilsdesidees.vigie.data.Day
import fr.auxfilsdesidees.vigie.data.Drought
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Pollen
import fr.auxfilsdesidees.vigie.data.PollenDay
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.PressureReading
import fr.auxfilsdesidees.vigie.data.RainNowcast
import fr.auxfilsdesidees.vigie.data.SeasonData
import fr.auxfilsdesidees.vigie.data.ShortStep
import fr.auxfilsdesidees.vigie.data.ShortTerm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The home page says what the Home Assistant card says. The read is of Friday 27/11/2026 at 12 h 20 at the place (UTC+1,
 * 11 h 20 UTC); the hour under way starts at 11 h UTC. The place is Bordeaux, for the sun.
 */
class HomeBoardTest {
  private val nb = ' '
  private val midnight = 1_795_737_600L // 27/11/2026 at 0 h UTC
  private val now = midnight + 11 * 3600 + 20 * 60
  private val hour = midnight + 11 * 3600

  private fun point(
    hours: List<HourWeather> = emptyList(),
    days: List<Day> = emptyList(),
    rain: RainNowcast? = null,
    shortTerm: ShortTerm? = null,
    season: SeasonData = SeasonData(),
    pressure: List<PressureReading> = emptyList(),
    code: Int? = 3,
    serverUtc: Long = now,
    provider: String? = "Météo-France (AROME, ARPEGE)",
  ) =
    PointNow(
      serverUtc,
      3600,
      provider,
      null,
      12.0,
      10.0,
      20.0,
      40.0,
      270.0,
      0.0,
      code,
      days,
      hours,
      rain,
      lat = 44.84,
      lon = -0.58,
      pressureHistory = pressure,
      shortTerm = shortTerm,
      season = season,
    )

  /** 30 hours from the hour before the one under way; [rain] gives the rain of an hour (index 0 = the hour under way). */
  private fun hours(rain: (Int) -> Double = { 0.0 }, isDay: (Int) -> Boolean? = { it in 0..5 }, code: (Int) -> Int = { 3 }) =
    (-1 until 29).map { i ->
      HourWeather(hour + i * 3600L, 12.0 - i * 0.2, rain(i), 20.0 + i, 30.0 + i, 270.0, code(i), isDay(i), rainProbabilityPct = 10.0 * (i % 5), cloudCoverPct = 50.0)
    }

  // ------------------------------------------------------------------------------------------------------- numbers, clock

  @Test
  fun `numbers are written as the card writes them`() {
    assertEquals("12,5", HomeBoard.fmt(12.46, 1))
    assertEquals("3", HomeBoard.fmt(3.0, 1))
    assertEquals("13", HomeBoard.fmt(12.6))
    assertEquals("–", HomeBoard.fmt(null))
    assertEquals("15${nb}h${nb}42", HomeBoard.hm(midnight + 14 * 3600 + 42 * 60, 3600))
    assertEquals("15${nb}h", HomeBoard.hm(midnight + 14 * 3600, 3600))
  }

  @Test
  fun `days are counted and named without java time`() {
    assertEquals(0L, HomeBoard.dayOf("1970-01-01"))
    assertEquals(midnight / 86_400, HomeBoard.dayOf("2026-11-27"))
    assertNull(HomeBoard.dayOf("27/11"))
    assertEquals("Ven", HomeBoard.dayName(midnight / 86_400))
    assertEquals(27, HomeBoard.dayOfMonth(midnight / 86_400))
    assertEquals(1, HomeBoard.dayOfMonth(HomeBoard.dayOf("2026-12-01")!!))
    assertEquals("demain 12${nb}h${nb}20", HomeBoard.dayWord(now + 86_400, now, 3600, true))
    assertEquals("lun", HomeBoard.dayWord(now + 3 * 86_400, now, 3600, false))
    assertEquals("", HomeBoard.dayWord(now + 3600, now, 3600, false))
  }

  // ------------------------------------------------------------------------------------------------------------- now

  @Test
  fun `a clear sky at night is a moon and « Nuit claire »`() {
    val night = HomeBoard.now(point(hours(isDay = { false }), code = 0), now)
    assertEquals("lune", night.kind)
    assertEquals("Nuit claire", night.label)
    val day = HomeBoard.now(point(hours(isDay = { true }), code = 0), now)
    assertEquals("soleil", day.kind)
    assertEquals("Ciel clair", day.label)
  }

  @Test
  fun `the gust peak comes from AROME-PI when it is there, else the next twelve hours`() {
    val st = ShortTerm(15, listOf(ShortStep(hour + 900, 50.0, "none"), ShortStep(hour + 1800, 70.0, "none"), ShortStep(hour + 2700, 60.0, "none")))
    assertEquals(70.0 to hour + 1800, HomeBoard.gustPeak(point(hours(), shortTerm = st), now))
    // Without AROME-PI: the gust of the hours rises by 1 km/h an hour, the twelfth from the hour under way is the highest.
    assertEquals(41.0 to hour + 11 * 3600, HomeBoard.gustPeak(point(hours()), now))
  }

  @Test
  fun `the pressure trend is the site's rule of one hPa in three hours`() {
    fun trend(old: Double, last: Double, age: Long = 0) =
      HomeBoard.pressureTrend(point(pressure = listOf(PressureReading(now - age - 3 * 3600, old), PressureReading(now - age, last))), now)
    assertEquals("↗", trend(1010.0, 1012.5))
    assertEquals("↘", trend(1012.5, 1010.0))
    assertEquals("→", trend(1010.0, 1010.4))
    assertEquals("", trend(1010.0, 1012.5, age = 4 * 3600))
    assertEquals("", HomeBoard.pressureTrend(point(), now))
  }

  @Test
  fun `the sun sets and rises at Bordeaux when it does at the end of November`() {
    val s = HomeBoard.sunTimes(point(), now)!!
    assertTrue(s.up)
    val set = s.set!!
    val rise = s.rise!!
    assertTrue("sunset ${HomeBoard.hm(set, 0)} UTC", set in midnight + 16 * 3600 + 5 * 60..midnight + 16 * 3600 + 45 * 60)
    assertTrue("sunrise ${HomeBoard.hm(rise, 0)} UTC", rise in midnight + 86_400 + 6 * 3600 + 55 * 60..midnight + 86_400 + 7 * 3600 + 35 * 60)
    assertFalse(HomeBoard.sunUp(44.84, -0.58, set))
    assertTrue(HomeBoard.sunUp(44.84, -0.58, set - 120))
  }

  @Test
  fun `the air quality index reads in the bands of the site`() {
    assertEquals("bon" to "vert", HomeBoard.air(10.0))
    assertEquals("dégradé" to "orange", HomeBoard.air(65.0))
    assertEquals("très mauvais" to "rouge", HomeBoard.air(120.0))
  }

  // ------------------------------------------------------------------------------------------------------------- rain

  /** PIAF: twelve 5-minute rates from a minute ago. */
  private fun piaf(vararg rates: Double) = RainNowcast(5, listOf(0.0, 0.0, 0.0, 0.0), rates.toList() + List(12 - rates.size) { 0.0 }, now - 60)

  @Test
  fun `rain coming in the hour is counted from now, with its strength`() {
    val p = point(hours(), rain = piaf(0.0, 0.0, 0.5, 2.0, 4.0))
    assertEquals(9, HomeBoard.nowcastFirst(p, now))
    val t = HomeBoard.rainTile(p, now)!!
    assertEquals("Pluie dans 9${nb}min", t.head)
    assertEquals("faible, puis forte", t.sub)
    assertEquals(12, t.bars.size)
    assertEquals(listOf("12${nb}h${nb}19", "12${nb}h${nb}44", "13${nb}h${nb}14"), t.marks)
  }

  @Test
  fun `snow coming is called snow when AROME-PI says so`() {
    val st = ShortTerm(15, listOf(ShortStep(hour + 900, null, "snow")))
    assertEquals("Neige dans 9${nb}min", HomeBoard.rainTile(point(hours(), rain = piaf(0.0, 0.0, 0.5), shortTerm = st), now)!!.head)
  }

  @Test
  fun `rain under way says it rains`() {
    val t = HomeBoard.rainTile(point(hours(), rain = piaf(1.5, 1.5)), now)!!
    assertEquals("Il pleut", t.head)
    assertEquals("modérée", t.sub)
  }

  @Test
  fun `a dry hour tells when the next rain comes, or until when it stays dry`() {
    val wet = HomeBoard.rainTile(point(hours(rain = { if (it == 4) 0.8 else 0.0 }), rain = piaf()), now)!!
    assertEquals("Pas de pluie dans l’heure", wet.head)
    assertEquals("Prochaine pluie vers 16${nb}h", wet.sub)
    val dry = HomeBoard.rainTile(point(hours().take(25), rain = piaf()), now)!!
    assertEquals("Sec jusqu’à demain 12${nb}h", dry.sub)
  }

  @Test
  fun `an old or stale reading says nothing of the hour to come`() {
    assertEquals("Pluie de l’heure non lue", HomeBoard.rainTile(point(hours(), rain = piaf(2.0), serverUtc = now - 2000), now)!!.head)
    val stale = HomeBoard.rainTile(point(hours(), rain = piaf(2.0), provider = "Météo-France (stale copy)"), now)!!
    assertEquals("Pluie de l’heure non lue", stale.head)
    assertTrue(stale.bars.isEmpty())
    assertNull(HomeBoard.rainTile(point(hours()), now))
  }

  @Test
  fun `an older API without the start of its steps counts from now, and writes no hour under the bars`() {
    val p = point(hours(), rain = RainNowcast(15, listOf(0.0, 0.3, 0.0, 0.0)))
    assertEquals(15, HomeBoard.nowcastFirst(p, now))
    val t = HomeBoard.rainTile(p, now)!!
    assertEquals("Pluie dans 15${nb}min", t.head)
    assertEquals("modérée", t.sub) // 0.3 mm in 15 minutes = 1.2 mm/h
    assertTrue(t.marks.isEmpty())
  }

  // ----------------------------------------------------------------------------------------------------------- season

  private val today = "2026-11-27"

  @Test
  fun `the season pill shows the strongest line and counts the others`() {
    val season =
      SeasonData(
        drought = Drought("available", "alerte", true),
        pollen = Pollen(mapOf("grass" to 3.0), listOf(PollenDay(today, mapOf("grass" to 12.46)))),
      )
    val pill = HomeBoard.seasonPill(point(season = season), now)!!
    assertEquals("secheresse", pill.glyph)
    assertEquals("orange", pill.tone)
    assertEquals("Sécheresse · alerte", pill.text)
    assertEquals(1, pill.more)
    assertEquals("", pill.detail)
  }

  @Test
  fun `pollen alone gives its species and its peak from today on`() {
    val pollen = Pollen(mapOf("grass" to 3.0), listOf(PollenDay("2026-11-26", mapOf("birch" to 80.0)), PollenDay(today, mapOf("grass" to 12.46))))
    val pill = HomeBoard.seasonPill(point(season = SeasonData(pollen = pollen)), now)!!
    assertEquals("fleur", pill.glyph)
    assertEquals("Pollens · graminées", pill.text)
    assertEquals("jusqu’à 12,5${nb}grains/m³", pill.detail)
    assertEquals(0, pill.more)
  }

  @Test
  fun `avalanches show while their bulletin runs, a drought under alert says nothing`() {
    val av = Avalanche("active", 3, now + 3600, "Haute-Bigorre")
    val pill = HomeBoard.seasonPill(point(season = SeasonData(avalanche = av)), now)!!
    assertEquals("Avalanches · risque 3 (marqué)", pill.text)
    assertEquals("orange", pill.tone)
    assertEquals("Haute-Bigorre", pill.detail)
    assertNull(HomeBoard.seasonPill(point(season = SeasonData(avalanche = av.copy(validUntilUtc = now - 1))), now))
    assertNull(HomeBoard.seasonPill(point(season = SeasonData(drought = Drought("available", "vigilance", false))), now))
    assertNull(HomeBoard.seasonPill(point(), now))
  }

  // ------------------------------------------------------------------------------------------------------------ hours

  @Test
  fun `the hours go by 1, 2 or 3 as the width allows`() {
    val p = point(hours())
    assertEquals(1, HomeBoard.hours(p, now, 900f)!!.step)
    assertEquals(24, HomeBoard.hours(p, now, 900f)!!.slots.size)
    val two = HomeBoard.hours(p, now, 388f)!!
    assertEquals(2, two.step)
    assertEquals(12, two.slots.size)
    assertEquals(hour, two.slots[0].ts) // the hour before the one under way is left out
    val three = HomeBoard.hours(p, now, 300f)!!
    assertEquals(3, three.step)
    assertEquals(8, three.slots.size)
    assertNull(HomeBoard.hours(point(hours().take(7)), now, 388f)) // 6 hours from now: 3 columns of 2 hours
  }

  @Test
  fun `a slot sums its rain, keeps its highest chance and its most significant weather`() {
    val p = point(hours(rain = { if (it == 0) 0.4 else if (it == 1) 1.1 else 0.0 }, code = { if (it == 1) 61 else 3 }))
    val s = HomeBoard.hours(p, now, 388f)!!.slots[0]
    assertEquals(1.5, s.mm!!, 1e-9)
    assertEquals(10.0, s.chance!!, 0.0)
    assertEquals("pluie", s.kind)
    assertEquals(31.0, s.gust!!, 0.0)
    assertEquals(20.5, s.wind!!, 1e-9)
    assertEquals(270.0, s.deg!!, 1e-6)
  }

  @Test
  fun `a night slot has the night icon and no sun`() {
    val s = HomeBoard.hours(point(hours(isDay = { false }, code = { 0 })), now, 388f)!!.slots[0]
    assertEquals("lune", s.kind)
    assertFalse(s.day)
    assertNull(s.sun)
  }

  // ------------------------------------------------------------------------------------------------------------- days

  private fun days(windMax: Double) =
    listOf("2026-11-26", today, "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04").map {
      Day(it, 3, 4.0, 13.0, 0.0, 20.0, windMax)
    }

  @Test
  fun `the days start today and name themselves as the card does`() {
    val d = HomeBoard.days(point(hours(), days(30.0)), now, 7)
    assertEquals(7, d.size)
    assertEquals("Auj.", d[0].name)
    assertEquals("Sam 28", d[1].name)
    assertEquals("Sam", d[1].nameShort)
    assertEquals("Mar 1", d[4].name)
  }

  @Test
  fun `a gust shows only over a whole day and above the wind of the day`() {
    // Today from the hour under way to midnight at the place: the twelve hours are there, the gust is 41 km/h.
    val d = HomeBoard.days(point(hours(), days(30.0)), now, 7)
    assertEquals(41.0, d[0].gust!!, 0.0)
    assertEquals(270.0, d[0].deg!!, 1e-6)
    // Tomorrow is cut by the end of the hours: no gust, no direction rather than a part of the day.
    assertNull(d[1].gust)
    assertNull(d[1].deg)
    // A gust no stronger than the wind of the day is left out.
    assertNull(HomeBoard.days(point(hours(), days(45.0)), now, 7)[0].gust)
    assertTrue(HomeBoard.days(point(hours(), days(30.0).take(2)), now, 7).isEmpty())
  }

  @Test
  fun `the hours of sunshine are written as the card writes them`() {
    assertEquals("0 h", HomeBoard.sunHoursText(0.0, false))
    assertEquals("8 h", HomeBoard.sunHoursText(7.8, false))
    assertEquals("1 h", HomeBoard.sunHoursText(0.95, true))
    assertEquals("30 min", HomeBoard.sunHoursText(0.5, false))
    assertEquals("10 min", HomeBoard.sunHoursText(0.04, false))
    assertEquals("0,5 h", HomeBoard.sunHoursText(0.5, true))
    assertEquals("0,1 h", HomeBoard.sunHoursText(0.04, true))
  }

  @Test
  fun `a day's sunshine is its share of the daylight, which tints its column`() {
    // Bordeaux on 27/11: the sun rises near 8 h 20 and sets near 17 h 20 at the place, about 9 hours of daylight.
    val light = HomeBoard.daylightHours(point(), midnight / 86_400)!!
    assertEquals(9.0, light, 0.34)
    assertNull(HomeBoard.daylightHours(point().copy(lat = null), midnight / 86_400))
    val sunny = listOf(8.0, 2.0, 0.5, null)
    val list =
      listOf(today, "2026-11-28", "2026-11-29", "2026-11-30").mapIndexed { i, date -> Day(date, 3, 4.0, 13.0, 0.0, 20.0, 30.0, sunshineH = sunny[i]) }
    val d = HomeBoard.days(point(hours(), list), now, 7)
    assertEquals(8.0 / light, d[0].share!!, 0.03)
    assertEquals(d[0].share!!, d[0].sun, 0.0)
    assertEquals(listOf(2, 1, 0), d.take(3).map { HomeBoard.sunTone(it) })
    // Without the hours of sunshine, the cloud cover of its hours, then its code, as before.
    assertNull(d[3].share)
    assertNull(d[3].sunshineH)
    assertEquals(HomeBoard.sunOfCode(3), d[3].sun, 0.0)
  }

  @Test
  fun `bars and the scale of the days follow the card`() {
    assertEquals(0f, HomeBoard.hourBar(0.0, 1))
    assertEquals(4f, HomeBoard.hourBar(0.01, 1))
    assertEquals(22f, HomeBoard.hourBar(10.0, 1))
    assertEquals(2f, HomeBoard.dayBar(null))
    assertEquals(24f, HomeBoard.dayBar(30.0))
    assertEquals(3f, HomeBoard.tileBar(0.0))
    assertEquals(30f, HomeBoard.tileBar(4.0))
    val cols = HomeBoard.days(point(hours(), days(30.0)), now, 7)
    assertEquals(3.0 to 14.0, HomeBoard.dayScale(cols))
  }
}
