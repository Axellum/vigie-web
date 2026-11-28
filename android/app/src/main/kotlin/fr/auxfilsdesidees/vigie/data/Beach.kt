package fr.auxfilsdesidees.vigie.data

import java.net.URLEncoder
import java.util.Locale
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull

/** A spot of the Sea page: its name, its place, where it is, where it faces, its bottom and its lifeguards. */
data class BeachSpot(
  val id: String,
  val name: String?,
  val place: String?,
  val lat: Double?,
  val lon: Double?,
  val facingDeg: Double?,
  val bottom: String?,
  val lifeguarded: Boolean?,
)

/** One hour of the spot's forecast (`/v1/surf/spots/{spot}`): the waves, the swell, the wind and the tide. */
data class SeaHour(
  val timeUtc: Long,
  val waveM: Double?,
  val wavePeriodS: Double?,
  val waveFromDeg: Double?,
  val swellM: Double?,
  val swellPeriodS: Double?,
  val swellFromDeg: Double?,
  val windKmh: Double?,
  val gustKmh: Double?,
  val windFromDeg: Double?,
  /** `onshore`, `offshore` or `cross-shore` (along the shore), as the API says it. */
  val windRelative: String?,
  val tideM: Double?,
  /** `rising` or `falling`. */
  val tideTrend: String?,
)

/** One activity of the spot (`/v1/activities/{spot}`): its verdict, why, its best slot and its verdict hour by hour. */
data class BeachActivity(
  val id: String,
  val available: Boolean,
  val verdict: String?,
  val reason: String?,
  val bestStartUtc: Long?,
  val bestEndUtc: Long?,
  val hours: List<HourVerdict>,
)

/** A coefficient Vigie estimates for a high water at Brest. */
data class TideCoefficient(val brestHighWaterUtc: Long, val value: Double)

/** The sunrise and the sunset of a day at the spot. */
data class SunDay(val sunriseUtc: Long, val sunsetUtc: Long)

/** The monitored bathing site of the beach: its name, its town and the class of its water over four years. */
data class BathingSite(val name: String?, val commune: String?, val quality: String?)

/**
 * A beach of the Sea page, as the Home Assistant card reads it with `vigie/card/beach`: the spot's forecast hour by hour,
 * its verdicts, the high and low waters with the coefficients, the sun, the water at its cell and its monitored bathing site.
 * [hasForecast] / [hasActivities] false = that part could not be read (the page draws the rest). [readUtc]: when it was read.
 */
data class Beach(
  val spot: BeachSpot,
  val hasForecast: Boolean,
  val hasActivities: Boolean,
  val hours: List<SeaHour>,
  val activities: List<BeachActivity>,
  val extremes: List<TideExtreme>,
  val coefficients: List<TideCoefficient>,
  val sun: List<SunDay>,
  val waterC: Double?,
  val bathing: BathingSite?,
  val forecastCredit: String?,
  val activitiesCredit: String?,
  val waterCredit: String?,
  val readUtc: Long,
)

/**
 * The answers of a beach cut down to what the Sea page draws (the rules of the integration's `weather_data.py`: `beach_forecast`,
 * `beach_activities`, `beach_water`, `bathing_site`), kept on the phone as one text, then read back into a [Beach].
 */
object BeachParser {
  private const val VERSION = 1
  private val SPOT_KEEP = listOf("id", "name", "place", "lat", "lon", "facing_deg", "bottom", "beach_surface", "lifeguarded")
  private val HOUR_KEEP = listOf("time_utc", "daylight", "waves", "swell", "wind", "tide")
  private val FORECAST_KEEP = listOf("generated_utc", "stale", "attribution")
  private val ACTIVITY_KEEP = listOf("id", "available", "verdict", "reason", "best_slot")
  private val ACTIVITY_HOUR_KEEP = listOf("time_utc", "daylight", "verdict", "reason")
  private val ACTIVITIES_KEEP = listOf("generated_utc", "sun", "stale", "attribution")
  private val WATER_KEEP = listOf("sea_surface_temperature_c", "sea_state_label", "wave_height_m", "stale", "attribution")
  private val BATHING_KEEP = listOf("id", "name", "commune", "quality", "lat", "lon", "ref")

  /** A bathing site this close is the beach's, whatever its side; farther, only one on the sea side (the site's rule). */
  private const val NEAR_KM = 1.0
  private const val SAME_PLACE_KM = 0.2
  private const val INLAND_DEG = 135.0

  /** The water of a beach is read again after an hour, its bathing site after a day (as the integration keeps them). */
  const val WATER_MAX_AGE_S = 3600L
  const val BATHING_MAX_AGE_S = 24 * 3600L

  /**
   * The four answers (null: not read) cut down and joined into the text kept on the phone; null when neither the forecast nor
   * the verdicts read (then nothing replaces the last copy). The water and the bathing site not read this time come from
   * [previous], the copy kept before, with the time they were read (`water_utc`, `bathing_utc`).
   */
  fun keep(surf: String?, activities: String?, point: String?, bathing: String?, readUtc: Long, previous: String? = null): String? {
    val forecast = surf?.let(::objectOf)?.takeIf { it["hours"] is JsonArray }
    val acts = activities?.let(::objectOf)?.takeIf { it["activities"] is JsonArray }
    if (forecast == null && acts == null) return null
    val spot = forecast?.get("spot").objOrNull() ?: acts?.get("spot").objOrNull()
    val kept = mutableMapOf<String, JsonElement>("version" to JsonPrimitive(VERSION), "read_utc" to JsonPrimitive(readUtc))
    kept["spot"] = JsonObject(pick(spot, SPOT_KEEP))
    kept["forecast"] =
      forecast?.let { f -> JsonObject(pick(f, FORECAST_KEEP) + ("hours" to JsonArray(f["hours"].arr().mapNotNull { it.objOrNull() }.map { JsonObject(pick(it, HOUR_KEEP)) }))) }
        ?: JsonNull
    kept["activities"] = acts?.let(::keepActivities) ?: JsonNull
    val before = previous?.let(::objectOf)?.takeIf { it["version"].long() == VERSION.toLong() }
    val water = point?.let(::objectOf)?.get("marine").objOrNull()?.let { pick(it, WATER_KEEP) }?.takeIf { it.isNotEmpty() }?.let(::JsonObject)
    if (water != null) {
      kept["water"] = water
      kept["water_utc"] = JsonPrimitive(readUtc)
    } else {
      kept["water"] = before?.get("water")?.takeIf { it is JsonObject } ?: JsonNull
      kept["water_utc"] = if (kept["water"] is JsonObject) before?.get("water_utc") ?: JsonNull else JsonNull
    }
    // A list of the sites that reads is an answer, a site or none; one not read keeps the site read before.
    val sites = bathing?.let(::objectOf)?.takeIf { it["places"] is JsonArray }
    if (sites != null) {
      kept["bathing"] = bathingSite(sites, spot) ?: JsonNull
      kept["bathing_utc"] = JsonPrimitive(readUtc)
    } else {
      kept["bathing"] = before?.get("bathing")?.takeIf { it is JsonObject } ?: JsonNull
      kept["bathing_utc"] = before?.get("bathing_utc") ?: JsonNull
    }
    return JsonObject(kept).toString()
  }

  /** When the water (`water_utc`) or the bathing site (`bathing_utc`) of a kept text was read; null when it was not. */
  fun readAt(text: String?, key: String): Long? = text?.let(::objectOf)?.takeIf { it["version"].long() == VERSION.toLong() }?.get(key).long()

  /** The kept text read back; null for one that does not read (an older version, a broken file). */
  fun beach(text: String): Beach? =
    try {
      val root = Json.parseToJsonElement(text).obj()
      if (root["version"].long() != VERSION.toLong()) null else beachOf(root)
    } catch (err: Exception) {
      null
    }

  private fun beachOf(root: JsonObject): Beach {
    val s = root["spot"].obj()
    val forecast = root["forecast"].objOrNull()
    val acts = root["activities"].objOrNull()
    val water = root["water"].objOrNull()
    val bathing = root["bathing"].objOrNull()
    val tide = acts?.get("tide").objOrNull()
    return Beach(
      spot =
        BeachSpot(
          id = s["id"].str() ?: "",
          name = s["name"].str(),
          place = s["place"].str(),
          lat = s["lat"].dbl(),
          lon = s["lon"].dbl(),
          facingDeg = s["facing_deg"].dbl(),
          bottom = s["bottom"].str(),
          lifeguarded = s["lifeguarded"].bool(),
        ),
      hasForecast = forecast != null,
      hasActivities = acts != null,
      hours = forecast?.get("hours").arr().mapNotNull { it.objOrNull() }.mapNotNull(::hourOf).sortedBy { it.timeUtc },
      activities =
        acts?.get("activities").arr().mapNotNull { it.objOrNull() }.map { a ->
          val slot = a["best_slot"].objOrNull()
          BeachActivity(
            id = a["id"].str() ?: "",
            available = a["available"].bool() ?: false,
            verdict = a["verdict"].str(),
            reason = a["reason"].str(),
            bestStartUtc = slot?.get("start_utc").long(),
            bestEndUtc = slot?.get("end_utc").long(),
            hours =
              a["hours"].arr().mapNotNull { it.objOrNull() }.mapNotNull { h ->
                HourVerdict(timeUtc = h["time_utc"].long() ?: return@mapNotNull null, daylight = h["daylight"].bool(), verdict = h["verdict"].str())
              },
          )
        },
      extremes =
        tide?.get("extremes").arr().mapNotNull { it.objOrNull() }.mapNotNull { e ->
          val kind = e["kind"].str()
          if (kind != "high" && kind != "low") return@mapNotNull null
          TideExtreme(timeUtc = e["time_utc"].long() ?: return@mapNotNull null, high = kind == "high", heightM = e["height_m"].dbl() ?: Double.NaN)
        }.sortedBy { it.timeUtc },
      coefficients =
        tide?.get("coefficients_estimated").arr().mapNotNull { it.objOrNull() }.mapNotNull { k ->
          TideCoefficient(k["brest_high_water_utc"].long() ?: return@mapNotNull null, k["value"].dbl() ?: return@mapNotNull null)
        },
      sun =
        acts?.get("sun").arr().mapNotNull { it.objOrNull() }.mapNotNull { d ->
          SunDay(d["sunrise_utc"].long() ?: return@mapNotNull null, d["sunset_utc"].long() ?: return@mapNotNull null)
        }.sortedBy { it.sunriseUtc },
      waterC = water?.get("sea_surface_temperature_c").dbl(),
      bathing = bathing?.let { BathingSite(it["name"].str(), it["commune"].str(), it["quality"].str()) },
      forecastCredit = forecast?.get("attribution").str(),
      activitiesCredit = acts?.get("attribution").str(),
      waterCredit = water?.get("attribution").str(),
      readUtc = root["read_utc"].long() ?: 0,
    )
  }

  private fun hourOf(h: JsonObject): SeaHour? {
    val t = h["time_utc"].long() ?: return null
    val waves = h["waves"].objOrNull()
    val swell = h["swell"].objOrNull()
    val wind = h["wind"].objOrNull()
    val tide = h["tide"].objOrNull()
    return SeaHour(
      timeUtc = t,
      waveM = waves?.get("height_m").dbl(),
      wavePeriodS = waves?.get("period_s").dbl(),
      waveFromDeg = waves?.get("from_deg").dbl(),
      swellM = swell?.get("height_m").dbl(),
      swellPeriodS = swell?.get("period_s").dbl(),
      swellFromDeg = swell?.get("from_deg").dbl(),
      windKmh = wind?.get("speed_kmh").dbl(),
      gustKmh = wind?.get("gust_kmh").dbl(),
      windFromDeg = wind?.get("from_deg").dbl(),
      windRelative = wind?.get("relative").str(),
      tideM = tide?.get("height_m").dbl(),
      tideTrend = tide?.get("trend").str(),
    )
  }

  /** The verdicts and their hours, the high and low waters with the coefficients, the sun (`beach_activities`). */
  private fun keepActivities(a: JsonObject): JsonObject {
    val tide = a["tide"].objOrNull()
    val list =
      a["activities"].arr().mapNotNull { it.objOrNull() }.map { act ->
        JsonObject(pick(act, ACTIVITY_KEEP) + ("hours" to JsonArray(act["hours"].arr().mapNotNull { it.objOrNull() }.map { JsonObject(pick(it, ACTIVITY_HOUR_KEEP)) })))
      }
    val keptTide =
      JsonObject(
        mapOf(
          "extremes" to JsonArray(tide?.get("extremes").arr().filter { it is JsonObject }),
          "coefficients_estimated" to (tide?.get("coefficients_estimated") as? JsonArray ?: JsonNull),
        )
      )
    return JsonObject(pick(a, ACTIVITIES_KEEP) + mapOf("activities" to JsonArray(list), "tide" to keptTide))
  }

  /**
   * The monitored bathing site of the beach in an answer of `/v1/sea/places` (`bathing_site`): the nearest within 1 km of the
   * spot, leaving out one behind the beach when its facing is known (the list does not say whether its water is the sea or a
   * lake), with its credit; null when there is none.
   */
  private fun bathingSite(answer: JsonObject, spot: JsonObject?): JsonObject? {
    if (spot == null) return null
    val lat = spot["lat"].dbl() ?: return null
    val lon = spot["lon"].dbl() ?: return null
    val facing = spot["facing_deg"].dbl()
    var best: Pair<Double, JsonObject>? = null
    for (p in answer["places"].arr().mapNotNull { it.objOrNull() }) {
      if (p["type"].str() != "bathing") continue
      val pLat = p["lat"].dbl() ?: continue
      val pLon = p["lon"].dbl() ?: continue
      val km = Geo.km(lat, lon, pLat, pLon)
      if (km > NEAR_KM || (best != null && km >= best.first)) continue
      if (facing != null && km > SAME_PLACE_KM) {
        val off = abs(((bearingDeg(lat, lon, pLat, pLon) - facing + 540) % 360) - 180)
        if (off > INLAND_DEG) continue
      }
      best = km to p
    }
    val (km, site) = best ?: return null
    return JsonObject(pick(site, BATHING_KEEP) + mapOf("distance_km" to JsonPrimitive(Math.round(km * 10) / 10.0), "attribution" to (answer["attribution"] ?: JsonNull)))
  }

  /** Initial bearing from the first point to the second, in degrees from north. */
  internal fun bearingDeg(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val p1 = Math.toRadians(lat1)
    val p2 = Math.toRadians(lat2)
    val dl = Math.toRadians(lon2 - lon1)
    val y = sin(dl) * cos(p2)
    val x = cos(p1) * sin(p2) - sin(p1) * cos(p2) * cos(dl)
    return (Math.toDegrees(atan2(y, x)) + 360) % 360
  }

  private fun objectOf(text: String): JsonObject? =
    try {
      Json.parseToJsonElement(text) as? JsonObject
    } catch (err: Exception) {
      null
    }

  private fun pick(o: JsonObject?, keys: List<String>): Map<String, JsonElement> = if (o == null) emptyMap() else keys.mapNotNull { k -> o[k]?.let { k to it } }.toMap()

  private fun JsonElement?.obj(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())

  private fun JsonElement?.objOrNull(): JsonObject? = this as? JsonObject

  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()

  private fun JsonElement?.prim(): JsonPrimitive? = if (this == null || this is JsonNull) null else this as? JsonPrimitive

  private fun JsonElement?.str(): String? = prim()?.takeIf { it.isString }?.contentOrNull

  private fun JsonElement?.dbl(): Double? = prim()?.takeIf { !it.isString }?.doubleOrNull?.takeIf { it.isFinite() }

  private fun JsonElement?.long(): Long? = prim()?.takeIf { !it.isString }?.let { it.longOrNull ?: it.doubleOrNull?.toLong() }

  private fun JsonElement?.bool(): Boolean? = prim()?.takeIf { !it.isString }?.booleanOrNull
}

/**
 * Reads the beaches of the Sea page from the public API, as the integration does for the card: the spot's forecast
 * (`/v1/surf/spots/{spot}?days=2`) and its verdicts (`/v1/activities/{spot}`) together, then, at the spot's point, the water
 * (`/v1/point`) and the monitored bathing sites (`/v1/sea/places?type=bathing`). The last good read of each beach is kept on
 * the phone ([shelf], a folder of its own), so the page shows at once and without network.
 */
class BeachReader(
  private val baseUrl: String = VigieRepository.BASE_URL,
  private val shelf: Shelf? = null,
  private val clock: () -> Long = System::currentTimeMillis,
  private val fetch: suspend (String) -> String = VigieRepository::httpGet,
) {
  /** Reads [spotId] again; the beach, kept; an [Exception] when neither its forecast nor its verdicts read. */
  suspend fun read(spotId: String): Beach {
    val id = URLEncoder.encode(spotId, "UTF-8")
    val now = clock() / 1000
    val previous = shelf?.let { s -> onDisk { s.read(nameOf(spotId)) } }
    // `/v1/point` is the one route the server limits to 10 a minute per address: the water is asked once an hour at most.
    val askWater = BeachParser.readAt(previous, "water_utc")?.let { now - it >= BeachParser.WATER_MAX_AGE_S } ?: true
    val askBathing = BeachParser.readAt(previous, "bathing_utc")?.let { now - it >= BeachParser.BATHING_MAX_AGE_S } ?: true
    val text = coroutineScope {
      val surf = async { orNull { fetch("$baseUrl/v1/surf/spots/$id?days=2") } }
      val activities = async { orNull { fetch("$baseUrl/v1/activities/$id") } }
      val s = surf.await()
      val at = s?.let(::spotPoint)
      val point = at?.takeIf { askWater }?.let { (lat, lon) -> async { orNull { fetch("$baseUrl/v1/point?${q(lat, lon)}&compact=false&marine=true") } } }
      val bathing =
        at?.takeIf { askBathing }?.let { (lat, lon) ->
          async { orNull { fetch(String.format(Locale.ROOT, "%s/v1/sea/places?type=bathing&near_lat=%.4f&near_lon=%.4f&radius_km=2&limit=20", baseUrl, lat, lon)) } }
        }
      BeachParser.keep(s, activities.await(), point?.await(), bathing?.await(), now, previous)
    } ?: throw ApiException(0)
    val beach = BeachParser.beach(text) ?: throw ApiException(0)
    shelf?.let { onDisk { it.write(nameOf(spotId), text) } }
    return beach
  }

  /** The last good read of [spotId] kept on the phone; null without one. */
  suspend fun saved(spotId: String): Beach? = shelf?.let { s -> onDisk { s.read(nameOf(spotId))?.let(BeachParser::beach) } }

  /** Only the copies of the spots of [spotIds] stay (the spots no longer followed anywhere lose theirs). */
  suspend fun keepOnly(spotIds: Collection<String>) {
    val s = shelf ?: return
    val kept = spotIds.map(::nameOf).toSet()
    onDisk { s.names().filter { it !in kept }.forEach(s::delete) }
  }

  private fun spotPoint(surf: String): Pair<Double, Double>? =
    try {
      val spot = (Json.parseToJsonElement(surf) as? JsonObject)?.get("spot") as? JsonObject
      val lat = (spot?.get("lat") as? JsonPrimitive)?.doubleOrNull
      val lon = (spot?.get("lon") as? JsonPrimitive)?.doubleOrNull
      if (lat != null && lon != null) lat to lon else null
    } catch (err: Exception) {
      null
    }

  private fun q(lat: Double, lon: Double) = String.format(Locale.ROOT, "lat=%.4f&lon=%.4f", lat, lon)

  private suspend fun <T> onDisk(work: () -> T): T? =
    withContext(Dispatchers.IO) {
      try {
        work()
      } catch (err: Exception) {
        null
      }
    }

  private suspend fun <T> orNull(read: suspend () -> T): T? =
    try {
      read()
    } catch (err: CancellationException) {
      throw err
    } catch (err: Exception) {
      null
    }

  companion object {
    /** A spot id fit for a file name (they are slugs: letters, digits and dashes). */
    fun nameOf(spotId: String): String = spotId.map { if (it.isLetterOrDigit() || it == '-' || it == '_') it else '_' }.joinToString("")
  }
}
