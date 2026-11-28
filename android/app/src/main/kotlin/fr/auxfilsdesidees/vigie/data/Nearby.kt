package fr.auxfilsdesidees.vigie.data

import java.util.Locale
import kotlin.math.cos
import kotlin.math.sqrt
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put

/*
 * What is around a place, for the fourth tab: the beaches (`/v1/beaches`, « Plages ») and the ski areas (`/v1/ski/areas`,
 * « Pistes »), the avalanche bulletin of an area (`/v1/avalanches`), and the tide and the bathing water of a beach kept
 * (`/v1/tides`, `/v1/sea/places`). The catalogues are OpenStreetMap's and the IGN's, merged by Vigie: a beach listed is not a
 * statement that it is monitored or safe, an area listed not one that it is open.
 */

/** A beach of the catalogue: [sea] false = by a lake or a river; [distanceKm] from the point asked. */
data class NearBeach(val id: String, val name: String, val lat: Double, val lon: Double, val sea: Boolean, val distanceKm: Double)

/**
 * A ski area of the catalogue: its lifts in service (French ones only, from the IGN) and the lowest and highest point of
 * them ([footM], [topM]; null when no lift gives a height).
 */
data class SkiArea(
  val id: String,
  val name: String,
  val lat: Double,
  val lon: Double,
  val distanceKm: Double,
  val footM: Int?,
  val topM: Int?,
  val lifts: Int?,
  val gondolas: Int = 0,
  val chairs: Int = 0,
  val drags: Int = 0,
)

/** One of the two catalogues around a point, and its credit. */
data class Catalogue<T>(val items: List<T>, val attribution: String?)

/** A level of the bulletin over a band of heights ([lowerM] to [upperM], open when null). */
data class DangerBand(val level: Int, val lowerM: Int?, val upperM: Int?)

/** A problem of the bulletin (`wind_slab`, `wet_snow`…) and the slopes it is on (`N`, `NE`…). */
data class AvalancheProblem(val type: String, val aspects: List<String>)

/** What the bulletin says of the days after it: from when, in a few words. */
data class AvalancheTrend(val fromUtc: Long?, val text: String)

/**
 * The avalanche bulletin of the massif of a point (`/v1/avalanches`, Météo-France's BRA in France), in its own words: the
 * level by height, the problems and their slopes, two highlights, the trend, and where to read it all.
 */
data class AvalancheBulletin(
  val region: String?,
  val maxLevel: Int?,
  val bands: List<DangerBand>,
  val problems: List<AvalancheProblem>,
  val activity: String?,
  val snowpack: String?,
  val trend: List<AvalancheTrend>,
  val publishedUtc: Long?,
  val validUntilUtc: Long?,
  val url: String?,
  val attribution: String?,
) {
  /** The level at a height: the band that holds it, the highest level of the bulletin when none does. */
  fun levelAt(heightM: Int): Int? =
    bands.firstOrNull { (it.lowerM ?: Int.MIN_VALUE) <= heightM && heightM < (it.upperM ?: Int.MAX_VALUE) }?.level ?: maxLevel
}

/** The tide of a beach (`/v1/tides`): rising or not now, the next high and low waters, the coefficient Vigie estimates. */
data class BeachTide(val rising: Boolean?, val nextHigh: Long?, val nextLow: Long?, val coefficient: Int?)

/** Reads the answers of the fourth tab, as tolerant as [VigieParser]: a missing field becomes null, never a guess. */
object NearbyParser {
  fun beaches(text: String): Catalogue<NearBeach> {
    val root = Json.parseToJsonElement(text).obj()
    val items =
      root["beaches"].arr().mapNotNull { it.objOrNull() }.mapNotNull { b ->
        NearBeach(
          id = b["id"].str() ?: return@mapNotNull null,
          name = b["name"].str() ?: return@mapNotNull null,
          lat = b["lat"].dbl() ?: return@mapNotNull null,
          lon = b["lon"].dbl() ?: return@mapNotNull null,
          sea = b["water"].str() == "sea",
          distanceKm = b["distance_km"].dbl() ?: return@mapNotNull null,
        )
      }
    return Catalogue(items.sortedBy { it.distanceKm }, root["attribution"].str())
  }

  fun areas(text: String): Catalogue<SkiArea> {
    val root = Json.parseToJsonElement(text).obj()
    val items =
      root["areas"].arr().mapNotNull { it.objOrNull() }.mapNotNull { a ->
        val kinds = a["lift_kinds"].objOrNull()
        SkiArea(
          id = a["id"].str() ?: return@mapNotNull null,
          name = a["name"].str() ?: return@mapNotNull null,
          lat = a["lat"].dbl() ?: return@mapNotNull null,
          lon = a["lon"].dbl() ?: return@mapNotNull null,
          distanceKm = a["distance_km"].dbl() ?: return@mapNotNull null,
          footM = a["foot_m"].int(),
          topM = a["top_m"].int(),
          lifts = a["lifts"].int(),
          gondolas = kinds?.get("gondola").int() ?: 0,
          chairs = kinds?.get("chair").int() ?: 0,
          drags = kinds?.get("drag").int() ?: 0,
        )
      }
    return Catalogue(items.sortedBy { it.distanceKm }, root["attribution"].str())
  }

  /** The first bulletin of the answer; null without one (no service here, or out of the season). */
  fun bulletin(text: String): AvalancheBulletin? {
    val root = Json.parseToJsonElement(text).obj()
    val b = root["bulletins"].arr().firstOrNull()?.objOrNull() ?: return null
    return AvalancheBulletin(
      region = b["regions"].arr().firstOrNull()?.objOrNull()?.get("name").str() ?: root["region_name"].str(),
      maxLevel = b["max_danger_level"].int(),
      bands =
        b["danger_ratings"].arr().mapNotNull { it.objOrNull() }.mapNotNull { r ->
          val e = r["elevation"].objOrNull()
          DangerBand(r["level"].int() ?: return@mapNotNull null, e?.get("lower_bound").int(), e?.get("upper_bound").int())
        },
      problems =
        b["avalanche_problems"].arr().mapNotNull { it.objOrNull() }.mapNotNull { p ->
          AvalancheProblem(p["problem_type"].str() ?: return@mapNotNull null, p["aspects"].arr().mapNotNull { it.str() })
        },
      activity = b["avalanche_activity_highlights"].str()?.takeIf { it.isNotBlank() },
      snowpack = b["snowpack_highlights"].str()?.takeIf { it.isNotBlank() },
      trend =
        b["tendency"].arr().mapNotNull { it.objOrNull() }.mapNotNull { t ->
          AvalancheTrend(t["valid_from"].str()?.let(VigieParser::isoSeconds), t["highlights"].str()?.takeIf { it.isNotBlank() } ?: return@mapNotNull null)
        },
      publishedUtc = b["publication_time"].str()?.let(VigieParser::isoSeconds),
      validUntilUtc = b["valid_until"].str()?.let(VigieParser::isoSeconds),
      url = b["bulletin_url"].str() ?: root["bulletin_url"].str(),
      attribution = root["attribution"].str() ?: b["attribution"].str(),
    )
  }

  fun tide(text: String): BeachTide? {
    val root = Json.parseToJsonElement(text).obj()
    val now = root["now"].objOrNull() ?: return null
    val trend = now["trend"].str()
    val coefficient = root["coefficients_estimated"].arr().firstOrNull()?.objOrNull()?.get("value").int()
    return BeachTide(
      rising = trend?.let { it == "rising" },
      nextHigh = now["next_high"].objOrNull()?.get("time_utc").long(),
      nextLow = now["next_low"].objOrNull()?.get("time_utc").long(),
      coefficient = coefficient,
    )
  }

  /**
   * The class of the bathing water of a beach (`excellent`, `good`, `sufficient`, `poor`…): the monitored bathing site of
   * `/v1/sea/places?type=bathing` nearest to it within 1 km (the Sea page's rule); null without one.
   */
  fun bathingQuality(text: String, lat: Double, lon: Double): String? {
    val k = cos(Math.toRadians(lat))
    return Json.parseToJsonElement(text).obj()["places"].arr().mapNotNull { it.objOrNull() }
      .filter { it["type"].str() == "bathing" && it["quality"].str() != null }
      .mapNotNull { p ->
        val la = p["lat"].dbl() ?: return@mapNotNull null
        val lo = p["lon"].dbl() ?: return@mapNotNull null
        val km = 111.2 * sqrt((la - lat) * (la - lat) + (lo - lon) * k * (lo - lon) * k)
        if (km <= 1.0) km to p["quality"].str()!! else null
      }
      .minByOrNull { it.first }
      ?.second
  }

  private fun JsonElement.obj(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())

  private fun JsonElement?.objOrNull(): JsonObject? = this as? JsonObject

  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()

  private fun JsonElement?.prim(): JsonPrimitive? = if (this == null || this is JsonNull) null else this as? JsonPrimitive

  private fun JsonElement?.str(): String? = prim()?.takeIf { it.isString }?.contentOrNull

  private fun JsonElement?.dbl(): Double? = prim()?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }

  private fun JsonElement?.int(): Int? = prim()?.takeIf { !it.isString }?.let { it.intOrNull ?: it.doubleOrNull?.toInt() }

  private fun JsonElement?.long(): Long? = prim()?.takeIf { !it.isString }?.let { it.longOrNull ?: it.doubleOrNull?.toLong() }
}

/** A text of the API and when it was read (seconds since 1970). */
data class Stamped(val text: String, val readUtc: Long)

/**
 * Reads what the fourth tab shows and keeps each answer on the phone ([shelf]), to show it at once and without network.
 * Every read of `/v1/point` (the place with its sea, a beach, the top and the foot of an area) waits for its turn at [gate],
 * its own share of the ten a minute the public server allows: three, so that the Accueil, the Mer tab and the map keep theirs.
 * The other routes are not limited that way. The copies older than two days go ([prune]).
 */
class NearbyReader(
  val baseUrl: String = VigieRepository.BASE_URL,
  private val shelf: Shelf? = null,
  private val gate: PointGate = PointGate(max = GATE),
  private val clock: () -> Long = System::currentTimeMillis,
  private val fetch: suspend (String) -> String = VigieRepository::httpGet,
) {
  /** The copy of [name] on the phone; null without one. */
  suspend fun saved(name: String): Stamped? = shelf?.let { s -> onDisk { s.read(name)?.let(::unwrap) } }

  /** Reads [url] (its turn at the gate for `/v1/point`) and keeps the answer under [name]. */
  suspend fun read(name: String, url: String): Stamped {
    if ("/v1/point?" in url) gate.take()
    val got = Stamped(fetch(url), clock() / 1000)
    shelf?.let { s -> onDisk { s.write(name, wrap(got)) } }
    return got
  }

  /** Removes the copies read more than [maxAgeS] seconds ago. */
  suspend fun prune(maxAgeS: Long = 2 * 86_400L) {
    val s = shelf ?: return
    val now = clock() / 1000
    onDisk { s.names().filter { n -> s.read(n)?.let(::unwrap)?.let { now - it.readUtc > maxAgeS } ?: true }.forEach(s::delete) }
  }

  private fun wrap(s: Stamped): String =
    buildJsonObject {
        put("read_utc", s.readUtc)
        put("text", s.text)
      }
      .toString()

  private fun unwrap(text: String): Stamped? =
    try {
      val o = Json.parseToJsonElement(text) as? JsonObject
      val t = (o?.get("text") as? JsonPrimitive)?.contentOrNull
      val at = (o?.get("read_utc") as? JsonPrimitive)?.longOrNull
      if (t != null && at != null) Stamped(t, at) else null
    } catch (err: Exception) {
      null
    }

  private suspend fun <T> onDisk(work: () -> T): T? =
    withContext(Dispatchers.IO) {
      try {
        work()
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        null
      }
    }

  /** The names and the addresses of the reads, one place each so that the copies and the screen agree. */
  companion object Asks {
    /** Three of the server's ten reads of `/v1/point` a minute. */
    const val GATE = 3

    private fun p2(lat: Double, lon: Double) = String.format(Locale.ROOT, "%.2f_%.2f", lat, lon)

    private fun q2(lat: Double, lon: Double) = String.format(Locale.ROOT, "near_lat=%.2f&near_lon=%.2f", lat, lon)

    private fun q4(lat: Double, lon: Double) = String.format(Locale.ROOT, "lat=%.4f&lon=%.4f", lat, lon)

    private fun id(s: String) = s.map { if (it.isLetterOrDigit() || it == '-' || it == '_') it else '_' }.joinToString("")

    /** The beaches within 14 km of a place, its point sent at two decimals (about 1 km), as everything that says where the phone is. */
    fun beaches(baseUrl: String, lat: Double, lon: Double) = "beaches_${p2(lat, lon)}" to "$baseUrl/v1/beaches?${q2(lat, lon)}&radius_km=14&limit=50"

    fun areas(baseUrl: String, lat: Double, lon: Double) = "areas_${p2(lat, lon)}" to "$baseUrl/v1/ski/areas?${q2(lat, lon)}&radius_km=15&limit=30"

    /** The place with its sea (« Autour »): its point at two decimals too, the sea is the same over a kilometre. */
    fun placeSea(baseUrl: String, lat: Double, lon: Double) =
      "sea_${p2(lat, lon)}" to String.format(Locale.ROOT, "%s/v1/point?lat=%.2f&lon=%.2f&compact=false&marine=true", baseUrl, lat, lon)

    fun beach(baseUrl: String, b: NearBeach) = "beach_${id(b.id)}" to "$baseUrl/v1/point?${q4(b.lat, b.lon)}&compact=false&marine=true"

    fun tide(baseUrl: String, b: NearBeach) = "tide_${id(b.id)}" to "$baseUrl/v1/tides?${q4(b.lat, b.lon)}&days=1&interval_minutes=60"

    fun bathing(baseUrl: String, b: NearBeach) =
      "bathing_${id(b.id)}" to String.format(Locale.ROOT, "%s/v1/sea/places?type=bathing&near_lat=%.4f&near_lon=%.4f&radius_km=2&limit=20", baseUrl, b.lat, b.lon)

    /** An area at a height (its top or its foot): the weather the API works out for that height. */
    fun height(baseUrl: String, a: SkiArea, m: Int?) =
      "ski_${id(a.id)}_${m ?: "x"}" to "$baseUrl/v1/point?${q4(a.lat, a.lon)}&compact=false${if (m != null) "&elevation=$m" else ""}"

    fun avalanches(baseUrl: String, a: SkiArea) = "avalanches_${id(a.id)}" to "$baseUrl/v1/avalanches?${q4(a.lat, a.lon)}"
  }
}

/**
 * The beaches and the areas the user keeps (the star), by their ids, in the order they were kept: a chip each on the tab
 * wherever they are within the catalogue of the place shown. Kept on the phone only.
 */
class KeptNearby(private val store: KeyValue) {
  fun load(): List<String> = store.read(KEY)?.split('\n')?.filter { it.isNotBlank() } ?: emptyList()

  /** Keeps [id], or lets it go when it is kept; the new list. */
  fun toggle(id: String): List<String> {
    val now = load()
    val next = if (id in now) now - id else now + id
    store.write(KEY, next.joinToString("\n"))
    return next
  }

  private companion object {
    const val KEY = "nearby_kept"
  }
}
