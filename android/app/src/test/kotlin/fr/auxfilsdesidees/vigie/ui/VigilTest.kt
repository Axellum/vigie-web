package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.Vigilance
import fr.auxfilsdesidees.vigie.data.VigieParser
import fr.auxfilsdesidees.vigie.data.Vigilances
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The official warnings read as the site's widget reads them. Fixtures: real answers of `/v1/vigilances` on 22/11/2026
 * at 19 h 45 (Paris, UTC+1): Ajaccio (orange wind from 17 h, yellow waves-flooding from 20 h, both until Monday 16 h),
 * Montreuil-sur-Mer (the Canche in orange, no hours), Rabat (no source).
 */
class VigilTest {
  private fun fixture(name: String): Vigilances =
    VigieParser.vigilances(requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText())

  private val now = 1795373156L // 22/11/2026 19 h 45 56 in Paris
  private val off = 3600
  private val nb = ' '

  private fun warning(level: String?, onset: Long?, end: Long?, phenomenon: String? = "wind", event: String? = null) =
    Vigilance("w-$level-$onset", "meteofrance", "Météo-France", level, phenomenon, event, null, false, null, onset, end, null, null, null, null, null, null)

  @Test
  fun `the banner says the highest level, its phenomena, until when, and how many others`() {
    val view = Vigil.view(fixture("vigilances_ajaccio.json"), now)
    assertEquals(Vigil.State.Warnings, view.state)
    assertEquals("ORANGE", view.level)
    assertEquals(listOf("Vent"), view.labels)
    assertEquals(1795446000L, view.until)
    assertEquals(1, view.more)
    assertEquals(listOf("wind", "coastal"), view.live.map { it.phenomenon })
    assertEquals("Vigilance orange", Vigil.levelTitle(view.level))
    assertEquals("jusqu'à demain 16${nb}h", Vigil.until(view.until!!, now, off))
    assertEquals("Météo-France", Vigil.issuers(view.live))
  }

  @Test
  fun `each warning says since or from when, and until when`() {
    val (wind, coast) = Vigil.view(fixture("vigilances_ajaccio.json"), now).live
    assertEquals("Depuis 17${nb}h · jusqu'à demain 16${nb}h", Vigil.period(wind, now, off))
    assertEquals("Dès 20${nb}h · jusqu'à demain 16${nb}h", Vigil.period(coast, now, off))
    assertEquals("Vagues, submersion", Vigil.label(coast))
    assertEquals("Corse-du-Sud", Vigil.where(wind))
  }

  @Test
  fun `a river in flood names the river and its distance, has no hours and no place on the frise`() {
    val view = Vigil.view(fixture("vigilances_montreuil.json"), now)
    assertEquals("ORANGE", view.level)
    assertEquals(listOf("Crues : Canche, à 0,6${nb}km"), view.labels)
    assertNull(view.until)
    val w = view.live.single()
    assertEquals("En cours, sans heure de fin", Vigil.period(w, now, off))
    assertTrue(Vigil.lanes(view.live, now, now + 86_400).isEmpty())
    assertEquals(listOf(w), Vigil.untimed(view.live))
  }

  @Test
  fun `no warning, no source, unread and expired are told apart`() {
    assertEquals(Vigil.State.Unread, Vigil.view(null, now).state)
    assertEquals(Vigil.State.NoSource, Vigil.view(fixture("vigilances_rabat.json"), now).state)
    assertEquals(Vigil.State.None, Vigil.view(Vigilances(true, false, emptyList(), null), now).state)
    assertEquals(Vigil.State.Unread, Vigil.view(Vigilances(true, true, emptyList(), null), now).state)
    val ended = Vigilances(true, false, listOf(warning("ORANGE", now - 7200, now - 60)), null)
    assertEquals(Vigil.State.None, Vigil.view(ended, now).state)
  }

  @Test
  fun `the frise draws each warning over its hours, cut to the window`() {
    val live = Vigil.view(fixture("vigilances_ajaccio.json"), now).live
    val t0 = 1795370400L // 19 h
    val lanes = Vigil.lanes(live, t0, t0 + 24 * 3600)
    assertEquals(listOf(t0 to 1795446000L, 1795374000L to 1795446000L), lanes.map { it.start to it.end })
    assertEquals(listOf("wind"), Vigil.at(live, t0).map { it.phenomenon })
    assertEquals(listOf("wind", "coastal"), Vigil.at(live, 1795374000L).map { it.phenomenon })
    // the reading of Monday 3 h says until when from Monday, not from tonight
    assertEquals("jusqu'à 16${nb}h", Vigil.until(1795446000L, 1795399200L, off))
    // the next day after 16 h: nothing
    assertTrue(Vigil.lanes(live, 1795446000L, 1795446000L + 24 * 3600).isEmpty())
  }

  @Test
  fun `the label is the site's word, else the issuer's without its level`() {
    assertEquals("Canicule", Vigil.label(warning("YELLOW", null, null, phenomenon = "other", event = "Vigilance jaune canicule")))
    assertEquals("Autre", Vigil.label(warning("YELLOW", null, null, phenomenon = null)))
    assertEquals("Neige, verglas", Vigil.label(warning("YELLOW", null, null, phenomenon = "snow-ice")))
  }

  @Test
  fun `times far away carry their date, minutes only when there are some`() {
    assertEquals("jusqu'à 22${nb}h${nb}30", Vigil.until(now + 2 * 3600 + 44 * 60 + 4, now, off))
    assertEquals("jusqu'au mar. 24 nov., 6${nb}h", Vigil.until(1795496400L, now, off))
    assertEquals("Dès mar. 24 nov. 6${nb}h · sans heure de fin", Vigil.period(warning("YELLOW", 1795496400L, null), now, off))
    assertEquals(11, Words.monthOf(Words.dayKey(now, off)))
    assertEquals("Vigilance", Vigil.levelTitle(null))
  }
}
