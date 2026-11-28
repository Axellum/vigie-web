package fr.auxfilsdesidees.vigie.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import fr.auxfilsdesidees.vigie.data.Beach
import fr.auxfilsdesidees.vigie.ui.smoothPath
import fr.auxfilsdesidees.vigie.ui.windArrow

/**
 * The Sea page of the Home Assistant card, drawn natively in its narrow layout (one column), under the head of the app's card:
 * a tab per followed spot ([tabs], when there are two or more), then for the beach shown its name with the tide and the
 * water, the six tiles, the activities hour by hour, the tide of 24 hours, the next hours by 3 hours and who the values are
 * from. Without its [beach] yet: its [name] and [status] (« Chargement… », or why it is not there). [note]: a line under
 * the name when the beach shown is an old copy. The logic is [SeaBoard]'s; the sizes are the card's px in dp, the texts keep
 * their size whatever the phone's font scale, with the card's « normal » line height (its `.pile`).
 */
@Composable
fun SeaBoardView(
  tabs: List<String>,
  selected: Int,
  onSelect: (Int) -> Unit,
  name: String,
  beach: Beach?,
  status: String?,
  note: String?,
  now: Long,
  offsetS: Int,
  modifier: Modifier = Modifier,
) {
  val pal = BoardPalette.Dark
  ProvideTextStyle(TextStyle(lineHeight = 1.17.em)) {
    BoxWithConstraints(modifier.fillMaxWidth()) {
      val w = maxWidth.value
      Column {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          if (tabs.size > 1) BeachTabs(tabs, selected, onSelect, pal)
          if (beach == null) {
            HeadView(SeaBoard.Head(name, null, null), pal)
            if (note != null) Text(note, color = pal.t3, fontSize = fs(12f), fontWeight = FontWeight.Medium)
            if (status != null) Text(status, color = pal.t2, fontSize = fs(14f), fontWeight = FontWeight.Medium, modifier = Modifier.padding(vertical = 8.dp))
          } else {
            HeadView(SeaBoard.head(beach, name, now, offsetS), pal)
            if (note != null) Text(note, color = pal.t3, fontSize = fs(12f), fontWeight = FontWeight.Medium)
            TilesView(beach, now, offsetS, w, pal)
            SeaBoard.activities(beach, now, offsetS).takeIf { it.isNotEmpty() }?.let { ActivitiesView(it, SeaBoard.ticks(now, offsetS), w, pal) }
            SeaBoard.tide(beach, now, offsetS, w, 84f)?.let { TideView(it, pal) }
            SeaBoard.table(beach, now, offsetS)?.let { TableView(it, pal) }
          }
        }
        beach?.let(SeaBoard::credits)?.let {
          Text(it, color = pal.t4, fontSize = fs(12f), fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 12.dp))
        }
      }
    }
  }
}

/** The colour of a tone of [SeaBoard]. */
private fun BoardPalette.of(tone: String?): Color =
  when (tone) {
    "t2" -> t2
    "t3" -> t3
    "t4" -> t4
    "green" -> green
    "yellow" -> yellow
    "orange" -> orange
    "red" -> red
    "wind" -> wind
    "rain" -> rain
    "sun" -> iconRoles.getValue("vs")
    else -> text
  }

private fun parts(list: List<SeaBoard.Part>, pal: BoardPalette): AnnotatedString = buildAnnotatedString {
  list.forEach { p ->
    if (p.tone == null && !p.bold) append(p.text)
    else withStyle(SpanStyle(color = if (p.tone != null) pal.of(p.tone) else Color.Unspecified, fontWeight = if (p.bold) FontWeight.Bold else null)) { append(p.text) }
  }
}

// ---------------------------------------------------------------------------------------------------- tabs and head

/** The beaches of the page, one chip each, the one shown in the green of the hour (the card's `.schs`). */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BeachTabs(tabs: List<String>, selected: Int, onSelect: (Int) -> Unit, pal: BoardPalette) {
  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    tabs.forEachIndexed { i, label ->
      val on = i == selected
      val shape = RoundedCornerShape(999.dp)
      Box(
        Modifier.clip(shape)
          .background(if (on) pal.accent.copy(alpha = 0.14f) else Color.Transparent)
          .border(1.5.dp, if (on) pal.accent else pal.rule, shape)
          .clickable { onSelect(i) }
          .semantics {
            role = Role.Tab
            this.selected = on
          }
          .padding(horizontal = 13.dp, vertical = 5.dp)
      ) {
        Text(label, color = if (on) pal.accent else pal.t2, fontSize = fs(14f), fontWeight = FontWeight.Bold, maxLines = 1)
      }
    }
  }
}

@Composable
private fun HeadView(h: SeaBoard.Head, pal: BoardPalette) {
  Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
      Text(h.name, color = pal.text, fontSize = fs(19f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (h.line != null) Text(h.line, color = pal.t2, fontSize = fs(12.5f), fontWeight = FontWeight.Medium, lineHeight = 1.25.em)
    }
    if (h.water != null) {
      Column(horizontalAlignment = Alignment.End) {
        Text("eau", color = pal.t3, fontSize = fs(11f), fontWeight = FontWeight.Medium, lineHeight = 1.05.em)
        Text(h.water, color = pal.rain, fontSize = fs(26f), fontWeight = FontWeight.Bold, lineHeight = 1.05.em)
      }
    }
  }
}

// ----------------------------------------------------------------------------------------------------------- the tiles

/**
 * The tiles, three a row. As the card does when a word of a tile is cut, the words get shorter (level 1, then 2) until they
 * all fit the width of a tile.
 */
@Composable
private fun TilesView(b: Beach, now: Long, offsetS: Int, w: Float, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  val density = LocalDensity.current
  val k11 = TextStyle(fontSize = fs(11f), fontWeight = FontWeight.Medium)
  val v15 = TextStyle(fontSize = fs(15f), fontWeight = FontWeight.Bold)
  // A tile's inner width: the third of the row less the gaps, its padding and its border.
  val inner = with(density) { ((w - 12f) / 3f - 16f - 3f).dp.toPx() }
  fun fits(t: SeaBoard.Tile): Boolean {
    fun width(s: AnnotatedString, style: TextStyle) = measurer.measure(s, style, softWrap = false, maxLines = 1).size.width
    val arrow = if (t.deg != null) with(density) { 17.dp.toPx() } else 0f
    return width(parts(t.key, pal), k11) <= inner && width(AnnotatedString(t.value), v15) + arrow <= inner && width(parts(t.detail, pal), k11) <= inner
  }
  val tiles = (0..2).map { SeaBoard.tiles(b, now, offsetS, it) }.firstOrNull { level -> level.all(::fits) } ?: SeaBoard.tiles(b, now, offsetS, 2)
  if (tiles.isEmpty()) return
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    tiles.chunked(3).forEach { row ->
      Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        row.forEach { TileView(it, pal, Modifier.weight(1f).fillMaxHeight()) }
        repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
      }
    }
  }
}

@Composable
private fun TileView(t: SeaBoard.Tile, pal: BoardPalette, modifier: Modifier) {
  val colour = pal.of(t.tone)
  Column(
    modifier.border(1.5.dp, pal.rule, RoundedCornerShape(12.dp)).padding(horizontal = 8.dp, vertical = 6.dp),
    verticalArrangement = Arrangement.spacedBy(1.dp),
  ) {
    Text(parts(t.key, pal), color = pal.t2, fontSize = fs(11f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      if (t.deg != null) Canvas(Modifier.size(13.dp)) { windArrow(size.width / 2, size.height / 2, size.width / 1.1f, t.deg, colour) }
      Text(t.value, color = colour, fontSize = fs(15f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    val detail = parts(t.detail, pal)
    if (detail.isNotEmpty()) Text(detail, color = pal.t2, fontSize = fs(11f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
  }
}

// ------------------------------------------------------------------------------------------------------ the activities

/** Each verdict with its best slot or why it is not good, then its 24 hours from the one under way, the night dark. */
@Composable
private fun ActivitiesView(rows: List<SeaBoard.ActivityRow>, ticks: List<String>, w: Float, pal: BoardPalette) {
  val (nameW, verdW) = SeaBoard.activityWidths(w)
  val left = nameW + 8 + verdW
  Column {
    Row(Modifier.fillMaxWidth().height(18.dp), verticalAlignment = Alignment.CenterVertically) {
      Row(Modifier.width(left.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("ACTIVITÉS", color = pal.t3, fontSize = fs(11f), fontWeight = FontWeight.Bold, letterSpacing = 0.06.em, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(nameW.dp))
        Spacer(Modifier.width(8.dp))
        Text("dans les 24 h", color = pal.t4, fontSize = fs(10.5f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(verdW.dp))
      }
      Spacer(Modifier.width(8.dp))
      Ticks(ticks, pal, Modifier.weight(1f).height(13.dp))
    }
    Spacer(Modifier.height(2.dp))
    rows.forEach { r ->
      Row(
        Modifier.fillMaxWidth().height(34.dp).drawTopRule(pal.rule),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(if (r.available) Modifier.width(left.dp) else Modifier.weight(1f), verticalArrangement = Arrangement.Center) {
          Row(verticalAlignment = Alignment.Bottom) {
            Text(r.name, color = pal.text, fontSize = fs(13f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 1.15.em, modifier = Modifier.width(nameW.dp).alignByBaseline())
            Spacer(Modifier.width(8.dp))
            Text(r.word, color = pal.of(r.tone), fontSize = fs(13f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 1.15.em, modifier = (if (r.available) Modifier.width(verdW.dp) else Modifier.weight(1f)).alignByBaseline())
          }
          if (r.why != null) Text(r.why, color = pal.t3, fontSize = fs(11f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, lineHeight = 1.15.em)
        }
        if (r.available) {
          Spacer(Modifier.width(8.dp))
          Strip(r.strip, pal, Modifier.weight(1f).height(14.dp))
        }
      }
    }
    Text("Règles de Vigie, pas pour la sécurité ni la navigation", color = pal.t4, fontSize = fs(12f), fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 4.dp))
  }
}

/** A line of 1 px on top of a row (the card's `border-top`). */
private fun Modifier.drawTopRule(colour: Color): Modifier = drawBehind { drawLine(colour, Offset(0f, density / 2), Offset(size.width, density / 2), strokeWidth = density) }

/** The hours over the strips, each at its quarter of the 24 hours. */
@Composable
private fun Ticks(ticks: List<String>, pal: BoardPalette, modifier: Modifier) {
  Layout(
    content = { ticks.forEach { Text(it, color = pal.t3, fontSize = fs(10f), fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false) } },
    modifier = modifier,
  ) { measurables, constraints ->
    val placeables = measurables.map { it.measure(Constraints()) }
    val width = constraints.maxWidth
    layout(width, constraints.maxHeight) { placeables.forEachIndexed { i, p -> p.placeRelative((width * i / ticks.size.toFloat()).toInt(), 0) } }
  }
}

/** The 24 hours of a verdict: a cell each, in the colour of its verdict, the night and the hours without one dark. */
@Composable
private fun Strip(strip: List<String?>, pal: BoardPalette, modifier: Modifier) {
  Canvas(modifier) {
    val k = density
    val n = strip.size.coerceAtLeast(1)
    val cw = (size.width - (n - 1) * k) / n
    strip.forEachIndexed { i, tone ->
      drawRoundRect(if (tone != null) pal.of(tone) else pal.rule, Offset(i * (cw + k), 0f), androidx.compose.ui.geometry.Size(cw, size.height), androidx.compose.ui.geometry.CornerRadius(2 * k))
    }
  }
}

// ------------------------------------------------------------------------------------------------------------- the tide

@Composable
private fun TideView(c: SeaBoard.TideCurve, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  Bloc("Marée · 24 h", "pas pour la navigation", pal) {
    Canvas(Modifier.width(c.w.dp).height(c.h.dp)) {
      val k = density
      val pts = c.points.map { (x, y) -> Offset(x * k, y * k) }
      val curve = smoothPath(pts)
      val area = Path().apply {
        addPath(curve)
        lineTo(pts.last().x, (c.y1 + 4) * k)
        lineTo(pts.first().x, (c.y1 + 4) * k)
        close()
      }
      drawPath(area, Brush.verticalGradient(0f to pal.rain.copy(alpha = 0.35f), 1f to pal.rain.copy(alpha = 0.04f), startY = 0f, endY = c.h * k))
      drawPath(curve, pal.rain, style = Stroke(3 * k))
      drawLine(pal.accent, Offset(c.nowX * k, (c.y0 - 8) * k), Offset(c.nowX * k, (c.y1 + 4) * k), strokeWidth = 2.5f * k)
      c.marks.forEach { m ->
        drawCircle(pal.text, 4.5f * k, Offset(m.x * k, m.y * k))
        baseline(measurer, m.text, m.textX, if (m.low) c.h - 3 else m.y - 9, 13f, pal.text, "middle")
      }
      c.hours.forEach { h -> baseline(measurer, h.text, h.x, c.h - 3, 12f, if (h.accent) pal.accent else pal.t3, h.anchor) }
    }
  }
}

/** Writes [text] bold with its baseline at [y] (dp), anchored at [x] as SVG's `text-anchor` (`start`, `middle`, `end`). */
private fun DrawScope.baseline(m: TextMeasurer, text: String, x: Float, y: Float, sizePx: Float, colour: Color, anchor: String) {
  val r = m.measure(text, TextStyle(color = colour, fontSize = sizePx.dp.toSp(), fontWeight = FontWeight.Bold), softWrap = false, maxLines = 1)
  val k = density
  val left = when (anchor) { "start" -> x * k; "end" -> x * k - r.size.width; else -> x * k - r.size.width / 2f }
  drawText(r, topLeft = Offset(left, y * k - r.firstBaseline))
}

// ------------------------------------------------------------------------------------------------------------ the table

@Composable
private fun TableView(t: SeaBoard.Table, pal: BoardPalette) {
  Bloc("Les prochaines heures", "toutes les 3 h", pal) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
      TableRow(null, t.hours.size, pal) { i -> Text(t.hours[i], color = if (i == 0) pal.accent else pal.t3, fontSize = fs(10f), fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth()) }
      listOf(Triple("Vagues", "m", t.waves), Triple("Période", "s", t.periods), Triple("Vent", "km/h", t.winds)).forEach { (label, unit, cells) ->
        TableRow(label to unit, cells.size, pal) { i -> CellView(cells[i], pal) }
      }
    }
  }
}

/** A row of the table: its label in 62 dp (none for the hours), then a column per slot. */
@Composable
private fun TableRow(label: Pair<String, String>?, n: Int, pal: BoardPalette, cell: @Composable (Int) -> Unit) {
  Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
    Box(Modifier.width(62.dp)) {
      if (label != null) {
        Text(
          buildAnnotatedString {
            append(label.first)
            withStyle(SpanStyle(fontSize = fs(10f), fontWeight = FontWeight.Medium, color = pal.t3)) { append(" ${label.second}") }
          },
          color = pal.t2,
          fontSize = fs(11f),
          fontWeight = FontWeight.Bold,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
        )
      }
    }
    repeat(n) { i -> Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { cell(i) } }
  }
}

@Composable
private fun CellView(c: SeaBoard.Cell, pal: BoardPalette) {
  Row(
    Modifier.fillMaxWidth().height(20.dp).clip(RoundedCornerShape(5.dp)).background(if (c.tone != null) pal.of(c.tone).copy(alpha = c.alpha) else Color.Transparent),
    horizontalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterHorizontally),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (c.deg != null) Canvas(Modifier.size(9.dp)) { windArrow(size.width / 2, size.height / 2, size.width / 1.1f, c.deg, pal.text) }
    Text(c.text, color = pal.text, fontSize = fs(11f), fontWeight = FontWeight.Bold, maxLines = 1, softWrap = false)
  }
}
