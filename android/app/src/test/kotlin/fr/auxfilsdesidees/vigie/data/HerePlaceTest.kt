package fr.auxfilsdesidees.vigie.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** The place « Ici »: it follows the phone, keeps its key, its bell and its rank, and its spots follow it without loss. */
class HerePlaceTest {
  private val trestel = CatalogueSpot("trestel", "Trestel", "Trévou", 48.8225, -3.3552)
  private val kerou = CatalogueSpot("kerou", "Le Kérou", "Le Pouldu", 47.7678, -3.5635)
  private val plouharnel = CatalogueSpot("plouharnel", "La Grande Plage", "Plouharnel", 47.5832, -3.1499)
  private val catalogue = listOf(trestel, kerou, plouharnel)

  private val lorient = Place("", 47.75, -3.37, here = true)
  private val sainteAnne = Place("Sainte-Anne", 14.44, -60.88, "Martinique, MQ", here = true)
  private val paris = FollowedPlace(Place("Paris", 48.8534, 2.3488), emptyList())

  @Test
  fun `its key stays the same wherever it goes, its copy is named by its point`() {
    val a = FollowedPlace(lorient, emptyList())
    val b = FollowedPlace(sainteAnne, emptyList())
    assertEquals(FollowedPlace.HERE_KEY, a.key)
    assertEquals(a.key, b.key)
    assertEquals("14.4400_-60.8800", OfflineCopies.nameOf(sainteAnne))
    assertEquals("48.8534,2.3488", paris.key)
  }

  @Test
  fun `it is called by its town, or « Ici » alone while it has none`() {
    assertEquals("Ici · Sainte-Anne", sainteAnne.label)
    assertEquals("Ici", lorient.label)
    assertEquals("Sainte-Anne", sainteAnne.nearName)
    assertEquals("vous", lorient.nearName)
    assertEquals("Paris", paris.place.label)
  }

  @Test
  fun `the first position adds it, the next ones move it and show it with its bell and its rank`() {
    val one = Choices(listOf(paris), 0).useHere(lorient, listOf("kerou", "kerou"))
    assertEquals(1, one.current)
    assertEquals(listOf("kerou"), one.herePlace!!.spots)
    val belled = one.bell(1, Bell.ORANGE).select(0)
    val moved = belled.useHere(sainteAnne, emptyList(), catalogue)
    assertEquals(2, moved.places.size)
    assertEquals(1, moved.current)
    assertEquals(sainteAnne, moved.herePlace!!.place)
    assertEquals(Bell.ORANGE, moved.herePlace!!.bell)
  }

  @Test
  fun `its spots far away are parked, and come back in their order with the phone`() {
    val home = Choices(listOf(FollowedPlace(lorient, listOf("plouharnel", "kerou"))), 0)
    val away = home.moveHere(sainteAnne, catalogue)
    assertEquals(emptyList<String>(), away.herePlace!!.spots)
    assertEquals(listOf("plouharnel", "kerou"), away.herePlace!!.parked)
    val back = away.moveHere(lorient, catalogue)
    assertEquals(listOf("plouharnel", "kerou"), back.herePlace!!.spots)
    assertEquals(emptyList<String>(), back.herePlace!!.parked)
  }

  @Test
  fun `in a new place with spots near, the nearest are followed and the old ones wait`() {
    val home = Choices(listOf(FollowedPlace(sainteAnne, emptyList(), parked = listOf("trestel"))), 0)
    val lannion = home.moveHere(Place("Lannion", 48.73, -3.46, here = true), catalogue)
    assertEquals(listOf("trestel"), lannion.herePlace!!.spots)
    val lorientNow = lannion.moveHere(lorient, catalogue)
    assertEquals(listOf("kerou", "plouharnel"), lorientNow.herePlace!!.spots)
    assertEquals(listOf("trestel"), lorientNow.herePlace!!.parked)
  }

  @Test
  fun `without the catalogue its spots stay, and nothing moves without a place « Ici »`() {
    val home = Choices(listOf(FollowedPlace(lorient, listOf("kerou"))), 0)
    assertEquals(listOf("kerou"), home.moveHere(sainteAnne, null).herePlace!!.spots)
    val fixed = Choices(listOf(paris), 0)
    assertSame(fixed, fixed.moveHere(sainteAnne, catalogue))
  }

  @Test
  fun `a spot followed again is no longer parked`() {
    val away = Choices(listOf(FollowedPlace(sainteAnne, emptyList(), parked = listOf("kerou", "trestel"))), 0)
    val again = away.follow(0, "kerou")
    assertEquals(listOf("kerou"), again.herePlace!!.spots)
    assertEquals(listOf("trestel"), again.herePlace!!.parked)
  }

  @Test
  fun `the « Ma position » of before becomes « Ici » once, with its spots and its bell`() {
    val before = Choices(listOf(paris, FollowedPlace(Place("Ma position", 47.75, -3.37), listOf("kerou"), Bell.RED)), 1)
    val after = before.adoptHere(setOf("Ma position"))
    val here = after.herePlace!!
    assertEquals(1, after.hereIndex)
    assertEquals(Place("", 47.75, -3.37, here = true), here.place)
    assertEquals(listOf("kerou"), here.spots)
    assertEquals(Bell.RED, here.bell)
    assertSame(after, after.adoptHere(setOf("Ma position")))
    val none = Choices(listOf(paris), 0)
    assertSame(none, none.adoptHere(setOf("Ma position")))
  }

  @Test
  fun `it is saved with its mark and its parked spots, one place « Ici » at most`() {
    val c = Choices(listOf(paris, FollowedPlace(sainteAnne, emptyList(), Bell.YELLOW, listOf("kerou"))), 1)
    assertEquals(c, PlacesStore.decode(PlacesStore.encode(c)))
    val two =
      """{"current":0,"places":[{"name":"A","lat":1,"lon":2,"spots":[],"here":true},{"name":"B","lat":3,"lon":4,"spots":[],"here":true}]}"""
    val read = PlacesStore.decode(two)!!
    assertTrue(read.places[0].place.here)
    assertFalse(read.places[1].place.here)
    val before = """{"current":0,"places":[{"name":"Lorient","lat":47.75,"lon":-3.37,"spots":["kerou"]}]}"""
    val old = PlacesStore.decode(before)!!.places.single()
    assertFalse(old.place.here)
    assertEquals(emptyList<String>(), old.parked)
  }
}
