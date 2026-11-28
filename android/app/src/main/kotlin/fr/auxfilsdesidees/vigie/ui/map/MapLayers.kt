package fr.auxfilsdesidees.vigie.ui.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.PointF
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.graphics.toColorInt
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.data.MapPin
import fr.auxfilsdesidees.vigie.data.SeaMap
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.sin
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression.color
import org.maplibre.android.style.expressions.Expression.concat
import org.maplibre.android.style.expressions.Expression.get
import org.maplibre.android.style.expressions.Expression.has
import org.maplibre.android.style.expressions.Expression.literal
import org.maplibre.android.style.expressions.Expression.match
import org.maplibre.android.style.expressions.Expression.not
import org.maplibre.android.style.expressions.Expression.stop
import org.maplibre.android.style.expressions.Expression.toString
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.iconAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.iconAnchor
import org.maplibre.android.style.layers.PropertyFactory.iconIgnorePlacement
import org.maplibre.android.style.layers.PropertyFactory.iconImage
import org.maplibre.android.style.layers.PropertyFactory.iconOffset
import org.maplibre.android.style.layers.PropertyFactory.symbolSortKey
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Point

/**
 * The layers the app puts over the base map, as the site's sea map: a dot per spot in the blue of its verdict, always
 * drawn, and to its left a label with the figures of the hour; where two labels would touch, MapLibre keeps the better
 * verdict (`symbol-sort-key` = the rank) and the dots stay. A followed spot has a star in the blue of its verdict in place
 * of its dot; a followed place, a pill with a star and its name, under the pins. Over them, the phone's position when
 * asked for.
 */
internal object MapLayers {
  private const val PINS = "vigie-pins"
  private const val DOTS = "vigie-dots"
  private const val STARS = "vigie-stars"
  private const val LABELS = "vigie-labels"
  private const val PLACES = "vigie-places"
  private const val ME = "vigie-me"
  private const val STAR = "vigie-star:"
  private const val EMPTY = """{"type":"FeatureCollection","features":[]}"""

  /** The colour of a dot without a verdict: the charter's rule grey, never a verdict's blue. */
  private const val NO_VERDICT = "#5e738c"

  /** What a touch on the map found: a spot's pin, a followed place's pill, or a town named by the base map. */
  sealed interface Pick {
    data class Spot(val id: String) : Pick

    data class Followed(val key: String) : Pick

    data class Town(val name: String, val lat: Double, val lon: Double) : Pick
  }

  fun add(style: Style, context: Context) {
    val metrics = context.resources.displayMetrics
    style.addImages(HashMap((listOf(-1) + SeaMap.BAND_COLOURS.keys).associate { "$STAR$it" to Marks.star(SeaMap.BAND_COLOURS[it] ?: NO_VERDICT, metrics.density, metrics.densityDpi) }))
    style.addSource(GeoJsonSource(PLACES, EMPTY))
    style.addLayer(
      SymbolLayer(PLACES, PLACES).withProperties(iconImage(get("image")), iconAnchor(Property.ICON_ANCHOR_BOTTOM), iconAllowOverlap(true), iconIgnorePlacement(true))
    )
    style.addSource(GeoJsonSource(PINS, EMPTY))
    style.addLayer(
      CircleLayer(DOTS, PINS)
        .withFilter(not(has("followed")))
        .withProperties(
          circleRadius(6.5f),
          circleColor(
            match(
              get("band"),
              color(NO_VERDICT.toColorInt()),
              *SeaMap.BAND_COLOURS.map { (band, hex) -> stop(band, color(hex.toColorInt())) }.toTypedArray(),
            )
          ),
          circleStrokeWidth(2f),
          circleStrokeColor("rgba(10, 18, 32, 0.85)"),
        )
    )
    style.addLayer(
      SymbolLayer(STARS, PINS)
        .withFilter(has("followed"))
        .withProperties(iconImage(concat(literal(STAR), toString(get("band")))), iconAllowOverlap(true), iconIgnorePlacement(true))
    )
    style.addLayer(
      SymbolLayer(LABELS, PINS)
        .withFilter(has("label"))
        .withProperties(
          iconImage(get("label")),
          iconAnchor(Property.ICON_ANCHOR_RIGHT),
          iconOffset(arrayOf(-9f, 0f)),
          iconAllowOverlap(false),
          symbolSortKey(get("rank")),
        )
    )
    style.addSource(GeoJsonSource(ME, EMPTY))
    style.addLayer(
      CircleLayer(ME, ME).withProperties(circleRadius(7f), circleColor("#4b9dff"), circleStrokeWidth(3f), circleStrokeColor("#ffffff"))
    )
  }

  /** The pins of the activity chosen, a star on the [followed] spots; the label pictures not drawn yet are drawn once. */
  fun show(style: Style, pins: List<MapPin>, followed: Set<String>, context: Context) {
    val metrics = context.resources.displayMetrics
    val missing = HashMap<String, Bitmap>()
    for (pin in pins) {
      val key = SeaMap.labelKey(pin) ?: continue
      if (key !in missing && style.getImage(key) == null) missing[key] = PinLabel.draw(pin, metrics.density, metrics.densityDpi)
    }
    if (missing.isNotEmpty()) style.addImages(missing)
    style.getSourceAs<GeoJsonSource>(PINS)?.setGeoJson(SeaMap.features(pins, followed))
  }

  /** The followed places ([fr.auxfilsdesidees.vigie.data.Favourites.places]): a pill each, with a star and the name. */
  fun showPlaces(style: Style, places: List<FollowedPlace>, context: Context) {
    val metrics = context.resources.displayMetrics
    val missing = HashMap<String, Bitmap>()
    for (f in places) {
      val key = SeaMap.placeKey(f.place.label)
      if (key !in missing && style.getImage(key) == null) missing[key] = Marks.place(f.place.label, metrics.density, metrics.densityDpi)
    }
    if (missing.isNotEmpty()) style.addImages(missing)
    style.getSourceAs<GeoJsonSource>(PLACES)?.setGeoJson(SeaMap.placeFeatures(places))
  }

  /** The phone's position, a blue dot (it never leaves the phone). */
  fun showMe(style: Style, lat: Double, lon: Double) {
    style.getSourceAs<GeoJsonSource>(ME)?.setGeoJson("""{"type":"Point","coordinates":[$lon,$lat]}""")
  }

  /**
   * What lies under a touch at [at] (screen pixels), within [slop] pixels: a spot's pin first, then a followed place, then
   * a town the base map names ([townLayers], [SeaMap.townLayers]); null on the sea or the land alone.
   */
  fun pick(map: MapLibreMap, townLayers: List<String>, at: PointF, slop: Float): Pick? {
    val box = RectF(at.x - slop, at.y - slop, at.x + slop, at.y + slop)
    map.queryRenderedFeatures(box, STARS, DOTS, LABELS).firstNotNullOfOrNull { it.getStringProperty("id") }?.let { return Pick.Spot(it) }
    map.queryRenderedFeatures(box, PLACES).firstNotNullOfOrNull { it.getStringProperty("key") }?.let { return Pick.Followed(it) }
    if (townLayers.isEmpty()) return null
    return map.queryRenderedFeatures(box, *townLayers.toTypedArray()).firstNotNullOfOrNull { f ->
      val point = f.geometry() as? Point ?: return@firstNotNullOfOrNull null
      val kind = if (f.hasProperty("class")) f.getStringProperty("class") else null
      if (kind != null && kind !in SeaMap.TOWN_CLASSES) return@firstNotNullOfOrNull null
      val name = listOf("name:fr", "name", "name_en").firstNotNullOfOrNull { k -> if (f.hasProperty(k)) f.getStringProperty(k)?.takeIf { it.isNotBlank() } else null }
      name?.let { Pick.Town(it, point.latitude(), point.longitude()) }
    }
  }
}

/** The marks of the followed spots and places, drawn at the screen's density, which MapLibre reads from the bitmap. */
internal object Marks {
  private val INK = "#F20A1220".toColorInt()
  private val FILL = "#EB0D161E".toColorInt()
  private val BORDER = "#479FD3F5".toColorInt()
  private val TEXT = "#F6F8FB".toColorInt()
  private val ACCENT = "#FFC857".toColorInt()

  /** A five-pointed star [size] dp wide in the blue of a verdict ([hex]), outlined in the app's yellow so it reads as « suivi ». */
  fun star(hex: String, density: Float, densityDpi: Int, size: Float = 20f): Bitmap {
    val px = ceil(size * density).toInt()
    val bitmap = Bitmap.createBitmap(px, px, Bitmap.Config.ARGB_8888)
    bitmap.density = densityDpi
    val canvas = Canvas(bitmap)
    val path = starPath(px / 2f, px / 2f, px / 2f - 1.5f * density)
    canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = INK; style = Paint.Style.STROKE; strokeWidth = 3.5f * density; strokeJoin = Paint.Join.ROUND })
    canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = hex.toColorInt() })
    canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ACCENT; style = Paint.Style.STROKE; strokeWidth = 1.6f * density; strokeJoin = Paint.Join.ROUND })
    return bitmap
  }

  /** A followed place: a dark pill with a yellow star and its [name], its point at the middle of its bottom edge. */
  fun place(name: String, density: Float, densityDpi: Int): Bitmap {
    val d = density
    val words =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = TEXT
        textSize = 13f * d
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      }
    val height = 24f * d
    val pad = 8f * d
    val star = 12f * d
    val gap = 5f * d
    val textWidth = words.measureText(name)
    val width = pad + star + gap + textWidth + pad
    // A small tip under the pill points at the place.
    val tip = 5f * d
    val bitmap = Bitmap.createBitmap(ceil(width).toInt(), ceil(height + tip).toInt(), Bitmap.Config.ARGB_8888)
    bitmap.density = densityDpi
    val canvas = Canvas(bitmap)
    val half = d / 2
    val pill = RectF(half, half, width - half, height - half)
    val radius = height / 2
    val body = Path().apply {
      addRoundRect(pill, radius, radius, Path.Direction.CW)
      moveTo(width / 2 - tip, height - half - 0.5f)
      lineTo(width / 2, height + tip - half)
      lineTo(width / 2 + tip, height - half - 0.5f)
      close()
    }
    canvas.drawPath(body, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = FILL })
    canvas.drawRoundRect(pill, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = d; color = BORDER })
    canvas.drawPath(starPath(pad + star / 2, height / 2, star / 2), Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ACCENT })
    val metrics = words.fontMetrics
    canvas.drawText(name, pad + star + gap, height / 2 - (metrics.ascent + metrics.descent) / 2, words)
    return bitmap
  }

  private fun starPath(cx: Float, cy: Float, outer: Float): Path {
    val inner = outer * 0.45f
    return Path().apply {
      for (k in 0 until 10) {
        val r = if (k % 2 == 0) outer else inner
        val a = Math.toRadians(-90.0 + k * 36.0)
        val x = cx + (r * cos(a)).toFloat()
        val y = cy + (r * sin(a)).toFloat()
        if (k == 0) moveTo(x, y) else lineTo(x, y)
      }
      close()
    }
  }
}
/**
 * The label of a pin, drawn as the site draws it (`.epingle` of the sketches, the pins of `/sea`): a dark pill with the dot
 * of the verdict, the figures in white, for the kite and the boat an arrow where the wind blows, and the way the tide goes
 * in yellow. Drawn at the screen's density, which MapLibre reads from the bitmap.
 */
internal object PinLabel {
  private val FILL = "#EB0D161E".toColorInt()
  private val BORDER = "#479FD3F5".toColorInt()
  private val TEXT = "#F6F8FB".toColorInt()
  private val TIDE = "#FFC857".toColorInt()

  fun draw(pin: MapPin, density: Float, densityDpi: Int): Bitmap {
    val text = pin.text.orEmpty()
    val d = density
    val words =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = TEXT
        textSize = 13f * d
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      }
    val height = 24f * d
    val padLeft = 6f * d
    val padRight = 9f * d
    val dot = 10f * d
    val gap = 5f * d
    val arrow = 10f * d
    val arrows = listOfNotNull(pin.windFrom?.let { (it + 180f) to TEXT }, pin.tide?.let { (if (it == "rising") 0f else 180f) to TIDE })
    val textWidth = words.measureText(text)
    val width = padLeft + dot + gap + textWidth + arrows.size * (gap + arrow) + padRight
    val bitmap = Bitmap.createBitmap(ceil(width).toInt(), ceil(height).toInt(), Bitmap.Config.ARGB_8888)
    bitmap.density = densityDpi
    val canvas = Canvas(bitmap)
    val half = d / 2
    val pill = RectF(half, half, width - half, height - half)
    val radius = height / 2
    canvas.drawRoundRect(pill, radius, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = FILL })
    canvas.drawRoundRect(
      pill,
      radius,
      radius,
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = d
        color = BORDER
      },
    )
    val band = SeaMap.BAND_COLOURS[SeaMap.band(pin.verdict)] ?: "#5e738c"
    canvas.drawCircle(padLeft + dot / 2, height / 2, dot / 2, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = band.toColorInt() })
    val metrics = words.fontMetrics
    val x = padLeft + dot + gap
    canvas.drawText(text, x, height / 2 - (metrics.ascent + metrics.descent) / 2, words)
    var ax = x + textWidth + gap + arrow / 2
    arrows.forEach { (angle, colour) ->
      drawArrow(canvas, ax, height / 2, arrow, angle, colour, 1.8f * d)
      ax += gap + arrow
    }
    return bitmap
  }

  /**
   * The site's arrow (`M8 13V3M4 7l4-4 4 4`), [size] high, centred on ([cx], [cy]), pointing up turned by [angle] degrees
   * clockwise: the wind where it blows to (its direction + 180°), the tide up when it rises.
   */
  private fun drawArrow(canvas: Canvas, cx: Float, cy: Float, size: Float, angle: Float, colour: Int, stroke: Float) {
    val top = cy - size / 2
    val back = top + size * 0.45f
    val path =
      Path().apply {
        moveTo(cx, cy + size / 2)
        lineTo(cx, top)
        moveTo(cx - size * 0.4f, back)
        lineTo(cx, top)
        lineTo(cx + size * 0.4f, back)
      }
    canvas.save()
    canvas.rotate(angle, cx, cy)
    canvas.drawPath(
      path,
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        color = colour
      },
    )
    canvas.restore()
  }
}
