package fr.auxfilsdesidees.vigie.notify

import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.KeyValue
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/*
 * The app linked to an account of the site by a code (`/account/app/link`, `src/lib/server/appLinks.ts` of the site):
 * the screens' pairing the other way round. The app asks a code with its Firebase token and shows it; the person enters
 * it on the account page (part Notifications) and the phone becomes one of the account's devices, which gets the alerts
 * of the account's zones. The app then picks up a secret of its own, once, to read the account's name and zones, give
 * a new token, send a test and unlink itself.
 */

/** A code the app shows until it is entered on the account page or [expiresAt] (milliseconds) passes. */
data class LinkCode(val code: String, val wait: String, val expiresAt: Long)

/** A zone of the account: its name and the lowest level it warns for (`YELLOW`, `ORANGE`, `RED`). */
data class AccountZone(val name: String, val minLevel: String)

/** What the app shows of the account it is linked to; [quietHours]: from 22:00 to 07:00, red alerts only. */
data class LinkedAccount(val name: String, val quietHours: Boolean, val zones: List<AccountZone>)

/** Where a code stands on the server. */
sealed interface LinkPoll {
  data object Pending : LinkPoll

  /** Expired or unknown: the app may ask a new one. */
  data object Expired : LinkPoll

  data class Ready(val secret: String) : LinkPoll
}

/** The site's server for the link; [send] is the network ([BellServer.http]), replaced in the tests. */
class AccountServer(
  siteUrl: String,
  private val send: suspend (method: String, url: String, secret: String?, body: String?) -> Answer = BellServer::http,
) {
  private val base = "${siteUrl.trimEnd('/')}/account/app"

  /** A new code for this phone's token; a code it asked before is dropped. */
  suspend fun start(token: String): LinkCode {
    val answer = check(send("POST", "$base/link", null, buildJsonObject { put("token", token) }.toString()))
    val o = parse(answer.body)
    val code = o?.text("code")
    val wait = o?.text("wait")
    val expires = o?.get("expiresAt")?.jsonPrimitive?.longOrNull
    if (code == null || wait == null || expires == null) throw ApiException(answer.status)
    return LinkCode(code, wait, expires * 1000)
  }

  suspend fun poll(link: LinkCode): LinkPoll {
    val body = buildJsonObject {
        put("wait", link.wait)
        put("code", link.code)
      }
      .toString()
    val o = parse(check(send("POST", "$base/link/poll", null, body)).body)
    return when (o?.text("status")) {
      "pending" -> LinkPoll.Pending
      "ready" -> o.text("secret")?.let { LinkPoll.Ready(it) } ?: LinkPoll.Expired
      else -> LinkPoll.Expired
    }
  }

  /** The account and its raw answer (kept to show it offline); null when the server no longer knows the secret. */
  suspend fun account(secret: String): Pair<LinkedAccount, String>? {
    val answer = send("GET", "$base/account", secret, null)
    if (answer.status == 401) return null
    check(answer)
    val account = parseAccount(answer.body) ?: throw ApiException(answer.status)
    return account to answer.body
  }

  /** A new Firebase token; false when the server no longer knows the secret. */
  suspend fun setToken(secret: String, token: String): Boolean {
    val answer = send("PUT", "$base/account", secret, buildJsonObject { put("token", token) }.toString())
    if (answer.status == 401) return false
    check(answer)
    return true
  }

  /** The phone is no longer a device of the account; a secret the server no longer knows is already unlinked. */
  suspend fun unlink(secret: String) {
    val answer = send("DELETE", "$base/account", secret, null)
    if (answer.status != 401) check(answer)
  }

  /** A test notification: how many were sent (0 or 1); null when the server no longer knows the secret. */
  suspend fun test(secret: String): Int? {
    val answer = send("POST", "$base/account/test", secret, "{}")
    if (answer.status == 401) return null
    return parse(check(answer).body)?.text("sent")?.toIntOrNull() ?: 0
  }

  private fun check(answer: Answer): Answer = if (answer.status in 200..299) answer else throw ApiException(answer.status)

  companion object {
    private fun parse(body: String): JsonObject? = runCatching { Json.parseToJsonElement(body) as? JsonObject }.getOrNull()

    private fun JsonObject.text(key: String): String? = (get(key) as? JsonPrimitive)?.contentOrNull

    /** `{name, quietHours, zones: [{name, minLevel}]}`; null when it is not that. */
    fun parseAccount(body: String): LinkedAccount? {
      val o = parse(body) ?: return null
      val name = o.text("name") ?: return null
      val zones =
        (o["zones"] as? JsonArray).orEmpty().mapNotNull { z ->
          val zone = z as? JsonObject ?: return@mapNotNull null
          val zoneName = zone.text("name") ?: return@mapNotNull null
          AccountZone(zoneName, zone.text("minLevel") ?: "YELLOW")
        }
      val quiet = (o["quietHours"] as? JsonPrimitive)?.booleanOrNull ?: false
      return LinkedAccount(name, quiet, zones)
    }
  }
}

/** What the phone knows of its link. */
sealed interface AccountState {
  data object Unlinked : AccountState

  /** A code is shown, waiting to be entered on the account page. */
  data class Waiting(val link: LinkCode) : AccountState

  /** Linked; [account] is the last one read (null before the first read). */
  data class Linked(val account: LinkedAccount?) : AccountState
}

/**
 * The link over the app's private preferences ([prefs]): the code being shown, then the secret and the last account
 * read. [token] gives the Firebase token, asked only when a code is asked or the account is read again.
 */
class AccountLinking(private val prefs: KeyValue, private val server: AccountServer, private val token: suspend () -> String) {
  val secret: String?
    get() = prefs.read(KEY_SECRET)?.takeIf { it.isNotEmpty() }

  /** What the phone knows, without asking the server. */
  fun state(): AccountState {
    if (secret != null) return AccountState.Linked(prefs.read(KEY_ACCOUNT)?.let(AccountServer::parseAccount))
    return shown()?.let { AccountState.Waiting(it) } ?: AccountState.Unlinked
  }

  private fun shown(): LinkCode? {
    val code = prefs.read(KEY_CODE)?.takeIf { it.isNotEmpty() } ?: return null
    val wait = prefs.read(KEY_WAIT)?.takeIf { it.isNotEmpty() } ?: return null
    val expires = prefs.read(KEY_EXPIRES)?.toLongOrNull() ?: return null
    return LinkCode(code, wait, expires)
  }

  /** A new code to show. */
  suspend fun begin(): AccountState {
    val current = token()
    val link = server.start(current)
    prefs.write(KEY_CODE, link.code)
    prefs.write(KEY_WAIT, link.wait)
    prefs.write(KEY_EXPIRES, link.expiresAt.toString())
    prefs.write(KEY_TOKEN, current)
    return AccountState.Waiting(link)
  }

  /** Asks the server where the shown code stands: linked once entered (the secret is kept), unlinked once expired. */
  suspend fun poll(): AccountState {
    val link = shown() ?: return state()
    return when (val answer = server.poll(link)) {
      LinkPoll.Pending -> AccountState.Waiting(link)
      LinkPoll.Expired -> {
        forgetCode()
        AccountState.Unlinked
      }
      is LinkPoll.Ready -> {
        prefs.write(KEY_SECRET, answer.secret)
        forgetCode()
        refresh()
      }
    }
  }

  /** The code shown is dropped here; the server forgets it once it expires. */
  fun cancel() = forgetCode()

  /**
   * Reads the account again, and gives the server the phone's token when Firebase changed it. Unlinked when the server
   * no longer knows the secret (the phone was removed on the account page, or the account deleted).
   */
  suspend fun refresh(): AccountState {
    val known = secret ?: return state()
    val current = token()
    if (current != prefs.read(KEY_TOKEN)) {
      if (!server.setToken(known, current)) return forget()
      prefs.write(KEY_TOKEN, current)
    }
    val (account, raw) = server.account(known) ?: return forget()
    prefs.write(KEY_ACCOUNT, raw)
    return AccountState.Linked(account)
  }

  /** Unlinks the phone on the server first: if the server cannot be told, the phone stays linked. */
  suspend fun unlink(): AccountState {
    secret?.let { server.unlink(it) }
    return forget()
  }

  /** A test notification; null when the server no longer knows the phone (it is then unlinked here too). */
  suspend fun test(): Int? {
    val known = secret ?: return null
    return server.test(known).also { if (it == null) forget() }
  }

  private fun forgetCode() {
    prefs.write(KEY_CODE, "")
    prefs.write(KEY_WAIT, "")
    prefs.write(KEY_EXPIRES, "")
  }

  private fun forget(): AccountState {
    prefs.write(KEY_SECRET, "")
    prefs.write(KEY_ACCOUNT, "")
    prefs.write(KEY_TOKEN, "")
    return AccountState.Unlinked
  }

  companion object {
    const val KEY_SECRET = "account_secret"
    const val KEY_ACCOUNT = "account_last"
    const val KEY_TOKEN = "account_token"
    const val KEY_CODE = "account_code"
    const val KEY_WAIT = "account_wait"
    const val KEY_EXPIRES = "account_expires"
  }
}
