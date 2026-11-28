package fr.auxfilsdesidees.vigie.notify

import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.data.KeyValue
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.roundToLong
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * The bells of the places, without an account: the server of the site keeps this phone's places that have a bell and
 * sends it the alerts that fall in them (`/account/app/device`, `src/lib/server/appDevices.ts` of the site). The phone
 * registers once with its Firebase token and keeps the secret it is given; each change sends every place with a bell,
 * and no bell at all makes the server forget the phone.
 */
object Bells {
  /** What the server is sent: the token, the language, the time zone and the places with a bell. */
  fun body(token: String, timeZone: String?, choices: Choices): String =
    buildJsonObject {
        put("token", token)
        put("lang", "fr")
        timeZone?.let { put("timeZone", it) }
        put(
          "places",
          buildJsonArray {
            choices.belled.forEach { f ->
              add(
                buildJsonObject {
                  // The server keeps 60 characters of a name and two decimals of a point (about 1 km).
                  put("name", f.place.name.ifBlank { f.place.label }.take(60))
                  put("lat", f.place.lat)
                  put("lon", f.place.lon)
                  put("radiusKm", RADIUS_KM)
                  put("minLevel", f.bell!!.name)
                }
              )
            }
          },
        )
      }
      .toString()

  /**
   * The followed place a notification names (`place` of its data: the point the server keeps, `lat,lon` to two
   * decimals): the place with a bell at that point first, else any place there; null when none is.
   */
  fun placeOf(choices: Choices, point: String?): FollowedPlace? {
    val parts = point?.split(',')?.mapNotNull { it.trim().toDoubleOrNull() } ?: return null
    if (parts.size != 2) return null
    val (lat, lon) = parts
    val here = choices.places.filter { abs(round2(it.place.lat) - lat) < 1e-6 && abs(round2(it.place.lon) - lon) < 1e-6 }
    return here.firstOrNull { it.bell != null } ?: here.firstOrNull()
  }

  private fun round2(v: Double): Double = (v * 100).roundToLong() / 100.0

  /** The radius of a place's circle: the place and its surroundings (sketch B). */
  const val RADIUS_KM = 10
}

/** One request to the server: its status and its body. */
data class Answer(val status: Int, val body: String)

/** The site's server for the bells; [send] is the network, replaced in the tests. */
class BellServer(
  private val siteUrl: String,
  private val send: suspend (method: String, url: String, secret: String?, body: String?) -> Answer = ::http,
) {
  private val url = "${siteUrl.trimEnd('/')}/account/app/device"

  /** A new device: the secret, shown once. */
  suspend fun register(body: String): String {
    val answer = check(send("POST", url, null, body))
    return (Json.parseToJsonElement(answer.body) as? JsonObject)?.get("secret")?.jsonPrimitive?.contentOrNull
      ?: throw ApiException(answer.status)
  }

  /** The places now; false when the server no longer knows the secret (it forgot the phone: register again). */
  suspend fun update(secret: String, body: String): Boolean {
    val answer = send("PUT", url, secret, body)
    if (answer.status == 401) return false
    check(answer)
    return true
  }

  /** Forget the phone; a secret the server no longer knows is already forgotten. */
  suspend fun remove(secret: String) {
    val answer = send("DELETE", url, secret, null)
    if (answer.status != 401) check(answer)
  }

  /** A test notification: how many were sent (0 or 1); null when the server no longer knows the phone. */
  suspend fun test(secret: String): Int? {
    val answer = send("POST", "$url/test", secret, "{}")
    if (answer.status == 401) return null
    check(answer)
    return (Json.parseToJsonElement(answer.body) as? JsonObject)?.get("sent")?.jsonPrimitive?.contentOrNull?.toIntOrNull() ?: 0
  }

  private fun check(answer: Answer): Answer = if (answer.status in 200..299) answer else throw ApiException(answer.status)

  companion object {
    private const val USER_AGENT = "vigie-android (+https://github.com/Axellum/vigie-web)"

    /** Every request says it sends JSON, even without a body: the site refuses a write without a type. */
    suspend fun http(method: String, url: String, secret: String?, body: String?): Answer =
      withContext(Dispatchers.IO) {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
          c.requestMethod = method
          c.connectTimeout = 15_000
          c.readTimeout = 30_000
          c.setRequestProperty("User-Agent", USER_AGENT)
          c.setRequestProperty("Accept", "application/json")
          c.setRequestProperty("Content-Type", "application/json")
          secret?.let { c.setRequestProperty("Authorization", "Bearer $it") }
          if (body != null) {
            c.doOutput = true
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
          }
          val status = c.responseCode
          val stream = if (status in 200..299) c.inputStream else c.errorStream
          Answer(status, stream?.use { it.readBytes().toString(Charsets.UTF_8) }.orEmpty())
        } finally {
          c.disconnect()
        }
      }
  }
}

/** What the last sync did, for the page of the places. */
sealed interface BellState {
  /** No bell: the server knows nothing of this phone. */
  data object Off : BellState

  /** The server has [count] places of this phone. */
  data class On(val count: Int) : BellState

  /** It could not be told; the app tries again later. */
  data class Failed(val message: String) : BellState
}

/**
 * Tells the server what the bells are now. The secret stays in [prefs] (the app's private preferences); [token] gives
 * the Firebase token, asked only when a bell is on.
 */
class BellSync(private val prefs: KeyValue, private val server: BellServer, private val token: suspend () -> String) {
  val secret: String?
    get() = prefs.read(KEY_SECRET)?.takeIf { it.isNotEmpty() }

  suspend fun sync(choices: Choices, timeZone: String?): BellState {
    val known = secret
    if (choices.belled.isEmpty()) {
      if (known != null) {
        server.remove(known)
        prefs.write(KEY_SECRET, "")
      }
      return BellState.Off
    }
    val body = Bells.body(token(), timeZone, choices)
    if (known == null || !server.update(known, body)) prefs.write(KEY_SECRET, server.register(body))
    return BellState.On(choices.belled.size)
  }

  /** A test notification; null when the phone has no bell (or the server forgot it). */
  suspend fun test(): Int? = secret?.let { server.test(it) }

  companion object {
    const val KEY_SECRET = "bell_secret"
  }
}
