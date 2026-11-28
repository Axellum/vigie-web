package fr.auxfilsdesidees.vigie.ui.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import androidx.core.graphics.toColorInt
import fr.auxfilsdesidees.vigie.data.MapWeather
import fr.auxfilsdesidees.vigie.data.WindPoint
import fr.auxfilsdesidees.vigie.data.WindUnit
import kotlin.math.ceil
import kotlin.math.max

/**
 * A badge of the wind measured, drawn as the site draws it (`windBadgeSvg` of vigie-web): a round in the colour of its
 * step (a rounded square for a buoy), ringed with the surface's colour, the mean wind in bold in it, and the gust in small
 * at its top right when it is well above the mean. The beak, toward where the wind goes, is a picture of its own, turned by
 * the map under the badge. Both are centred on the point, at the screen's density, which MapLibre reads from the bitmap.
 */
internal object WindBadge {
  private val SURFACE = MapWeather.SURFACE.toColorInt()
  private val INK = "#e2e9ed".toColorInt()
  private val SHADOW = 0x4D000000

  fun badge(p: WindPoint, radius: Int, unit: WindUnit, density: Float, densityDpi: Int): Bitmap {
    val d = density
    val r = radius * d
    val step = MapWeather.windStep(p.kmh)
    val value = MapWeather.windValue(p.kmh, unit)
    val gust = if (MapWeather.gustShown(p)) MapWeather.windValue(p.gustKmh!!, unit).toString() else null
    val small =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.DEFAULT_BOLD
        textSize = r * 0.7f
      }
    // The picture is a square centred on the point: wide enough for the gust beside the round when there is one.
    val half = if (gust == null) r + 3 * d else max(r + 3 * d, max(r * 0.55f + small.measureText(gust) + 3 * d, r * 1.25f + 3 * d))
    val side = ceil(2 * half).toInt()
    val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
    bitmap.density = densityDpi
    val canvas = Canvas(bitmap)
    val c = side / 2f
    val fill =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = (MapWeather.WIND_COLOURS[step] ?: "#7cc39b").toColorInt()
        setShadowLayer(1.5f * d, 0f, d, SHADOW)
      }
    val ring =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.3f * d
        color = SURFACE
      }
    if (p.buoy) {
      val box = RectF(c - r, c - r, c + r, c + r)
      canvas.drawRoundRect(box, r * 0.3f, r * 0.3f, fill)
      canvas.drawRoundRect(box, r * 0.3f, r * 0.3f, ring)
    } else {
      canvas.drawCircle(c, c, r, fill)
      canvas.drawCircle(c, c, r, ring)
    }
    val font = if (value >= 100) r * 0.82f else r * 0.98f
    val figure =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.DEFAULT_BOLD
        textSize = font
        textAlign = Paint.Align.CENTER
        color = if (step == 1) MapWeather.WIND_INK_ON_1.toColorInt() else android.graphics.Color.WHITE
      }
    canvas.drawText(value.toString(), c, c + font * 0.36f, figure)
    gust?.let {
      // As the site's `.gust`: from 0,55 r right of the centre, its top 1,25 r above it, ringed with the surface's colour.
      val x = c + r * 0.55f
      val baseline = c - r * 1.25f - small.fontMetrics.ascent * 0.9f
      canvas.drawText(it, x, baseline, Paint(small).apply { style = Paint.Style.STROKE; strokeWidth = 2.5f * d; strokeJoin = Paint.Join.ROUND; color = SURFACE })
      canvas.drawText(it, x, baseline, Paint(small).apply { color = INK })
    }
    return bitmap
  }

  /** The beak, pointing up from the round (the site's path), in the step's colour. */
  fun beak(p: WindPoint, radius: Int, density: Float, densityDpi: Int): Bitmap {
    val d = density
    val r = radius * d
    val side = ceil(2 * (r * 1.78f + 3 * d)).toInt()
    val bitmap = Bitmap.createBitmap(side, side, Bitmap.Config.ARGB_8888)
    bitmap.density = densityDpi
    val c = side / 2f
    val path =
      Path().apply {
        moveTo(c - r * 0.62f, c - r * 0.6f)
        lineTo(c, c - r * 1.78f)
        lineTo(c + r * 0.62f, c - r * 0.6f)
        close()
      }
    Canvas(bitmap)
      .drawPath(
        path,
        Paint(Paint.ANTI_ALIAS_FLAG).apply {
          color = (MapWeather.WIND_COLOURS[MapWeather.windStep(p.kmh)] ?: "#7cc39b").toColorInt()
          setShadowLayer(1.5f * d, 0f, d, SHADOW)
        },
      )
    return bitmap
  }
}
