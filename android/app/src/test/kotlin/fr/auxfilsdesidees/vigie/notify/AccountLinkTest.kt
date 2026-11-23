package fr.auxfilsdesidees.vigie.notify

import fr.auxfilsdesidees.vigie.data.KeyValue
import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/** The app linked to an account by a code: what the server is asked, what the phone keeps, when it is unlinked. */
class AccountLinkTest {
  private class Memory : KeyValue {
    val map = mutableMapOf<String, String>()

    override fun read(key: String) = map[key]

    override fun write(key: String, value: String) {
      map[key] = value
    }
  }

  /** The site's server for one phone and one account. */
  private class Site {
    val calls = mutableListOf<String>()
    var code: String? = null
    var wait: String? = null
    var entered = false
    var expired = false
    var secret: String? = null
    var token: String? = null
    var down = false
    var account = """{"name":"Mon compte","quietHours":true,"zones":[{"name":"Lorient","minLevel":"ORANGE"},{"name":"Corte","minLevel":"RED"}]}"""
    private var made = 0

    suspend fun send(method: String, url: String, secret: String?, body: String?): Answer {
      if (down) throw IOException("no network")
      val path = url.removePrefix(SITE)
      calls += "$method $path"
      val o = body?.let { Json.parseToJsonElement(it) as JsonObject }
      return when {
        method == "POST" && path == "/account/app/link" -> {
          made++
          code = "ABCD-EFG$made"
          wait = "wait-$made"
          token = o!!["token"]!!.jsonPrimitive.content
          Answer(201, """{"code":"$code","wait":"$wait","expiresAt":1800000000}""")
        }
        method == "POST" && path == "/account/app/link/poll" -> {
          val mine = o!!["wait"]!!.jsonPrimitive.content == wait && o["code"]!!.jsonPrimitive.content == code
          when {
            !mine || expired -> Answer(200, """{"status":"expired"}""")
            entered -> {
              this.secret = "secret-$made"
              code = null
              Answer(200, """{"status":"ready","secret":"secret-$made"}""")
            }
            else -> Answer(200, """{"status":"pending"}""")
          }
        }
        secret == null || secret != this.secret -> Answer(401, """{"message":"Unknown phone"}""")
        method == "GET" && path == "/account/app/account" -> Answer(200, account)
        method == "PUT" && path == "/account/app/account" -> {
          token = o!!["token"]!!.jsonPrimitive.content
          Answer(200, """{"ok":true}""")
        }
        method == "DELETE" && path == "/account/app/account" -> {
          this.secret = null
          Answer(200, """{"ok":true}""")
        }
        method == "POST" && path == "/account/app/account/test" -> Answer(200, """{"sent":1,"failed":0}""")
        else -> Answer(404, "")
      }
    }
  }

  private fun linking(prefs: KeyValue, site: Site, token: () -> String = { "token-1" }) =
    AccountLinking(prefs, AccountServer("$SITE/", site::send)) { token() }

  /** A phone linked to [site]'s account, its calls forgotten. */
  private suspend fun linked(prefs: Memory, site: Site) {
    linking(prefs, site).begin()
    site.entered = true
    linking(prefs, site).poll()
    site.calls.clear()
  }

  @Test
  fun `a code is asked with the token and shown, then the secret comes once it is entered`() = runTest {
    val prefs = Memory()
    val site = Site()
    assertEquals(AccountState.Unlinked, linking(prefs, site).state())

    val shown = linking(prefs, site).begin() as AccountState.Waiting
    assertEquals("ABCD-EFG1", shown.link.code)
    assertEquals(1_800_000_000_000, shown.link.expiresAt)
    assertEquals("token-1", site.token)
    // The page closes and opens again: the code is still there.
    assertEquals(shown, linking(prefs, site).state())
    assertEquals(shown, linking(prefs, site).poll())

    site.entered = true
    val now = linking(prefs, site).poll() as AccountState.Linked
    val account = now.account!!
    assertEquals("Mon compte", account.name)
    assertTrue(account.quietHours)
    assertEquals(listOf(AccountZone("Lorient", "ORANGE"), AccountZone("Corte", "RED")), account.zones)
    assertEquals(
      listOf("POST /account/app/link", "POST /account/app/link/poll", "POST /account/app/link/poll", "GET /account/app/account"),
      site.calls,
    )
    assertEquals("secret-1", prefs.map[AccountLinking.KEY_SECRET])
    assertEquals("", prefs.map[AccountLinking.KEY_CODE])
    // Offline, the page shows the last account read.
    assertEquals(now, linking(prefs, site).state())
  }

  @Test
  fun `an expired code is forgotten, and a code dropped here asks nothing more`() = runTest {
    val prefs = Memory()
    val site = Site()
    linking(prefs, site).begin()
    site.expired = true
    assertEquals(AccountState.Unlinked, linking(prefs, site).poll())
    assertEquals(AccountState.Unlinked, linking(prefs, site).state())

    linking(prefs, site).begin()
    linking(prefs, site).cancel()
    site.calls.clear()
    assertEquals(AccountState.Unlinked, linking(prefs, site).poll())
    assertTrue(site.calls.isEmpty())
  }

  @Test
  fun `a new token is given before the account is read, once`() = runTest {
    val prefs = Memory()
    val site = Site()
    linked(prefs, site)
    assertEquals("token-1", site.token)
    linking(prefs, site) { "token-2" }.refresh()
    assertEquals(listOf("PUT /account/app/account", "GET /account/app/account"), site.calls)
    assertEquals("token-2", site.token)
    site.calls.clear()
    linking(prefs, site) { "token-2" }.refresh()
    assertEquals(listOf("GET /account/app/account"), site.calls)
  }

  @Test
  fun `a phone removed on the account page is unlinked here at the next read`() = runTest {
    val prefs = Memory()
    val site = Site()
    linked(prefs, site)
    site.account = """{"name":"Mon compte","quietHours":false,"zones":[]}"""
    val read = linking(prefs, site).refresh() as AccountState.Linked
    assertTrue(read.account!!.zones.isEmpty())

    site.secret = null
    assertEquals(AccountState.Unlinked, linking(prefs, site).refresh())
    assertNull(linking(prefs, site).secret)
    assertEquals("", prefs.map[AccountLinking.KEY_ACCOUNT])
  }

  @Test
  fun `unlinking tells the server first, and the phone stays linked when it cannot`() = runTest {
    val prefs = Memory()
    val site = Site()
    linked(prefs, site)
    site.down = true
    try {
      linking(prefs, site).unlink()
      fail("Unlinking without the server must fail")
    } catch (err: IOException) {
      // Said on the page; the secret stays.
    }
    assertTrue(linking(prefs, site).state() is AccountState.Linked)

    site.down = false
    assertEquals(AccountState.Unlinked, linking(prefs, site).unlink())
    assertEquals(listOf("DELETE /account/app/account"), site.calls)
    assertNull(site.secret)
  }

  @Test
  fun `a test goes through the secret, and a phone the server forgot is unlinked`() = runTest {
    val prefs = Memory()
    val site = Site()
    assertNull(linking(prefs, site).test())
    assertTrue(site.calls.isEmpty())
    linked(prefs, site)
    assertEquals(1, linking(prefs, site).test())
    assertEquals("POST /account/app/account/test", site.calls.last())
    site.secret = null
    assertNull(linking(prefs, site).test())
    assertEquals(AccountState.Unlinked, linking(prefs, site).state())
  }

  @Test
  fun `the account is read from what the server answers, nothing else`() {
    val account = AccountServer.parseAccount("""{"name":"A","zones":[{"name":"Z"},{"minLevel":"RED"},3]}""")!!
    assertEquals("A", account.name)
    assertEquals(false, account.quietHours)
    assertEquals(listOf(AccountZone("Z", "YELLOW")), account.zones)
    assertNull(AccountServer.parseAccount("""{"zones":[]}"""))
    assertNull(AccountServer.parseAccount("<html>"))
    assertNull(AccountServer.parseAccount("[]"))
  }

  private companion object {
    const val SITE = "https://vigie.example"
  }
}
