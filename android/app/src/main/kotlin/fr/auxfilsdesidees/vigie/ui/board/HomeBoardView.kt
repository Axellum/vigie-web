package fr.auxfilsdesidees.vigie.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.ui.smoothPath
import fr.auxfilsdesidees.vigie.ui.windArrow
import androidx.compose.material3.Text
import kotlin.math.roundToInt

/**
 * The home page of the Home Assistant card, drawn natively (piste B of the sketches chosen on 2026-11-27, with the rain tile
 * of piste A, columns « Lueur »): now, the rain of the hour, the strongest line of the season, the next 24 hours and the
 * days. The sizes are the card's, in dp for its px: the layout follows the width as the card's does (columns by 1, 2 or 3
 * hours, day names without their number under 50 dp a column). The texts keep their size whatever the phone's font scale,
 * as in a drawing: the board is laid out to the dp, and a bigger font would overlap its columns. [onRain]: what a tap on the
 * rain tile does (the card opens its Details page), none when null.
 */
@Composable
fun HomeBoardView(p: PointNow, now: Long, modifier: Modifier = Modifier, onRain: (() -> Unit)? = null) {
  val pal = BoardPalette.Dark
  BoxWithConstraints(modifier.fillMaxWidth()) {
    val w = maxWidth.value
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
      NowBlock(p, now, w, pal)
      HomeBoard.rainTile(p, now)?.let { RainTileView(it, w, pal, onRain) }
      HomeBoard.seasonPill(p, now)?.let { SeasonPillView(it, pal) }
      HomeBoard.hours(p, now, w)?.let { HoursBlock(it, p.utcOffsetS, w, pal) }
      HomeBoard.days(p, now, 7).takeIf { it.size >= 2 }?.let { DaysBlock(it, w, pal) }
    }
  }
}

/** A size in the card's px, as text that ignores the phone's font scale. */
@Composable
internal fun fs(px: Float): TextUnit = with(LocalDensity.current) { px.dp.toSp() }

internal fun bold(c: Color) = SpanStyle(color = c, fontWeight = FontWeight.Bold)

// ---------------------------------------------------------------------------------------------------------------- now

/**
 * Icon, temperature in its colour, the weather, feeling and humidity, the wind; beside it the gusts to come, the pressure,
 * the air and the UV, the sun. Under 370 dp the gust of now goes (the gusts to come stay), under 340 the humidity too, and
 * the icon and the temperature are smaller: the card's rule, so that nothing is cut.
 */
@Composable
private fun NowBlock(p: PointNow, now: Long, w: Float, pal: BoardPalette) {
  val m = HomeBoard.now(p, now)
  val less = if (w < 340) 2 else if (w < 370) 1 else 0
  val k = (w / 448f).coerceIn(if (less >= 2) 0.72f else 0.8f, 1f)
  val small = if (k < 0.9f) 11f else 12f
  val off = p.utcOffsetS
  Row(Modifier.fillMaxWidth().heightIn(min = (68 * k).dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
    FamilyIcon(m.kind, (54 * k).roundToInt().dp, pal)
    if (m.temp != null) {
      Text(
        "${HomeBoard.fmt(m.temp)}°",
        color = pal.temperature(m.temp),
        style = TextStyle(fontSize = fs((52 * k).roundToInt().toFloat()), fontWeight = FontWeight.Bold, letterSpacing = fs(-1f), lineHeight = 1.em),
      )
    }
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
      m.label?.let { Text(it, color = pal.text, fontSize = fs((15 * minOf(k, 1.1f)).roundToInt().toFloat()), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis) }
      val feels = listOfNotNull(m.feels?.let { "ressenti ${HomeBoard.fmt(it)}°" }, m.humidity?.takeIf { less < 2 }?.let { "${HomeBoard.fmt(it)} %" }).joinToString(" · ")
      if (feels.isNotEmpty()) Text(feels, color = pal.t2, fontSize = fs(12f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (m.wind != null) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          if (m.deg != null) Canvas(Modifier.size(13.dp)) { windArrow(size.width / 2, size.height / 2, size.width, m.deg, pal.wind) }
          val line = buildAnnotatedString {
            withStyle(bold(pal.wind)) { append(HomeBoard.fmt(m.wind)) }
            append(" km/h")
            if (m.gust != null && less < 1) {
              append(" · raf. ")
              withStyle(bold(pal.wind)) { append(HomeBoard.fmt(m.gust)) }
            }
          }
          Text(line, color = pal.t2, fontSize = fs(13f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
      }
    }
    val facts = nowFacts(p, now, off, pal)
    if (facts.isNotEmpty()) {
      Column(Modifier.width((146 * maxOf(k, 0.8f)).roundToInt().dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        facts.forEach { (sunDot, line) ->
          Row(verticalAlignment = Alignment.CenterVertically) {
            if (sunDot) Canvas(Modifier.padding(end = 4.dp).size(12.dp)) { drawCircle(pal.yellow, size.width * 5 / 24) }
            Text(line, color = pal.t2, fontSize = fs(small), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
        }
      }
    }
  }
}

/** The lines beside now: (with the sun's dot, the line). */
private fun nowFacts(p: PointNow, now: Long, off: Int, pal: BoardPalette): List<Pair<Boolean, AnnotatedString>> {
  val out = ArrayList<Pair<Boolean, AnnotatedString>>()
  HomeBoard.gustPeak(p, now)?.let { (v, at) ->
    out += false to buildAnnotatedString {
      append("Rafales ")
      withStyle(bold(pal.gust(v) ?: pal.wind)) { append(HomeBoard.fmt(v)) }
      append(" vers ${HomeBoard.hm(at, off)}")
    }
  }
  p.pressureHpa?.let { hpa ->
    val tr = HomeBoard.pressureTrend(p, now)
    out += false to buildAnnotatedString {
      withStyle(bold(pal.text)) { append(HomeBoard.fmt(hpa)) }
      append(" hPa")
      if (tr.isNotEmpty()) append(" $tr")
    }
  }
  if (p.aqiEu != null || p.uvIndex != null) {
    out += false to buildAnnotatedString {
      p.aqiEu?.let { aqi ->
        val (word, tone) = HomeBoard.air(aqi)
        append("Air ")
        withStyle(bold(pal.tone(tone))) { append(word) }
      }
      p.uvIndex?.let { uv -> append(if (p.aqiEu != null) " · UV ${HomeBoard.fmt(uv)}" else "UV ${HomeBoard.fmt(uv)}") }
    }
  }
  HomeBoard.sunTimes(p, now)?.takeIf { it.rise != null || it.set != null }?.let { s ->
    val set = s.set?.let { "↓ ${HomeBoard.hm(it, off)}" }
    val rise = s.rise?.let { "↑ ${HomeBoard.hm(it, off)}" }
    out += true to AnnotatedString((if (s.up) listOf(set, rise) else listOf(rise, set)).filterNotNull().joinToString(" · "))
  }
  return out
}

// --------------------------------------------------------------------------------------------------------------- rain

/** The rain of the next hour: when it comes, how strong, a bar per step and the hours under them. */
@Composable
private fun RainTileView(t: HomeBoard.RainTile, w: Float, pal: BoardPalette, onClick: (() -> Unit)?) {
  val shape = RoundedCornerShape(12.dp)
  Row(
    Modifier.fillMaxWidth()
      .height(56.dp)
      .clip(shape)
      .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
      .background(pal.rain.copy(alpha = 0.12f), shape)
      .border(1.dp, pal.rain.copy(alpha = 0.45f), shape)
      .padding(horizontal = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    CardGlyph("parapluie", 22.dp, pal.rain, 2.2f)
    Column(Modifier.widthIn(max = (w * 0.6f).roundToInt().dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
      Text(t.head, color = pal.text, fontSize = fs(15f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (t.sub.isNotEmpty()) {
        Text(t.sub, color = pal.t2, fontSize = fs(12f), fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 1.2.em)
      }
    }
    BoxWithConstraints(Modifier.weight(1f).widthIn(min = 60.dp)) {
      val bw = maxWidth.value
      Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Row(Modifier.fillMaxWidth().height(30.dp), verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          t.bars.forEach { b ->
            Box(Modifier.weight(1f).height(HomeBoard.tileBar(b.r).dp).background(if (b.r > 0) pal.rainOf(b.r) else pal.hollow, RoundedCornerShape(3.dp)))
          }
        }
        // The card's container rule: the middle hour goes under 130 dp, all of them under 80.
        val marks = if (bw <= 80) emptyList() else if (bw <= 130 && t.marks.size == 3) listOf(t.marks[0], t.marks[2]) else t.marks
        if (marks.size > 1) {
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            marks.forEach { Text(it, color = pal.t3, fontSize = fs(10f), fontWeight = FontWeight.Medium, maxLines = 1) }
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------------------- season

/** The strongest line of the season (avalanches, drought, pollen), « +n » for the others. */
@Composable
private fun SeasonPillView(s: HomeBoard.SeasonPill, pal: BoardPalette) {
  val col = pal.tone(s.tone)
  val neutral = s.tone == "neutre"
  val shape = RoundedCornerShape(16.dp)
  Row(
    Modifier.fillMaxWidth()
      .background(if (neutral) Color.Transparent else col.copy(alpha = 0.2f), shape)
      .border(1.5.dp, if (neutral) pal.rule else col.copy(alpha = 0.65f), shape)
      .padding(horizontal = 12.dp, vertical = 7.dp),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    CardGlyph(s.glyph, 18.dp, col, 2.2f)
    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
      val detailSize = fs(12f)
      val line = buildAnnotatedString {
        withStyle(bold(pal.text)) { append(s.text) }
        if (s.detail.isNotEmpty()) withStyle(SpanStyle(color = pal.t2, fontWeight = FontWeight.Medium, fontSize = detailSize)) { append(" · ${s.detail}") }
      }
      Text(line, fontSize = fs(13f), maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
      if (s.more > 0) {
        Box(
          Modifier.padding(start = 4.dp).heightIn(min = 22.dp).widthIn(min = 26.dp).background((if (neutral) pal.t3 else col).copy(alpha = 0.25f), RoundedCornerShape(11.dp)).padding(horizontal = 6.dp),
          contentAlignment = Alignment.Center,
        ) {
          Text("+${s.more}", color = col, fontSize = fs(13f), fontWeight = FontWeight.Bold)
        }
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------------- the columns

/** The title of a block: its name in capitals on the left, a legend on the right. */
@Composable
internal fun SectionHeader(left: String, pal: BoardPalette, right: @Composable () -> Unit) {
  Row(Modifier.fillMaxWidth().height(16.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
    Text(left.uppercase(), color = pal.t3, fontSize = fs(11f), fontWeight = FontWeight.Bold, letterSpacing = 0.06.em, maxLines = 1)
    right()
  }
}

/** « nuit ▬ soleil »: the legend of the glow. */
@Composable
private fun GlowLegend(pal: BoardPalette) {
  Row(verticalAlignment = Alignment.CenterVertically) {
    Text("nuit", color = pal.t4, fontSize = fs(10.5f), fontWeight = FontWeight.Medium)
    Box(
      Modifier.padding(horizontal = 6.dp).size(72.dp, 8.dp).background(
        Brush.horizontalGradient(0f to pal.glowNight.copy(alpha = 0.55f), 0.22f to pal.glowNight.copy(alpha = 0.55f), 0.3f to pal.glowCloud.copy(alpha = 0.45f), 1f to pal.glowSun.copy(alpha = 0.85f)),
        RoundedCornerShape(4.dp),
      ),
    )
    Text("soleil", color = pal.t4, fontSize = fs(10.5f), fontWeight = FontWeight.Medium)
  }
}

/** One column of the hours or the days: its glow, and a green line around the one under way. */
private fun DrawScope.column(pal: BoardPalette, left: Float, width: Float, height: Float, glow: Brush, ring: Boolean, radius: Float) {
  val k = density
  val x = (left + 1) * k
  val cw = maxOf(1f, width - 2) * k
  drawRoundRect(glow, Offset(x, 0f), Size(cw, height * k), CornerRadius(radius * k))
  if (ring) {
    val s = 1.5f * k
    drawRoundRect(pal.accent.copy(alpha = 0.75f), Offset(x + s / 2, s / 2), Size(cw - s, height * k - s), CornerRadius(radius * k - s / 2), style = Stroke(s))
  }
}

/** Writes [text] centred on [cx] (px), its line box of [lineHeight] × the size starting at [top] (the card's px). */
internal fun DrawScope.label(
  m: TextMeasurer,
  text: AnnotatedString,
  cx: Float,
  top: Float,
  sizePx: Float,
  colour: Color,
  weight: FontWeight = FontWeight.Bold,
  lineHeight: Float = 1.17f,
) {
  val style = TextStyle(color = colour, fontSize = sizePx.dp.toSp(), fontWeight = weight)
  val r = m.measure(text, style, softWrap = false, maxLines = 1)
  val y = top * density + (lineHeight * sizePx * density - r.size.height) / 2
  drawText(r, topLeft = Offset(cx - r.size.width / 2f, y))
}

internal fun DrawScope.label(m: TextMeasurer, text: String, cx: Float, top: Float, sizePx: Float, colour: Color, weight: FontWeight = FontWeight.Bold, lineHeight: Float = 1.17f) =
  label(m, AnnotatedString(text), cx, top, sizePx, colour, weight, lineHeight)

/** A horizontal brush through the colours of some temperatures, one stop in the middle of each of [n] columns. */
private fun tempBrush(pal: BoardPalette, temps: List<Double>, widthPx: Float): Brush =
  if (temps.size == 1) Brush.horizontalGradient(listOf(pal.temperature(temps[0]), pal.temperature(temps[0])))
  else Brush.horizontalGradient(*temps.mapIndexed { i, t -> (i + 0.5f) / temps.size to pal.temperature(t) }.toTypedArray(), startX = 0f, endX = widthPx)

// ---------------------------------------------------------------------------------------------------------- the hours

/** The next 24 hours: a column per slot, its icon, the temperature curve, the rain, its chance, the wind and gusts, the hour. */
@Composable
private fun HoursBlock(h: HomeBoard.Hours, offsetS: Int, w: Float, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  val list = h.slots
  val n = list.size
  val cw = w / n
  val hasP = list.any { it.chance != null }
  val height = if (hasP) 206f else 192f
  val yWind = if (hasP) 158f else 144f
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    SectionHeader(if (h.step == 1) "24 h · heure par heure" else "24 h · par ${h.step} h", pal) { GlowLegend(pal) }
    Canvas(Modifier.width(w.dp).height(height.dp)) {
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
      list.forEachIndexed { i, x -> label(measurer, "${HomeBoard.fmt(x.temp)}°", pts[i].x, yRel[i] + 7, 13f, pal.temperature(x.temp), lineHeight = 1.2f) }
      // The rain: its amount over the bar, the bars standing on the same line.
      list.forEachIndexed { i, x ->
        val mm = x.mm?.takeIf { it >= 0.1 } ?: return@forEachIndexed
        val bh = HomeBoard.hourBar(mm, h.step)
        val bw = minOf(18f, cw * 0.7f)
        val cx = cw * (i + 0.5f)
        drawRoundRect(pal.rainOf(mm / h.step), Offset((cx - bw / 2) * k, (142 - bh) * k), Size(bw * k, bh * k), CornerRadius(4f * k))
        label(measurer, HomeBoard.fmt(mm, if (mm < 10) 1 else 0), cx * k, 142 - bh - 2 - 11.7f, 10f, pal.rainLight)
      }
      if (hasP) list.forEachIndexed { i, x -> x.chance?.let { label(measurer, "${HomeBoard.fmt(it)} %", cw * (i + 0.5f) * k, 144f, 10f, pal.t3, FontWeight.Medium) } }
      // The wind: its arrow and speed, the gust under it (yellow from 60, orange from 80).
      list.forEachIndexed { i, x ->
        val cx = cw * (i + 0.5f) * k
        val speed = measurer.measure(HomeBoard.fmt(x.wind), TextStyle(color = pal.wind, fontSize = 12f.dp.toSp(), fontWeight = FontWeight.Bold))
        val arrow = if (x.deg != null) 11f * k + 2f * k else 0f
        val left = cx - (arrow + speed.size.width) / 2
        val mid = (yWind + 7.5f) * k
        if (x.deg != null) windArrow(left + 5.5f * k, mid, 11f * k, x.deg, pal.wind)
        drawText(speed, topLeft = Offset(left + arrow, mid - speed.size.height / 2f))
        x.gust?.let { g ->
          val c = pal.gust(g)
          label(measurer, HomeBoard.fmt(g), cx, yWind + 15f, 10f, c ?: pal.t3, if (c != null) FontWeight.Bold else FontWeight.Normal, 1.25f)
        }
      }
      // Under 36 dp a column has no room for « 21:00 »: in French « 21 h » fits, the card keeps it.
      list.forEachIndexed { i, x -> label(measurer, HomeBoard.hourOnly(x.ts, offsetS), cw * (i + 0.5f) * k, height - 17, 11f, if (i == 0) pal.accent else pal.t2) }
    }
  }
}

// ----------------------------------------------------------------------------------------------------------- the days

/**
 * The days: a column per day tinted by its sun, the highest and lowest as two curves around a band, rain, chance, wind. Where
 * the answer gives the hours of sunshine, a line under the icon says them (« 7 h », « 30 min ») and everything under it goes
 * 14 px down, as in the card.
 */
@Composable
private fun DaysBlock(days: List<HomeBoard.DayColumn>, w: Float, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  val n = days.size
  val cw = w / n
  val tight = cw < 50
  val hasP = days.any { it.chance != null }
  val hasSun = days.any { it.sunshineH != null }
  val sh = if (hasSun) 14f else 0f // the line of sunshine
  val height = (if (hasP) 250f else 236f) + sh
  val legend = (if (hasSun) "soleil · " else "") + if (days.any { it.gust != null }) "pluie · vent / rafales" else "pluie · vent"
  val sunColour = pal.iconRoles["vs"] ?: pal.yellow
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    SectionHeader("$n jours · max et min", pal) { Text(legend, color = pal.t4, fontSize = fs(10.5f), fontWeight = FontWeight.Medium, maxLines = 1) }
    Canvas(Modifier.width(w.dp).height(height.dp)) {
      val k = density
      days.forEachIndexed { i, d -> column(pal, cw * i, cw, height, pal.glow(d.sun, true, height * k), i == 0, 10f) }
      days.forEachIndexed { i, d ->
        val cx = cw * (i + 0.5f) * k
        label(measurer, if (tight) d.nameShort else d.name, cx, 3f, 13f, if (i == 0) pal.accent else pal.text)
        familyIcon(d.kind, cx, (3 + 15.2f + 1 + 15) * k, 30f * k, pal)
        // The card's `.ds`: a line of 13 px under the icon (1 px apart), a dot of 5 px, 3 px, the hours in 11 px semi-bold.
        if (d.sunshineH != null) {
          val col = when (HomeBoard.sunTone(d)) { 2 -> sunColour; 1 -> mixSrgb(pal.t3, sunColour, 0.55f); else -> pal.t3 }
          val r = measurer.measure(HomeBoard.sunHoursText(d.sunshineH, tight), TextStyle(color = col, fontSize = 11.dp.toSp(), fontWeight = FontWeight.SemiBold), softWrap = false, maxLines = 1)
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
      val maxPath = smoothPath(mx)
      // One outline: along the highest, then back along the lowest (the card's band).
      val band = Path().apply {
        smoothInto(this, mx, start = true)
        smoothInto(this, mn.reversed(), start = false)
        close()
      }
      val bounds = band.getBounds()
      // The curves in a layer of their own, so that the dots are hollow: the columns show through them.
      drawContext.canvas.saveLayer(Rect(0f, 0f, size.width, size.height), Paint())
      drawPath(
        band,
        Brush.verticalGradient(
          listOf(pal.temperature(days.map { it.tmax }.average()).copy(alpha = 0.2f), pal.temperature(days.map { it.tmin }.average()).copy(alpha = 0.16f)),
          startY = bounds.top,
          endY = bounds.bottom,
        ),
      )
      drawPath(maxPath, tempBrush(pal, days.map { it.tmax }, w * k), style = Stroke(4f * k, cap = StrokeCap.Round))
      drawPath(smoothPath(mn), tempBrush(pal, days.map { it.tmin }, w * k), style = Stroke(3f * k, cap = StrokeCap.Round))
      (mx + mn).forEach { drawCircle(Color.Black, 3.75f * k, it, blendMode = BlendMode.Clear) }
      drawContext.canvas.restore()
      days.forEachIndexed { i, d ->
        drawCircle(pal.temperature(d.tmax), 3.75f * k, mx[i], style = Stroke(2.5f * k))
        drawCircle(pal.temperature(d.tmin), 3.75f * k, mn[i], style = Stroke(2.5f * k))
        label(measurer, "${HomeBoard.fmt(d.tmax)}°", mx[i].x, yOf(d.tmax) - 26, 15f, pal.temperature(d.tmax), lineHeight = 1.2f)
        label(measurer, "${HomeBoard.fmt(d.tmin)}°", mn[i].x, yOf(d.tmin) + 7, 13f, pal.temperature(d.tmin), FontWeight.Medium, 1.2f)
      }
      // Rain, chance and wind, stacked as the card stacks them.
      val textSize = if (tight) 11f else 12f
      days.forEachIndexed { i, d ->
        val cx = cw * (i + 0.5f)
        val mm = d.rainMm
        val wet = mm != null && mm >= 0.5
        val bh = HomeBoard.dayBar(mm)
        val bw = minOf(26f, cw * 0.55f)
        drawRoundRect(if (wet) pal.rainOf(mm!! / 6) else pal.hollow, Offset((cx - bw / 2) * k, (200 + sh - bh) * k), Size(bw * k, bh * k), CornerRadius(4f * k))
        var y = 202f + sh
        if (mm != null) {
          val txt = if (wet) "${if (mm < 1) HomeBoard.fmt(mm, 1) else HomeBoard.fmt(mm)} mm" else "sec"
          label(measurer, txt, cx * k, y, textSize, if (wet) pal.rainLight else pal.t3)
        }
        y += textSize * 1.17f + 2
        if (hasP) {
          d.chance?.let { label(measurer, "${HomeBoard.fmt(it)} %", cx * k, y, 10f, pal.t3, FontWeight.Medium) }
          y += 11.7f + 2
        }
        y += 3
        val wind = buildAnnotatedString {
          if (d.windMax != null) withStyle(bold(pal.wind)) { append(HomeBoard.fmt(d.windMax)) }
          if (d.gust != null) withStyle(SpanStyle(color = pal.t3, fontWeight = FontWeight.Normal, fontSize = (if (tight) 9f else 10f).dp.toSp())) { append("/${HomeBoard.fmt(d.gust)}") }
        }
        val r = measurer.measure(wind, TextStyle(fontSize = textSize.dp.toSp(), fontWeight = FontWeight.Bold), softWrap = false)
        val arrow = if (d.deg != null) (11f + (if (tight) 1f else 2f)) * k else 0f
        val left = cx * k - (arrow + r.size.width) / 2
        val mid = (y + textSize * 1.17f / 2) * k
        if (d.deg != null) windArrow(left + 5.5f * k, mid, 11f * k, d.deg, pal.wind)
        drawText(r, topLeft = Offset(left + arrow, mid - r.size.height / 2f))
      }
    }
  }
}

/** The card's `mix`: [a] towards [b] by [t], channel by channel in sRGB (Compose's `lerp` goes through Oklab). */
private fun mixSrgb(a: Color, b: Color, t: Float): Color =
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
