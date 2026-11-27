package fr.auxfilsdesidees.vigie.ui.board

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import fr.auxfilsdesidees.vigie.ui.smoothPath
import fr.auxfilsdesidees.vigie.ui.windArrow

/*
 * The columns of the card's home page, the hours and the days, drawn once for the app ([HomeBoardView], in a Canvas) and
 * for the home screen widgets (`widget/BoardArt.kt`, in a picture). The sizes are the card's px: the drawing multiplies them
 * by the DrawScope's density, the screen's in the app, the screen's times the widget's scale in a picture. [m] measures the
 * texts at that same density.
 */

/** The height of the hours' columns: 206 with the chance of rain, 192 without (the card's). */
internal fun hoursHeight(slots: List<HomeBoard.HourSlot>): Float = if (slots.any { it.chance != null }) 206f else 192f

/** The height of the days' columns: 250 with the chance of rain, 236 without, 14 more with the line of their sunshine. */
internal fun daysHeight(days: List<HomeBoard.DayColumn>): Float =
  (if (days.any { it.chance != null }) 250f else 236f) + (if (days.any { it.sunshineH != null }) 14f else 0f)

/** The next 24 hours in [w] (title left out): a column per slot, its icon, the temperature curve, the rain, its chance, the wind and gusts, the hour. */
internal fun DrawScope.drawHours(m: TextMeasurer, h: HomeBoard.Hours, offsetS: Int, w: Float, pal: BoardPalette) {
  val list = h.slots
  val n = list.size
  val cw = w / n
  val hasP = list.any { it.chance != null }
  val height = hoursHeight(list)
  val yWind = if (hasP) 158f else 144f
  val k = density
  list.forEachIndexed { i, x -> column(pal, cw * i, cw, height, pal.glow(x.sun, x.day, height * k), i == 0, 9f) }
  list.forEachIndexed { i, x -> familyIcon(x.kind, cw * (i + 0.5f) * k, 14f * k, 24f * k, pal) }
  // The curve: at least 4 °C from top to bottom, so that 2° never looks like a fall.
  val temps = list.map { it.temp }
  val mn = temps.min()
  val mx = temps.max()
  val amp = maxOf(4.0, mx - mn)
  val low = (mn + mx) / 2 - amp / 2
  val yRel = temps.map { (66 - (it - low) / amp * 44).toFloat() }
  val pts = yRel.mapIndexed { i, y -> Offset(cw * (i + 0.5f) * k, (26 + y) * k) }
  drawPath(smoothPath(pts), tempBrush(pal, temps, w * k), style = Stroke(4f * k, cap = StrokeCap.Round))
  list.forEachIndexed { i, x -> label(m, "${HomeBoard.fmt(x.temp)}°", pts[i].x, yRel[i] + 7, 13f, pal.temperature(x.temp), lineHeight = 1.2f) }
  // The rain: its amount over the bar, the bars standing on the same line.
  list.forEachIndexed { i, x ->
    val mm = x.mm?.takeIf { it >= 0.1 } ?: return@forEachIndexed
    val bh = HomeBoard.hourBar(mm, h.step)
    val bw = minOf(18f, cw * 0.7f)
    val cx = cw * (i + 0.5f)
    drawRoundRect(pal.rainOf(mm / h.step), Offset((cx - bw / 2) * k, (142 - bh) * k), Size(bw * k, bh * k), CornerRadius(4f * k))
    label(m, HomeBoard.fmt(mm, if (mm < 10) 1 else 0), cx * k, 142 - bh - 2 - 11.7f, 10f, pal.rainLight)
  }
  if (hasP) list.forEachIndexed { i, x -> x.chance?.let { label(m, "${HomeBoard.fmt(it)} %", cw * (i + 0.5f) * k, 144f, 10f, pal.t3, FontWeight.Medium) } }
  // The wind: its arrow and speed, the gust under it (yellow from 60, orange from 80).
  list.forEachIndexed { i, x ->
    val cx = cw * (i + 0.5f) * k
    val speed = m.measure(HomeBoard.fmt(x.wind), TextStyle(color = pal.wind, fontSize = 12f.dp.toSp(), fontWeight = FontWeight.Bold))
    val arrow = if (x.deg != null) 11f * k + 2f * k else 0f
    val left = cx - (arrow + speed.size.width) / 2
    val mid = (yWind + 7.5f) * k
    if (x.deg != null) windArrow(left + 5.5f * k, mid, 11f * k, x.deg, pal.wind)
    drawText(speed, topLeft = Offset(left + arrow, mid - speed.size.height / 2f))
    x.gust?.let { g ->
      val c = pal.gust(g)
      label(m, HomeBoard.fmt(g), cx, yWind + 15f, 10f, c ?: pal.t3, if (c != null) FontWeight.Bold else FontWeight.Normal, 1.25f)
    }
  }
  // Under 36 dp a column has no room for « 21:00 »: in French « 21 h » fits, the card keeps it.
  list.forEachIndexed { i, x -> label(m, HomeBoard.hourOnly(x.ts, offsetS), cw * (i + 0.5f) * k, height - 17, 11f, if (i == 0) pal.accent else pal.t2) }
}

/**
 * The days in [w] (title left out): a column per day tinted by its sun, the highest and lowest as two curves around a band,
 * rain, chance, wind. Where the answer gives the hours of sunshine, a line under the icon says them (« 7 h », « 30 min ») and
 * everything under it goes 14 px down, as in the card.
 */
internal fun DrawScope.drawDays(m: TextMeasurer, days: List<HomeBoard.DayColumn>, w: Float, pal: BoardPalette) {
  val n = days.size
  val cw = w / n
  val tight = cw < 50
  val hasP = days.any { it.chance != null }
  val sh = if (days.any { it.sunshineH != null }) 14f else 0f // the line of sunshine
  val height = daysHeight(days)
  val sunColour = pal.iconRoles["vs"] ?: pal.yellow
  val k = density
  days.forEachIndexed { i, d -> column(pal, cw * i, cw, height, pal.glow(d.sun, true, height * k), i == 0, 10f) }
  days.forEachIndexed { i, d ->
    val cx = cw * (i + 0.5f) * k
    label(m, if (tight) d.nameShort else d.name, cx, 3f, 13f, if (i == 0) pal.accent else pal.text)
    familyIcon(d.kind, cx, (3 + 15.2f + 1 + 15) * k, 30f * k, pal)
    // The card's `.ds`: a line of 13 px under the icon (1 px apart), a dot of 5 px, 3 px, the hours in 11 px semi-bold.
    if (d.sunshineH != null) {
      val col =
        when (HomeBoard.sunTone(d)) {
          2 -> sunColour
          1 -> mixSrgb(pal.t3, sunColour, 0.55f)
          else -> pal.t3
        }
      val r = m.measure(HomeBoard.sunHoursText(d.sunshineH, tight), TextStyle(color = col, fontSize = 11.dp.toSp(), fontWeight = FontWeight.SemiBold), softWrap = false, maxLines = 1)
      val left = cx - (8 * k + r.size.width) / 2
      val mid = (3 + 15.2f + 1 + 30 + 1 + 6.5f) * k
      drawCircle(col, 2.5f * k, Offset(left + 2.5f * k, mid))
      drawText(r, topLeft = Offset(left + 8 * k, mid - r.size.height / 2f))
    }
  }
  val (lo, hi) = HomeBoard.dayScale(days)
  fun yOf(t: Double) = (150 + sh - (t - lo) / (hi - lo) * 76).toFloat()
  val mx = days.mapIndexed { i, d -> Offset(cw * (i + 0.5f) * k, yOf(d.tmax) * k) }
  val mn = days.mapIndexed { i, d -> Offset(cw * (i + 0.5f) * k, yOf(d.tmin) * k) }
  // One outline: along the highest, then back along the lowest (the card's band).
  val band =
    Path().apply {
      smoothInto(this, mx, start = true)
      smoothInto(this, mn.reversed(), start = false)
      close()
    }
  val bounds = band.getBounds()
  // The curves in a layer of their own, so that the dots are hollow: the columns show through them.
  drawContext.canvas.saveLayer(Rect(0f, 0f, w * k, height * k), Paint())
  drawPath(
    band,
    Brush.verticalGradient(
      listOf(pal.temperature(days.map { it.tmax }.average()).copy(alpha = 0.2f), pal.temperature(days.map { it.tmin }.average()).copy(alpha = 0.16f)),
      startY = bounds.top,
      endY = bounds.bottom,
    ),
  )
  drawPath(smoothPath(mx), tempBrush(pal, days.map { it.tmax }, w * k), style = Stroke(4f * k, cap = StrokeCap.Round))
  drawPath(smoothPath(mn), tempBrush(pal, days.map { it.tmin }, w * k), style = Stroke(3f * k, cap = StrokeCap.Round))
  (mx + mn).forEach { drawCircle(Color.Black, 3.75f * k, it, blendMode = BlendMode.Clear) }
  drawContext.canvas.restore()
  days.forEachIndexed { i, d ->
    drawCircle(pal.temperature(d.tmax), 3.75f * k, mx[i], style = Stroke(2.5f * k))
    drawCircle(pal.temperature(d.tmin), 3.75f * k, mn[i], style = Stroke(2.5f * k))
    label(m, "${HomeBoard.fmt(d.tmax)}°", mx[i].x, yOf(d.tmax) - 26, 15f, pal.temperature(d.tmax), lineHeight = 1.2f)
    label(m, "${HomeBoard.fmt(d.tmin)}°", mn[i].x, yOf(d.tmin) + 7, 13f, pal.temperature(d.tmin), FontWeight.Medium, 1.2f)
  }
  // Rain, chance and wind, stacked as the card stacks them.
  val textSize = if (tight) 11f else 12f
  days.forEachIndexed { i, d ->
    val cx = cw * (i + 0.5f)
    val mm = d.rainMm
    val wet = mm != null && mm >= 0.5
    val bh = HomeBoard.dayBar(mm)
    val bw = minOf(26f, cw * 0.55f)
    drawRoundRect(if (wet) pal.rainOf(mm / 6) else pal.hollow, Offset((cx - bw / 2) * k, (200 + sh - bh) * k), Size(bw * k, bh * k), CornerRadius(4f * k))
    var y = 202f + sh
    if (mm != null) {
      val txt = if (wet) "${if (mm < 1) HomeBoard.fmt(mm, 1) else HomeBoard.fmt(mm)} mm" else "sec"
      label(m, txt, cx * k, y, textSize, if (wet) pal.rainLight else pal.t3)
    }
    y += textSize * 1.17f + 2
    if (hasP) {
      d.chance?.let { label(m, "${HomeBoard.fmt(it)} %", cx * k, y, 10f, pal.t3, FontWeight.Medium) }
      y += 11.7f + 2
    }
    y += 3
    val wind = buildAnnotatedString {
      if (d.windMax != null) withStyle(bold(pal.wind)) { append(HomeBoard.fmt(d.windMax)) }
      if (d.gust != null) withStyle(SpanStyle(color = pal.t3, fontWeight = FontWeight.Normal, fontSize = (if (tight) 9f else 10f).dp.toSp())) { append("/${HomeBoard.fmt(d.gust)}") }
    }
    val r = m.measure(wind, TextStyle(fontSize = textSize.dp.toSp(), fontWeight = FontWeight.Bold), softWrap = false)
    val arrow = if (d.deg != null) (11f + (if (tight) 1f else 2f)) * k else 0f
    val left = cx * k - (arrow + r.size.width) / 2
    val mid = (y + textSize * 1.17f / 2) * k
    if (d.deg != null) windArrow(left + 5.5f * k, mid, 11f * k, d.deg, pal.wind)
    drawText(r, topLeft = Offset(left + arrow, mid - r.size.height / 2f))
  }
}

/** One column of the hours, the days or the widget's frise: its glow, and a green line around the one under way. */
internal fun DrawScope.column(pal: BoardPalette, left: Float, width: Float, height: Float, glow: Brush, ring: Boolean, radius: Float) {
  val k = density
  val x = (left + 1) * k
  val cw = maxOf(1f, width - 2) * k
  drawRoundRect(glow, Offset(x, 0f), Size(cw, height * k), CornerRadius(radius * k))
  if (ring) {
    val s = 1.5f * k
    drawRoundRect(pal.accent.copy(alpha = 0.75f), Offset(x + s / 2, s / 2), Size(cw - s, height * k - s), CornerRadius(radius * k - s / 2), style = Stroke(s))
  }
}

/** A horizontal brush through the colours of some temperatures, one stop in the middle of each of [n] columns. */
internal fun tempBrush(pal: BoardPalette, temps: List<Double>, widthPx: Float): Brush =
  if (temps.size == 1) Brush.horizontalGradient(listOf(pal.temperature(temps[0]), pal.temperature(temps[0])))
  else Brush.horizontalGradient(*temps.mapIndexed { i, t -> (i + 0.5f) / temps.size to pal.temperature(t) }.toTypedArray(), startX = 0f, endX = widthPx)

/** The card's `mix`: [a] towards [b] by [t], channel by channel in sRGB (Compose's `lerp` goes through Oklab). */
internal fun mixSrgb(a: Color, b: Color, t: Float): Color =
  Color(red = a.red + (b.red - a.red) * t, green = a.green + (b.green - a.green) * t, blue = a.blue + (b.blue - a.blue) * t)

/** The monotone curve of [smoothPath] appended to [path]: from a move ([start]) or a line to its first point. */
private fun smoothInto(path: Path, pts: List<Offset>, start: Boolean) {
  if (pts.isEmpty()) return
  if (start) path.moveTo(pts[0].x, pts[0].y) else path.lineTo(pts[0].x, pts[0].y)
  val n = pts.size
  if (n == 1) return
  val dx = FloatArray(n - 1) { pts[it + 1].x - pts[it].x }
  val m = FloatArray(n - 1) { (pts[it + 1].y - pts[it].y) / dx[it] }
  val t = FloatArray(n)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (i in 1 until n - 1) t[i] = if (m[i - 1] * m[i] <= 0) 0f else (m[i - 1] + m[i]) / 2
  for (i in 0 until n - 1) {
    if (m[i] == 0f) {
      t[i] = 0f
      t[i + 1] = 0f
    } else {
      val a = t[i] / m[i]
      val b = t[i + 1] / m[i]
      val s = a * a + b * b
      if (s > 9) {
        val q = 3 / kotlin.math.sqrt(s)
        t[i] = q * a * m[i]
        t[i + 1] = q * b * m[i]
      }
    }
  }
  for (i in 0 until n - 1) {
    val h = dx[i] / 3
    path.cubicTo(pts[i].x + h, pts[i].y + t[i] * h, pts[i + 1].x - h, pts[i + 1].y - t[i + 1] * h, pts[i + 1].x, pts[i + 1].y)
  }
}
