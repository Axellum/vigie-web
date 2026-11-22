package fr.auxfilsdesidees.vigie.data

import org.junit.Assert.assertEquals
import org.junit.Test

/** Distances and suggestions, checked on real spots of the catalogue (22/11/2026) around Lorient. */
class GeoTest {
  private val kerou = CatalogueSpot("le-pouldu-plage-du-kerou", "Plage du Kerou", "Le Pouldu", 47.7678, -3.5635)
  private val plouharnel = CatalogueSpot("plouharnel-la-grande-plage", "La Grande Plage", "Plouharnel", 47.5832, -3.1499)
  private val torche = CatalogueSpot("beuzec-plage-de-la-torche", "Plage de la Torche", "Beuzec", 47.8432, -4.3476)
  private val trestel = CatalogueSpot("trevou-treguignec-plage-de-trestel", "Plage de Trestel", "Trévou-Tréguignec", 48.8225, -3.3552)

  @Test
  fun `a distance on the Earth, in km`() {
    assertEquals(0.0, Geo.km(47.75, -3.37, 47.75, -3.37), 1e-9)
    // One degree of latitude is about 111 km anywhere.
    assertEquals(111.2, Geo.km(47.0, -3.0, 48.0, -3.0), 0.1)
    assertEquals(14.6, Geo.km(47.75, -3.37, kerou.lat, kerou.lon), 0.1)
  }

  @Test
  fun `the nearest spots first`() {
    val near = Geo.nearest(listOf(torche, trestel, plouharnel, kerou), 47.75, -3.37)
    assertEquals(listOf(kerou, plouharnel, torche, trestel), near.map { it.first })
  }

  @Test
  fun `the suggestion keeps three spots at most, within 60 km`() {
    assertEquals(listOf(kerou.id, plouharnel.id), Geo.suggested(listOf(torche, trestel, plouharnel, kerou), 47.75, -3.37))
    // Paris: no spot within 60 km, none suggested.
    assertEquals(emptyList<String>(), Geo.suggested(listOf(torche, trestel, plouharnel, kerou), 48.8534, 2.3488))
  }

  @Test
  fun `a position is rounded to about 1 km`() {
    assertEquals(47.75, Geo.roundKm(47.7461), 0.0)
    assertEquals(-3.37, Geo.roundKm(-3.3712), 0.0)
  }
}
