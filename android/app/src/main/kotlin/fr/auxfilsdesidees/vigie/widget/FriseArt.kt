package fr.auxfilsdesidees.vigie.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.ui.Frise
import fr.auxfilsdesidees.vigie.ui.Words
import fr.auxfilsdesidees.vigie.ui.skyOf
import fr.auxfilsdesidees.vigie.ui.smoothPath
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import fr.auxfilsdesidees.vigie.ui.weatherIcon
import kotlin.math.roundToInt

/**
 * The frise of the frise widget, drawn into a picture: a home screen cannot draw a curve. The same shapes and colours
 * as the app's « Heures » tab (night shade, temperature on the charter's ramp, wind, rain bars, tide, verdict cells),
 * on fewer hours and without the row names. The tide and the surf come under the weather only when the picture is tall
 * enough ([SEA_MIN_DP]) and the place has a favourite spot.
 */
object FriseArt {
  /** Below this height of the picture (dp), the tide and the surf are left out: the weather keeps its room. */
  const val SEA_MIN_DP = 200f

  /** The words drawn in the picture, read once from the resources. */
  class Labels(val now: String, val gusts: String, val tide: String, val dry: String, val noTide: String, val noWeather: String) {
    companion object {
      fun of(context: Context) =
        Labels(
          now = context.getString(R.string.frise_now),
          gusts = context.getString(R.string.frise_gusts),
          tide = context.getString(R.string.frise_tide),
          dry = context.getString(R.string.frise_dry),
          noTide = context.getString(R.string.frise_no_tide),
          noWeather = context.getString(R.string.hours_no_weather),
        )
    }
  }

  fun draw(context: Context, strip: FriseModel.Strip, widthDp: Float, heightDp: Float, labels: Labels): Bitmap {
    val metrics = context.resources.displayMetrics
    val density = metrics.density
    val fontScale = context.resources.configuration.fontScale
    val w = (widthDp * density).roundToInt().coerceAtLeast(1)
    val h = (heightDp * density).roundToInt().coerceAtLeast(1)
    val image = ImageBitmap(w, h)
    val sea = strip.spot != null && heightDp >= SEA_MIN_DP
    CanvasDrawScope().draw(Density(density, fontScale), LayoutDirection.Ltr, Canvas(image), Size(w.toFloat(), h.toFloat())) {
      Painter(this, strip, labels, sea, fontScale).paint()
    }
    return image.asAndroidBitmap()
  }

  private class Painter(val scope: DrawScope, val strip: FriseModel.Strip, val labels: Labels, val sea: Boolean, val fontScale: Float) {
    val k = scope.density
    val width = scope.size.width
    val height = scope.size.height
    val n = strip.hours.size
    val gx = 8 * k
    val gw = width - 16 * k
    val step = gw / n

    // Rows, from the top: the sky icons, the temperature, the wind, the rain; then the tide and the surf; then the hours.
    val axisH = 18 * k
    val seaH = if (sea) 86 * k else 0f
    val top = 4 * k
    val weatherBottom = height - axisH - seaH
    val iconH = 24 * k
    val rest = weatherBottom - (top + iconH)
    val tempTop = top + iconH
    val tempH = rest * 0.42f
    val windTop = tempTop + tempH
    val windH = rest * 0.33f
    val rainTop = windTop + windH
    val rainH = weatherBottom - rainTop

    fun xC(i: Int) = gx + step * (i + 0.5f)

    fun xT(t: Long) = gx + gw * ((t - strip.startUtc).toFloat() / (strip.endUtc - strip.startUtc))

    fun paint() {
      card()
      nights()
      if (strip.hours.any { it.weather != null }) {
        sky()
        temperature()
        wind()
        rain()
      } else {
        text(labels.noWeather, width / 2, (top + weatherBottom) / 2, VigieColors.Text3, 12f, Paint.Align.CENTER)
      }
      if (sea) sea()
      axis()
    }

    fun card() =
      with(scope) {
        drawRoundRect(VigieColors.Glass, cornerRadius = CornerRadius(12 * k))
        drawRoundRect(VigieColors.GlassBorder, Offset(0.75f * k, 0.75f * k), Size(width - 1.5f * k, height - 1.5f * k), CornerRadius(12 * k), style = Stroke(1.5f * k))
      }

    fun nights() =
      with(scope) {
        strip.hours.forEachIndexed { i, h ->
          if (h.night) drawRect(Color.Black.copy(alpha = 0.16f), Offset(gx + step * i, top), Size(step + 0.4f * k, height - axisH - top))
        }
        for (i in FriseModel.midnights(strip.hours, strip.offsetS)) {
          val x = gx + step * i
          drawLine(Color.White.copy(alpha = 0.25f), Offset(x, top), Offset(x, height - axisH), k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2 * k, 4 * k)))
        }
      }

    /** One icon every two hours, between the two. */
    fun sky() =
      with(scope) {
        for (i in 0 until n step 2) {
          val hour = strip.hours[i]
          val s = skyOf(hour.weather?.weatherCode, !hour.night) ?: continue
          weatherIcon(s, gx + step * (i + 1f), top + iconH / 2, 20 * k)
        }
      }

    /** The curve on the charter's ramp, the highest written above it and the lowest under it. */
    fun temperature(): Unit =
      with(scope) {
        val temps = strip.hours.mapIndexedNotNull { i, h -> h.weather?.tempC?.let { i to it } }
        if (temps.size < 2) return
        val (lo, hi) = FriseModel.tempScale(temps.map { it.second })
        val y0 = tempTop + 13 * k
        val hh = (tempH - 26 * k).coerceAtLeast(4 * k)
        val pts = temps.map { (i, v) -> Offset(xC(i), y0 + hh - ((v - lo) / (hi - lo)).toFloat() * hh) }
        val mean = VigieColors.temperature(temps.map { it.second }.average())
        val floor = tempTop + tempH
        val fill = smoothPath(pts).apply {
          lineTo(pts.last().x, floor)
          lineTo(pts.first().x, floor)
          close()
        }
        drawPath(fill, Brush.verticalGradient(listOf(mean.copy(alpha = 0.30f), mean.copy(alpha = 0f)), startY = y0, endY = floor))
        val span = (pts.last().x - pts.first().x).coerceAtLeast(1f)
        val stops = temps.mapIndexed { j, (_, v) -> ((pts[j].x - pts.first().x) / span) to VigieColors.temperature(v) }.toTypedArray()
        drawPath(smoothPath(pts), Brush.horizontalGradient(*stops, startX = pts.first().x, endX = pts.last().x), style = Stroke(3 * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
        val jMax = temps.indices.maxBy { temps[it].second }
        val jMin = temps.indices.minBy { temps[it].second }
        label(Words.degrees(temps[jMax].second), pts[jMax].x, pts[jMax].y - 6 * k, VigieColors.temperature(temps[jMax].second))
        if (jMin != jMax) label(Words.degrees(temps[jMin].second), pts[jMin].x, pts[jMin].y + 14 * k, VigieColors.temperature(temps[jMin].second))
      }

    /** The mean wind's curve from 0, and the strongest gust written over it. */
    fun wind() =
      with(scope) {
        val winds = strip.hours.mapIndexedNotNull { i, h -> h.weather?.windKmh?.let { i to it } }
        if (winds.size >= 2) {
          val hi = maxOf(1.0, winds.maxOf { it.second } * 1.05)
          val y0 = windTop + 13 * k
          val floor = windTop + windH - 2 * k
          val hh = (floor - y0).coerceAtLeast(4 * k)
          val pts = winds.map { (i, v) -> Offset(xC(i), floor - (v / hi).toFloat() * hh) }
          val fill = smoothPath(pts).apply {
            lineTo(pts.last().x, floor)
            lineTo(pts.first().x, floor)
            close()
          }
          drawPath(fill, Brush.verticalGradient(listOf(VigieColors.Wind.copy(alpha = 0.30f), VigieColors.Wind.copy(alpha = 0f)), startY = y0, endY = floor))
          drawPath(smoothPath(pts), VigieColors.Wind, style = Stroke(2.5f * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
        }
        val gusts = strip.hours.mapIndexedNotNull { i, h -> h.weather?.gustKmh?.let { i to it } }
        if (gusts.isNotEmpty()) {
          val (i, g) = gusts.maxBy { it.second }
          label(String.format(labels.gusts, Words.kmh(g)), xC(i), windTop + 10 * k, VigieColors.Text2)
        }
      }

    /** Pill bars on a square-root scale over a thin line, the total at the end; « sec » when every hour is known and dry. */
    fun rain(): Unit =
      with(scope) {
        val base = rainTop + rainH - 3 * k
        drawRect(Color.White.copy(alpha = 0.1f), Offset(gx, base), Size(gw, 1.5f * k))
        val rains = strip.hours.map { it.weather?.rainMm }
        val known = rains.filterNotNull()
        if (known.isEmpty()) return
        val total = known.sum()
        if (total > 0) {
          val lw = minOf(7 * k, step * 0.45f)
          val room = (rainH - 6 * k).coerceAtLeast(4 * k)
          rains.forEachIndexed { i, mm ->
            if (mm == null || mm <= 0) return@forEachIndexed
            val hp = FriseModel.rainShare(mm, known.max()) * room
            val col = if (mm < 1) VigieColors.RainLight else if (mm < 3) VigieColors.Rain else VigieColors.RainHeavy
            drawRoundRect(col, Offset(xC(i) - lw / 2, base - hp), Size(lw, hp), CornerRadius(lw / 2))
          }
          text(Words.mm(total), gx + gw, rainTop + 10 * k, VigieColors.Rain, 11f, Paint.Align.RIGHT)
        } else if (known.size == rains.size) {
          text(labels.dry, gx + gw, base - 4 * k, VigieColors.Text3, 11f, Paint.Align.RIGHT)
        }
      }

    /** The tide of the favourite spot (half cosine between its extremes, their times written), then its surf, hour by hour. */
    fun sea() =
      with(scope) {
        val y = weatherBottom
        text(labels.tide, gx + 2 * k, y + 12 * k, VigieColors.Text3, 11f, Paint.Align.LEFT)
        val extremes = strip.tide
        val curveTop = y + 22 * k
        val curveH = 20 * k
        if (extremes.size >= 2) {
          val lo = extremes.minOf { it.heightM }
          val hi = extremes.maxOf { it.heightM }
          fun yT(m: Double) = curveTop + curveH - ((m - lo) / (if (hi > lo) hi - lo else 1.0)).toFloat() * curveH
          val pts = (0..56).mapNotNull { j -> val t = strip.startUtc + (strip.endUtc - strip.startUtc) * j / 56; Frise.tideHeight(extremes, t)?.let { Offset(xT(t), yT(it)) } }
          if (pts.size >= 2) {
            val fill = smoothPath(pts).apply {
              lineTo(pts.last().x, curveTop + curveH + 6 * k)
              lineTo(pts.first().x, curveTop + curveH + 6 * k)
              close()
            }
            drawPath(fill, Brush.verticalGradient(listOf(VigieColors.Water.copy(alpha = 0.38f), VigieColors.Water.copy(alpha = 0.04f)), startY = curveTop, endY = curveTop + curveH + 6 * k))
            drawPath(smoothPath(pts), VigieColors.Water, style = Stroke(2.5f * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
            for (e in strip.extremes) {
              val word = (if (e.high) "PM " else "BM ") + Words.clock(e.timeUtc, strip.offsetS)
              val ye = yT(e.heightM)
              label(word, xT(e.timeUtc), if (e.high) ye - 6 * k else ye + 14 * k, VigieColors.Text)
            }
          }
        } else {
          text(labels.noTide, gx + 2 * k, curveTop + curveH / 2 + 4 * k, VigieColors.Text3, 11f, Paint.Align.LEFT)
        }
        val surfY = y + 60 * k
        text("${Words.activity(FriseModel.SEA_ACTIVITY)} · ${strip.spot}", gx + 2 * k, surfY + 10 * k, VigieColors.Text3, 11f, Paint.Align.LEFT)
        strip.sea.forEachIndexed { i, v ->
          val col = if (v == null) VigieColors.Rule.copy(alpha = 0.55f) else VigieColors.verdict(v)
          drawRoundRect(col, Offset(gx + i * step + 0.75f * k, surfY + 14 * k), Size(step - 1.5f * k, 10 * k), CornerRadius(3 * k))
        }
      }

    /** The hours under the frise, « Maint. » under the line of now, in the accent colour. */
    fun axis() =
      with(scope) {
        val xNow = gx + step * strip.nowFrac
        drawLine(VigieColors.Accent, Offset(xNow, top), Offset(xNow, height - axisH), 2 * k)
        val baseline = height - 5 * k
        val nowWidth = paint(11f, true).measureText(labels.now)
        val nowLeft = (xNow - nowWidth / 2).coerceAtLeast(4 * k)
        text(labels.now, nowLeft, baseline, VigieColors.Accent, 11f, Paint.Align.LEFT, bold = true)
        for (tick in strip.ticks) {
          val x = xC(tick.index)
          if (x - 14 * k < nowLeft + nowWidth) continue
          text(tick.text, x, baseline, VigieColors.Text3, 11f, Paint.Align.CENTER)
        }
      }

    /** A value written on a curve, kept inside the frise. */
    fun label(s: String, x: Float, baseline: Float, color: Color) {
      val half = paint(11f, false).measureText(s) / 2
      text(s, x.coerceIn(gx + half, gx + gw - half), baseline, color, 11f, Paint.Align.CENTER)
    }

    fun paint(sizeSp: Float, bold: Boolean) =
      Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = sizeSp * fontScale * k
        typeface = if (bold) Typeface.create(Typeface.DEFAULT, Typeface.BOLD) else Typeface.DEFAULT
      }

    fun text(s: String, x: Float, baseline: Float, color: Color, sizeSp: Float, align: Paint.Align, bold: Boolean = false) {
      val p = paint(sizeSp, bold).apply {
        this.color = color.toArgb()
        textAlign = align
      }
      scope.drawIntoCanvas { it.nativeCanvas.drawText(s, x, baseline, p) }
    }
  }
}
