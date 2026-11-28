package fr.auxfilsdesidees.vigie.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The star of the sea map, written in the followed places the app already has. Made-up places, never a real home. */
class FavouritesTest {
  private val quiberon = Place("Quiberon", 47.4840, -3.1190, "Bretagne")
  private val biarritz = Place("Biarritz", 43.4832, -1.5586, "Nouvelle-Aquitaine")
  private val grandePlage = CatalogueSpot("plouharnel-la-grande-plage", "La Grande Plage", "Plouharnel", 47.5832, -3.1499)
  private val santocha = CatalogueSpot("capbreton-plage-santocha", "Plage Santocha", "Capbreton", 43.6466, -1.4479)
  private val capbreton = Place("Capbreton", 43.6420, -1.4280, "Nouvelle-Aquitaine")

  private fun choices(vararg places: FollowedPlace, current: Int = 0) = Choices(places.toList(), current)

  @Test
  fun `a spot joins the nearest followed place within 60 km, at the end, and the shown place stays`() {
    val c = choices(FollowedPlace(biarritz, listOf("biarritz-corsaires")), FollowedPlace(quiberon, listOf("quiberon-port-blanc")), current = 0)
    val (next, starred) = Favourites.starSpot(c, grandePlage, town = null)!!
    assertEquals(listOf("quiberon-port-blanc", grandePlage.id), next.places[1].spots)
    assertEquals(listOf("biarritz-corsaires"), next.places[0].spots)
    assertEquals(0, next.current)
    assertEquals(Starred.Joined(grandePlage.id, "La Grande Plage", quiberon.pointKey, "Quiberon"), starred)
  }

  @Test
  fun `a spot far from every followed place comes with its town, which becomes a followed place`() {
    val c = choices(FollowedPlace(quiberon, emptyList()))
    val (next, starred) = Favourites.starSpot(c, santocha, town = capbreton)!!
    assertEquals(2, next.places.size)
    assertEquals(capbreton, next.places[1].place)
    assertEquals(listOf(santocha.id), next.places[1].spots)
    assertEquals(0, next.current)
    assertEquals(Starred.WithPlace(santocha.id, "Plage Santocha", capbreton.pointKey, "Capbreton"), starred)
  }

  @Test
  fun `without a town from the site, the spot's own place and point make the new place`() {
    val (next, _) = Favourites.starSpot(Choices.EMPTY, santocha, town = null)!!
    assertEquals(Place("Capbreton", santocha.lat, santocha.lon), next.places.single().place)
    assertEquals(0, next.current)
  }

  @Test
  fun `a spot followed already, or parked by « Ici », is not starred twice`() {
    val c = choices(FollowedPlace(quiberon, listOf(grandePlage.id)))
    assertNull(Favourites.starSpot(c, grandePlage, null))
    val parked = choices(FollowedPlace(Place("", 47.0, -2.0, here = true), emptyList(), parked = listOf(grandePlage.id)))
    assertNull(Favourites.starSpot(parked, grandePlage, null))
    assertTrue(grandePlage.id in Favourites.spots(parked))
  }

  @Test
  fun `the star taken away from a spot takes it from wherever it is, the places stay`() {
    val c = choices(FollowedPlace(quiberon, listOf("a", grandePlage.id)), FollowedPlace(Place("", 47.0, -2.0, here = true), listOf("b"), parked = listOf(grandePlage.id)))
    val next = Favourites.unstarSpot(c, grandePlage.id)
    assertEquals(listOf("a"), next.places[0].spots)
    assertEquals(emptyList<String>(), next.places[1].parked)
    assertEquals(2, next.places.size)
  }

  @Test
  fun `a town is followed alone, once, and « Annuler » takes it away`() {
    val c = choices(FollowedPlace(quiberon, listOf("a")))
    val (next, starred) = Favourites.starTown(c, biarritz)!!
    assertEquals(FollowedPlace(biarritz, emptyList()), next.places[1])
    assertEquals(0, next.current)
    assertEquals(Starred.Town(biarritz.pointKey, "Biarritz"), starred)
    assertNull(Favourites.starTown(next, biarritz))
    assertEquals(c, Favourites.undo(next, starred))
  }

  @Test
  fun `« Annuler » takes away the spot that joined, or the place that came with it`() {
    val c = choices(FollowedPlace(quiberon, listOf("a")))
    val (joined, j) = Favourites.starSpot(c, grandePlage, null)!!
    assertEquals(c, Favourites.undo(joined, j))
    val (withPlace, w) = Favourites.starSpot(c, santocha, capbreton)!!
    assertEquals(c, Favourites.undo(withPlace, w))
  }

  @Test
  fun `the map marks the followed places, not « Ici » nor a place without a name`() {
    val c = choices(FollowedPlace(quiberon, emptyList()), FollowedPlace(Place("Sainte-Anne", 14.4, -60.9, here = true), emptyList()), FollowedPlace(Place("", 1.0, 1.0), emptyList()))
    assertEquals(listOf("Quiberon"), Favourites.places(c).map { it.place.name })
    assertEquals(quiberon.pointKey, Favourites.placeAt(c, quiberon.copy(name = "autre"))?.key)
    assertNull(Favourites.placeAt(c, Place("Sainte-Anne", 14.4, -60.9)))
  }
}
