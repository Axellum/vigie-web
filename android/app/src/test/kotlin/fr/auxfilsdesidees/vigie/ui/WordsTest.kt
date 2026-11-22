package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.ActivityVerdict
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
  fun `a verdict says when to go, or why not`() {
    val surf = ActivityVerdict("surf", true, "good", "possible", null, 1795420800L, 1795438800L)
    assertEquals("Demain de 9${nb}h à 14${nb}h", Words.verdictLine(surf, now, off))
    val fishing = ActivityVerdict("shore_fishing", true, "poor", "poor", "low_water.outside_window", null, null)
    assertEquals("Avant la basse mer : hors des 2 h avant la basse mer", Words.verdictLine(fishing, now, off))
    val off24 = ActivityVerdict("kite", false, null, null, null, null, null)
    assertEquals("Pas de calcul ici.", Words.verdictLine(off24, now, off))
    assertEquals("Bon", Words.verdict("good"))
    assertEquals("Déconseillé", Words.verdict("poor"))
    assertEquals("Inconnu", Words.verdict(null))
  }

  @Test
  fun `an unknown reason code is not guessed`() {
    assertEquals("Période de la houle : courte", Words.reason("swell_period.short"))
    assertNull(Words.reason("swell_period.new_state"))
    assertNull(Words.reason(null))
  }
}
