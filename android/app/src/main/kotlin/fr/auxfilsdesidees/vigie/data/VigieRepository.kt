package fr.auxfilsdesidees.vigie.data

import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext

/** Reads the public Vigie API. One refresh = two requests, run together: the place, and the activity verdicts. */
class VigieRepository(
  private val baseUrl: String = BASE_URL,
  private val fetch: suspend (String) -> String = ::httpGet,
) {
  suspend fun load(place: Place = DEFAULT_PLACE, spotIds: List<String> = DEFAULT_SPOTS): Snapshot = coroutineScope {
    val q = String.format(Locale.ROOT, "lat=%.4f&lon=%.4f", place.lat, place.lon)
    val point = async { VigieParser.point(fetch("$baseUrl/v1/point?$q&compact=false")) }
    val overview = async { VigieParser.overview(fetch("$baseUrl/v1/activities/overview"), spotIds) }
    val (spots, stale) = overview.await()
    Snapshot(place = place, point = point.await(), spots = spots, spotsStale = stale)
  }

  companion object {
    const val BASE_URL = "https://vigie.auxfilsdesidees.fr"

    // Until the user can choose: the town and the four spots of the clickable prototype (public places).
    val DEFAULT_PLACE = Place("Lorient", 47.75, -3.37)
    val DEFAULT_SPOTS =
      listOf(
        "plouharnel-la-grande-plage",
        "le-pouldu-plage-du-kerou",
        "portivy-plage-de-l-isthme",
        "beuzec-plage-de-la-torche",
      )

    private const val USER_AGENT = "vigie-android (+https://github.com/Axellum/vigie-web)"

    suspend fun httpGet(url: String): String =
      withContext(Dispatchers.IO) {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
          c.connectTimeout = 15_000
          c.readTimeout = 30_000
          c.setRequestProperty("User-Agent", USER_AGENT)
          c.setRequestProperty("Accept", "application/json")
          val code = c.responseCode
          if (code !in 200..299) throw ApiException(code)
          c.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
        } finally {
          c.disconnect()
        }
      }
  }
}

class ApiException(val status: Int) : Exception("HTTP $status")
