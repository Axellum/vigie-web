package fr.auxfilsdesidees.vigie.ui.map

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.graphics.toColorInt
import fr.auxfilsdesidees.vigie.data.MapPin
import fr.auxfilsdesidees.vigie.data.SeaMap
import kotlin.math.ceil
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression.color
import org.maplibre.android.style.expressions.Expression.get
import org.maplibre.android.style.expressions.Expression.has
import org.maplibre.android.style.expressions.Expression.match
import org.maplibre.android.style.expressions.Expression.stop
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.iconAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.iconAnchor
import org.maplibre.android.style.layers.PropertyFactory.iconImage
import org.maplibre.android.style.layers.PropertyFactory.iconOffset
import org.maplibre.android.style.layers.PropertyFactory.symbolSortKey
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The layers the app puts over the base map, as the site's sea map: a dot per spot in the blue of its verdict, always
 * drawn, and to its left a label with the figures of the hour; where two labels would touch, MapLibre keeps the better
 * verdict (`symbol-sort-key` = the rank) and the dots stay. Over them, the phone's position when asked for.
 */
internal object MapLayers {
  private const val PINS = "vigie-pins"
  private const val DOTS = "vigie-dots"
  private const val LABELS = "vigie-labels"
  private const val ME = "vigie-me"
  private const val EMPTY = """{"type":"FeatureCollection","features":[]}"""

  /** The colour of a dot without a verdict: the charter's rule grey, never a verdict's blue. */
  private const val NO_VERDICT = "#5e738c"

  fun add(style: Style) {
    style.addSource(GeoJsonSource(PINS, EMPTY))
    style.addLayer(
      CircleLayer(DOTS, PINS)
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

  /** The pins of the activity chosen; the label pictures not drawn yet are drawn once. */
  fun show(style: Style, pins: List<MapPin>, context: Context) {
    val metrics = context.resources.displayMetrics
    val missing = HashMap<String, Bitmap>()
    for (pin in pins) {
      val key = SeaMap.labelKey(pin) ?: continue
      if (key !in missing && style.getImage(key) == null) missing[key] = PinLabel.draw(pin, metrics.density, metrics.densityDpi)
    }
    if (missing.isNotEmpty()) style.addImages(missing)
    style.getSourceAs<GeoJsonSource>(PINS)?.setGeoJson(SeaMap.features(pins))
  }

  /** The phone's position, a blue dot (it never leaves the phone). */
  fun showMe(style: Style, lat: Double, lon: Double) {
    style.getSourceAs<GeoJsonSource>(ME)?.setGeoJson("""{"type":"Point","coordinates":[$lon,$lat]}""")
  }
}

/**
 * The label of a pin, drawn as the site draws it (`.epingle` of the sketches, the pins of `/sea`): a dark pill with the dot
 * of the verdict, the figures in white and the way the tide goes in yellow. Drawn at the screen's density, which MapLibre
 * reads from the bitmap.
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
    val arrow = if (pin.tide != null) 10f * d else 0f
    val textWidth = words.measureText(text)
    val width = padLeft + dot + gap + textWidth + (if (arrow > 0) gap + arrow else 0f) + padRight
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
    if (arrow > 0) {
      val ax = x + textWidth + gap + arrow / 2
      val top = height / 2 - arrow / 2
      val bottom = height / 2 + arrow / 2
      val up = pin.tide == "rising"
      val tip = if (up) top else bottom
      val back = if (up) top + arrow * 0.45f else bottom - arrow * 0.45f
      val path =
        Path().apply {
          moveTo(ax, if (up) bottom else top)
          lineTo(ax, tip)
          moveTo(ax - arrow * 0.4f, back)
          lineTo(ax, tip)
          lineTo(ax + arrow * 0.4f, back)
        }
      canvas.drawPath(
        path,
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          style = Paint.Style.STROKE
          strokeWidth = 1.8f * d
          strokeCap = Paint.Cap.ROUND
          strokeJoin = Paint.Join.ROUND
          color = TIDE
        },
      )
    }
    return bitmap
  }
}
