package fr.auxfilsdesidees.vigie.ui.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextUtils
import android.text.TextPaint
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.graphics.PathParser
import fr.auxfilsdesidees.vigie.data.TownReading
import fr.auxfilsdesidees.vigie.data.TownWeather
import fr.auxfilsdesidees.vigie.ui.board.BoardPalette
import fr.auxfilsdesidees.vigie.ui.board.HomeBoard
import fr.auxfilsdesidees.vigie.ui.board.familyIcon
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.VectorSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.Point

/**
 * Which towns of the base map get a pill, as the site chooses them (`townMarkers.ts`): read from the tiles, not from the labels
 * on screen (the labels change as the pills hide them, the tiles do not); the capital, the cities, the towns, the villages, each
 * from the zoom the base map names it; the most important first, a town whose pill would touch one already kept left out; 40 at
 * most, the site's limit for a request. On the IGN's plan, its own names (`toponyme_localite_ponc`) by their importance.
 */
internal object TownPicker {
  /** A pill and its name under it, dp: the box kept free around each when they are laid out. */
  const val PILL_H = 44f
  private const val PILL_GAP = 4f

  /** The town's point is under its pill, above its name (the name is 13 dp high). */
  const val POINT_FROM_BOTTOM = 7f

  /** The zoom from which OpenMapTiles' base map names each kind of place (its `label_city`, `label_town`, `label_village`). */
  private val FROM_ZOOM = mapOf("city" to 3.0, "town" to 6.0, "village" to 9.0)
  private val CLASS_ORDER = mapOf("city" to 0, "town" to 1, "village" to 2)

  private const val PLACES = "place"
  private const val IGN_PLACES = "toponyme_localite_ponc"

  /** The IGN's importance of a town (1 the largest), read from its `txt_typo`, and the zoom its plan names it from. */
  private val IGN_LEVEL = Regex("""(?:commune |TYPO_A_|BAT_COMMUNE[_-]?)(\d)""")
  private val IGN_FROM = mapOf(1 to 3.0, 2 to 4.0, 3 to 5.0, 4 to 7.0, 5 to 9.0, 6 to 7.0, 7 to 7.0)
  private val SPACES = Regex("\\s+")
  private val HYPHEN_BREAK = Regex("-\\s+")

  /** A town of the tiles: the name the pill writes, the name of the tiles (its id), its point and its order. */
  data class Candidate(val name: String, val raw: String, val lat: Double, val lon: Double, val order: Double)

  /**
   * The town of a place of the tiles ([prop] reads its properties) at [zoom]; null for a country, a region, a hamlet, or a town
   * the base map does not name yet at this zoom. Its name in French when the map has one.
   */
  fun candidate(prop: (String) -> Any?, lat: Double, lon: Double, zoom: Double): Candidate? {
    // The IGN breaks a long name over two lines, after a hyphen or between words.
    fun text(key: String) = (prop(key) as? String)?.replace(HYPHEN_BREAK, "-")?.replace(SPACES, " ")?.trim()?.takeIf { it.isNotEmpty() }
    fun num(key: String) = (prop(key) as? Number)?.toDouble()?.takeIf { it.isFinite() }
    val cls = text("class")
    if (cls != null) {
      val from = FROM_ZOOM[cls] ?: return null
      if (zoom < from) return null
      val raw = text("name") ?: return null
      val name = text("name:fr") ?: text("name:latin") ?: raw
      val order = (if (num("capital") == 2.0) 0 else 1) * 1e6 + CLASS_ORDER.getValue(cls) * 1e4 + (num("rank") ?: 99.0) * 10
      return Candidate(name, raw, lat, lon, order)
    }
    val typo = text("txt_typo") ?: return null
    val level = IGN_LEVEL.find(typo)?.groupValues?.get(1)?.toIntOrNull() ?: return null
    if (zoom < (IGN_FROM[level] ?: return null)) return null
    val name = text("texte") ?: return null
    return Candidate(name, name, lat, lon, 1e6 + level * 1e4 + (if (typo.contains("capitale")) 0 else 5000))
  }

  /** The width of a pill with what it shows, dp (the drawing's own measures, a little generous), or of its name when wider. */
  fun pillWidth(r: TownReading?, name: String): Float {
    var w = 62f
    if (r?.tempMin != null) w += 22
    if (r != null && TownWeather.rainShown(r)) w += 36
    if (r?.wind != null) w += 34
    return max(w, min(150f, name.length * 6.6f + 8))
  }

  /** A point on the screen, dp. */
  data class At(val x: Float, val y: Float)

  private class Box(val left: Float, val top: Float, val right: Float, val bottom: Float)

  /** The towns kept, the most important first ([list] is in that order), one whose box would touch a box kept left out. */
  fun <T> layout(list: List<T>, xy: (T) -> At, widthOf: (T) -> Float): List<T> {
    val kept = ArrayList<Pair<T, Box>>()
    for (t in list) {
      val p = xy(t)
      val w = widthOf(t)
      val box = Box(p.x - w / 2, p.y + POINT_FROM_BOTTOM - PILL_H, p.x + w / 2, p.y + POINT_FROM_BOTTOM)
      if (kept.any { (_, k) -> touch(k, box) }) continue
      kept += t to box
    }
    return kept.map { it.first }
  }

  private fun touch(a: Box, b: Box) =
    a.left < b.right + PILL_GAP && b.left < a.right + PILL_GAP && a.top < b.bottom + PILL_GAP && b.top < a.bottom + PILL_GAP

  /**
   * The towns in view the base map names at this zoom, the most important first; [width] × [height] the map, px. A pill must lie
   * between [top] and [bottom] (px from the map's top): under the search and the chips above, or the cards below, it is not read.
   */
  fun inView(map: MapLibreMap, style: Style, width: Int, height: Int, density: Float, top: Float, bottom: Float): List<TownInView> {
    val zoom = map.cameraPosition.zoom
    val w = width / density
    val above = top / density
    val below = min(height.toFloat(), bottom) / density
    val sources =
      style.layers.filterIsInstance<SymbolLayer>().mapNotNull { l -> l.sourceLayer.takeIf { it == PLACES || it == IGN_PLACES }?.let { l.sourceId to it } }.distinct()
    val seen = LinkedHashMap<String, Pair<TownInView, At>>()
    for ((sourceId, sourceLayer) in sources) {
      val source = style.getSourceAs<VectorSource>(sourceId) ?: continue
      for (f in source.querySourceFeatures(arrayOf(sourceLayer), null)) {
        val point = f.geometry() as? Point ?: continue
        val c = candidate({ key -> value(f, key) }, point.latitude(), point.longitude(), zoom) ?: continue
        val px = map.projection.toScreenLocation(LatLng(c.lat, c.lon))
        val at = At(px.x / density, px.y / density)
        if (at.x < 0 || at.x > w || at.y + POINT_FROM_BOTTOM - PILL_H < above || at.y + POINT_FROM_BOTTOM > below) continue
        val id = String.format(Locale.ROOT, "%s@%.3f,%.3f", c.raw, c.lat, c.lon)
        if (id !in seen) seen[id] = TownInView(id, c.name, c.lat, c.lon, c.order) to at
      }
    }
    val list = seen.values.sortedWith(compareBy<Pair<TownInView, At>> { it.first.order }.thenBy { it.first.name })
    return layout(list, { it.second }, { pillWidth(null, it.first.name) }).take(TownWeather.PER_REQUEST).map { it.first }
  }

  /** The pills as GeoJSON: each one's picture, its town (to open its sheet when touched) and its order (MapLibre keeps the first). */
  fun features(pills: List<TownPill>): String =
    JsonObject(
        mapOf(
          "type" to JsonPrimitive("FeatureCollection"),
          "features" to
            JsonArray(
              pills.map { p ->
                JsonObject(
                  mapOf(
                    "type" to JsonPrimitive("Feature"),
                    "geometry" to JsonObject(mapOf("type" to JsonPrimitive("Point"), "coordinates" to JsonArray(listOf(JsonPrimitive(p.town.lon), JsonPrimitive(p.town.lat))))),
                    "properties" to
                      JsonObject(
                        mapOf(
                          "id" to JsonPrimitive(p.town.id),
                          "name" to JsonPrimitive(p.town.name),
                          "lat" to JsonPrimitive(p.town.lat),
                          "lon" to JsonPrimitive(p.town.lon),
                          "order" to JsonPrimitive(p.town.order),
                          "image" to JsonPrimitive(TownWeather.pillKey(p.reading, p.town.name)),
                        )
                      ),
                  )
                )
              }
            ),
        )
      )
      .toString()

  private fun value(f: Feature, key: String): Any? {
    val v = f.getProperty(key) ?: return null
    if (!v.isJsonPrimitive) return null
    val p = v.asJsonPrimitive
    return when {
      p.isNumber -> p.asDouble
      p.isString -> p.asString
      else -> null
    }
  }
}

/**
 * A town's pill, drawn as the site draws it (`.vigie-town` of `MapView.svelte`, the sketch B chosen on 2026-11-28): the icon of
 * the sky and the temperature in its colour in a dark pill; the lowest of the day for a day; a drop and the millimetres when it
 * rains in the next hours, the gust and where it blows when it is strong; the town's name under it. The card's dark palette
 * ([BoardPalette.Dark]); drawn at the screen's density, which MapLibre reads from the bitmap. Its point is [OFFSET] dp above the
 * bottom of the picture.
 */
internal object TownPillArt {
  private val P = BoardPalette.Dark
  private const val SURFACE = 0xFF121E26.toInt()
  private const val FILL = 0xF0121E26.toInt()
  private const val LINE = 0xFF22323C.toInt()
  private const val INK = 0xFFE2E9ED.toInt()
  private const val SHADOW = 0x38000000

  /** Room around the pill and the name for the shadow and the halo, dp. */
  private const val MARGIN = 3f
  private const val PILL = 28f
  private const val NAME = 13f

  /** How far under the point the picture's bottom is, dp: the site's offset, and the margin. */
  const val OFFSET = TownPicker.POINT_FROM_BOTTOM + MARGIN

  private val DROP by lazy { PathParser.createPathFromPathData("M6 1C6 1 1 7.5 1 10.5a5 5 0 0 0 10 0C11 7.5 6 1 6 1Z") }
  private val ARROW by lazy { PathParser.createPathFromPathData("M8 1.5 L12.5 12 L8 9.6 L3.5 12 Z") }
  private val medium: Typeface by lazy { Typeface.create("sans-serif-medium", Typeface.NORMAL) }

  fun draw(town: TownInView, r: TownReading, density: Float, densityDpi: Int): Bitmap {
    val d = density
    val temp = paint(15f * d, Typeface.DEFAULT_BOLD, P.temperature(r.temp).toArgb())
    val tempText = "${HomeBoard.fmt(r.temp)}°"
    val low = r.tempMin?.let { paint(12f * d, medium, P.temperature(it).copy(alpha = 0.9f).toArgb()) to "${HomeBoard.fmt(it)}°" }
    val rain = if (TownWeather.rainShown(r)) paint(11.5f * d, medium, P.rain.toArgb()) to TownWeather.rainFigure(r.rainMm) else null
    val wind = r.wind?.let { paint(11.5f * d, medium, P.wind.toArgb()) to HomeBoard.fmt(it) }
    // The pill's row: padding 3, icon 24, the temperature, then each part 3 apart; a part with a rule before it (margin 2, rule 1, padding 4).
    val part = (3 + 2 + 1 + 4 + 10 + 1) * d
    var pillW = (3 + 24 + 3) * d + temp.measureText(tempText) + 8 * d
    low?.let { (p, s) -> pillW += 3 * d + p.measureText(s) }
    rain?.let { (p, s) -> pillW += part + p.measureText(s) }
    wind?.let { (p, s) -> pillW += part + p.measureText(s) }
    val namePaint = paint(11.5f * d, medium, INK)
    val name = TextUtils.ellipsize(town.name, namePaint, 140 * d, TextUtils.TruncateAt.END).toString()
    val nameW = namePaint.measureText(name)
    val inner = max(pillW, nameW)
    val m = MARGIN * d
    val width = ceil(inner + 2 * m).toInt()
    val height = ceil((PILL + 1 + NAME) * d + 2 * m).toInt()
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    bitmap.density = densityDpi
    val canvas = Canvas(bitmap)
    val left = (width - pillW) / 2
    val top = m
    val pill = RectF(left + d / 2, top + d / 2, left + pillW - d / 2, top + PILL * d - d / 2)
    val radius = PILL * d / 2
    canvas.drawRoundRect(pill, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = FILL; setShadowLayer(1.5f * d, 0f, d, SHADOW) })
    canvas.drawRoundRect(pill, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = LINE; style = Paint.Style.STROKE; strokeWidth = d })
    val cy = top + PILL * d / 2
    var x = left + 3 * d
    CanvasDrawScope().draw(Density(d), LayoutDirection.Ltr, androidx.compose.ui.graphics.Canvas(canvas), Size(width.toFloat(), height.toFloat())) {
      familyIcon(r.kind, x + 12 * d, cy, 24 * d, P)
    }
    x += (24 + 3) * d
    x = write(canvas, tempText, temp, x, cy)
    low?.let { (p, s) -> x = write(canvas, s, p, x + 3 * d, cy) }
    rain?.let { (p, s) ->
      x = rule(canvas, x, cy, d)
      glyph(canvas, DROP, 12f, 16f, x, cy, d, p.color, null)
      x = write(canvas, s, p, x + 11 * d, cy)
    }
    wind?.let { (p, s) ->
      x = rule(canvas, x, cy, d)
      glyph(canvas, ARROW, 16f, 16f, x, cy, d, p.color, r.windDeg?.let { TownWeather.windStep(it) + 180f })
      write(canvas, s, p, x + 11 * d, cy)
    }
    // The name under the pill, haloed in the colour of the surface so that it reads on any background.
    val nameY = top + (PILL + 1) * d + NAME * d / 2 - (namePaint.ascent() + namePaint.descent()) / 2
    val nameX = (width - nameW) / 2
    canvas.drawText(name, nameX, nameY, TextPaint(namePaint).apply { color = SURFACE; style = Paint.Style.STROKE; strokeWidth = 3f * d; strokeJoin = Paint.Join.ROUND })
    canvas.drawText(name, nameX, nameY, namePaint)
    return bitmap
  }

  private fun paint(size: Float, face: Typeface, colour: Int) =
    TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size
      typeface = face
      color = colour
      isSubpixelText = true
    }

  /** Writes [s] from [x], centred on the line [cy]; returns where it ends. */
  private fun write(canvas: Canvas, s: String, p: Paint, x: Float, cy: Float): Float {
    canvas.drawText(s, x, cy - (p.ascent() + p.descent()) / 2, p)
    return x + p.measureText(s)
  }

  /** The rule before a part (3 apart, margin 2, a line of 1, padding 4); returns where the part's drawing starts. */
  private fun rule(canvas: Canvas, x: Float, cy: Float, d: Float): Float {
    val at = x + (3 + 2 + 0.5f) * d
    canvas.drawLine(at, cy - 7 * d, at, cy + 7 * d, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = LINE; strokeWidth = d })
    return x + (3 + 2 + 1 + 4) * d
  }

  /** A drawing of a box [boxW] × [boxH] in the site's box of 10 × 11 dp at [x], centred on [cy], turned by [turn] degrees. */
  private fun glyph(canvas: Canvas, path: android.graphics.Path, boxW: Float, boxH: Float, x: Float, cy: Float, d: Float, colour: Int, turn: Float?) {
    val k = min(10f / boxW, 11f / boxH) * d
    val w = boxW * k
    val h = boxH * k
    val cx = x + 5 * d
    canvas.save()
    if (turn != null) canvas.rotate(turn, cx, cy)
    canvas.translate(cx - w / 2, cy - h / 2)
    canvas.scale(k, k)
    canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = colour })
    canvas.restore()
  }
}
