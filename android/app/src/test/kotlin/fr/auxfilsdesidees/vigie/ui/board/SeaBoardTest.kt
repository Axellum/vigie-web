package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.Beach
import fr.auxfilsdesidees.vigie.data.BeachParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The Sea page says what the Home Assistant card says. The beach is the Plage des Corsaires read on Saturday 28/11/2026 at
 * 10 h 10 at the place (UTC+1, 9 h 10 UTC); the hour under way starts at 9 h UTC.
 */
class SeaBoardTest {
  private val nb = ' '
  private val t0 = 1795856400L // 28/11/2026 at 9 h UTC
  private val now = t0 + 600
  private val offset = 3600

  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private val beach: Beach =
    BeachParser.beach(
      BeachParser.keep(
        fixture("beach_corsaires_surf.json"),
        fixture("beach_corsaires_activities.json"),
        fixture("beach_corsaires_point.json"),
        fixture("beach_corsaires_bathing.json"),
        now,
      )!!
    )!!

  private fun text(parts: List<SeaBoard.Part>) = parts.joinToString("") { it.text }

  @Test
  fun `the tabs keep what names the beach`() {
    assertEquals("Corsaires", SeaBoard.shortName("Plage des Corsaires"))
    assertEquals("Côte des Basques", SeaBoard.shortName("Plage de la Côte des Basques"))
    assertEquals("Anglet", SeaBoard.shortName("plage d’Anglet"))
    assertEquals("Grande Plage", SeaBoard.shortName("Grande Plage"))
    assertEquals("Plage", SeaBoard.shortName("Plage"))
    assertNull(SeaBoard.shortName(" "))
    assertEquals("Plage 2", SeaBoard.beachN(1))
  }

  @Test
  fun `the head says the tide, the next low water, the coefficient and the water`() {
    val h = SeaBoard.head(beach, "Plage des Corsaires", now, offset)
    assertEquals("La mer descend · basse mer 13${nb}h${nb}03 · coef. 85 (estimé)", h.line)
    assertEquals("16°", h.water)
  }

  @Test
  fun `six tiles, the words shorter level by level`() {
    val t = SeaBoard.tiles(beach, now, offset)
    assertEquals(listOf("Vagues · très forte", "Houle", "Vent de terre", "Baïnes", "Qualité de l’eau", "Plage surveillée"), t.map { text(it.key) })
    assertEquals("2,5${nb}m", t[0].value)
    assertEquals("14${nb}s · du nord-ouest", text(t[0].detail))
    assertEquals("11${nb}km/h", t[2].value)
    assertEquals("rafales 23 · d’est", text(t[2].detail))
    assertEquals("green", t[2].key[1].tone)
    // The baïnes run from 3 hours before the low water of 13 h 03: under way, until 16 h 03.
    assertEquals("En cours", t[3].value)
    assertEquals("orange", t[3].tone)
    assertEquals("jusqu’à 16${nb}h${nb}03", text(t[3].detail))
    assertEquals("Excellente", t[4].value)
    assertEquals("green", t[4].tone)

    val one = SeaBoard.tiles(beach, now, offset, level = 1)
    assertEquals("14${nb}s", text(one[0].detail))
    assertEquals("rafales 23", text(one[2].detail))
    val two = SeaBoard.tiles(beach, now, offset, level = 2)
    assertEquals(listOf("Vagues", "Houle", "Vent de terre", "Baïnes", "Qualité", "Surveillance"), two.map { text(it.key) })
  }

  @Test
  fun `no baïnes on rock, and the sun fills the tiles left`() {
    val rock = beach.copy(spot = beach.spot.copy(bottom = "rock", lifeguarded = false), bathing = null)
    val t = SeaBoard.tiles(rock, now, offset)
    assertEquals(listOf("Vagues · très forte", "Houle", "Vent de terre", "Coucher du soleil"), t.map { text(it.key) })
    assertFalse(SeaBoard.onBaineCoast(rock))
    assertEquals("sun", t[3].tone)
  }

  @Test
  fun `each activity has its verdict, why and its 24 hours`() {
    val rows = SeaBoard.activities(beach, now, offset)
    assertEquals(listOf("Surf", "Kite / wing", "Bateau", "Pêche à pied"), rows.map { it.name })
    assertEquals(listOf("Bon", "Déconseillé", "Possible", "Déconseillé"), rows.map { it.word })
    assertEquals("au mieux jusqu’à 18${nb}h", rows[0].why)
    assertEquals("Vent : trop faible", rows[1].why)
    assertEquals("Vagues : modérées", rows[2].why)
    assertEquals("Basse mer : loin de la basse mer", rows[3].why)
    assertTrue(rows.all { it.strip.size == 24 })
    assertEquals("green", rows[0].strip[0])
    // The night has no verdict to show.
    assertNull(rows[0].strip[12])
    assertEquals(listOf("10${nb}h", "16${nb}h", "22${nb}h", "4${nb}h"), SeaBoard.ticks(now, offset))
  }

  @Test
  fun `the reasons are the card's short words, an unknown code is never shown`() {
    assertEquals("Houle : forte", SeaBoard.reason("swell_height.big"))
    assertNull(SeaBoard.reason("swell_height.enormous"))
    assertNull(SeaBoard.reason(null))
  }

  @Test
  fun `the tide of 24 hours marks its high and low waters`() {
    val c = assertNotNullAndGet(SeaBoard.tide(beach, now, offset, 355f, 84f))
    assertTrue(c.points.size >= 24)
    assertTrue(c.marks.any { it.low && it.text == "BM 13${nb}h${nb}03" })
    assertTrue(c.marks.any { !it.low })
    assertTrue(c.nowX > 4f && c.nowX < 30f)
    assertNull(SeaBoard.tide(beach.copy(hours = beach.hours.take(4)), now, offset, 355f, 84f))
  }

  @Test
  fun `the next hours by 3 hours, tinted by their strength`() {
    val t = assertNotNullAndGet(SeaBoard.table(beach, now, offset))
    assertEquals(listOf("10${nb}h", "13${nb}h", "16${nb}h", "19${nb}h", "22${nb}h", "1${nb}h", "4${nb}h", "7${nb}h"), t.hours)
    assertEquals("2,5", t.waves[0].text)
    assertEquals("yellow", t.waves[0].tone)
    assertEquals("14", t.periods[0].text)
    assertEquals("11", t.winds[0].text)
    assertEquals(97.0, t.winds[0].deg!!, 0.0)
  }

  @Test
  fun `the credits name who the values are from`() {
    val c = SeaBoard.credits(beach)!!
    assertTrue(c.startsWith("Données${nb}: "))
    listOf("Open-Meteo", "Copernicus", "EOT20", "OpenStreetMap", "GIP Littoral", "Shom", "ministère de la Santé (data.gouv.fr)").forEach { assertTrue(it, it in c) }
    assertTrue(c.endsWith(" · relayées par Vigie"))
  }

  @Test
  fun `a direction in words is the card's eighth of the compass`() {
    assertEquals(0, SeaBoard.sector(10.0))
    assertEquals(1, SeaBoard.sector(22.5))
    assertEquals(7, SeaBoard.sector(308.0))
    assertEquals(0, SeaBoard.sector(-10.0))
  }

  private fun <T> assertNotNullAndGet(v: T?): T {
    assertNotNull(v)
    return v!!
  }
}
