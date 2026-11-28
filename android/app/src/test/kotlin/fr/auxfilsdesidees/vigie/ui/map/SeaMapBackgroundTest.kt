package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.MapBackground
import fr.auxfilsdesidees.vigie.data.SeaMap
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
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/** The background of the sea map: chosen, kept on the phone, read once, and the dark plan when the IGN cannot be read. */
@OptIn(ExperimentalCoroutinesApi::class)
class SeaMapBackgroundTest {
  private fun fixture(name: String): String = requireNotNull(javaClass.classLoader?.getResource(name)) { "missing fixture $name" }.readText()

  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String): String? = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  /** A style of the IGN's plan with one locality layer, to tell it from the others. */
  private val plan = """{"version":8,"sources":{},"layers":[{"id":"toponyme localite importance 3","type":"symbol","source-layer":"toponyme_localite_ponc"}]}"""

  @Before
  fun main() {
    Dispatchers.setMain(UnconfinedTestDispatcher())
  }

  @After
  fun reset() {
    Dispatchers.resetMain()
  }

  private fun reader(asked: MutableList<String>, ignFails: () -> Boolean = { false }) =
    SeaMapReader("https://api.test", "https://site.test") { url ->
      asked += url
      when {
        url == SeaMap.PLAN_IGN_STYLE -> if (ignFails()) throw java.io.IOException("offline") else plan
        url.endsWith("/data/basemap/dark.json") -> fixture("basemap_dark.json")
        url.endsWith("/v1/activities/overview") -> fixture("overview_three_spots.json")
        else -> fixture("surf_overview_three_spots.json")
      }
    }

  @Test
  fun `a background chosen is shown with its towns, kept on the phone, and each style is read once`() = runTest {
    val asked = mutableListOf<String>()
    val kept = Memory()
    val vm = SeaMapViewModel(reader(asked), { emptyList() }, work = UnconfinedTestDispatcher(testScheduler), kept = kept)
    vm.load()
    advanceUntilIdle()
    val dark = vm.ui.value.style
    assertEquals(MapBackground.Dark, vm.ui.value.background)

    vm.chooseBackground(MapBackground.PlanIgn)
    advanceUntilIdle()
    assertEquals(plan, vm.ui.value.style)
    assertEquals(MapBackground.PlanIgn, vm.ui.value.background)
    assertEquals(listOf("toponyme localite importance 3"), vm.ui.value.townLayers)
    assertEquals("plan-ign", kept.map[SeaMapViewModel.BACKGROUND_KEY])

    vm.chooseBackground(MapBackground.PhotoIgn)
    advanceUntilIdle()
    assertEquals(SeaMap.styleWithPhotos(dark!!), vm.ui.value.style)
    assertEquals(MapBackground.PhotoIgn, vm.ui.value.chosen)

    // Back and forth: nothing is read again.
    vm.chooseBackground(MapBackground.PlanIgn)
    vm.chooseBackground(MapBackground.Dark)
    advanceUntilIdle()
    assertEquals(dark, vm.ui.value.style)
    assertEquals(1, asked.count { it == SeaMap.PLAN_IGN_STYLE })
    assertEquals(1, asked.count { it.endsWith("/data/basemap/dark.json") })
    assertEquals("dark", kept.map[SeaMapViewModel.BACKGROUND_KEY])
  }

  @Test
  fun `the map opens on the background kept, and on the dark plan when the IGN cannot be read`() = runTest {
    val asked = mutableListOf<String>()
    val kept = Memory().apply { map[SeaMapViewModel.BACKGROUND_KEY] = "plan-ign" }
    var fails = true
    val vm = SeaMapViewModel(reader(asked) { fails }, { emptyList() }, work = UnconfinedTestDispatcher(testScheduler), kept = kept)
    assertEquals(MapBackground.PlanIgn, vm.ui.value.background)
    vm.load()
    advanceUntilIdle()
    // The IGN failing: the dark plan, said so; the choice stays on the phone for the next opening.
    assertEquals(MapBackground.Dark, vm.ui.value.background)
    assertEquals(MapBackground.Dark, vm.ui.value.chosen)
    assertEquals(MapBackground.PlanIgn, vm.ui.value.backgroundFailed)
    assertEquals(SeaMap.styleForApp(fixture("basemap_dark.json")), vm.ui.value.style)
    assertFalse(vm.ui.value.failed)
    assertEquals("plan-ign", kept.map[SeaMapViewModel.BACKGROUND_KEY])

    // Chosen again once the IGN answers.
    fails = false
    vm.chooseBackground(MapBackground.PlanIgn)
    advanceUntilIdle()
    assertEquals(MapBackground.PlanIgn, vm.ui.value.background)
    assertNull(vm.ui.value.backgroundFailed)
    assertFalse(vm.ui.value.backgroundBusy)
  }
}
