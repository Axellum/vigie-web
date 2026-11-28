package fr.auxfilsdesidees.vigie.data

import kotlin.math.floor
import kotlin.math.hypot
import kotlin.math.min
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

/** The three grids of the forecast wind, the finest last (the site's `FieldLevelId`). */
enum class FieldLevelId(val id: String, val rank: Int) {
  World("world", 2),
  Europe("europe", 1),
  France("france", 0);

  companion object {
    fun of(id: String?): FieldLevelId? = entries.firstOrNull { it.id == id }
  }
}

/** One grid of the hour, as the site lists it (`/data/wind-field.json`, the site's `FieldLevel`). */
data class FieldLevel(
  val id: FieldLevelId,
  /** `AROME` or `ARPEGE`. */
  val model: String,
  /** Epoch seconds of the run and of the hour of the forecast. */
  val run: Long,
  val valid: Long,
  /** West, south, east, north of the nodes (the centres of the image's pixels), in degrees. */
  val box: GeoBox,
  val width: Int,
  val height: Int,
  /** Degrees between two nodes, the same along both axes. */
  val step: Double,
  /** The grid goes round the world: its last column is next to its first. */
  val wholeWorld: Boolean,
  /** Metres per second of a byte at 0 or 255. */
  val scale: Double,
  /** The zoom of the map from which this grid is worth loading (the world's is 0). */
  val minZoom: Double,
  /** The address of the image on the site, `/data/wind-field/<level>/<stamp>.png`. */
  val image: String,
)

/** The site's answer: the grids of the hour. */
data class WindFieldAnswer(
  /** `ok` with grids; `off` when the API serves no forecast wind; `unavailable` when it failed. */
  val status: String,
  /** Epoch seconds of the hour of the forecast; null without one. */
  val valid: Long?,
  /** An older answer, kept because Météo-France's portal failed. */
  val stale: Boolean,
  val levels: List<FieldLevel>,
)

/** A grid read from its image: east and north components in m/s, row by row from the north-west; NaN where the model has none. */
class FieldGrid(
  val id: FieldLevelId,
  /** The image it was read from (a new hour has a new one). */
  val image: String,
  val west: Double,
  val south: Double,
  val east: Double,
  val north: Double,
  val step: Double,
  val width: Int,
  val height: Int,
  val wholeWorld: Boolean,
  /** Degrees over which a grid that does not go round the world fades into the coarser one at its edges. */
  val ramp: Double,
  val u: FloatArray,
  val v: FloatArray,
)

/**
 * The forecast wind of the sea map, as the site's (`windField.ts`, `windFieldLayer.svelte.ts`; the API's ADR 0038): the wind
 * at 10 m of Météo-France's models for the whole hour nearest to now, ARPEGE over the world (0.5°) and Europe (0.2°), AROME
 * over France (0.05°), each an image whose red and green bytes are the east and north components against [FieldLevel.scale]
 * and whose blue is 255 where the model has a value. The finest grid that has a value wins at each point, faded into the
 * coarser one over its edge so that no seam shows. A forecast, never a measure (the badges) nor a warning.
 */
object WindField {
  /** The list is asked again after 10 minutes, a minute after a failure or when the hour turned (the site's). */
  const val REFRESH_MS = 600_000L
  const val RETRY_MS = 60_000L

  /** The trails take a colour from these speeds (km/h), the steps 4 and 5 of the measured wind's badges; below, the quiet ink. */
  val STRONG_KMH = intArrayOf(40, 60)

  /** Pixels (dp) a trail's head moves per second for a wind of 1 m/s, the same at every zoom (10 m/s: 80 dp/s). */
  const val PX_PER_S = 8.0

  /** The inks of the trails over the dark plan and the photographs (the site's `--flow`, `--wind-4`, `--wind-5`). */
  val INKS_DARK = intArrayOf(0xFFD2E1EA.toInt(), 0xFF8D5FCF.toInt(), 0xFFD04A8C.toInt())

  /** Over the IGN's plan, a light map: the site's light theme. */
  val INKS_LIGHT = intArrayOf(0xFF23465B.toInt(), 0xFF6B3FA0.toInt(), 0xFFB0287A.toInt())

  private val STAMP = Regex("""^/data/wind-field/(world|europe|france)/\d{10}-\d{10}\.png$""")

  /** A grid fades into the coarser one over this many of its own steps from its edge. */
  private const val RAMP_STEPS = 8

  /** The site's answer; an exception for one that is not. */
  fun answer(text: String): WindFieldAnswer {
    val root = Json.parseToJsonElement(text) as? JsonObject ?: error("not an answer of the forecast wind")
    val status = root["status"].str()
    require(status == "ok" || status == "off" || status == "unavailable") { "not an answer of the forecast wind" }
    val levels = root["levels"].arr().mapNotNull(::level)
    return WindFieldAnswer(
      status = if (status == "ok" && levels.isEmpty()) "unavailable" else status,
      valid = root["valid"].long(),
      stale = root["stale"].bool() == true,
      levels = levels,
    )
  }

  /** One grid of the answer; null when it lacks what places or reads it, or its image is not one of the site's. */
  fun level(raw: JsonElement): FieldLevel? {
    val o = raw as? JsonObject ?: return null
    val id = FieldLevelId.of(o["id"].str()) ?: return null
    val box = o["bbox"].arr().map { it.num() }
    val width = o["width"].num()?.toInt() ?: return null
    val height = o["height"].num()?.toInt() ?: return null
    val step = o["step"].num() ?: return null
    val scale = o["scale"].num() ?: return null
    val image = o["image"].str() ?: return null
    if (box.size != 4 || box.any { it == null } || width < 2 || height < 2 || step <= 0 || scale <= 0) return null
    if (!STAMP.matches(image) || !image.startsWith("/data/wind-field/${id.id}/")) return null
    return FieldLevel(
      id = id,
      model = o["model"].str() ?: "",
      run = o["run"].long() ?: return null,
      valid = o["valid"].long() ?: return null,
      box = GeoBox(box[0]!!, box[1]!!, box[2]!!, box[3]!!),
      width = width,
      height = height,
      step = step,
      wholeWorld = o["wholeWorld"].bool() == true,
      scale = scale,
      minZoom = o["minZoom"].num() ?: 0.0,
      image = image,
    )
  }

  /** The grids worth loading for a view: the world always, a finer one once the map is close enough and over its box. */
  fun levelsWanted(answer: WindFieldAnswer?, view: GeoBox?, zoom: Double): List<FieldLevel> {
    if (answer == null || answer.status != "ok") return emptyList()
    return answer.levels.filter { it.wholeWorld || (zoom >= it.minZoom && view != null && view.overlaps(it.box)) }
  }

  /** The hour (epoch seconds) a forecast for "now" is of: the whole hour nearest to [nowMs], as the API chooses it. */
  fun nearestHour(nowMs: Long): Long = (nowMs / 3_600_000.0).roundToLong() * 3600

  /** The grid of an image from its pixels (ARGB, as Android's `Bitmap.getPixels` gives them); an error when the size is not the one announced. */
  fun grid(level: FieldLevel, argb: IntArray): FieldGrid {
    val n = level.width * level.height
    require(argb.size == n) { "the image of ${level.id.id} is not ${level.width} x ${level.height}" }
    val u = FloatArray(n)
    val v = FloatArray(n)
    val k = level.scale / 127.5
    for (i in 0 until n) {
      val p = argb[i]
      if ((p and 0xff) < 128) {
        u[i] = Float.NaN
        v[i] = Float.NaN
      } else {
        u[i] = (((p shr 16) and 0xff) - 127.5).times(k).toFloat()
        v[i] = (((p shr 8) and 0xff) - 127.5).times(k).toFloat()
      }
    }
    val b = level.box
    return FieldGrid(
      id = level.id,
      image = level.image,
      west = b.west,
      south = b.south,
      east = b.east,
      north = b.north,
      step = level.step,
      width = level.width,
      height = level.height,
      wholeWorld = level.wholeWorld,
      ramp = if (level.wholeWorld) 0.0 else RAMP_STEPS * level.step,
      u = u,
      v = v,
    )
  }

  /** The grids in the order a point is looked for: the finest first. */
  fun finestFirst(grids: Collection<FieldGrid>): List<FieldGrid> = grids.sortedBy { it.id.rank }

  private fun wrapLon(lon: Double): Double = ((((lon + 180) % 360) + 360) % 360) - 180

  /**
   * The wind of one grid at a point, by bilinear interpolation between the four nodes around it, written into [out] (east,
   * north m/s). False when the point is outside the grid or a node around it has no value.
   */
  fun sampleGrid(g: FieldGrid, lon: Double, lat: Double, out: FloatArray): Boolean {
    val fy = (g.north - lat) / g.step
    if (!(fy >= 0) || fy > g.height - 1) return false
    var fx: Double
    if (g.wholeWorld) {
      fx = (wrapLon(lon) - g.west) / g.step
      fx = ((fx % g.width) + g.width) % g.width
    } else {
      fx = (lon - g.west) / g.step
      if (!(fx >= 0) || fx > g.width - 1) return false
    }
    val i0 = floor(fx).toInt()
    val j0 = min(floor(fy).toInt(), g.height - 2)
    val i1 = if (g.wholeWorld) (i0 + 1) % g.width else min(i0 + 1, g.width - 1)
    val tx = fx - i0
    val ty = fy - j0
    val a = j0 * g.width
    val b = a + g.width
    // A node without a value (outside AROME's domain): NaN spreads, and the coarser grid is taken.
    val u = (g.u[a + i0] * (1 - tx) + g.u[a + i1] * tx) * (1 - ty) + (g.u[b + i0] * (1 - tx) + g.u[b + i1] * tx) * ty
    if (u.isNaN()) return false
    val v = (g.v[a + i0] * (1 - tx) + g.v[a + i1] * tx) * (1 - ty) + (g.v[b + i0] * (1 - tx) + g.v[b + i1] * tx) * ty
    if (v.isNaN()) return false
    out[0] = u.toFloat()
    out[1] = v.toFloat()
    return true
  }

  /** How much a grid counts at a point: 1 inside, down to 0 at its edge over [FieldGrid.ramp] degrees. */
  fun edgeWeight(g: FieldGrid, lon: Double, lat: Double): Double {
    if (g.wholeWorld || g.ramp <= 0) return 1.0
    val d = minOf(lon - g.west, g.east - lon, lat - g.south, g.north - lat)
    return if (d <= 0) 0.0 else if (d >= g.ramp) 1.0 else d / g.ramp
  }

  /** The wind at a point from the grids (finest first), written into [out] (east, north m/s); false where none has a value. */
  fun sampleWind(grids: List<FieldGrid>, lon: Double, lat: Double, out: FloatArray, scratch: FloatArray = FloatArray(2)): Boolean {
    var left = 1.0
    var u = 0.0
    var v = 0.0
    for (i in grids.indices) {
      val g = grids[i]
      if (!sampleGrid(g, lon, lat, scratch)) continue
      // The coarsest grid takes all that is left: there is nothing to fade into under it.
      val take = left * (if (i == grids.lastIndex) 1.0 else edgeWeight(g, lon, lat))
      if (take <= 0) continue
      u += take * scratch[0]
      v += take * scratch[1]
      left -= take
      if (left < 1e-3) break
    }
    if (left >= 1) return false
    out[0] = (u / (1 - left)).toFloat()
    out[1] = (v / (1 - left)).toFloat()
    return true
  }

  /** 0 for the quiet ink, 1 from 40 km/h, 2 from 60 km/h. */
  fun flowClass(ms: Double): Int {
    val kmh = ms * 3.6
    return if (kmh >= STRONG_KMH[1]) 2 else if (kmh >= STRONG_KMH[0]) 1 else 0
  }

  /** The opacity of a trail's head: a calm breeze barely shows, a strong wind reads clearly, never a solid line. */
  fun flowAlpha(ms: Double): Double = 0.2 + 0.46 * min(1.0, ms / 15)

  /** The number of trails for a map of this size in dp: about one per 25 x 25, between 150 and 3000. */
  fun flowCount(width: Double, height: Double): Int = Math.round(min(3000.0, maxOf(150.0, width * height / 650))).toInt()

  /** The speed of a wind, m/s. */
  fun speed(u: Float, v: Float): Double = hypot(u.toDouble(), v.toDouble())

  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()

  private fun JsonElement?.prim(): JsonPrimitive? = if (this == null || this is JsonNull) null else this as? JsonPrimitive

  private fun JsonElement?.str(): String? = prim()?.takeIf { it.isString }?.contentOrNull?.trim()?.takeIf { it.isNotEmpty() }

  private fun JsonElement?.num(): Double? = prim()?.takeUnless { it.isString }?.doubleOrNull?.takeIf { it.isFinite() }

  private fun JsonElement?.long(): Long? = prim()?.takeUnless { it.isString }?.let { it.longOrNull ?: it.doubleOrNull?.toLong() }

  private fun JsonElement?.bool(): Boolean? = prim()?.booleanOrNull
}
