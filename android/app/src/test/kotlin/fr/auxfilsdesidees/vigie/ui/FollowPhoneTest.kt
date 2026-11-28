package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PlacesStore
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** « Ici » at each opening: it goes where the phone is, rounded to about 1 km, named by the site, and is read there. */
@OptIn(ExperimentalCoroutinesApi::class)
class FollowPhoneTest {
  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String) = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private val sainteAnne =
    """{"places":[{"name":"Sainte-Anne","region":"Martinique","cc":"MQ","lat":14.4317,"lon":-60.8849,"population":4306}],"attribution":"GeoNames"}"""

  private val asked = mutableListOf<String>()
  private var siteNames = true

  private val repository =
    VigieRepository(baseUrl = "https://api.test", siteUrl = "https://site.test") { url ->
      asked += url
      when {
        "/data/places.json" in url -> if (siteNames) sainteAnne else throw fr.auxfilsdesidees.vigie.data.ApiException(400)
        "/v1/point" in url -> fixture("point_lorient.json")
        "/v1/vigilances" in url -> fixture("vigilances_ajaccio.json")
        "/v1/activities/overview" in url -> fixture("overview_three_spots.json")
        else -> fixture("activities_plouharnel.json")
      }
    }

  private val home = FollowedPlace(Place("Lorient", 47.75, -3.37, "Brittany", here = true), listOf("plouharnel-la-grande-plage"))

  @Before
  fun main() {
    Dispatchers.setMain(UnconfinedTestDispatcher())
  }

  @After
  fun reset() {
    Dispatchers.resetMain()
  }

  private fun model(choices: Choices, at: Pair<Double, Double>?): Pair<HomeViewModel, Memory> {
    val kv = Memory()
    val store = PlacesStore(kv).apply { save(choices) }
    return HomeViewModel(repository, store, phone = { at }) to kv
  }

  @Test
  fun `the phone abroad moves « Ici », names it, parks its far spots and reads it there`() = runTest {
    val (vm, kv) = model(Choices(listOf(home), 0), 14.44123 to -60.87987)
    vm.followPhone()
    advanceUntilIdle()
    val here = vm.app.value.choices.herePlace!!
    assertEquals(Place("Sainte-Anne", 14.44, -60.88, "Martinique", here = true), here.place)
    assertEquals(emptyList<String>(), here.spots)
    assertEquals(listOf("plouharnel-la-grande-plage"), here.parked)
    assertEquals(FollowedPlace.HERE_KEY, here.key)
    assertEquals(vm.app.value.choices, PlacesStore(kv).load())
    // Only two decimals of the position leave the phone.
    assertTrue(asked.contains("https://site.test/data/places.json?lat=14.44&lon=-60.88"))
    assertTrue(asked.any { it.startsWith("https://api.test/v1/point?lat=14.4400&lon=-60.8800") })
    val state = vm.app.value.states[FollowedPlace.HERE_KEY] as HomeState.Ready
    assertEquals("Ici · Sainte-Anne", state.snapshot.place.label)
  }

  @Test
  fun `a site that names nothing leaves « Ici » alone, then the next opening names it`() = runTest {
    siteNames = false
    val (vm, _) = model(Choices(listOf(home), 0), 14.44 to -60.88)
    vm.followPhone()
    advanceUntilIdle()
    assertEquals("Ici", vm.app.value.choices.herePlace!!.place.label)
    siteNames = true
    asked.clear()
    vm.followPhone()
    advanceUntilIdle()
    assertEquals("Ici · Sainte-Anne", vm.app.value.choices.herePlace!!.place.label)
    // The point did not move: only its town was asked, the weather stays.
    assertFalse(asked.any { "/v1/point" in it })
    assertEquals("Ici · Sainte-Anne", (vm.app.value.states[FollowedPlace.HERE_KEY] as HomeState.Ready).snapshot.place.label)
  }

  @Test
  fun `the same point named already asks nothing, and no place « Ici » never asks the phone`() = runTest {
    val (vm, _) = model(Choices(listOf(home), 0), 47.7512 to -3.3703)
    advanceUntilIdle()
    asked.clear()
    vm.followPhone()
    advanceUntilIdle()
    assertEquals(emptyList<String>(), asked)

    var phoneAsked = false
    val fixed = FollowedPlace(Place("Paris", 48.8534, 2.3488), emptyList())
    val store = PlacesStore(Memory()).apply { save(Choices(listOf(fixed), 0)) }
    val other = HomeViewModel(repository, store, phone = { phoneAsked = true; 14.44 to -60.88 })
    other.followPhone()
    advanceUntilIdle()
    assertFalse(phoneAsked)
    assertEquals(fixed, other.app.value.choices.places.single())
  }

  @Test
  fun `« Utiliser ma position » adds « Ici » once and names it`() = runTest {
    val fixed = FollowedPlace(Place("Paris", 48.8534, 2.3488), emptyList())
    val (vm, _) = model(Choices(listOf(fixed), 0), null)
    assertTrue(vm.addPlace(Place("", 14.44, -60.88, here = true), emptyList()))
    advanceUntilIdle()
    assertEquals(1, vm.app.value.choices.current)
    assertEquals("Ici · Sainte-Anne", vm.app.value.choices.herePlace!!.place.label)
    assertTrue(vm.addPlace(Place("", 14.44, -60.88, here = true), emptyList()))
    assertEquals(2, vm.app.value.choices.places.size)
  }
}
