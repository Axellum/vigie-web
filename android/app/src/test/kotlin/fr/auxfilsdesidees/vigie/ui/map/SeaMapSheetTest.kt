package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.BeachReader
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PointGate
import fr.auxfilsdesidees.vigie.data.SeaMapReader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** The sheet of the sea map: what it reads, and how often, on a clock the test moves by hand. */
@OptIn(ExperimentalCoroutinesApi::class)
class SeaMapSheetTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  @Before
  fun main() {
    Dispatchers.setMain(UnconfinedTestDispatcher())
  }

  @After
  fun reset() {
    Dispatchers.resetMain()
  }

  @Test
  fun `a town's sheet reads its weather once in ten minutes, and again when asked`() = runTest {
    val asked = mutableListOf<String>()
    var now = 0L
    var fails = false
    val fetch: suspend (String) -> String = { url ->
      asked += url
      if (fails) throw java.io.IOException("offline")
      fixture("point_lorient.json")
    }
    val gate = PointGate(clock = { now })
    val vm =
      SeaMapViewModel(SeaMapReader("https://api.test", "https://site.test", gate, fetch = fetch), { emptyList() }, BeachReader("https://api.test", fetch = gate.gated(fetch)), clock = { now }, work = UnconfinedTestDispatcher(testScheduler))
    val town = Place("Capbreton", 43.642, -1.428)
    vm.open(SeaMapViewModel.Sheet.Town(town))
    advanceUntilIdle()
    assertEquals(SeaMapViewModel.Sheet.Town(town), vm.sheet.value)
    assertNotNull(vm.towns.value[town.pointKey]?.point)
    // Closed and opened again within ten minutes: nothing more is read.
    vm.close()
    assertNull(vm.sheet.value)
    now = SeaMapViewModel.FRESH_MS - 1
    vm.open(SeaMapViewModel.Sheet.Town(town))
    advanceUntilIdle()
    assertEquals(1, asked.size)
    // Ten minutes later, read again; a read that fails keeps the weather read before.
    now = SeaMapViewModel.FRESH_MS
    fails = true
    vm.open(SeaMapViewModel.Sheet.Town(town))
    advanceUntilIdle()
    assertEquals(2, asked.size)
    val state = vm.towns.value.getValue(town.pointKey)
    assertTrue(state.failed)
    assertNotNull(state.point)
    // « Réessayer » reads it whatever its age.
    fails = false
    vm.retry()
    advanceUntilIdle()
    assertEquals(3, asked.size)
    assertEquals(false, vm.towns.value.getValue(town.pointKey).failed)
    assertTrue(asked.all { it.startsWith("https://api.test/v1/point?lat=43.6420&lon=-1.4280") })
  }

  @Test
  fun `a search typed before the spots are read is run again with them, and a spot found opens its sheet`() = runTest {
    val reader =
      SeaMapReader("https://api.test", "https://site.test") { url ->
        when {
          url.endsWith("/data/basemap/dark.json") -> fixture("basemap_dark.json")
          url.endsWith("/v1/activities/overview") -> fixture("overview_three_spots.json")
          else -> fixture("surf_overview_three_spots.json")
        }
      }
    val vm = SeaMapViewModel(reader, { emptyList() }, work = UnconfinedTestDispatcher(testScheduler))
    vm.search("plouharnel")
    advanceUntilIdle()
    assertEquals(emptyList<SeaMapViewModel.Hit>(), vm.search.value.hits)
    vm.load()
    advanceUntilIdle()
    val hit = vm.search.value.hits.single()
    assertEquals("La Grande Plage", hit.name)
    assertEquals("plouharnel-la-grande-plage", hit.id)
    assertEquals("Plouharnel", vm.spot(hit.id!!)?.place)
  }
}
