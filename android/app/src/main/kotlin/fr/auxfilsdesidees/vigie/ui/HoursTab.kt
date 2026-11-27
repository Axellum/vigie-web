package fr.auxfilsdesidees.vigie.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.PointerInputScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.SpotHours
import fr.auxfilsdesidees.vigie.data.Vigilance
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * The « Heures » tab: the frise of direction D, as in the clickable prototype. Day pills, one sentence for the day, a
 * card of 24 hour columns (sky, temperature, rain, wind, the official warnings of the place, tide, the coastal warning
 * of the spot, three activities) with an amber cursor that follows the finger, and the reading of the hour under it.
 */
@Composable
internal fun HoursTab(state: HomeState.Ready, followsSpots: Boolean) {
  val snap = state.snapshot
  val p = snap.point
  val spot = snap.favourite
  val now = p.serverUtc
  val off = p.utcOffsetS
  val starts = remember(snap) { Frise.dayStarts(now, off, Frise.coverEnd(p, spot)) }
  var dayIndex by rememberSaveable { mutableIntStateOf(0) }
  var cursor by rememberSaveable { mutableIntStateOf(0) }
  val d = dayIndex.coerceIn(0, starts.lastIndex)
  val hours = remember(snap, d) { Frise.window(starts[d], p, spot) }
  val firstHour = remember(snap) { Frise.window(starts[0], p, spot).first() }
  val c = cursor.coerceIn(0, Frise.HOURS - 1)
  val vigil = remember(snap) { Vigil.view(snap.vigilances, now) }

  // The place and the time of the read are in the head of the card above (VigieApp); the sky now closes the row of days.
  Row(verticalAlignment = Alignment.CenterVertically) {
    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      starts.forEachIndexed { k, t -> DayChip(Words.dayPill(t, now, off), k == d) { dayIndex = k } }
    }
    WeatherIcon(p.weatherCode, !firstHour.night, 32.dp)
    Spacer(Modifier.width(4.dp))
    Text(Words.degrees(p.tempC), color = VigieColors.temperature(p.tempC), style = MaterialTheme.typography.headlineSmall)
  }
  daySentence(p, starts, d)?.let { Text(it, color = VigieColors.Text, style = MaterialTheme.typography.bodyLarge) }
  // No spot followed at the place: the rows of the sea (tide, coast, activities) would only say « non lue », so they go.
  val seaRows = spot != null || followsSpots
  FriseCard(hours, c, today = d == 0, spot = spot, seaRows = seaRows, vigil = vigil, offsetS = off) { cursor = it }
  Readout(hours[c], spot, seaRows, Vigil.at(vigil.live, hours[c].timeUtc), now, off)
  when {
    spot != null -> Mention(stringResource(R.string.hours_drag, spot.name))
    followsSpots -> Mention(stringResource(R.string.hours_sea_unread))
    else -> Mention(stringResource(R.string.hours_no_spot))
  }
  if (p.hours.isNotEmpty() && p.provider != null) Credits(stringResource(R.string.credits_weather, p.provider))
  if (spot != null) Credits(stringResource(R.string.credits_sea))
  if (vigil.live.isNotEmpty()) Credits(stringResource(R.string.credits_vigil, Vigil.issuers(vigil.live)))
}

/** Today: the next 12 hours when the hours are served, else the day's line; another day: its line of `daily`. */
private fun daySentence(p: PointNow, starts: List<Long>, d: Int): String? {
  val index = (Words.dayKey(starts[d], p.utcOffsetS) - Words.dayKey(p.serverUtc, p.utcOffsetS)).toInt()
  val daily = p.days.getOrNull(index)?.let(Words::daySentence)
  if (d != 0) return daily
  return Words.next12Hours(p.hours.filter { it.timeUtc >= starts[0] }, p.utcOffsetS) ?: daily
}

@Composable
private fun DayChip(text: String, selected: Boolean, onClick: () -> Unit) {
  Box(Modifier.minimumInteractiveComponentSize(), contentAlignment = Alignment.Center) {
    Text(
      text,
      color = if (selected) VigieColors.OnPill else VigieColors.Text,
      style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
      modifier =
        Modifier.clip(RoundedCornerShape(50))
          .background(if (selected) VigieColors.Accent.copy(alpha = 0.95f) else Color.White.copy(alpha = 0.12f))
          .clickable(onClick = onClick)
          .padding(horizontal = 16.dp, vertical = 8.dp),
    )
  }
}

@Composable
private fun Mention(text: String) {
  Text(text, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
}

// --------------------------------------------------------------------------------------------------------- the frise

/** The words drawn inside the frise, read once from the resources. */
private class FriseWords(
  val sky: String,
  val temp: String,
  val rain: String,
  val wind: String,
  val tide: String,
  val vigil: String,
  val coast: String,
  val dry: String,
  val now: String,
  val gusts: String,
  val noAlert: String,
  val unread: String,
  val noTide: String,
  val noWeather: String,
  val vigilUnread: String,
  val vigilNoSource: String,
  val vigilNotHere: String,
  val vigilUntimed: String,
)

// The frise's geometry, in dp, from the prototype (a card of 446 dp; label column of 62 dp; rows at fixed heights).
private const val LABEL_COLUMN = 62f
private const val RIGHT_PAD = 12f
private const val WEATHER_BLOCK = 210f
private const val NO_WEATHER_BLOCK = 40f

// The official warnings of the place, under the wind: one lane per warning (three at most), or one line of text.
private const val VIGIL_TOP = 246f
private const val VIGIL_LANE = 20f
private const val VIGIL_LANES = 3

private fun vigilBlock(lanes: Int): Float = 10f + VIGIL_LANE * lanes.coerceIn(1, VIGIL_LANES)

// The rows of the sea (tide, coastal warning, three activities), under the warnings; dropped without a followed spot.
private const val SEA_BLOCK = 175f

private fun PointerInputScope.hourAt(x: Float): Int {
  val gx = LABEL_COLUMN.dp.toPx()
  val step = (size.width - (LABEL_COLUMN + RIGHT_PAD).dp.toPx()) / Frise.HOURS
  return floor((x - gx) / step).toInt().coerceIn(0, Frise.HOURS - 1)
}

@Composable
private fun FriseCard(
  hours: List<FriseHour>,
  cursor: Int,
  today: Boolean,
  spot: SpotHours?,
  seaRows: Boolean,
  vigil: Vigil.View,
  offsetS: Int,
  onCursor: (Int) -> Unit,
) {
  val hasWeather = hours.any { it.weather != null }
  // Without the hourly weather, its four rows give way to one line: everything under them moves up.
  val shift = if (hasWeather) 0f else NO_WEATHER_BLOCK - WEATHER_BLOCK
  val sea = if (seaRows) 0f else -SEA_BLOCK
  val t0 = hours.first().timeUtc
  val lanes = remember(vigil, t0) { Vigil.lanes(vigil.live, t0, t0 + Frise.HOURS * 3600L) }
  // The rows under the warnings move down by as many lanes as there are warnings to draw.
  val vb = vigilBlock(lanes.size)
  val measurer = rememberTextMeasurer()
  val words =
    FriseWords(
      sky = stringResource(R.string.frise_sky),
      temp = stringResource(R.string.frise_temp),
      rain = stringResource(R.string.frise_rain),
      wind = stringResource(R.string.frise_wind),
      tide = stringResource(R.string.frise_tide),
      vigil = stringResource(R.string.frise_vigil),
      coast = stringResource(R.string.frise_coast),
      dry = stringResource(R.string.frise_dry),
      now = stringResource(R.string.frise_now),
      gusts = stringResource(R.string.frise_gusts),
      noAlert = stringResource(R.string.frise_no_alert),
      unread = stringResource(R.string.frise_unread),
      noTide = stringResource(R.string.frise_no_tide),
      noWeather = stringResource(R.string.hours_no_weather),
      vigilUnread = stringResource(R.string.frise_vigil_unread),
      vigilNoSource = stringResource(R.string.frise_vigil_nosource),
      vigilNotHere = stringResource(R.string.frise_vigil_not_here),
      vigilUntimed = stringResource(R.string.frise_vigil_untimed),
    )
  val description = stringResource(R.string.frise_description)
  val update by rememberUpdatedState(onCursor)
  val shape = RoundedCornerShape(22.dp)
  Canvas(
    Modifier.fillMaxWidth()
      .height((446f + shift + vb + sea).dp)
      .background(VigieColors.Glass, shape)
      .border(1.5.dp, VigieColors.GlassBorder, shape)
      .semantics { contentDescription = description }
      .pointerInput(Unit) { detectTapGestures { update(hourAt(it.x)) } }
      .pointerInput(Unit) {
        detectHorizontalDragGestures(onDragStart = { update(hourAt(it.x)) }) { change, _ ->
          change.consume()
          update(hourAt(change.position.x))
        }
      }
  ) {
    drawFrise(hours, cursor, today, spot, seaRows, vigil, lanes, offsetS, hasWeather, shift, vb, sea, measurer, words)
  }
}

private enum class Anchor { Start, Middle, End }

private fun DrawScope.text(
  measurer: TextMeasurer,
  s: String,
  x: Float,
  baseline: Float,
  color: Color,
  anchor: Anchor = Anchor.Start,
  size: Float = 12f,
  bold: Boolean = false,
  avoid: Float? = null,
) {
  val r = measurer.measure(s, TextStyle(color = color, fontSize = size.sp, fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal))
  var left =
    when (anchor) {
      Anchor.Start -> x
      Anchor.Middle -> x - r.size.width / 2f
      Anchor.End -> x - r.size.width
    }
  // [avoid] is the cursor's line: a label it would cross moves beside it, to the right, else to the left near the edge
  if (avoid != null && avoid > left - 3 * density && avoid < left + r.size.width + 3 * density) {
    left = if (avoid + 5 * density + r.size.width <= this.size.width - 4 * density) avoid + 5 * density else avoid - 5 * density - r.size.width
  }
  drawText(r, topLeft = Offset(left, baseline - r.firstBaseline))
}

private fun DrawScope.drawFrise(
  hours: List<FriseHour>,
  cursor: Int,
  today: Boolean,
  spot: SpotHours?,
  seaRows: Boolean,
  vigil: Vigil.View,
  lanes: List<Vigil.Lane>,
  offsetS: Int,
  hasWeather: Boolean,
  shift: Float,
  vb: Float,
  sea: Float,
  measurer: TextMeasurer,
  w: FriseWords,
) {
  val k = density
  val width = size.width
  val gx = LABEL_COLUMN * k
  val gw = width - (LABEL_COLUMN + RIGHT_PAD) * k
  val step = gw / Frise.HOURS
  fun xC(i: Int) = gx + step * (i + 0.5f)
  fun y(v: Float) = v * k // the top band and the weather rows
  fun yv(v: Float) = (v + shift) * k // the official warnings, under the weather
  fun yb(v: Float) = (v + shift + vb) * k // the rows under the warnings
  val gridTop = y(32f)
  val gridBottom = yb(428f + sea)
  val t0 = hours.first().timeUtc
  val t1 = t0 + Frise.HOURS * 3600L
  fun xT(t: Long) = gx + gw * ((t - t0).toFloat() / (t1 - t0))
  fun rowName(word: String, baseline: Float) = text(measurer, word, 12 * k, baseline, VigieColors.Text2)

  // nights
  hours.forEachIndexed { i, h ->
    if (h.night) drawRect(Color.Black.copy(alpha = 0.16f), Offset(gx + step * i, gridTop), Size(step + 0.4f * k, gridBottom - gridTop))
  }

  // hours of the top band, change of day
  class Tag(val x: Float, val s: String, val day: Boolean)
  val tags = mutableListOf<Tag>()
  hours.forEachIndexed { i, h ->
    if (i > 0 && Math.floorMod(h.timeUtc + offsetS, 86_400L) < 3600) {
      val x = gx + step * i
      drawLine(Color.White.copy(alpha = 0.25f), Offset(x, y(30f)), Offset(x, gridBottom), k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(2 * k, 4 * k)))
      tags += Tag(x + 2 * k, Words.dayShort(Words.dayKey(h.timeUtc, offsetS)), true)
    }
  }
  val xc = xC(cursor)
  // A line of text of a row starts after the cursor when it stands at the start (« Maint. »), as the warnings' lanes do.
  val lineX = if (xc < gx + 14 * k) xc + 5 * k else gx
  for (i in 0 until Frise.HOURS step 4) {
    val x = xC(i)
    if (tags.any { it.day && abs(it.x + 14 * k - x) < 30 * k }) continue
    if (abs(x - xc) < 40 * k) continue // the cursor's pill takes the place
    tags += Tag(x, Words.hour(hours[i].timeUtc, offsetS), false)
  }
  for (tag in tags) {
    if (tag.day && abs(tag.x + 14 * k - xc) < 34 * k) continue
    if (tag.day) text(measurer, tag.s, tag.x, y(22f), VigieColors.Accent) else text(measurer, tag.s, tag.x, y(22f), VigieColors.Text3, Anchor.Middle)
  }

  if (hasWeather) {
    // sky: one icon every three hours
    rowName(w.sky, y(54f))
    for (i in 0 until Frise.HOURS step 3) {
      val h = hours[i + 1]
      val sky = skyOf(h.weather?.weatherCode, !h.night) ?: continue
      weatherIcon(sky, gx + step * (i + 1.5f), y(48f), 28 * k)
    }

    // temperature: the curve coloured by the charter's ramp, on at least 4 °C so a flat day stays flat
    rowName(w.temp, y(106f))
    val temps = hours.mapIndexedNotNull { i, h -> h.weather?.tempC?.let { i to it } }
    if (temps.size >= 2) {
      var lo = temps.minOf { it.second }
      var hi = temps.maxOf { it.second }
      if (hi - lo < 4) {
        val mid = (hi + lo) / 2
        lo = mid - 2
        hi = mid + 2
      }
      val top = y(82f)
      val hh = 38 * k
      val pts = temps.map { (i, v) -> Offset(xC(i), top + hh - ((v - lo) / (hi - lo)).toFloat() * hh) }
      val mean = VigieColors.temperature(temps.map { it.second }.average())
      val fill = smoothPath(pts).apply {
        lineTo(pts.last().x, y(128f))
        lineTo(pts.first().x, y(128f))
        close()
      }
      drawPath(fill, Brush.verticalGradient(listOf(mean.copy(alpha = 0.34f), mean.copy(alpha = 0f)), startY = top, endY = y(128f)))
      val span = (pts.last().x - pts.first().x).coerceAtLeast(1f)
      val stops = temps.mapIndexed { j, (_, v) -> ((pts[j].x - pts.first().x) / span) to VigieColors.temperature(v) }.toTypedArray()
      drawPath(
        smoothPath(pts),
        Brush.horizontalGradient(*stops, startX = pts.first().x, endX = pts.last().x),
        style = Stroke(3.5f * k, cap = StrokeCap.Round, join = StrokeJoin.Round),
      )
      val jMax = temps.indices.maxBy { temps[it].second }
      val jMin = temps.indices.minBy { temps[it].second }
      text(measurer, Words.degrees(temps[jMax].second), pts[jMax].x, pts[jMax].y - 8 * k, VigieColors.temperature(temps[jMax].second), Anchor.Middle, avoid = xc)
      if (jMin != jMax) text(measurer, Words.degrees(temps[jMin].second), pts[jMin].x, pts[jMin].y + 18 * k, VigieColors.temperature(temps[jMin].second), Anchor.Middle, avoid = xc)
    }

    // rain: pill bars on a square-root scale, the day's total; « sec » only when every hour is known and dry
    rowName(w.rain, y(166f))
    drawRect(Color.White.copy(alpha = 0.1f), Offset(gx, y(179f)), Size(gw, 1.5f * k))
    val rains = hours.map { it.weather?.rainMm }
    val known = rains.filterNotNull()
    if (known.isNotEmpty()) {
      val total = known.sum()
      if (total > 0) {
        val mMax = max(2.0, known.max())
        val lw = 7 * k
        rains.forEachIndexed { i, mm ->
          if (mm == null || mm <= 0) return@forEachIndexed
          val hp = (6 + (34 - 6) * sqrt(min(mm, mMax) / mMax)).toFloat() * k
          val col = if (mm < 1) VigieColors.RainLight else if (mm < 3) VigieColors.Rain else VigieColors.RainHeavy
          drawRoundRect(col, Offset(xC(i) - lw / 2, y(180f) - hp), Size(lw, hp), CornerRadius(lw / 2))
        }
        text(measurer, Words.mm(total), gx + gw, y(146f), VigieColors.Rain, Anchor.End)
      } else if (known.size == rains.size) {
        text(measurer, w.dry, gx + gw / 2, y(170f), VigieColors.Text3, Anchor.Middle)
      }
    }

    // wind: the mean wind's curve from 0, the strongest gust, an arrow every three hours (pointing where it goes)
    rowName(w.wind, y(214f))
    val winds = hours.mapIndexedNotNull { i, h -> h.weather?.windKmh?.let { i to it } }
    if (winds.size >= 2) {
      val hi = max(1.0, winds.maxOf { it.second } * 1.05)
      val top = y(196f)
      val hh = 22 * k
      val pts = winds.map { (i, v) -> Offset(xC(i), top + hh - (v / hi).toFloat() * hh) }
      val fill = smoothPath(pts).apply {
        lineTo(pts.last().x, y(222f))
        lineTo(pts.first().x, y(222f))
        close()
      }
      drawPath(fill, Brush.verticalGradient(listOf(VigieColors.Wind.copy(alpha = 0.34f), VigieColors.Wind.copy(alpha = 0f)), startY = top, endY = y(222f)))
      drawPath(smoothPath(pts), VigieColors.Wind, style = Stroke(3 * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
    val gusts = hours.mapIndexedNotNull { i, h -> h.weather?.gustKmh?.let { i to it } }
    if (gusts.isNotEmpty()) {
      val (iG, g) = gusts.maxBy { it.second }
      val xr = xC(iG).coerceIn(gx + 34 * k, gx + gw - 34 * k)
      text(measurer, String.format(w.gusts, Words.kmh(g)), xr, y(190f), VigieColors.Text, Anchor.Middle, avoid = xc)
    }
    for (i in 1 until Frise.HOURS step 3) {
      val deg = hours[i].weather?.windDeg ?: continue
      windArrow(xC(i), y(236f), 12 * k, deg, VigieColors.Wind)
    }
  } else {
    val r =
      measurer.measure(
        w.noWeather,
        TextStyle(color = VigieColors.Text3, fontSize = 12.sp),
        constraints = Constraints(maxWidth = (width - 24 * k).toInt().coerceAtLeast(1)),
      )
    drawText(r, topLeft = Offset(12 * k, y(36f)))
  }

  // the official warnings of the place: one lane per warning over the hours it applies, its level and phenomenon written
  // on it (the widget's words); a warning without hours (a river in flood) is on the banner of the Accueil, named here
  rowName(w.vigil, yv(VIGIL_TOP + 14f))
  if (lanes.isNotEmpty()) {
    lanes.take(VIGIL_LANES).forEachIndexed { j, lane ->
      val top = yv(VIGIL_TOP + 2f + VIGIL_LANE * j)
      val x0 = xT(lane.start)
      val x1 = max(xT(lane.end), x0 + 6 * k)
      drawRoundRect(VigieColors.warning(lane.warning.level), Offset(x0, top), Size(x1 - x0, 16 * k), CornerRadius(6 * k))
      // the words start after the cursor when it stands at the start of the lane (a warning already in force, read now)
      val cx = xC(cursor)
      val tx = if (cx >= x0 && cx < x0 + 14 * k) cx + 5 * k else x0 + 6 * k
      clipRect(x0, top, x1 - 4 * k, top + 16 * k) {
        text(measurer, "${Vigil.levelShort(lane.warning.level)} · ${Vigil.label(lane.warning)}", tx, top + 12 * k, VigieColors.OnPill, size = 11f, bold = true)
      }
    }
    if (lanes.size > VIGIL_LANES) {
      text(measurer, "+${lanes.size - VIGIL_LANES}", 12 * k, yv(VIGIL_TOP + 14f + VIGIL_LANE * (VIGIL_LANES - 1)), VigieColors.Text3)
    }
  } else {
    val untimed = Vigil.untimed(vigil.live)
    val line =
      when (vigil.state) {
        Vigil.State.Unread -> w.vigilUnread
        Vigil.State.NoSource -> w.vigilNoSource
        Vigil.State.None -> w.noAlert
        Vigil.State.Warnings ->
          if (untimed.isNotEmpty()) String.format(w.vigilUntimed, untimed.map(Vigil::label).distinct().joinToString(", ")) else w.vigilNotHere
      }
    text(measurer, line, lineX, yv(VIGIL_TOP + 14f), VigieColors.Text3)
  }

  if (seaRows) drawSeaRows(hours, step, spot, offsetS, gx, gw, t0, t1, lineX, xc, { xT(it) }, { yb(it) }, measurer, w)
  for (i in 0 until Frise.HOURS step 4) text(measurer, Words.hour(hours[i].timeUtc, offsetS), xC(i), yb(440f + sea), VigieColors.Text3, Anchor.Middle)

  // the cursor and its pill
  drawLine(VigieColors.Accent, Offset(xc, y(30f)), Offset(xc, gridBottom), 2 * k)
  val word = if (today && cursor == 0) w.now else Words.hour(hours[cursor].timeUtc, offsetS)
  val r = measurer.measure(word, TextStyle(color = VigieColors.OnPill, fontSize = 12.sp, fontWeight = FontWeight.SemiBold))
  val cw = r.size.width + 16 * k
  val xl = (xc - cw / 2).coerceIn(6 * k, width - cw - 6 * k)
  drawRoundRect(VigieColors.Accent, Offset(xl, y(6f)), Size(cw, 22 * k), CornerRadius(11 * k))
  drawText(r, topLeft = Offset(xl + 8 * k, y(6f) + (22 * k - r.size.height) / 2))
}

/** The rows of the sea under the warnings: the tide, the coastal warning and the three activities of the favourite spot. */
private fun DrawScope.drawSeaRows(
  hours: List<FriseHour>,
  step: Float,
  spot: SpotHours?,
  offsetS: Int,
  gx: Float,
  gw: Float,
  t0: Long,
  t1: Long,
  lineX: Float,
  xc: Float,
  xT: (Long) -> Float,
  yb: (Float) -> Float,
  measurer: TextMeasurer,
  w: FriseWords,
) {
  val k = density
  fun rowName(word: String, baseline: Float) = text(measurer, word, 12 * k, baseline, VigieColors.Text2)

  // tide of the favourite spot: half cosine between the API's extremes, their times written
  rowName(w.tide, yb(276f))
  val extremes = spot?.tide.orEmpty()
  val tidePts =
    if (extremes.size >= 2) {
      val lo = extremes.minOf { it.heightM }
      val hi = extremes.maxOf { it.heightM }
      val top = yb(258f)
      val hh = 32 * k
      fun yT(m: Double) = top + hh - ((m - lo) / (if (hi > lo) hi - lo else 1.0)).toFloat() * hh
      val pts = (0..72).mapNotNull { j -> val t = t0 + (t1 - t0) * j / 72; Frise.tideHeight(extremes, t)?.let { Offset(xT(t), yT(it)) } }
      if (pts.size >= 2) {
        val fill = smoothPath(pts).apply {
          lineTo(pts.last().x, top + hh)
          lineTo(pts.first().x, top + hh)
          close()
        }
        drawPath(fill, Brush.verticalGradient(listOf(VigieColors.Water.copy(alpha = 0.42f), VigieColors.Water.copy(alpha = 0.04f)), startY = top, endY = top + hh))
        drawPath(smoothPath(pts), VigieColors.Water, style = Stroke(2.5f * k, cap = StrokeCap.Round, join = StrokeJoin.Round))
        for (e in extremes) {
          if (e.timeUtc < t0 || e.timeUtc > t1) continue
          val xe = xT(e.timeUtc).coerceIn(gx + 16 * k, gx + gw - 16 * k)
          val ye = yT(e.heightM)
          text(measurer, Words.clock(e.timeUtc, offsetS), xe, if (e.high) ye - 8 * k else ye + 18 * k, VigieColors.Text, Anchor.Middle, avoid = xc)
        }
      }
      pts
    } else emptyList()
  if (tidePts.size < 2) text(measurer, if (spot == null) w.unread else w.noTide, lineX, yb(276f), VigieColors.Text3)

  // official coastal warning over the favourite spot: a bar per warning, its colour word written on it
  rowName(w.coast, yb(332f))
  when {
    spot == null || !spot.vigilanceKnown -> text(measurer, w.unread, lineX, yb(332f), VigieColors.Text3)
    spot.alerts.isEmpty() -> text(measurer, w.noAlert, lineX, yb(332f), VigieColors.Text3)
    else ->
      for (a in spot.alerts) {
        val s = max(a.startUtc ?: t0, t0)
        val e = min(a.endUtc ?: t1, t1)
        if (e <= s) continue
        drawRoundRect(VigieColors.warning(a.level), Offset(xT(s), yb(320f)), Size(xT(e) - xT(s), 16 * k), CornerRadius(6 * k))
        text(measurer, Words.warningLevel(a.level), xT(s) + 6 * k, yb(332f), VigieColors.OnPill, size = 11f)
      }
  }

  // the three activities of the favourite spot, one cell per hour (night and unknown in grey)
  Frise.ACTIVITIES.forEachIndexed { r, id ->
    rowName(Words.activityShort(id), yb(362f + 28 * r))
    hours.forEachIndexed { i, h ->
      val v = h.verdicts[id]
      val col = if (v == null) VigieColors.Rule.copy(alpha = 0.55f) else VigieColors.verdict(v)
      drawRoundRect(col, Offset(gx + i * step + 0.75f * k, yb(350f + 28 * r)), Size(step - 1.5f * k, 15 * k), CornerRadius(4 * k))
    }
  }
}

// -------------------------------------------------------------------------------------------- the reading of an hour

@Composable
private fun Readout(h: FriseHour, spot: SpotHours?, seaRows: Boolean, warnings: List<Vigilance>, nowUtc: Long, offsetS: Int) {
  val wx = h.weather
  Glass {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Text(Words.readoutTitle(h.timeUtc, offsetS), color = VigieColors.Accent, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
      Text(Words.fromNow(Frise.hoursFromNow(h.timeUtc, nowUtc)), color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium)
    }
    // the official warnings in force at that hour, the strongest first; « jusqu'à » from the day read, not from today
    // (at Monday 3 h, a Monday 16 h end is « jusqu'à 16 h », not « jusqu'à demain 16 h »)
    warnings.forEach { v ->
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
          Vigil.levelShort(v.level),
          color = VigieColors.OnPill,
          style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
          modifier = Modifier.background(VigieColors.warning(v.level), RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 2.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(Vigil.label(v), color = VigieColors.Text, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
        v.endUtc?.let { Text(Vigil.until(it, h.timeUtc, offsetS), color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium) }
      }
    }
    Row(Modifier.fillMaxWidth()) {
      Column(Modifier.weight(1.1f)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          WeatherIcon(wx?.weatherCode, !h.night, 36.dp)
          Spacer(Modifier.width(4.dp))
          Text(Words.degrees(wx?.tempC), color = VigieColors.temperature(wx?.tempC), fontSize = 26.sp, fontWeight = FontWeight.SemiBold)
        }
        val rain = wx?.rainMm
        when {
          rain != null && rain > 0 -> Small(stringResource(R.string.readout_rain, Words.mm(rain)), VigieColors.Rain)
          wx?.weatherCode != null -> Small(Words.weatherAt(wx.weatherCode, !h.night), VigieColors.Text2)
        }
      }
      Column(Modifier.weight(1f)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.height(36.dp)) {
          WindArrow(wx?.windDeg, 16.dp, VigieColors.Wind)
          Spacer(Modifier.width(6.dp))
          Text(Words.kmh(wx?.windKmh), color = VigieColors.Text, fontSize = 20.sp)
        }
        val parts = listOfNotNull(wx?.gustKmh?.let { "raf. ${it.roundToInt()}" }, Words.windFrom(wx?.windDeg).ifEmpty { null })
        if (parts.isNotEmpty()) Small(parts.joinToString(" · "), VigieColors.Text2)
      }
      if (seaRows) {
        Column(Modifier.weight(1f)) {
          val next = spot?.let { Frise.nextExtreme(it.tide, h.timeUtc + 1800) }
          Box(Modifier.height(36.dp), contentAlignment = Alignment.CenterStart) {
            Text(next?.let { Words.tideTrend(it, offsetS).first } ?: "—", color = VigieColors.Text, fontSize = 20.sp)
          }
          if (next != null) Small(Words.tideTrend(next, offsetS).second, VigieColors.Text2)
        }
      }
    }
    // without a followed spot, the tide and the activities of the reading are left out, as their rows of the frise
    if (seaRows) {
      Box(Modifier.fillMaxWidth().height(1.dp).background(Color.White.copy(alpha = 0.08f)))
      Row(Modifier.fillMaxWidth()) {
        Frise.ACTIVITIES.forEach { id ->
          val v = h.verdicts[id]
          val color = if (v == null) VigieColors.Text3 else VigieColors.verdict(v)
          Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              ActivityGlyph(id, color, 15.dp)
              Spacer(Modifier.width(6.dp))
              Small(Words.activityShort(id), VigieColors.Text2)
            }
            Text(
              if (v != null) Words.verdict(v) else if (h.night) stringResource(R.string.readout_night) else "—",
              color = color,
              fontSize = 15.sp,
              fontWeight = FontWeight.SemiBold,
            )
          }
        }
      }
    }
  }
}

@Composable
private fun Small(text: String, color: Color) {
  Text(text, color = color, fontSize = 12.5.sp)
}
