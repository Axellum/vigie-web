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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.ui.smoothPath
import fr.auxfilsdesidees.vigie.ui.windArrow

/**
 * The bar of pages of the Home Assistant card (« Accueil | Détails »), its narrow look: a track, the page shown in the green
 * of the hour. [selected] is the index of the page shown.
 */
@Composable
fun BoardPages(labels: List<String>, selected: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) {
  val pal = BoardPalette.Dark
  val track = RoundedCornerShape(14.dp)
  Row(
    modifier.fillMaxWidth().background(Color.White.copy(alpha = 0.04f), track).border(1.5.dp, pal.rule, track).padding(3.dp),
    horizontalArrangement = Arrangement.spacedBy(3.dp),
  ) {
    labels.forEachIndexed { i, label ->
      val on = i == selected
      Box(
        Modifier.weight(1f)
          .height(30.dp)
          .clip(RoundedCornerShape(10.dp))
          .background(if (on) pal.accent else Color.Transparent)
          .clickable { onSelect(i) }
          .semantics {
            role = Role.Tab
            this.selected = on
          },
        contentAlignment = Alignment.Center,
      ) {
        Text(label, color = if (on) pal.onPill else pal.t3, fontSize = fs(13f), fontWeight = FontWeight.Bold, maxLines = 1)
      }
    }
  }
}

/**
 * The Details page of the Home Assistant card, drawn natively in its narrow layout (one column): the rain until noon in a few
 * periods, the hour to come by 5 minutes, AROME-PI by quarter hour (gusts, precipitation, hail, visibility), the next 48
 * hours, the chances of the ensembles, and who the values are from. The logic is `DetailsBoard`'s; the sizes are the card's
 * px in dp, the texts keep their size whatever the phone's font scale (as `HomeBoardView`).
 */
@Composable
fun DetailsBoardView(p: PointNow, now: Long, modifier: Modifier = Modifier) {
  val pal = BoardPalette.Dark
  BoxWithConstraints(modifier.fillMaxWidth()) {
    val w = maxWidth.value
    Column {
      Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        DetailsBoard.chips(p, now)?.let { ChipsBlock(it, pal) }
        DetailsBoard.minutes(p, now)?.let { MinutesBlock(it, w, pal) }
        DetailsBoard.quarter(p, now, w)?.let { QuarterBlock(it, w, pal) }
        DetailsBoard.hours48(p, now, w)?.let { Hours48Block(it, w, pal) }
        DetailsBoard.chances(p, now, w)?.let { ChancesBlock(it, pal) }
      }
      DetailsBoard.credits(p)?.let {
        Text(it, color = pal.t4, fontSize = fs(12f), fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 12.dp))
      }
    }
  }
}

/** A block of the page: its title in capitals, a legend on the right, then [content]. */
@Composable
private fun Bloc(title: String, right: String, pal: BoardPalette, content: @Composable () -> Unit) {
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    SectionHeader(title, pal) {
      if (right.isNotEmpty()) {
        Text(right, color = pal.t4, fontSize = fs(10.5f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(start = 10.dp))
      }
    }
    content()
  }
}

/** Writes [text] with its left edge ([align] −1), its centre (0) or its right edge (1) at [x] (card px), its line from [top]. */
private fun DrawScope.textAt(
  m: TextMeasurer,
  text: String,
  x: Float,
  top: Float,
  sizePx: Float,
  colour: Color,
  weight: FontWeight = FontWeight.Medium,
  align: Int = 0,
  lineHeight: Float = 1.2f,
) {
  val r = m.measure(text, TextStyle(color = colour, fontSize = sizePx.dp.toSp(), fontWeight = weight), softWrap = false, maxLines = 1)
  val k = density
  val left = when (align) { -1 -> x * k; 1 -> x * k - r.size.width; else -> x * k - r.size.width / 2f }
  drawText(r, topLeft = Offset(left, top * k + (lineHeight * sizePx * k - r.size.height) / 2))
}

/** A bar with rounder top corners than bottom ones, standing on [bottom] (card px). */
private fun DrawScope.bar(colour: Color, left: Float, bottom: Float, width: Float, height: Float, top: Float, foot: Float) {
  if (height <= 0f || width <= 0f) return
  val k = density
  val rr =
    RoundRect(
      left * k, (bottom - height) * k, (left + width) * k, bottom * k,
      topLeftCornerRadius = CornerRadius(top * k), topRightCornerRadius = CornerRadius(top * k),
      bottomRightCornerRadius = CornerRadius(foot * k), bottomLeftCornerRadius = CornerRadius(foot * k),
    )
  drawPath(Path().apply { addRoundRect(rr) }, colour)
}

// --------------------------------------------------------------------------------------------------------- the chips

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ChipsBlock(c: DetailsBoard.Chips, pal: BoardPalette) {
  Bloc(c.title, "", pal) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
      c.chips.forEach { chip ->
        val tone = if (chip.wet) pal.rain else pal.green
        val shape = RoundedCornerShape(14.dp)
        Row(
          Modifier.height(28.dp)
            .background(tone.copy(alpha = if (chip.wet) 0.16f else 0.1f), shape)
            .border(1.dp, tone.copy(alpha = if (chip.wet) 0.55f else 0.45f), shape)
            .padding(horizontal = 9.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
          Box(Modifier.size(8.dp).background(tone, CircleShape))
          Text(chip.what, color = pal.text, fontSize = fs(13f), fontWeight = FontWeight.Bold, maxLines = 1)
          Text("→ ${chip.to}", color = pal.t2, fontSize = fs(13f), fontWeight = FontWeight.Normal, maxLines = 1)
        }
      }
    }
  }
}

// --------------------------------------------------------------------------------------------------- the hour to come

@Composable
private fun MinutesBlock(m: DetailsBoard.Minutes, w: Float, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  Bloc(m.title, m.source, pal) {
    Canvas(Modifier.width(w.dp).height(72.dp)) {
      val k = density
      val bw = w - 52
      val dash = PathEffect.dashPathEffect(floatArrayOf(3 * k, 3 * k))
      listOf(14f to "forte", 38f to "modérée").forEach { (y, word) ->
        drawLine(pal.hollow, Offset(0f, y * k), Offset(bw * k, y * k), strokeWidth = k, pathEffect = dash)
        textAt(measurer, word, bw + 4, y - 7, 10f, pal.t4, align = -1)
      }
      val n = m.bars.size
      val gap = 4f
      val each = (bw - gap * (n - 1)) / n
      m.bars.forEachIndexed { i, b ->
        bar(if (b.r > 0) pal.rainOf(b.r) else pal.hollow, i * (each + gap), 50f, each, DetailsBoard.minuteBar(b.r), 4f, 2f)
      }
      m.labels.forEachIndexed { i, l ->
        if (l.text.isEmpty()) return@forEachIndexed
        val colour = when (l.role) { "accent" -> pal.accent; "first" -> pal.rainLight; else -> pal.t3 }
        textAt(measurer, l.text, i * (each + gap) + each / 2, 56f, 10f, colour, if (l.role == "plain") FontWeight.Medium else FontWeight.Bold)
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------- by quarter hour

@Composable
private fun QuarterBlock(q: DetailsBoard.Quarter, w: Float, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  Bloc(q.title, q.right, pal) {
    Canvas(Modifier.width(w.dp).height(92.dp)) {
      val k = density
      val cw = w / q.n
      q.gusts?.let { g ->
        val hot = pal.gust(g.peak.v) ?: pal.text
        if (g.unitOnLeft) textAt(measurer, "rafales km/h", 0f, 0f, 10f, pal.t4, align = -1) else textAt(measurer, "rafales km/h", w, 0f, 10f, pal.t4, align = 1)
        g.y80?.let { y ->
          drawLine(pal.orange.copy(alpha = 0.6f), Offset(0f, y * k), Offset(w * k, y * k), strokeWidth = k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * k, 4 * k)))
        }
        val pts = g.points.map { Offset(it.x * k, it.y * k) }
        val curve = smoothPath(pts)
        val area = Path().apply {
          addPath(curve)
          lineTo(pts.last().x, 48 * k)
          lineTo(pts.first().x, 48 * k)
          close()
        }
        // The curve in a layer of its own, so that the ring of the peak is hollow (the card fills it with its background).
        drawContext.canvas.saveLayer(Rect(0f, 0f, size.width, 48 * k), Paint())
        drawPath(area, pal.wind.copy(alpha = 0.14f))
        drawPath(curve, pal.wind, style = Stroke(2.5f * k, cap = StrokeCap.Round))
        drawCircle(Color.Black, 4.5f * k, Offset(g.peak.x * k, g.peak.y * k), blendMode = BlendMode.Clear)
        drawContext.canvas.restore()
        drawCircle(hot, 4.5f * k, Offset(g.peak.x * k, g.peak.y * k), style = Stroke(2.5f * k))
        if (g.peakLeft != null) textAt(measurer, g.peakText, g.peakLeft, g.peakTop, 12f, hot, FontWeight.Bold, align = -1)
        else textAt(measurer, g.peakText, g.peakRight ?: 0f, g.peakTop, 12f, hot, FontWeight.Bold, align = 1)
      }
      q.runs.forEach { r ->
        val left = (r.i0 * cw + 1) * k
        val width = (r.n * cw - 2) * k
        val corner = CornerRadius(5 * k)
        if (r.wet) drawRoundRect(pal.rain, Offset(left, 52 * k), Size(width, 20 * k), corner)
        else drawRoundRect(pal.rule, Offset(left + k / 2, 52 * k + k / 2), Size(width - k, 20 * k - k), corner, style = Stroke(k))
        if (r.text.isNotEmpty()) textAt(measurer, r.text, r.i0 * cw + 1 + (r.n * cw - 2) / 2, 52f, 10f, if (r.wet) pal.onPill else pal.t4, FontWeight.Bold, lineHeight = 2f)
      }
      q.marks.forEach { (i, text) ->
        val cx = (cw * (i + 0.5f) - 22).coerceIn(0f, maxOf(0f, w - 44)) + 22
        textAt(measurer, text, cx, 76f, 10f, pal.t3, FontWeight.Bold)
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------------- 48 hours

@Composable
private fun Hours48Block(h: DetailsBoard.Hours48, w: Float, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  Bloc(h.title, h.legend, pal) {
    Canvas(Modifier.width(w.dp).height(122.dp)) {
      val k = density
      val n = h.hours.size
      val cw = w / n
      h.hours.forEachIndexed { i, x ->
        drawRoundRect(pal.glow(x.sun, x.day, 92 * k), Offset((i * cw + 0.5f) * k, 0f), Size(maxOf(1f, cw - 1) * k, 92 * k), CornerRadius(3 * k))
      }
      h.days.forEach { (i, name) ->
        drawLine(pal.hollow, Offset(i * cw * k, 0f), Offset(i * cw * k, 92 * k), strokeWidth = k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * k, 3 * k)))
        textAt(measurer, name, i * cw + 3, 0f, 10f, pal.t2, FontWeight.Bold, align = -1)
      }
      if (h.hasChance) {
        val pts = h.hours.mapIndexedNotNull { i, x -> x.chance?.let { Offset(cw * (i + 0.5f) * k, DetailsBoard.chanceY(it) * k) } }
        if (pts.size >= 2) drawPath(smoothPath(pts), pal.t2.copy(alpha = 0.8f), style = Stroke(1.5f * k, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3 * k, 3 * k))))
        textAt(measurer, "chance", 4f, 30f, 9f, pal.t3, align = -1)
      }
      val bw = minOf(6f, cw * 0.7f)
      h.hours.forEachIndexed { i, x ->
        bar(pal.rainOf(x.mm), cw * (i + 0.5f) - bw / 2, 92f, bw, DetailsBoard.hour48Bar(x.mm), 3f, 1f)
      }
      h.hours.forEachIndexed { i, x ->
        if (i % h.windEvery != 0 || x.wind == null) return@forEachIndexed
        val cx = ((cw * (i + 0.5f) - 15).coerceIn(0f, maxOf(0f, w - 30)) + 15) * k
        val speed = measurer.measure(HomeBoard.fmt(x.wind), TextStyle(color = pal.wind, fontSize = 10f.dp.toSp(), fontWeight = FontWeight.Bold), softWrap = false)
        val arrow = if (x.deg != null) 10f * k else 0f
        val left = cx - (arrow + speed.size.width) / 2
        val mid = (94 + 6) * k
        if (x.deg != null) windArrow(left + 4.5f * k, mid, 9f * k, x.deg, pal.wind)
        drawText(speed, topLeft = Offset(left + arrow, mid - speed.size.height / 2f))
      }
      h.hourLabels.forEach { (i, text) ->
        val cx = (cw * (i + 0.5f) - 15).coerceIn(0f, maxOf(0f, w - 30)) + 15
        textAt(measurer, text, cx, 108f, 10f, if (i == 0) pal.accent else pal.t3, FontWeight.Bold)
      }
    }
  }
}

// -------------------------------------------------------------------------------------------------------- chances

@Composable
private fun ChancesBlock(c: DetailsBoard.Chances, pal: BoardPalette) {
  Bloc(c.title, c.source, pal) {
    Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
      Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
        Spacer(Modifier.width(c.labelWidth.dp))
        c.hours.forEach { Text(it, color = pal.t3, fontSize = fs(10f), fontWeight = FontWeight.Bold, maxLines = 1, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Center) }
      }
      c.rows.forEach { row ->
        val tone = when (row.tone) { "rain" -> pal.rain; "orange" -> pal.orange; "red" -> pal.red; "yellow" -> pal.yellow; else -> pal.t2 }
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.CenterVertically) {
          Text(row.label, color = tone, fontSize = fs(12f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.width(c.labelWidth.dp))
          row.values.forEach { v ->
            Box(
              Modifier.weight(1f).height(24.dp).background(if (v != null) tone.copy(alpha = DetailsBoard.chanceAlpha(v)) else Color.Transparent, RoundedCornerShape(6.dp)),
              contentAlignment = Alignment.Center,
            ) {
              if (v != null) Text(HomeBoard.fmt(v), color = if (v >= 55) pal.onPill else pal.t2, fontSize = fs(11f), fontWeight = FontWeight.Bold, maxLines = 1)
            }
          }
        }
      }
    }
  }
}
