package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.ActivityVerdict
import fr.auxfilsdesidees.vigie.data.Day
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.TideExtreme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WordsTest {
  private val nb = ' '
  // 22/11/2026 at 14:18 in Lorient (UTC+1), the time of the fixtures.
  private val now = 1795353506L
  private val off = 3600

  @Test
  fun `numbers are written the French way`() {
    assertEquals("30${nb}km/h", Words.kmh(29.7))
    assertEquals("0${nb}mm", Words.mm(0.0))
    assertEquals("0,4${nb}mm", Words.mm(0.4))
    assertEquals("5${nb}mm", Words.mm(5.0))
    assertEquals("12${nb}mm", Words.mm(12.3))
    assertEquals("14°", Words.degrees(14.0))
    assertEquals("−3°", Words.degrees(-3.2)) // typographic minus
    assertEquals("0°", Words.degrees(-0.4)) // never « −0° »
    assertEquals("—", Words.degrees(null))
  }

  @Test
  fun `distances, populations and regions of the place choices`() {
    assertEquals("15${nb}km", Words.km(14.62))
    assertEquals("4,2${nb}km", Words.km(4.21))
    assertEquals("3${nb}km", Words.km(3.04))
    assertEquals("10${nb}km", Words.km(9.96))
    assertEquals("58 112${nb}hab.", Words.population(58112))
    assertEquals("5 430${nb}hab.", Words.population(5430))
    assertEquals("812${nb}hab.", Words.population(812))
    assertEquals("Bretagne", Words.placeWhere("Brittany", "FR"))
    assertEquals("Auvergne-Rhône-Alpes", Words.placeWhere("Auvergne-Rhône-Alpes", "FR"))
    assertEquals("Texas, États-Unis", Words.placeWhere("Texas", "US"))
    assertEquals("Genève, Suisse", Words.placeWhere("Geneva", "CH"))
    assertEquals("", Words.placeWhere(null, "FR"))
    assertEquals("Martinique", Words.placeWhere("Martinique", "MQ"))
    assertEquals("La Réunion", Words.placeWhere("Reunion", "RE"))
    assertEquals("Espagne", Words.placeWhere(null, "ES"))
  }

  @Test
  fun `a place kept in English before is shown in French`() {
    assertEquals("Bretagne", Words.where("Brittany"))
    assertEquals("Catalonia, Espagne", Words.where("Catalonia, ES"))
    assertEquals("Bretagne", Words.where("Bretagne"))
    assertEquals("Province Sud", Words.where("South Province"))
    assertEquals(null, Words.where(null))
    // A code the phone does not know stays as it is.
    assertEquals("Lieu, XZ", Words.where("Lieu, XZ"))
  }

  @Test
  fun `near a place, elided before a vowel`() {
    assertEquals("près d'Ajaccio", Words.near("Ajaccio"))
    assertEquals("près d'Étaples", Words.near("Étaples"))
    assertEquals("près d'Yvetot", Words.near("Yvetot"))
    assertEquals("près de Brest", Words.near("Brest"))
    assertEquals("près de Hendaye", Words.near("Hendaye")) // « h » muet or aspiré: not guessed
  }

  @Test
  fun `the wind says where it comes from`() {
    assertEquals("d'ouest", Words.windFrom(287.0))
    assertEquals("du nord", Words.windFrom(359.0))
    assertEquals("de sud-ouest", Words.windFrom(225.0))
    assertEquals("", Words.windFrom(null))
  }

  @Test
  fun `times and days are local to the place`() {
    assertEquals("14${nb}h${nb}18", Words.clock(now, off))
    assertEquals("dimanche", Words.dayName(Math.floorDiv(now + off, 86_400L)))
    assertEquals("aujourd'hui", Words.relativeDay(now, now, off))
    assertEquals("demain", Words.relativeDay(now + 86_400, now, off))
  }

  @Test
  fun `the time of a read kept on the phone says its age`() {
    assertEquals("de 14${nb}h${nb}18", Words.readTime(now, now, off))
    assertEquals("de 13${nb}h${nb}53", Words.readTime(now - 25 * 60, now, off))
    assertEquals("de 13${nb}h${nb}33, il y a 45${nb}min", Words.readTime(now - 45 * 60, now, off))
    assertEquals("de 8${nb}h${nb}18, il y a 6${nb}h", Words.readTime(now - 6 * 3600, now, off))
    assertEquals("d'hier 23${nb}h${nb}50", Words.readTime(now - (14 * 3600 + 28 * 60), now, off))
    assertEquals("du ven. 20 nov., 14${nb}h${nb}18", Words.readTime(now - 2 * 86_400, now, off))
    // A phone clock behind the server's: no negative age.
    assertEquals("de 14${nb}h${nb}18", Words.readTime(now, now - 600, off))
  }

  @Test
  fun `a verdict says when to go, or why not`() {
    val surf = ActivityVerdict("surf", true, "good", "possible", null, 1795420800L, 1795438800L)
    assertEquals("Demain de 9${nb}h à 14${nb}h", Words.verdictLine(surf, now, off))
    val fishing = ActivityVerdict("shore_fishing", true, "poor", "poor", "low_water.outside_window", null, null)
    assertEquals("Hors des 2 h avant la basse mer", Words.verdictLine(fishing, now, off))
    val off24 = ActivityVerdict("kite", false, null, null, null, null, null)
    assertEquals("Pas de calcul ici.", Words.verdictLine(off24, now, off))
    assertEquals("Bon", Words.verdict("good"))
    assertEquals("Déconseillé", Words.verdict("poor"))
    assertEquals("Inconnu", Words.verdict(null))
  }

  @Test
  fun `the frise's days, hours and reading`() {
    assertEquals("Auj.", Words.dayPill(now, now, off))
    assertEquals("Lun. 23", Words.dayPill(1795410000L, now, off))
    assertEquals(22, Words.dayOfMonth(Words.dayKey(now, off)))
    assertEquals(1, Words.dayOfMonth(20_454L)) // 1 January 2026
    assertEquals(31, Words.dayOfMonth(20_453L)) // 31 December 2025
    assertEquals(29, Words.dayOfMonth(19_782L)) // 29 February 2024
    assertEquals("Dimanche · 14${nb}h", Words.readoutTitle(now, off))
    assertEquals("maintenant", Words.fromNow(0))
    assertEquals("dans 7${nb}h", Words.fromNow(7))
    // the words of the Home Assistant card and of the site's widget: « Nuit claire » at night, « Ciel clair » by day
    assertEquals("Nuit claire", Words.weatherAt(0, day = false))
    assertEquals("Ciel clair", Words.weatherAt(0, day = true))
    assertEquals("Ciel clair", Words.weatherAt(0, day = null))
    assertEquals("Couvert", Words.weatherAt(3, day = false))
    assertEquals("Pêche", Words.activityShort("shore_fishing"))
    assertEquals("orange", Words.warningLevel("ORANGE"))
    assertEquals("descend" to "basse mer 20${nb}h${nb}53", Words.tideTrend(TideExtreme(1795377180L, false, -1.84), off))
  }

  @Test
  fun `one sentence for the day, never dry without data`() {
    assertEquals("Éclaircies, de 8° à 12°, 4${nb}mm.", Words.daySentence(Day("2026-11-23", 2, 7.6, 12.4, 4.2)))
    assertEquals("Couvert, de 8° à 12°.", Words.daySentence(Day("2026-11-23", 3, 7.6, 12.4, 0.3)))
    val start = 1795352400L // 14 h local
    val dry = (0 until 12).map { HourWeather(start + it * 3600L, 12.0, 0.0, 20.0, 30.0, 270.0, 3, true) }
    assertEquals("Sec ces 12 prochaines heures.", Words.next12Hours(dry, off))
    assertEquals("Sec jusqu'à 17${nb}h.", Words.next12Hours(dry.mapIndexed { i, x -> if (i == 3) x.copy(rainMm = 0.4) else x }, off))
    val wet =
      dry.mapIndexed { i, x ->
        when (i) {
          0 -> x.copy(rainMm = 2.0)
          5 -> x.copy(gustKmh = 62.0)
          else -> x
        }
      }
    assertEquals("Il pleut, rafales fortes vers 19${nb}h.", Words.next12Hours(wet, off))
    assertNull(Words.next12Hours(dry.mapIndexed { i, x -> if (i == 6) x.copy(rainMm = null) else x }, off))
  }

  @Test
  fun `an unknown reason code is not guessed`() {
    assertEquals("Période de la houle : courte", Words.reason("swell_period.short"))
    assertEquals("Rafales très marquées", Words.reason("gust_gap.very_gusty"))
    assertNull(Words.reason("swell_period.new_state"))
    assertNull(Words.reason(null))
  }
}
