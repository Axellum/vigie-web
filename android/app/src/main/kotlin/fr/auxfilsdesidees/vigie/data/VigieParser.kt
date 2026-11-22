package fr.auxfilsdesidees.vigie.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.longOrNull

/**
 * Reads the JSON of the Vigie API into the app's models. Tolerant on purpose: an unknown field is ignored, a missing or
 * null one becomes null (the screen then shows a dash or hides the block), so a new API field never breaks the app.
 */
object VigieParser {
  fun point(text: String): PointNow {
    val root = Json.parseToJsonElement(text).obj()
    val current = root["current"].objOrNull()
    val days =
      root["daily"].arr().mapNotNull { it.objOrNull() }.map { d ->
        Day(
          date = d["date"].str() ?: "",
          code = d["code"].int(),
          tminC = d["tmin"].dbl(),
          tmaxC = d["tmax"].dbl(),
          rainMm = d["rain_mm"].dbl(),
        )
      }
    // `hourly` is absent from the compact payload and from an API older than ADR 0040: the list then stays empty.
    val hours =
      root["hourly"].arr().mapNotNull { it.objOrNull() }.mapNotNull { h ->
        val t = h["time_utc"].long() ?: return@mapNotNull null
        HourWeather(
          timeUtc = t,
          tempC = h["temp_c"].dbl(),
          rainMm = h["precipitation_mm"].dbl(),
          windKmh = h["wind_kmh"].dbl(),
          gustKmh = h["wind_gust_kmh"].dbl(),
          windDeg = h["wind_deg"].dbl(),
          weatherCode = h["weather_code"].int(),
          isDay = h["is_day"].bool(),
        )
      }
    // A step without a number makes the whole hour unread rather than dry: nothing is claimed without data.
    val nowcast = root["rain_nowcast"].objOrNull()
    val steps = nowcast?.get("mm_per_step").arr().map { it.dbl() }
    val rainSoon =
      if (nowcast == null || steps.isEmpty() || steps.any { it == null }) null
      else RainNowcast(stepMinutes = nowcast["interval_minutes"].int()?.takeIf { it > 0 } ?: 15, mmPerStep = steps.map { it!! })
    return PointNow(
      serverUtc = root["server_utc"].long() ?: 0L,
      utcOffsetS = root["utc_offset_s"].int() ?: 0,
      provider = root["weather_provider"].str(),
      alertLevel = root["local_alert_level"].str(),
      tempC = current?.get("temp_c").dbl(),
      feelsLikeC = current?.get("feels_like_c").dbl(),
      windKmh = current?.get("wind_kmh").dbl(),
      gustKmh = current?.get("gust_kmh").dbl(),
      windDeg = current?.get("wind_deg").dbl(),
      rain1hMm = current?.get("rain_1h_mm").dbl(),
      weatherCode = current?.get("weather_code").int(),
      days = days,
      hours = hours.sortedBy { it.timeUtc },
      rainSoon = rainSoon,
    )
  }

  /** The hours of one spot from `/v1/activities/{spot}`: verdicts hour by hour, tide extremes, coastal warnings. */
  fun spotHours(text: String): SpotHours {
    val root = Json.parseToJsonElement(text).obj()
    val spot = root["spot"].objOrNull()
    val id = spot?.get("id").str() ?: ""
    val activities =
      root["activities"].arr().mapNotNull { it.objOrNull() }.associate { a ->
        val hours =
          a["hours"].arr().mapNotNull { it.objOrNull() }.mapNotNull { h ->
            val t = h["time_utc"].long() ?: return@mapNotNull null
            HourVerdict(timeUtc = t, daylight = h["daylight"].bool(), verdict = h["verdict"].str())
          }
        (a["id"].str() ?: "") to hours
      }
    val tide =
      root["tide"].objOrNull()?.get("extremes").arr().mapNotNull { it.objOrNull() }.mapNotNull { e ->
        val t = e["time_utc"].long() ?: return@mapNotNull null
        val h = e["height_m"].dbl() ?: return@mapNotNull null
        TideExtreme(timeUtc = t, high = e["kind"].str() == "high", heightM = h)
      }
    val vigilance = root["vigilance"].objOrNull()
    val alerts =
      vigilance?.get("alerts").arr().mapNotNull { it.objOrNull() }.map { a ->
        CoastAlert(level = a["level"].str(), startUtc = a["onset_utc"].long(), endUtc = a["ends_utc"].long() ?: a["expires_utc"].long())
      }
    return SpotHours(
      id = id,
      name = spot?.get("name").str() ?: id,
      activities = activities,
      tide = tide.sortedBy { it.timeUtc },
      vigilanceKnown = vigilance?.get("status").str() == "ok",
      alerts = alerts,
    )
  }

  /** The spots of `/v1/activities/overview` whose id is in [ids], in the order of [ids]; and whether the API flags them stale. */
  fun overview(text: String, ids: List<String>): Pair<List<Spot>, Boolean> {
    val root = Json.parseToJsonElement(text).obj()
    val byId =
      root["spots"].arr().mapNotNull { it.objOrNull() }.associateBy { it["id"].str() ?: "" }
    val spots =
      ids.mapNotNull { id ->
        val s = byId[id] ?: return@mapNotNull null
        Spot(
          id = id,
          name = s["name"].str() ?: id,
          place = s["place"].str(),
          activities =
            s["activities"].arr().mapNotNull { it.objOrNull() }.map { a ->
              val slot = a["best_slot"].objOrNull()
              ActivityVerdict(
                id = a["id"].str() ?: "",
                available = a["available"].bool() ?: false,
                verdict = a["verdict"].str(),
                now = a["now"].str(),
                reason = a["reason"].str(),
                bestStartUtc = slot?.get("start_utc").long(),
                bestEndUtc = slot?.get("end_utc").long(),
              )
            },
        )
      }
    return spots to (root["stale"].bool() ?: false)
  }

  /** Every spot of `/v1/activities/overview` that has coordinates (a spot without them cannot be offered by distance). */
  fun catalogue(text: String): List<CatalogueSpot> {
    val root = Json.parseToJsonElement(text).obj()
    return root["spots"].arr().mapNotNull { it.objOrNull() }.mapNotNull { s ->
      val id = s["id"].str() ?: return@mapNotNull null
      val lat = s["lat"].dbl() ?: return@mapNotNull null
      val lon = s["lon"].dbl() ?: return@mapNotNull null
      CatalogueSpot(id = id, name = s["name"].str() ?: id, place = s["place"].str(), lat = lat, lon = lon)
    }
  }

  /**
   * The official warnings of a point (`/v1/vigilances?lat&lon&lang=fr,en`). The text kept is the first in French, else
   * the first in English, else the first one. A link that points at a data file (a feed) is not offered to read.
   */
  fun vigilances(text: String): Vigilances {
    val root = Json.parseToJsonElement(text).obj()
    val statuses = root["coverage"].arr().mapNotNull { it.objOrNull()?.get("status").str() }
    val items =
      root["vigilances"].arr().mapNotNull { it.objOrNull() }.map { v ->
        val texts = v["texts"].arr().mapNotNull { it.objOrNull() }
        val lang = { t: JsonObject -> t["language"].str().orEmpty().lowercase() }
        val chosen = texts.firstOrNull { lang(it).startsWith("fr") } ?: texts.firstOrNull { lang(it).startsWith("en") } ?: texts.firstOrNull()
        val area = v["area"].objOrNull()
        val link = v["link"].str()?.takeUnless { DATA_FILE.containsMatchIn(it) }
        Vigilance(
          id = v["id"].str() ?: "",
          source = v["source"].str(),
          issuer = v["issuer"].str() ?: chosen?.get("sender_name").str(),
          level = v["level"].str(),
          phenomenon = v["phenomenon"].str(),
          event = chosen?.get("event").str() ?: v["event"].str(),
          area = area?.get("description").str(),
          river = area?.get("localization").str() == "line",
          distanceKm = v["distance_km"].dbl(),
          onsetUtc = v["onset_utc"].long(),
          endUtc = v["ends_utc"].long() ?: v["expires_utc"].long(),
          sentUtc = v["sent_utc"].long(),
          headline = chosen?.get("headline").str(),
          description = chosen?.get("description").str(),
          instruction = chosen?.get("instruction").str(),
          web = chosen?.get("web").str() ?: link,
          attribution = v["attribution"].str(),
        )
      }
    return Vigilances(
      covered = root["countries"].arr().isNotEmpty(),
      unavailable = statuses.isNotEmpty() && statuses.all { it == "unavailable" },
      items = items,
      disclaimer = root["disclaimer"].str(),
    )
  }

  private val DATA_FILE = Regex("""\.(geo)?json(\?|$)|\.xml(\?|$)""", RegexOption.IGNORE_CASE)

  /** The answers of the site's place search, and the credit to show with them (GeoNames, CC BY 4.0). */
  fun places(text: String): Pair<List<PlaceHit>, String?> {
    val root = Json.parseToJsonElement(text).obj()
    val hits =
      root["places"].arr().mapNotNull { it.objOrNull() }.mapNotNull { p ->
        val name = p["name"].str() ?: return@mapNotNull null
        val lat = p["lat"].dbl() ?: return@mapNotNull null
        val lon = p["lon"].dbl() ?: return@mapNotNull null
        PlaceHit(name = name, region = p["region"].str(), country = p["cc"].str(), lat = lat, lon = lon, population = p["population"].long())
      }
    return hits to root["attribution"].str()
  }

  private fun JsonElement.obj(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())

  private fun JsonElement?.objOrNull(): JsonObject? = this as? JsonObject

  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()

  private fun JsonElement?.prim(): JsonPrimitive? = if (this == null || this is JsonNull) null else this as? JsonPrimitive

  private fun JsonElement?.str(): String? = prim()?.takeIf { it.isString }?.contentOrNull

  private fun JsonElement?.dbl(): Double? = prim()?.doubleOrNull

  private fun JsonElement?.int(): Int? = prim()?.intOrNull ?: prim()?.doubleOrNull?.toInt()

  private fun JsonElement?.long(): Long? = prim()?.longOrNull ?: prim()?.doubleOrNull?.toLong()

  private fun JsonElement?.bool(): Boolean? = prim()?.booleanOrNull
}
