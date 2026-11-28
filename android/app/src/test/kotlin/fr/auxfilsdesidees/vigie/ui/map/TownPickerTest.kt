package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.TownReading
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Which towns of the base map get a pill, as the site's `townMarkers.ts` chooses them. */
class TownPickerTest {
  private fun props(vararg p: Pair<String, Any>): (String) -> Any? = p.toMap()::get

  @Test
  fun `the towns of OpenMapTiles, each from the zoom the base map names it, in French`() {
    val paris = TownPicker.candidate(props("class" to "city", "name" to "Paris", "capital" to 2.0, "rank" to 1.0), 48.857, 2.352, 3.0)!!
    assertEquals("Paris", paris.name)
    assertEquals(10.0, paris.order, 0.0)
    val geneve = TownPicker.candidate(props("class" to "city", "name" to "Genève", "name:fr" to "Genève", "name:latin" to "Geneve", "rank" to 4.0), 46.2, 6.15, 6.0)!!
    assertEquals("Genève", geneve.name)
    assertEquals(1e6 + 40, geneve.order, 0.0)
    // A town from zoom 6, a village from zoom 9; never a hamlet, a region or a country.
    assertNull(TownPicker.candidate(props("class" to "town", "name" to "Carnac"), 47.584, -3.078, 5.9))
    assertEquals(1e6 + 1e4 + 990, TownPicker.candidate(props("class" to "town", "name" to "Carnac"), 47.584, -3.078, 6.0)!!.order, 0.0)
    assertNull(TownPicker.candidate(props("class" to "village", "name" to "Plouharnel"), 47.6, -3.11, 8.5))
    assertEquals("Plouharnel", TownPicker.candidate(props("class" to "village", "name" to "Plouharnel"), 47.6, -3.11, 9.0)?.name)
    assertNull(TownPicker.candidate(props("class" to "hamlet", "name" to "Kerlescan"), 47.59, -3.06, 14.0))
    assertNull(TownPicker.candidate(props("class" to "state", "name" to "Bretagne"), 48.0, -3.0, 6.0))
  }

  @Test
  fun `the towns of the IGN's plan, by their importance`() {
    val vannes = TownPicker.candidate(props("txt_typo" to "commune 3 capitale", "texte" to "Vannes"), 47.65, -2.76, 5.0)!!
    assertEquals("Vannes", vannes.name)
    assertNull(TownPicker.candidate(props("txt_typo" to "TYPO_A_5", "texte" to "Carnac"), 47.584, -3.078, 8.0))
    // The IGN breaks a long name over two lines, after a hyphen or between words.
    assertEquals("Saint-Pierre-Quiberon", TownPicker.candidate(props("txt_typo" to "BAT_COMMUNE_5", "texte" to "Saint-Pierre-\nQuiberon"), 47.52, -3.14, 9.0)?.name)
    assertEquals("La Trinité-sur-Mer", TownPicker.candidate(props("txt_typo" to "TYPO_A_5", "texte" to "La\nTrinité-sur-Mer"), 47.59, -3.03, 9.0)?.name)
    assertNull(TownPicker.candidate(props("txt_typo" to "BAT_HAMEAU", "texte" to "Kerlescan"), 47.59, -3.06, 12.0))
  }

  @Test
  fun `the most important first, a pill that would touch one kept left out`() {
    data class T(val name: String, val x: Float, val y: Float)
    val list = listOf(T("Vannes", 100f, 100f), T("Auray", 130f, 110f), T("Carnac", 100f, 160f), T("Quiberon", 220f, 100f))
    val kept = TownPicker.layout(list, { TownPicker.At(it.x, it.y) }, { TownPicker.pillWidth(null, it.name) })
    // Auray's pill would lie over Vannes'; Carnac is under it, Quiberon beside it.
    assertEquals(listOf("Vannes", "Carnac", "Quiberon"), kept.map { it.name })
  }

  @Test
  fun `a pill is as wide as what it shows, or as its name`() {
    val r = TownReading("couvert", 13.2, null, 0.5, 47.2, 184.0, true)
    assertEquals(132f, TownPicker.pillWidth(r, "Carnac"), 0f)
    assertEquals(62f, TownPicker.pillWidth(r.copy(rainMm = 0.0, wind = null), "Paris"), 0f)
    assertEquals(150f, TownPicker.pillWidth(null, "Saint-Remy-en-Bouzemont-Saint-Genest-et-Isson"), 0f)
  }

  @Test
  fun `the pills as GeoJSON, their town and order with them`() {
    val town = TownInView("Carnac@47.584,-3.078", "Carnac", 47.584, -3.078, 1_010_990.0)
    val json = Json.parseToJsonElement(TownPicker.features(listOf(TownPill(town, TownReading("couvert", 13.2, null, 0.5, 47.2, 184.0, true))))) as JsonObject
    val f = (json["features"] as JsonArray).single() as JsonObject
    val p = f["properties"] as JsonObject
    assertEquals("Carnac", p["name"]!!.jsonPrimitive.content)
    assertEquals("vigie-town:couvert:13:-:0,5:47:185:Carnac", p["image"]!!.jsonPrimitive.content)
    assertEquals("1010990.0", p["order"]!!.jsonPrimitive.content)
    assertEquals("[-3.078,47.584]", (f["geometry"] as JsonObject)["coordinates"].toString())
  }
}
