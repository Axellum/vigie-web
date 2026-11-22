package fr.auxfilsdesidees.vigie.data

import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Test

class OfflineCopiesTest {
  private class Memory : Shelf {
    val files = mutableMapOf<String, String>()

    override fun read(name: String) = files[name]

    override fun write(name: String, text: String) {
      files[name] = text
    }

    override fun delete(name: String) {
      files.remove(name)
    }

    override fun names() = files.keys.toList()
  }

  private fun fixture(name: String): String =
    requireNotNull(javaClass.classLoader?.getResource(name)) { "fixture $name" }.readText()

  /** The API of the fixtures: the point, the warnings, the overview and the favourite's hours. */
  private val online: suspend (String) -> String = { url ->
    when {
      "/v1/point" in url -> fixture("point_lorient.json")
      "/v1/vigilances" in url -> fixture("vigilances_ajaccio.json")
      "/v1/activities/overview" in url -> fixture("overview_three_spots.json")
      else -> fixture("activities_plouharnel.json")
    }
  }

  private val offline: suspend (String) -> String = { throw IOException("no network") }

  @Test
  fun `a good read is kept on the phone and comes back the same without network`() = runTest {
    val shelf = Memory()
    val read = VigieRepository(baseUrl = "https://example.test", copies = OfflineCopies(shelf), fetch = online).load(LORIENT, SPOTS)
    assertEquals(listOf("47.7500_-3.3700"), shelf.names())

    val repo = VigieRepository(baseUrl = "https://example.test", copies = OfflineCopies(shelf), fetch = offline)
    assertEquals(read, repo.saved(LORIENT, SPOTS))
    try {
      repo.load(LORIENT, SPOTS)
      fail("a read without network fails")
    } catch (err: IOException) {
      // the screen then keeps the copy, with its time
    }
    assertEquals(read, repo.saved(LORIENT, SPOTS))
  }

  @Test
  fun `an unreadable point or one without the server's time keeps the last good copy`() = runTest {
    val shelf = Memory()
    val read = VigieRepository(baseUrl = "https://example.test", copies = OfflineCopies(shelf), fetch = online).load(LORIENT, SPOTS)
    var point = "{"
    val broken = VigieRepository(baseUrl = "https://example.test", copies = OfflineCopies(shelf)) { url ->
      if ("/v1/point" in url) point else online(url)
    }
    try {
      broken.load(LORIENT, SPOTS)
      fail("an unreadable point fails the read")
    } catch (err: IllegalArgumentException) {
      // nothing kept from it
    }
    assertEquals(read, broken.saved(LORIENT, SPOTS))

    point = "{}"
    assertEquals(0L, broken.load(LORIENT, SPOTS).point.serverUtc)
    assertEquals(read, broken.saved(LORIENT, SPOTS))
  }

  @Test
  fun `the copy keeps only the followed spots and follows the spots chosen since`() = runTest {
    val shelf = Memory()
    val copies = OfflineCopies(shelf)
    val read = VigieRepository(baseUrl = "https://example.test", copies = copies, fetch = online).load(LORIENT, SPOTS)
    val kept = Json.parseToJsonElement(copies.read(LORIENT)!!.overview!!).jsonObject["spots"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }
    assertEquals(read.spots.map { it.id }.toSet(), kept.toSet())
    assertFalse(shelf.files.values.single().contains("trevou-treguignec-plage-de-trestel"))

    // Another spot starred since: its hours were never read, the old favourite's are not shown in its place.
    val repo = VigieRepository(baseUrl = "https://example.test", copies = copies, fetch = offline)
    val others = SPOTS.drop(1)
    val saved = repo.saved(LORIENT, others)
    assertNotNull(saved)
    assertNull(saved!!.favourite)
    assertEquals(read.spots.filter { it.id in others }, saved.spots)
    assertEquals(read.point, saved.point)
  }

  @Test
  fun `a place no longer followed loses its copy`() = runTest {
    val shelf = Memory()
    val copies = OfflineCopies(shelf)
    val repo = VigieRepository(baseUrl = "https://example.test", copies = copies, fetch = online)
    repo.load(LORIENT, SPOTS)
    repo.load(AJACCIO, emptyList())
    assertEquals(2, shelf.names().size)

    repo.forget(LORIENT)
    assertNull(repo.saved(LORIENT, SPOTS))
    assertNotNull(repo.saved(AJACCIO, emptyList()))

    repo.load(LORIENT, SPOTS)
    repo.keepOnly(listOf(LORIENT))
    assertEquals(listOf("47.7500_-3.3700"), shelf.names())
  }

  @Test
  fun `an unreadable copy or one of another version reads as none`() = runTest {
    val shelf = Memory()
    val copies = OfflineCopies(shelf)
    val name = OfflineCopies.nameOf(LORIENT)
    shelf.write(name, "{")
    assertNull(copies.read(LORIENT))
    shelf.write(name, """{"version": 2, "point": "{}"}""")
    assertNull(copies.read(LORIENT))
    shelf.write(name, """{"version": 1, "point": "not json"}""")
    assertNull(VigieRepository(copies = copies, fetch = offline).saved(LORIENT, SPOTS))
  }

  @Test
  fun `without a shelf nothing is kept and nothing comes back`() = runTest {
    val repo = VigieRepository(baseUrl = "https://example.test", fetch = online)
    repo.load(LORIENT, SPOTS)
    assertNull(repo.saved(LORIENT, SPOTS))
  }

  private companion object {
    val LORIENT = Place("Lorient", 47.75, -3.37)
    val AJACCIO = Place("Ajaccio", 41.9192, 8.7386)
    val SPOTS = listOf("plouharnel-la-grande-plage", "le-pouldu-plage-du-kerou", "portivy-plage-de-l-isthme", "beuzec-plage-de-la-torche")
  }
}
