package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PlacesStore
import fr.auxfilsdesidees.vigie.data.Starred
import fr.auxfilsdesidees.vigie.data.VigieRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The star of the sea map, through the view model the tabs and the widgets read: saved with the other choices, the place
 * concerned read, « Annuler » taking it back. A made-up home, never a real one.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MapStarTest {
  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String) = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private val asked = mutableListOf<String>()

  private val repository =
    VigieRepository(baseUrl = "https://api.test", siteUrl = "https://site.test") { url ->
      asked += url
      when {
        "/data/places.json" in url ->
          """{"places":[{"name":"Plouharnel","region":"Bretagne","cc":"FR","lat":47.5973,"lon":-3.1157,"population":2000}],"attribution":"GeoNames"}"""
        "/v1/point" in url -> fixture("point_lorient.json")
        "/v1/vigilances" in url -> fixture("vigilances_ajaccio.json")
        "/v1/activities/overview" in url -> fixture("overview_three_spots.json")
        else -> fixture("activities_plouharnel.json")
      }
    }

  private val home = FollowedPlace(Place("Bastia", 42.70, 9.45, "Corse"), listOf("a"))
  private val grandePlage = CatalogueSpot("plouharnel-la-grande-plage", "La Grande Plage", "Plouharnel", 47.5832, -3.1499)

  @Before
  fun main() {
    Dispatchers.setMain(UnconfinedTestDispatcher())
  }

  @After
  fun reset() {
    Dispatchers.resetMain()
  }

  private fun model(): Pair<HomeViewModel, Memory> {
    val kv = Memory()
    PlacesStore(kv).save(Choices(listOf(home), 0))
    return HomeViewModel(repository, PlacesStore(kv)) to kv
  }

  @Test
  fun `a spot far from every place comes with the town the site names, saved, read, and « Annuler » takes it back`() = runTest {
    val (vm, kv) = model()
    advanceUntilIdle()
    asked.clear()
    val starred = vm.starSpot(grandePlage)
    advanceUntilIdle()
    assertEquals(Starred.WithPlace(grandePlage.id, "La Grande Plage", "47.5973,-3.1157", "Plouharnel"), starred)
    val choices = PlacesStore(kv).load()
    assertEquals(listOf("Bastia", "Plouharnel"), choices.places.map { it.place.name })
    assertEquals(Place("Plouharnel", 47.5973, -3.1157, "Bretagne"), choices.places[1].place)
    assertEquals(listOf(grandePlage.id), choices.places[1].spots)
    // The shown place stays; the new one is read, the town asked at two decimals only.
    assertEquals(0, choices.current)
    assertTrue(asked.any { "/data/places.json?lat=47.58&lon=-3.15" in it })
    assertTrue(asked.any { "/v1/point?lat=47.5973&lon=-3.1157" in it })
    // Twice: nothing more.
    assertNull(vm.starSpot(grandePlage))
    vm.undoStar(starred!!)
    advanceUntilIdle()
    assertEquals(listOf("Bastia"), PlacesStore(kv).load().places.map { it.place.name })
  }

  @Test
  fun `a spot near a place joins it, a town is followed alone, and their stars come off`() = runTest {
    val (vm, kv) = model()
    vm.starTown(Place("Quiberon", 47.484, -3.119, "Bretagne"))
    advanceUntilIdle()
    asked.clear()
    val joined = vm.starSpot(grandePlage)
    advanceUntilIdle()
    assertEquals(Starred.Joined(grandePlage.id, "La Grande Plage", "47.4840,-3.1190", "Quiberon"), joined)
    // No town asked: a followed place is near.
    assertTrue(asked.none { "/data/places.json" in it })
    assertEquals(listOf(grandePlage.id), PlacesStore(kv).load().places[1].spots)
    vm.unstarSpot(grandePlage.id)
    advanceUntilIdle()
    assertEquals(emptyList<String>(), PlacesStore(kv).load().places[1].spots)
    vm.unstarTown("47.4840,-3.1190")
    advanceUntilIdle()
    assertEquals(listOf(home), PlacesStore(kv).load().places)
  }
}
