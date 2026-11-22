package fr.auxfilsdesidees.vigie.data

import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext

/**
 * Reads the public Vigie API. One refresh of a place = up to three requests, run together: the place, the activity
 * verdicts of its followed spots, and the hours of its favourite spot (the first one). The favourite's hours are a bonus:
 * when they fail, the rest still shows. A place without spots asks the point only.
 *
 * The place search is the site's (`/data/places.json`, GeoNames): the API has no geocoding of its own. [siteUrl] stays the
 * public site when a debug build reads a local API (an API alone does not serve the search).
 */
class VigieRepository(
  private val baseUrl: String = BASE_URL,
  private val siteUrl: String = BASE_URL,
  private val clock: () -> Long = System::currentTimeMillis,
  private val fetch: suspend (String) -> String = ::httpGet,
) {
  // The overview is the same for every place: one read serves the refresh and the spot choices for a few minutes.
  @Volatile private var overviewCache: Pair<Long, String>? = null

  suspend fun load(place: Place, spotIds: List<String>): Snapshot = coroutineScope {
    val q = String.format(Locale.ROOT, "lat=%.4f&lon=%.4f", place.lat, place.lon)
    val point = async { VigieParser.point(fetch("$baseUrl/v1/point?$q&compact=false")) }
    val overview = async { if (spotIds.isEmpty()) emptyList<Spot>() to false else VigieParser.overview(overviewText(fresh = true), spotIds) }
    val favourite =
      async {
        val id = spotIds.firstOrNull() ?: return@async null
        try {
          VigieParser.spotHours(fetch("$baseUrl/v1/activities/$id?days=3"))
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          null
        }
      }
    val (spots, stale) = overview.await()
    Snapshot(place = place, point = point.await(), spots = spots, spotsStale = stale, favourite = favourite.await())
  }

  /** Every spot with coordinates, to offer the nearest ones of a place. */
  suspend fun catalogue(): List<CatalogueSpot> = VigieParser.catalogue(overviewText(fresh = false))

  /**
   * The site's place search: at least two letters, else nothing is asked. France first, the site's order kept otherwise:
   * the site ranks by population among equal matches, so « Brest » gave Brest in Belarus before Brest in Brittany.
   */
  suspend fun searchPlaces(query: String): Pair<List<PlaceHit>, String?> {
    val q = query.trim()
    if (q.length < 2) return emptyList<PlaceHit>() to null
    val (hits, credit) = VigieParser.places(fetch("$siteUrl/data/places.json?q=${URLEncoder.encode(q, "UTF-8")}"))
    return hits.sortedBy { if (it.country == "FR") 0 else 1 } to credit
  }

  private suspend fun overviewText(fresh: Boolean): String {
    val cached = overviewCache
    if (!fresh && cached != null && clock() - cached.first < OVERVIEW_TTL_MS) return cached.second
    return fetch("$baseUrl/v1/activities/overview").also { overviewCache = clock() to it }
  }

  companion object {
    const val BASE_URL = "https://vigie.auxfilsdesidees.fr"
    private const val OVERVIEW_TTL_MS = 10 * 60_000L

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
