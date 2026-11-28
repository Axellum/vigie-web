package fr.auxfilsdesidees.vigie.data

import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.tan
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/** A box of the map in degrees, as the site's `Box`: a [west] greater than the [east] crosses the antimeridian. */
data class GeoBox(val west: Double, val south: Double, val east: Double, val north: Double) {
  /** Whether [other] overlaps this view (the site's `boxesOverlap`): a view may span 360° or more, or cross the antimeridian. */
  fun overlaps(other: GeoBox): Boolean {
    if (other.north < south || other.south > north) return false
    // The phone gives a view across the antimeridian as a west above its east: unfolded here, as the site's.
    val e = if (east < west) east + 360 else east
    if (e - west >= 360) return true
    val w = ((other.west - west) % 360 + 360) % 360 + west
    val width = if (other.east >= other.west) other.east - other.west else other.east + 360 - other.west
    return w <= e || w + width - 360 >= west
  }

  /** Whether [other] lies inside this box (the box of the wind read covers the view). */
  fun contains(other: GeoBox): Boolean = west <= other.west && south <= other.south && east >= other.east && north >= other.north

  /** Whether a point lies inside (the site's `inBox`). */
  fun contains(lat: Double, lon: Double): Boolean {
    if (lat < south || lat > north) return false
    return if (west <= east) lon in west..east else lon >= west || lon <= east
  }
}

/**
 * The areas of the rain radar (the site's `RADAR_AREAS`, the API's ADR 0037): metropolitan France and three overseas
 * mosaics, each with the box of its grid. [id] is the site's (`/data/radar.json?area=`).
 */
enum class RadarArea(val id: String, val box: GeoBox) {
  France("france", GeoBox(-5.5, 41.2, 9.8, 51.3)),
  Antilles("antilles", GeoBox(-66.0, 10.59, -57.0, 21.0)),
  Reunion("reunion", GeoBox(51.0, -25.02, 62.02, -16.0)),
  NewCaledonia("new-caledonia", GeoBox(159.7, -27.27, 171.58, -16.2)),
}

/** A class of the radar's legend: from [minMmH] millimetres an hour, in [color] (`#rrggbb`). */
data class RadarClass(val minMmH: Double, val color: String, val alpha: Double)

/** The images of the radar of an [area], the oldest first (epoch seconds), and how to draw them. */
data class Radar(
  val area: RadarArea,
  val frames: List<Long>,
  val minZoom: Double,
  val maxZoom: Double,
  val bounds: GeoBox,
  val legend: List<RadarClass>,
  val stale: Boolean,
)

/** The wind measured at a station of Météo-France or at a buoy offshore (`/data/wind.json` of the site). */
data class WindPoint(
  val id: String,
  /** Null for a station the API does not name. */
  val name: String?,
  val lat: Double,
  val lon: Double,
  /** The station's altitude (a summit measures the crest's wind); null for a buoy. */
  val altM: Int?,
  val kmh: Double,
  val gustKmh: Double?,
  /** Where the wind comes from, in degrees; null when calm or not measured (the badge has no beak then). */
  val fromDeg: Double?,
  /** Epoch seconds of the observation. */
  val measured: Long,
  val buoy: Boolean,
)

/** The wind read for a [box] (wider than the view): its points, the newest observation, and whether the site served it old. */
data class WindMap(val box: GeoBox, val points: List<WindPoint>, val measured: Long?, val stale: Boolean)

/**
 * The weather layers of the sea map, as the site's (`src/lib/radar.ts`, `src/lib/wind.ts` of vigie-web): the rain radar
 * of Météo-France (the last 35 minutes, an image every 5 minutes, drawn as tiles by the site) and the wind measured now by
 * its stations and the buoys offshore, a badge each. Measured, never a forecast and never a warning.
 */
object MapWeather {
  /** The images kept for the animation: the last 35 minutes. */
  const val RADAR_FRAMES = 8
  /** The radar's list is not asked again before an image can have come. */
  const val RADAR_REFRESH_MS = 300_000L
  /** A new wind observation comes every 6 minutes. */
  const val WIND_REFRESH_MS = 360_000L
  /** After a read that failed. */
  const val RETRY_MS = 60_000L
  /** The time an image stays on screen while playing, and the newest one a little longer. */
  const val STEP_MS = 600L
  const val LAST_STEP_MS = 1_500L
  /** The radar is drawn a little see-through, as on the site. */
  const val RADAR_OPACITY = 0.85f

  /** The five steps of a badge's colour, in km/h: below 20, 20 to 30, 30 to 40, 40 to 60, 60 and more. */
  val WIND_STEPS = listOf(20, 30, 40, 60)

  /** The site's `--wind-1` to `--wind-5` of the dark theme. */
  val WIND_COLOURS = mapOf(1 to "#7cc39b", 2 to "#3a9bb5", 3 to "#4f7fd0", 4 to "#8d5fcf", 5 to "#d04a8c")
  /** The figure on the lightest step (`--on-wind-1`); white on the others. */
  const val WIND_INK_ON_1 = "#0c151b"
  /** The ring of a badge (`--surface` of the dark theme). */
  const val SURFACE = "#121e26"

  /** The gust is written beside the badge when it is at least this much above the mean (km/h). */
  const val GUST_SHOWN_ABOVE_KMH = 15

  /** The step (1 to 5) of a mean wind, for its colour. */
  fun windStep(kmh: Double): Int = WIND_STEPS.indexOfFirst { kmh < it }.let { if (it == -1) 5 else it + 1 }

  /** A speed on a badge: a whole number (the badges have room for three digits). */
  fun windValue(kmh: Double): Int = kmh.roundToInt()

  fun gustShown(p: WindPoint): Boolean = p.gustKmh != null && p.gustKmh >= p.kmh + GUST_SHOWN_ABOVE_KMH

  /** The radius of a badge on screen, in dp: small over a whole country, larger close in. */
  fun badgeRadius(zoom: Double): Int = if (zoom < 6) 10 else if (zoom < 8) 12 else 14

  /**
   * The area whose radar is shown: close enough for the tiles (from [minZoom]), and either on France (any overlap) or with
   * the centre of the view inside an overseas mosaic (a small island in a view of a whole ocean is not worth it). Null
   * when no radar is shown.
   */
  fun radarAreaOf(view: GeoBox?, zoom: Double, minZoom: Double = 3.0): RadarArea? {
    if (view == null || zoom < minZoom) return null
    if (view.overlaps(RadarArea.France.box)) return RadarArea.France
    val lat = (view.south + view.north) / 2
    // A view that crosses the antimeridian has its east above 180: the centre is brought back into -180..180.
    var lon = (view.west + view.east) / 2
    if (view.west > view.east) lon += 180
    if (lon > 180) lon -= 360
    return listOf(RadarArea.Antilles, RadarArea.Reunion, RadarArea.NewCaledonia).firstOrNull { it.box.contains(lat, lon) }
  }

  /** The site's answer (`/data/radar.json?area=`): an [Exception] for one without an image or a legend. */
  fun radar(text: String, area: RadarArea): Radar {
    val o = Json.parseToJsonElement(text) as? JsonObject ?: throw IllegalArgumentException("not a radar")
    val frames = o["frames"].arr().mapNotNull { it.num()?.toLong() }.sorted().takeLast(RADAR_FRAMES)
    require(frames.isNotEmpty()) { "no radar image" }
    val legend =
      o["legend"].arr().mapNotNull { it as? JsonObject }.mapNotNull { c ->
        val min = c["minMmH"].num() ?: return@mapNotNull null
        val colour = c["color"].str()?.takeIf { HEX.matches(it) } ?: return@mapNotNull null
        RadarClass(min, colour, c["alpha"].num() ?: 1.0)
      }
    require(legend.isNotEmpty()) { "no radar legend" }
    val b = o["bounds"].arr().mapNotNull { it.num() }
    return Radar(
      area = area,
      frames = frames,
      minZoom = o["minZoom"].num() ?: 3.0,
      maxZoom = o["maxZoom"].num() ?: 10.0,
      bounds = if (b.size == 4) GeoBox(b[0], b[1], b[2], b[3]) else area.box,
      legend = legend,
      stale = o["stale"].bool() == true,
    )
  }

  /** The address of the tiles of one image, on the site (it relays the API's). */
  fun radarTiles(siteUrl: String, area: RadarArea, epoch: Long): String = "$siteUrl/data/radar/${area.id}/$epoch/{z}/{x}/{y}.png"

  /** The box asked to the site for a view: whole degrees with a margin, so that a small move asks nothing new. */
  fun windQueryBox(view: GeoBox): GeoBox {
    val pad = max(1.0, (view.north - view.south) * 0.25)
    fun clamp(v: Double, lo: Double, hi: Double) = min(hi, max(lo, v))
    return GeoBox(
      clamp(floor(view.west - pad), -180.0, 180.0),
      clamp(floor(view.south - pad), -90.0, 90.0),
      clamp(ceil(view.east + pad), -180.0, 180.0),
      clamp(ceil(view.north + pad), -90.0, 90.0),
    )
  }

  /** The `bbox` of `/data/wind.json`: whole degrees only, as the site accepts it. */
  fun windBox(box: GeoBox): String = listOf(box.west, box.south, box.east, box.north).joinToString(",") { it.toInt().toString() }

  /** The site's answer (`/data/wind.json?bbox=`); a point without an id, a place, a wind or a date is left out. */
  fun wind(text: String, box: GeoBox): WindMap {
    val o = Json.parseToJsonElement(text) as? JsonObject ?: throw IllegalArgumentException("not a wind answer")
    val list = o["points"] as? JsonArray ?: throw IllegalArgumentException("not a wind answer")
    val points =
      list.mapNotNull { it as? JsonObject }.mapNotNull { p ->
        val id = p["id"].str() ?: return@mapNotNull null
        val lat = p["lat"].num() ?: return@mapNotNull null
        val lon = p["lon"].num() ?: return@mapNotNull null
        val kmh = p["kmh"].num()?.takeIf { it >= 0 } ?: return@mapNotNull null
        val measured = p["measured"].num()?.toLong() ?: return@mapNotNull null
        WindPoint(
          id = id,
          name = p["name"].str(),
          lat = lat,
          lon = lon,
          altM = p["altM"].num()?.roundToInt(),
          kmh = kmh,
          gustKmh = p["gustKmh"].num(),
          fromDeg = p["fromDeg"].num()?.let { (it % 360 + 360) % 360 },
          measured = measured,
          buoy = p["buoy"].bool() == true,
        )
      }
    return WindMap(box, points, o["measured"].num()?.toLong() ?: points.maxOfOrNull { it.measured }, o["stale"].bool() == true)
  }

  /**
   * The points kept on screen (the site's `declutter`): those in the [view], the strongest first, and a point whose badge
   * would touch one already kept is left out. Positions are Web Mercator pixels at [zoom] (512 dp a tile, as MapLibre draws),
   * [radius] in dp. Every point counts, summits too.
   */
  fun declutter(points: List<WindPoint>, view: GeoBox, zoom: Double, radius: Int): List<WindPoint> {
    val gap = 2.0 * radius + 2
    val grid = HashMap<Long, MutableList<DoubleArray>>()
    val kept = ArrayList<WindPoint>()
    val scale = 512.0 * 2.0.pow(zoom)
    for (p in points.sortedWith(compareByDescending<WindPoint> { it.kmh }.thenBy { it.id })) {
      if (!view.contains(p.lat, p.lon)) continue
      val x = (p.lon + 180) / 360 * scale
      val lat = Math.toRadians(p.lat.coerceIn(-85.05, 85.05))
      val y = (1 - ln(tan(PI / 4 + lat / 2)) / PI) / 2 * scale
      val cx = floor(x / gap).toLong()
      val cy = floor(y / gap).toLong()
      var touches = false
      loop@ for (i in cx - 1..cx + 1) for (j in cy - 1..cy + 1) {
        for (q in grid[cell(i, j)] ?: continue) {
          if ((q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y) < gap * gap) {
            touches = true
            break@loop
          }
        }
      }
      if (touches) continue
      grid.getOrPut(cell(cx, cy)) { ArrayList() }.add(doubleArrayOf(x, y))
      kept += p
    }
    return kept
  }

  private fun cell(i: Long, j: Long): Long = (i shl 32) xor (j and 0xffffffffL)

  /** The picture of a badge without its beak: the step's colour, a round (a square for a buoy), the figure, the gust. */
  fun badgeKey(p: WindPoint, radius: Int): String =
    "vigie-wind:${windStep(p.kmh)}:${windValue(p.kmh)}:${if (p.buoy) "b" else "s"}:${if (gustShown(p)) windValue(p.gustKmh!!) else "-"}:$radius"

  /** The picture of a beak, pointing up: turned on the map toward where the wind goes. */
  fun beakKey(p: WindPoint, radius: Int): String = "vigie-beak:${windStep(p.kmh)}:$radius"

  /**
   * The badges as GeoJSON for the map: a point each, with its id, its badge's picture, and for a wind that has a direction
   * its beak's picture and the angle it is turned by (where the wind goes, clockwise from the north).
   */
  fun windFeatures(points: List<WindPoint>, radius: Int): String =
    JsonObject(
        mapOf(
          "type" to JsonPrimitive("FeatureCollection"),
          "features" to
            JsonArray(
              points.map { p ->
                val props =
                  buildMap<String, JsonElement> {
                    put("id", JsonPrimitive(p.id))
                    put("badge", JsonPrimitive(badgeKey(p, radius)))
                    p.fromDeg?.let {
                      put("beak", JsonPrimitive(beakKey(p, radius)))
                      put("rot", JsonPrimitive((it + 180) % 360))
                    }
                  }
                JsonObject(
                  mapOf(
                    "type" to JsonPrimitive("Feature"),
                    "geometry" to JsonObject(mapOf("type" to JsonPrimitive("Point"), "coordinates" to JsonArray(listOf(JsonPrimitive(p.lon), JsonPrimitive(p.lat))))),
                    "properties" to JsonObject(props),
                  )
                )
              }
            ),
        )
      )
      .toString()

  private val HEX = Regex("^#[0-9a-fA-F]{6}$")

  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()

  private fun JsonElement?.prim(): JsonPrimitive? = if (this == null || this is JsonNull) null else this as? JsonPrimitive

  private fun JsonElement?.str(): String? = prim()?.takeIf { it.isString }?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

  private fun JsonElement?.num(): Double? = prim()?.takeUnless { it.isString }?.doubleOrNull?.takeIf { it.isFinite() }

  private fun JsonElement?.bool(): Boolean? = prim()?.booleanOrNull
}
