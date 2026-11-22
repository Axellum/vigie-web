package fr.auxfilsdesidees.vigie.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The user's choices: kept as they were given, changed without ever losing or doubling a place or a spot. */
class PlacesStoreTest {
  private val lorient = FollowedPlace(Place("Lorient", 47.75, -3.37, "Brittany"), listOf("le-pouldu-plage-du-kerou", "plouharnel-la-grande-plage"))
  private val quiberon = FollowedPlace(Place("Quiberon", 47.4837, -3.1199, "Brittany"), emptyList())
  private val paris = FollowedPlace(Place("Paris", 48.8534, 2.3488), emptyList())

  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String) = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  @Test
  fun `the choices come back as they were saved`() {
    val kv = Memory()
    val choices = Choices(listOf(lorient, quiberon, paris), 1)
    PlacesStore(kv).save(choices)
    assertEquals(choices, PlacesStore(kv).load())
  }

  @Test
  fun `nothing saved or an unreadable text reads as no choice`() {
    assertEquals(Choices.EMPTY, PlacesStore(Memory()).load())
    val kv = Memory().apply { map["followed_places"] = "{not json" }
    assertEquals(Choices.EMPTY, PlacesStore(kv).load())
    assertNull(PlacesStore.decode("[1, 2]"))
  }

  @Test
  fun `a saved current place beyond the list falls back inside it`() {
    val text = PlacesStore.encode(Choices(listOf(lorient), 5))
    assertEquals(0, PlacesStore.decode(text)!!.current)
  }

  @Test
  fun `adding shows the new place and refuses a second one at the same point`() {
    val one = Choices.EMPTY.add(lorient)!!
    assertEquals(0, one.current)
    val two = one.add(quiberon)!!
    assertEquals(listOf("Lorient", "Quiberon"), two.places.map { it.place.name })
    assertEquals(1, two.current)
    assertNull(two.add(FollowedPlace(Place("Lorient again", 47.75, -3.37), emptyList())))
  }

  @Test
  fun `removing keeps the same place shown when it can`() {
    val three = Choices(listOf(lorient, quiberon, paris), 2)
    assertEquals(Choices(listOf(quiberon, paris), 1), three.remove(0))
    assertEquals(Choices(listOf(lorient, quiberon), 1), three.remove(2))
    assertEquals(Choices(listOf(lorient, paris), 1), Choices(listOf(lorient, quiberon, paris), 1).remove(1))
    assertEquals(three, three.remove(7))
  }

  @Test
  fun `the star puts a spot first, following never doubles it, unfollowing removes it`() {
    val c = Choices(listOf(lorient, quiberon), 0)
    assertEquals(listOf("plouharnel-la-grande-plage", "le-pouldu-plage-du-kerou"), c.star(0, "plouharnel-la-grande-plage").places[0].spots)
    assertEquals(lorient.spots, c.follow(0, "le-pouldu-plage-du-kerou").places[0].spots)
    assertEquals(listOf("beuzec-plage-de-la-torche"), c.follow(1, "beuzec-plage-de-la-torche").places[1].spots)
    assertEquals(listOf("plouharnel-la-grande-plage"), c.unfollow(0, "le-pouldu-plage-du-kerou").places[0].spots)
    assertEquals(lorient, c.unfollow(1, "x").places[0])
  }
}
