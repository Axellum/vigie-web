package fr.auxfilsdesidees.vigie.notify

import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.Bell
import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.Place
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** The bells of the places: what the server is told, when, and the place a notification names. */
class BellsTest {
  private val lorient = FollowedPlace(Place("Lorient", 47.7486, -3.3704, "Bretagne"), emptyList())
  private val port = FollowedPlace(Place("Lorient, le port", 47.7451, -3.3652), emptyList())
  private val corte = FollowedPlace(Place("Corte", 42.3061, 9.1503), emptyList())

  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String) = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  /** The site's server for one phone: it keeps the last secret it gave and the last places it was sent. */
  private class Site {
    val calls = mutableListOf<String>()
    var secret: String? = null
    var body: String? = null
    var full = false
    private var made = 0

    suspend fun send(method: String, url: String, secret: String?, body: String?): Answer {
      val path = url.removePrefix(SITE)
      calls += "$method $path"
      return when {
        method == "POST" && path == "/account/app/device" -> {
          if (full) return Answer(503, """{"message":"full"}""")
          made++
          this.secret = "secret-$made"
          this.body = body
          Answer(201, """{"secret":"secret-$made"}""")
        }
        secret == null || secret != this.secret -> Answer(401, """{"message":"Unknown device"}""")
        method == "PUT" -> {
          this.body = body
          Answer(200, """{"ok":true}""")
        }
        method == "DELETE" -> {
          this.secret = null
          Answer(200, """{"ok":true}""")
        }
        method == "POST" && path == "/account/app/device/test" -> Answer(200, """{"sent":1,"failed":0}""")
        else -> Answer(404, "")
      }
    }
  }

  private fun sync(prefs: KeyValue, site: Site, tokens: MutableList<String> = mutableListOf()) =
    BellSync(prefs, BellServer("$SITE/", site::send)) { "token-1".also { tokens += it } }

  @Test
  fun `the server is told the places with a bell, their level and a circle of 10 km`() {
    val long = FollowedPlace(Place("L".repeat(80), 42.3, 9.15), emptyList())
    val c = Choices(listOf(lorient, corte, long), 0).bell(1, Bell.RED).bell(2, Bell.YELLOW)
    val body = Json.parseToJsonElement(Bells.body("token-1", "Europe/Paris", c)) as JsonObject
    assertEquals("token-1", body["token"]!!.jsonPrimitive.content)
    assertEquals("fr", body["lang"]!!.jsonPrimitive.content)
    assertEquals("Europe/Paris", body["timeZone"]!!.jsonPrimitive.content)
    val places = body["places"] as JsonArray
    assertEquals(2, places.size)
    val first = places[0] as JsonObject
    assertEquals("Corte", first["name"]!!.jsonPrimitive.content)
    assertEquals("42.3061", first["lat"]!!.jsonPrimitive.content)
    assertEquals("10", first["radiusKm"]!!.jsonPrimitive.content)
    assertEquals("RED", first["minLevel"]!!.jsonPrimitive.content)
    assertEquals(60, (places[1] as JsonObject)["name"]!!.jsonPrimitive.content.length)
  }

  @Test
  fun `a notification's point names the place with a bell there first`() {
    val c = Choices(listOf(port, lorient, corte), 0).bell(1, Bell.ORANGE)
    assertSame(lorient.place, Bells.placeOf(c, "47.75,-3.37")!!.place)
    assertSame(port.place, Bells.placeOf(c.bell(1, null), "47.75,-3.37")!!.place)
    assertSame(corte.place, Bells.placeOf(c, "42.31, 9.15")!!.place)
    assertNull(Bells.placeOf(c, "48.85,2.35"))
    assertNull(Bells.placeOf(c, "47.75"))
    assertNull(Bells.placeOf(c, "nord,ouest"))
    assertNull(Bells.placeOf(c, null))
  }

  @Test
  fun `no bell asks nothing, a first bell registers, a change updates`() = runTest {
    val prefs = Memory()
    val site = Site()
    val tokens = mutableListOf<String>()
    val none = Choices(listOf(lorient, corte), 0)
    assertEquals(BellState.Off, sync(prefs, site, tokens).sync(none, "Europe/Paris"))
    assertTrue(site.calls.isEmpty())
    assertTrue(tokens.isEmpty())

    val one = none.bell(1, Bell.ORANGE)
    assertEquals(BellState.On(1), sync(prefs, site, tokens).sync(one, "Europe/Paris"))
    assertEquals(listOf("POST /account/app/device"), site.calls)
    assertEquals("secret-1", prefs.map[BellSync.KEY_SECRET])

    val two = one.bell(0, Bell.RED)
    assertEquals(BellState.On(2), sync(prefs, site).sync(two, "Europe/Paris"))
    assertEquals("PUT /account/app/device", site.calls.last())
    assertEquals(2, ((Json.parseToJsonElement(site.body!!) as JsonObject)["places"] as JsonArray).size)
  }

  @Test
  fun `a phone the server forgot registers again, and no bell left forgets it`() = runTest {
    val prefs = Memory()
    val site = Site()
    val c = Choices(listOf(lorient), 0).bell(0, Bell.YELLOW)
    sync(prefs, site).sync(c, null)
    site.secret = null // forgotten after 60 days without news
    assertEquals(BellState.On(1), sync(prefs, site).sync(c, null))
    assertEquals(listOf("POST /account/app/device", "PUT /account/app/device", "POST /account/app/device"), site.calls)
    assertEquals("secret-2", prefs.map[BellSync.KEY_SECRET])

    assertEquals(BellState.Off, sync(prefs, site).sync(c.bell(0, null), null))
    assertEquals("DELETE /account/app/device", site.calls.last())
    assertNull(sync(prefs, site).secret)
    assertNull(site.secret)
  }

  @Test
  fun `a test goes to the phone the server knows, none without a secret`() = runTest {
    val prefs = Memory()
    val site = Site()
    assertNull(sync(prefs, site).test())
    assertTrue(site.calls.isEmpty())
    sync(prefs, site).sync(Choices(listOf(corte), 0).bell(0, Bell.RED), null)
    assertEquals(1, sync(prefs, site).test())
    assertEquals("POST /account/app/device/test", site.calls.last())
    site.secret = null
    assertNull(sync(prefs, site).test())
  }

  @Test
  fun `a full server keeps no secret and says why`() = runTest {
    val prefs = Memory()
    val site = Site().apply { full = true }
    try {
      sync(prefs, site).sync(Choices(listOf(corte), 0).bell(0, Bell.ORANGE), null)
      fail("A full server must not register the phone")
    } catch (err: ApiException) {
      assertEquals(503, err.status)
    }
    assertNull(sync(prefs, site).secret)
  }

  private companion object {
    const val SITE = "https://vigie.example"
  }
}
