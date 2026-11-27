package fr.auxfilsdesidees.vigie.ui.board

import androidx.compose.ui.graphics.vector.PathParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The icons copied from the Home Assistant card (`FamilyIconData.kt`) read whole: every weather the home page can show has
 * its drawing, every shape is one the small reader draws, every mask it points to is there. No Android in these tests: the
 * outlines are parsed, not turned into paths.
 */
class FamilyIconsTest {
  private val drawn = setOf("g", "mask", "circle", "rect", "path", "polygon", "line")

  private fun walk(n: SvgNode, f: (SvgNode) -> Unit) {
    f(n)
    n.kids.forEach { walk(it, f) }
  }

  @Test
  fun `the twenty icons of the family are there`() {
    assertEquals(
      setOf(
        "soleil", "lune", "eclaircies", "nuit_nuageuse", "couvert", "brouillard", "bruine", "pluie", "pluie_forte", "pluie_verglacante",
        "averses", "averses_nuit", "averses_violentes", "neige", "neige_forte", "grains_de_neige", "averses_neige", "averses_neige_nuit",
        "orage", "orage_grele",
      ),
      MERIDIEN_ICONS.keys,
    )
    assertEquals(setOf("parapluie", "secheresse", "montagne", "fleur", "flamme", "danger"), CARD_GLYPHS.keys)
  }

  @Test
  fun `every weather code shows an icon, by day and by night`() {
    for (code in 0..99) {
      val kind = HomeBoard.wmoKind(code)
      assertTrue("code $code → $kind", kind in MERIDIEN_ICONS)
      val night = HomeBoard.atNight(kind, false)
      assertTrue("code $code at night → $night", night in MERIDIEN_ICONS)
    }
  }

  @Test
  fun `every drawing reads into shapes the reader knows, with its masks`() {
    for ((name, svg) in MERIDIEN_ICONS + CARD_GLYPHS) {
      val root = SvgReader.read(svg)
      val masks = HashSet<String>()
      val wanted = HashSet<String>()
      var shapes = 0
      walk(root) { n ->
        if (n === root) return@walk
        assertTrue("$name: <${n.tag}>", n.tag in drawn)
        if (n.tag == "mask") n.attrs["id"]?.let(masks::add)
        n.attrs["mask"]?.let { wanted += it.removePrefix("url(#").removeSuffix(")") }
        when (n.tag) {
          "path" -> assertTrue("$name: empty path", PathParser().parsePathString(n.attrs.getValue("d")).toNodes().isNotEmpty())
          "circle" -> assertTrue("$name: circle without r", n.attrs["r"]?.toFloatOrNull() != null)
          "polygon" -> assertEquals("$name: odd polygon", 0, n.attrs.getValue("points").trim().split(Regex("[\\s,]+")).size % 2)
        }
        if (n.tag != "g" && n.tag != "mask") shapes++
      }
      assertTrue("$name draws nothing", shapes > 0)
      assertTrue("$name: masks $wanted not in $masks", masks.containsAll(wanted))
    }
  }
}
