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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
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

// ---------------------------------------------------------------------------------------------------------- the hours

/** The next 24 hours: a column per slot, its icon, the temperature curve, the rain, its chance, the wind and gusts, the hour. */
@Composable
private fun HoursBlock(h: HomeBoard.Hours, offsetS: Int, w: Float, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    SectionHeader(if (h.step == 1) "24 h · heure par heure" else "24 h · par ${h.step} h", pal) { GlowLegend(pal) }
    Canvas(Modifier.width(w.dp).height(hoursHeight(h.slots).dp)) { drawHours(measurer, h, offsetS, w, pal) }
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
  val hasSun = days.any { it.sunshineH != null }
  val legend = (if (hasSun) "soleil · " else "") + if (days.any { it.gust != null }) "pluie · vent / rafales" else "pluie · vent"
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    SectionHeader("${days.size} jours · max et min", pal) { Text(legend, color = pal.t4, fontSize = fs(10.5f), fontWeight = FontWeight.Medium, maxLines = 1) }
    Canvas(Modifier.width(w.dp).height(daysHeight(days).dp)) { drawDays(measurer, days, w, pal) }
  }
}
