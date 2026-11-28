package fr.auxfilsdesidees.vigie.data

import fr.auxfilsdesidees.vigie.ui.board.HomeBoard
import java.math.BigDecimal
import java.time.LocalDate
import kotlin.math.roundToLong
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

/** A cell of the weather grid (0.05°, about 5 km) a town falls in: its row and column, the same key wherever it is asked from. */
data class TownCell(val i: Long, val j: Long) {
  val lat: Double get() = i * TownWeather.GRID
  val lon: Double get() = j * TownWeather.GRID

  /** As the site's `cellKey` asks it: `47.6,-3.05`. */
  val query: String get() = "${plain(i)},${plain(j)}"

  private fun plain(k: Long): String = BigDecimal.valueOf(k).multiply(STEP).stripTrailingZeros().toPlainString()

  companion object {
    private val STEP = BigDecimal("0.05")
  }
}

/** What a town's pill reads of an hour. */
data class TownHour(
  val t: Long,
  val tempC: Double?,
  val precipMm: Double?,
  val windKmh: Double?,
  val gustKmh: Double?,
  val windDeg: Double?,
  val code: Int?,
  val isDay: Boolean?,
)

/** What a town's pill reads of a day: its date at the town, its sky, its lowest and highest, its rain and its strongest wind. */
data class TownDay(val date: String, val code: Int?, val tminC: Double?, val tmaxC: Double?, val rainMm: Double?, val windMaxKmh: Double?)

/** The weather now at a town. */
data class TownNow(val tempC: Double?, val windKmh: Double?, val gustKmh: Double?, val windDeg: Double?, val code: Int?)

/** The weather of a town's cell as the site's `/data/towns.json` sends it. */
data class Town(val lat: Double, val lon: Double, val utcOffsetS: Long?, val now: TownNow?, val hours: List<TownHour>, val days: List<TownDay>)

/** The answer of `/data/towns.json`: each cell asked with its weather (null: not read), and whether the site's share of the day is used up. */
data class TownsAnswer(val towns: List<Pair<TownCell, Town?>>, val attribution: String?, val paused: Boolean)

/** A moment the pills show: now; a coming hour (the same instant everywhere); an hour of tomorrow at each town's clock; a later day. */
sealed interface Moment {
  data object Now : Moment

  data class Hour(val t: Long) : Moment

  data class Local(val days: Int, val hour: Int) : Moment

  data class Day(val days: Int) : Moment
}

/** What a pill shows of a town at a moment: the sky, the temperature (the highest and the lowest for a day), the rain, a strong wind. */
data class TownReading(
  val kind: String?,
  val temp: Double,
  val tempMin: Double?,
  /** The rain of the 3 hours from the moment (of the day for a day), mm. */
  val rainMm: Double,
  /** The strongest gust, else the mean wind, km/h; null when it is not strong. */
  val wind: Double?,
  /** Where the wind comes from, degrees. */
  val windDeg: Double?,
  val day: Boolean,
)

/**
 * The weather of the towns of the map, as the site's home map draws it (`townWeather.ts`, vigie-web#164, the sketch B chosen on
 * 2026-11-28): a pill per town the base map names, the icon of the sky and the temperature; a drop and the millimetres when it
 * rains in the next 3 hours; the gust when it is strong. Read through the site's `/data/towns.json` (never `/v1/points`, which
 * the rented server limits to 3 a minute), at the moment chosen in the bar under the map.
 */
object TownWeather {
  /** The step of the weather grid, degrees (`WEATHER_GRID_DEG` of the site). */
  const val GRID = 0.05

  /** Towns asked in one request: the API's limit. */
  const val PER_REQUEST = 40

  /** Below this zoom the base map names countries, not towns: no pill. */
  const val MIN_ZOOM = 3.0

  /** A town's weather is asked again after a quarter of an hour, as a point's; one not read, after a minute. */
  const val REFRESH_MS = 900_000L
  const val RETRY_MS = 60_000L

  /** The rain of the next 3 hours (or of the day) from which a pill shows its drop, mm. */
  const val RAIN_SHOWN_MM = 0.2

  /** The gust, or the mean wind, from which a pill shows the wind, km/h. */
  const val GUST_SHOWN_KMH = 45.0
  const val WIND_SHOWN_KMH = 30.0

  /** The cell a point falls in (the site's `snapToGrid`). */
  fun cellOf(lat: Double, lon: Double): TownCell {
    val i = Math.round(lat / GRID).coerceIn(-1800L, 1800L)
    var j = Math.round(lon / GRID)
    if (j > 3600) j -= 7200 else if (j < -3600) j += 7200
    return TownCell(i, j)
  }

  /** The address of the weather of [cells] at the site. */
  fun url(siteUrl: String, cells: List<TownCell>): String = "$siteUrl/data/towns.json?" + cells.joinToString("&") { "at=${it.query}" }

  /** The answer of `/data/towns.json`; throws on anything that is not one. */
  fun towns(text: String): TownsAnswer {
    val root = Json.parseToJsonElement(text) as? JsonObject ?: error("not an answer of towns")
    val list = root["towns"] as? JsonArray ?: error("no towns")
    return TownsAnswer(
      towns =
        list.mapNotNull { raw ->
          val o = raw as? JsonObject ?: return@mapNotNull null
          val lat = o["lat"].num() ?: return@mapNotNull null
          val lon = o["lon"].num() ?: return@mapNotNull null
          cellOf(lat, lon) to (o["weather"] as? JsonObject)?.let(::town)
        },
      attribution = root["attribution"].str(),
      paused = root["paused"].bool() == true,
    )
  }

  private fun town(w: JsonObject): Town? {
    val lat = w["lat"].num() ?: return null
    val lon = w["lon"].num() ?: return null
    val now =
      (w["current"] as? JsonObject)?.let { c ->
        TownNow(c["tempC"].num(), c["windKmh"].num(), c["gustKmh"].num(), c["windDeg"].num(), c["code"].num()?.toInt())
      }
    val hours =
      w["hourly"].arr().mapNotNull { raw ->
        val h = raw as? JsonObject ?: return@mapNotNull null
        TownHour(
          t = h["t"].long() ?: return@mapNotNull null,
          tempC = h["tempC"].num(),
          precipMm = h["precipMm"].num(),
          windKmh = h["windKmh"].num(),
          gustKmh = h["windGustKmh"].num(),
          windDeg = h["windDeg"].num(),
          code = h["weatherCode"].num()?.toInt(),
          isDay = h["isDay"].bool(),
        )
      }
    val days =
      w["daily"].arr().mapNotNull { raw ->
        val d = raw as? JsonObject ?: return@mapNotNull null
        TownDay(d["date"].str() ?: return@mapNotNull null, d["code"].num()?.toInt(), d["tminC"].num(), d["tmaxC"].num(), d["rainMm"].num(), d["windMaxKmh"].num())
      }
    if (now == null) return null
    return Town(lat, lon, w["utcOffsetS"].long(), now, hours, days)
  }

  // ------------------------------------------------------------------------------------------- the moments of the bar

  /** The moments of the bar: now, in 3, 6 and 9 hours, tomorrow at 8 and 14 h, the two days after. */
  fun moments(nowS: Long): List<Moment> {
    val next = nowS - Math.floorMod(nowS, 3600L) + 3600
    return listOf(Moment.Now) + listOf(2, 5, 8).map { Moment.Hour(next + it * 3600L) } +
      listOf(Moment.Local(1, 8), Moment.Local(1, 14), Moment.Day(2), Moment.Day(3))
  }

  /** The instant of a moment at a town (the start of its hour); null for a day. */
  fun momentTime(m: Moment, nowS: Long, offsetS: Long?): Long? =
    when (m) {
      Moment.Now -> nowS - Math.floorMod(nowS, 3600L)
      is Moment.Hour -> m.t
      is Moment.Day -> null
      is Moment.Local -> {
        val off = offsetS ?: 0
        val midnight = Math.floorDiv(nowS + off, 86_400L) * 86_400 - off
        midnight + m.days * 86_400L + m.hour * 3600L
      }
    }

  /** The town's own date of an instant. */
  private fun localDay(t: Long, offsetS: Long): String = LocalDate.ofEpochDay(Math.floorDiv(t + offsetS, 86_400L)).toString()

  private fun strong(gust: Double?, wind: Double?): Double? = if ((gust ?: 0.0) >= GUST_SHOWN_KMH || (wind ?: 0.0) >= WIND_SHOWN_KMH) gust ?: wind else null

  /** What a town shows at a moment; null when its forecast does not reach it. */
  fun readAt(t: Town, m: Moment, nowS: Long): TownReading? {
    val off = t.utcOffsetS ?: 0
    if (m is Moment.Day) {
      val date = localDay(nowS + m.days * 86_400L, off)
      val d = t.days.firstOrNull { it.date == date } ?: return null
      val high = d.tmaxC ?: return null
      return TownReading(
        kind = HomeBoard.wmoKind(d.code),
        temp = high,
        tempMin = d.tminC,
        rainMm = d.rainMm ?: 0.0,
        wind = d.windMaxKmh?.takeIf { it >= WIND_SHOWN_KMH },
        windDeg = null,
        day = true,
      )
    }
    val at = momentTime(m, nowS, t.utcOffsetS) ?: return null
    val i = t.hours.indexOfFirst { it.t <= at && at < it.t + 3600 }
    val hour = if (i >= 0) t.hours[i] else null
    val next3 = if (i >= 0) t.hours.subList(i, minOf(i + 3, t.hours.size)) else emptyList()
    val rain = next3.sumOf { it.precipMm ?: 0.0 }
    if (m == Moment.Now) {
      val c = t.now
      val day = hour?.isDay != false
      val temp = c?.tempC ?: hour?.tempC ?: return null
      return TownReading(
        kind = HomeBoard.atNight(HomeBoard.wmoKind(c?.code ?: hour?.code), day),
        temp = temp,
        tempMin = null,
        rainMm = rain,
        wind = strong(c?.gustKmh ?: hour?.gustKmh, c?.windKmh ?: hour?.windKmh),
        windDeg = c?.windDeg ?: hour?.windDeg,
        day = day,
      )
    }
    val temp = hour?.tempC ?: return null
    val day = hour.isDay != false
    return TownReading(
      kind = HomeBoard.atNight(HomeBoard.wmoKind(hour.code), day),
      temp = temp,
      tempMin = null,
      rainMm = rain,
      wind = strong(next3.mapNotNull { it.gustKmh }.maxOrNull(), next3.mapNotNull { it.windKmh }.maxOrNull()),
      windDeg = hour.windDeg,
      day = day,
    )
  }

  /** Whether a pill shows its drop. */
  fun rainShown(r: TownReading): Boolean = r.rainMm >= RAIN_SHOWN_MM

  /** The picture of a pill: the same for the same reading and name, drawn once. */
  fun pillKey(r: TownReading, name: String): String =
    "vigie-town:${r.kind}:${HomeBoard.fmt(r.temp)}:${r.tempMin?.let { HomeBoard.fmt(it) } ?: "-"}:" +
      "${if (rainShown(r)) rainFigure(r.rainMm) else "-"}:${r.wind?.let { HomeBoard.fmt(it) } ?: "-"}:${r.windDeg?.let { windStep(it) } ?: "-"}:$name"

  /** The millimetres a pill writes: one decimal under 10. */
  fun rainFigure(mm: Double): String = HomeBoard.fmt(mm, if (mm < 10) 1 else 0)

  /** The pill's arrow, turned by steps of 5° (the picture is drawn once per step). */
  fun windStep(deg: Double): Long = (deg / 5).roundToLong() * 5 % 360

  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()

  private fun JsonElement?.prim(): JsonPrimitive? = if (this == null || this is JsonNull) null else this as? JsonPrimitive

  private fun JsonElement?.str(): String? = prim()?.takeIf { it.isString }?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

  private fun JsonElement?.num(): Double? = prim()?.takeUnless { it.isString }?.doubleOrNull?.takeIf { it.isFinite() }

  private fun JsonElement?.long(): Long? = prim()?.takeUnless { it.isString }?.let { it.longOrNull ?: it.doubleOrNull?.toLong() }

  private fun JsonElement?.bool(): Boolean? = prim()?.booleanOrNull
}
