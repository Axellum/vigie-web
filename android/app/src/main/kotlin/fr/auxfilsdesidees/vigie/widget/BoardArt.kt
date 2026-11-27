package fr.auxfilsdesidees.vigie.widget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.Typeface
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Canvas
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.drawscope.CanvasDrawScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import fr.auxfilsdesidees.vigie.ui.Frise
import fr.auxfilsdesidees.vigie.ui.Vigil
import fr.auxfilsdesidees.vigie.ui.board.BoardPalette
import fr.auxfilsdesidees.vigie.ui.board.HomeBoard
import fr.auxfilsdesidees.vigie.ui.board.cardGlyph
import fr.auxfilsdesidees.vigie.ui.board.familyIcon
import fr.auxfilsdesidees.vigie.ui.smoothPath
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import fr.auxfilsdesidees.vigie.ui.windArrow
import kotlin.math.roundToInt
import kotlin.math.sqrt
import androidx.compose.ui.graphics.Paint as LayerPaint

/**
 * The widgets drawn in the look of the home page of the Home Assistant card, piste B of the sketches chosen on
 * 2026-11-27 (« the columns first »): the weather now in the header, the rain of the hour on one line, the « Lueur »
 * columns of the next hours (tinted by their sun, night blue at night, the one under way ringed in green), the days as
 * two curves. A home screen cannot draw, so the whole content of a widget is one picture at the screen's density, laid
 * out here in dp with the card's palette ([BoardPalette.Dark]) and rules ([HomeBoard]). As the app's home page, the texts
 * keep their size whatever the phone's font scale, so that nothing overlaps.
 */
object BoardArt {
  private val pal = BoardPalette.Dark

  /** The background of the widgets, the card's (its dark theme): `res/drawable/widget_board.xml` holds the same. */
  val Background = Color(0xFF19232E)

  /** The rows of the columns of the hours, from the top. */
  enum class Row { Head, Icon, Temp, Curve, Rain, Chance, Wind, SeaTitle, Tide, Surf, Foot }

  /** The place widget, [w] × [h] dp (its room without the frame's padding), in [format]. */
  fun place(context: Context, v: BoardWidget.View, w: Float, h: Float, format: BoardWidget.Format): Bitmap =
    draw(context, w, h) {
      when (format) {
        BoardWidget.Format.Compact -> compact(v, w, h)
        BoardWidget.Format.Medium -> medium(v, w, h)
        BoardWidget.Format.Large -> large(v, w, h)
      }
    }

  /**
   * The frise widget: the header, twelve columns hour by hour; from about three rows, the rain tile above them; from about
   * four, the tide and the surf of the favourite spot under them ([sea]).
   */
  fun frise(context: Context, v: BoardWidget.View, sea: BoardWidget.Sea?, w: Float, h: Float): Bitmap =
    draw(context, w, h) {
      header(v, w)
      var y = HEADER + GAP
      val tall = h >= FRISE_TILE_FROM
      if (tall) {
        at(0f, y) { rainTile(v, w, TILE) }
        y += TILE + GAP
      } else if (v.age != null) {
        textMid(fit(v.age, w, 12f, Weight.Medium), 0f, y + 8, VigieColors.Warning, 12f, Weight.Medium, Paint.Align.LEFT)
        y += 16f + GAP
      }
      val rest = h - y
      val withSea = sea != null && rest >= FRISE_SEA_FROM
      val rows = buildList {
        addAll(listOf(Row.Head, Row.Icon, Row.Curve, Row.Rain))
        if (tall) add(Row.Chance)
        add(Row.Wind)
        if (withSea) addAll(listOf(Row.SeaTitle, Row.Tide, Row.Surf))
      }
      if (v.hourly.size >= 4) at(0f, y) { hours(v.hourly, 1, v.offsetS, w, rest, rows, iconDp = 20f, tempDp = 11.5f, rx = 7f, stroke = 3f, sea = sea.takeIf { withSea }) }
    }

  private const val HEADER = 24f
  private const val RAIN_LINE = 22f
  private const val TITLE = 15f
  private const val TILE = 52f
  private const val GAP = 6f

  /** The frise's rain tile from this height (dp of content: a 4 × 3 widget on a phone), its tide and surf from this much left. */
  private const val FRISE_TILE_FROM = 280f
  private const val FRISE_SEA_FROM = 290f

  // -------------------------------------------------------------------------------------------------------- the formats

  /**
   * Compact (one row of the grid): the weather now on the left (icon, temperature, place), six columns hour by hour, and
   * under them the rain of the hour on one line with its twelve 5-minute bars and the warning (without one: the hour the
   * bars end at). Narrower than four cells, no columns.
   */
  private fun DrawScope.compact(v: BoardWidget.View, w: Float, h: Float) {
    val lineH = 17f
    val top = h - lineH - 5
    val columns = w >= 226 && v.hourly.size >= 4
    val left = if (columns) 88f else w
    nowBlock(v, left, top)
    if (columns) at(left + 8, 0f) { hours(v.hourly.take(6), 1, v.offsetS, w - left - 8, top, listOf(Row.Head, Row.Icon, Row.Temp), iconDp = 18f, rx = 7f) }
    at(0f, h - lineH) { compactRain(v, w, lineH) }
  }

  /** Medium: the header, the rain of the hour on one line, the columns by three hours. */
  private fun DrawScope.medium(v: BoardWidget.View, w: Float, h: Float) {
    header(v, w)
    at(0f, HEADER + GAP) { rainLine(v, w) }
    val top = HEADER + GAP + RAIN_LINE + GAP
    // A narrow widget keeps columns of 30 dp at least.
    val slots = v.byThree.take((w / 30).toInt().coerceIn(4, 8))
    if (slots.size >= 4) at(0f, top) { hours(slots, 3, v.offsetS, w, h - top, listOf(Row.Icon, Row.Curve, Row.Rain, Row.Wind, Row.Foot)) }
  }

  /** Large: the medium one, then the five days as two curves; the hours take a little more than half of what is left. */
  private fun DrawScope.large(v: BoardWidget.View, w: Float, h: Float) {
    header(v, w)
    at(0f, HEADER + GAP) { rainLine(v, w) }
    var y = HEADER + GAP + RAIN_LINE + GAP
    val hasDays = v.days.size >= 2
    val hasHours = v.byThree.size >= 4
    val free = h - y - (if (hasHours) TITLE + 5 else 0f) - (if (hasDays) GAP + TITLE + 5 else 0f)
    val hoursH = if (!hasHours) 0f else if (hasDays) (free * 0.52f).roundToInt().toFloat() else free
    if (hasHours) {
      at(0f, y) { title("24 h · par 3 h", w, legend = true) }
      y += TITLE + 5
      at(0f, y) { hours(v.byThree, 3, v.offsetS, w, hoursH, listOf(Row.Icon, Row.Curve, Row.Rain, Row.Wind, Row.Foot)) }
      y += hoursH + GAP
    }
    if (hasDays) {
      at(0f, y) { title("${v.days.size} jours · max et min", w, legend = false) }
      y += TITLE + 5
      val daysH = h - y
      at(0f, y) { days(v.days, w, daysH) }
    }
  }

  // ---------------------------------------------------------------------------------------------------------- the blocks

  /** The weather now of the compact format: icon and temperature, the place under them; centred in [h]. */
  private fun DrawScope.nowBlock(v: BoardWidget.View, w: Float, h: Float) {
    val blockH = 31f + 3 + 15
    val y = (h - blockH) / 2
    var x = 0f
    if (v.kind != null) {
      familyIcon(v.kind, 15f.px, (y + 15.5f).px, 30f.px, pal)
      x = 34f
    }
    v.tempC?.let { textMid("${HomeBoard.fmt(it)}°", x, y + 15.5f, pal.temperature(it), 31f, Weight.Bold, Paint.Align.LEFT) }
    pin(6f, y + 34 + 7.5f, 12f, pal.t2, 2.2f)
    textMid(fit(v.name, w - 15, 12f, Weight.Bold), 15f, y + 34 + 7.5f, pal.text, 12f, Weight.Bold, Paint.Align.LEFT)
  }

  /**
   * The header: the pin, the place, the icon and the temperature now; at the right end the warning's pill, or the quiet
   * words of the warnings (« Aucune vigilance », a green dot before them) when they leave the place room.
   */
  private fun DrawScope.header(v: BoardWidget.View, w: Float) {
    val cy = HEADER / 2
    val pillText = BoardWidget.pill(v.warnings)
    val tempText = v.tempC?.let { "${HomeBoard.fmt(it)}°" }
    val tempW = tempText?.let { measure(it, 17f, Weight.Bold) } ?: 0f
    val nowW = 4 + (if (v.kind != null) 22f + 3 else 0f) + tempW
    val start = 15f + 6
    var right = 0f
    var quiet: String? = null
    if (pillText != null) right = pillWidth(pillText, 11f) + 8
    else {
      val words = v.warnings.short
      val ww = measure(words, 11f, Weight.Medium) + 10 + 8
      if (w - start - nowW - ww >= 80) {
        quiet = words
        right = ww
      }
    }
    pin(7.5f, cy, 15f, pal.t2, 2f)
    val name = fit(v.name, maxOf(30f, w - start - nowW - right - 10), 14f, Weight.Bold)
    textMid(name, start, cy, pal.text, 14f, Weight.Bold, Paint.Align.LEFT)
    var x = start + measure(name, 14f, Weight.Bold) + 6 + 4
    if (v.kind != null) {
      familyIcon(v.kind, (x + 11).px, cy.px, 22f.px, pal)
      x += 22 + 3
    }
    if (tempText != null) textMid(tempText, x, cy, pal.temperature(v.tempC), 17f, Weight.Bold, Paint.Align.LEFT)
    if (pillText != null) pill(pillText, v.warnings.level, w, cy, 11f)
    else if (quiet != null) {
      val tw = measure(quiet, 11f, Weight.Medium)
      if (v.warnings.state == Vigil.State.None) drawCircle(pal.green, 3f.px, Offset((w - tw - 7).px, cy.px))
      textMid(quiet, w, cy, pal.t3, 11f, Weight.Medium, Paint.Align.RIGHT)
    }
  }

  /** The rain of the hour on one line (medium and large): the umbrella, its words, its bars at the end; the age once old. */
  private fun DrawScope.rainLine(v: BoardWidget.View, w: Float) {
    val cy = RAIN_LINE / 2
    if (v.age != null) {
      cardGlyph("parapluie", 8.5f.px, cy.px, 17f.px, pal.t4, 2.2f)
      textMid(fit(v.age, w - 24, 12.5f, Weight.Medium), 24f, cy, VigieColors.Warning, 12.5f, Weight.Medium, Paint.Align.LEFT)
      return
    }
    cardGlyph("parapluie", 8.5f.px, cy.px, 17f.px, pal.rain, 2.2f)
    val steps = v.rain.bars
    val bw = if (steps.isEmpty()) 0f else minOf(110f, w * 0.36f)
    textMid(fit(v.rain.head, w - 24 - (if (bw > 0) bw + 8 else 0f), 14f, Weight.Bold), 24f, cy, pal.text, 14f, Weight.Bold, Paint.Align.LEFT)
    if (bw > 0) bars(steps, w - bw, cy - 8, bw, 16f, gap = 2f, dry = 2f, low = 4f)
  }

  /** The rain of the hour of the compact format: words, bars across what is left, and the pill or the bars' end. */
  private fun DrawScope.compactRain(v: BoardWidget.View, w: Float, h: Float) {
    val cy = h / 2
    val pillText = BoardWidget.pill(v.warnings)
    val end = if (pillText == null && v.age == null) v.rain.end else null
    val right =
      when {
        pillText != null -> pillWidth(pillText, 10f) + 6
        end != null -> measure(end, 10f, Weight.Medium) + 6
        else -> 0f
      }
    if (pillText != null) pill(pillText, v.warnings.level, w, cy, 10f)
    else if (end != null) textMid(end, w, cy, pal.t3, 10f, Weight.Medium, Paint.Align.RIGHT)
    if (v.age != null) {
      textMid(fit(v.age, w - right, 11.5f, Weight.Medium), 0f, cy, VigieColors.Warning, 11.5f, Weight.Medium, Paint.Align.LEFT)
      return
    }
    cardGlyph("parapluie", 6.5f.px, cy.px, 13f.px, pal.rain, 2.4f)
    val x = 13f + 6
    val steps = v.rain.bars
    val room = w - x - right
    val head = fit(v.rain.head, if (steps.isEmpty()) room else room - 66, 12f, Weight.Bold)
    textMid(head, x, cy, pal.text, 12f, Weight.Bold, Paint.Align.LEFT)
    if (steps.isNotEmpty()) {
      val bx = x + measure(head, 12f, Weight.Bold) + 6
      bars(steps, bx, cy - 7, w - right - bx, 14f, gap = 2f, dry = 2f, low = 4f)
    }
  }

  /**
   * The bars of the rain of the hour standing on one line, [w] × [h] dp from ([x], [y]): a dry step low and grey, a wet
   * one rising with the square root of its rate (4 mm/h fill the height), as the card's tile.
   */
  private fun DrawScope.bars(bars: List<HomeBoard.Bar>, x: Float, y: Float, w: Float, h: Float, gap: Float, dry: Float, low: Float) {
    if (bars.isEmpty() || w < 12) return
    val n = bars.size
    val bw = (w - gap * (n - 1)) / n
    bars.forEachIndexed { i, b ->
      val bh = if (b.r > 0) low + sqrt(minOf(b.r, 4.0) / 4).toFloat() * (h - low) else dry
      drawRoundRect(if (b.r > 0) pal.rainOf(b.r) else pal.hollow, Offset((x + i * (bw + gap)).px, (y + h - bh).px), Size(bw.px, bh.px), CornerRadius(minOf(3f, bw / 2).px))
    }
  }

  /** The card's rain tile: the umbrella, the head and its words (the age once old), the bars and their hours. */
  private fun DrawScope.rainTile(v: BoardWidget.View, w: Float, h: Float) {
    drawRoundRect(pal.rain.copy(alpha = 0.12f), Offset.Zero, Size(w.px, h.px), CornerRadius(12f.px))
    drawRoundRect(pal.rain.copy(alpha = 0.45f), Offset(0.5f.px, 0.5f.px), Size((w - 1).px, (h - 1).px), CornerRadius(11.5f.px), style = Stroke(1f.px))
    val cy = h / 2
    cardGlyph("parapluie", (12 + 11f).px, cy.px, 22f.px, pal.rain, 2.2f)
    val r = v.rain
    val textX = 12f + 22 + 10
    val bw = if (v.age != null || r.bars.isEmpty()) 0f else minOf(120f, w - 24 - 22 - 20 - 124)
    val textW = w - textX - 12 - (if (bw > 0) bw + 10 else 0f)
    val sub = v.age ?: r.sub
    if (sub.isEmpty()) textMid(fit(r.head, textW, 15f, Weight.Bold), textX, cy, pal.text, 15f, Weight.Bold, Paint.Align.LEFT)
    else {
      textMid(fit(r.head, textW, 15f, Weight.Bold), textX, cy - 8, pal.text, 15f, Weight.Bold, Paint.Align.LEFT)
      textMid(fit(sub, textW, 12f, Weight.Medium), textX, cy + 10, if (v.age != null) VigieColors.Warning else pal.t2, 12f, Weight.Medium, Paint.Align.LEFT)
    }
    if (bw > 0) {
      val bx = w - 12 - bw
      val marks = if (bw < 110 && r.marks.size == 3) listOf(r.marks[0], r.marks[2]) else r.marks
      val barsH = 24f
      val top = (h - barsH - (if (marks.isNotEmpty()) 3 + 12 else 0)) / 2
      bars(r.bars, bx, top, bw, barsH, gap = if (bw < 110) 3f else 4f, dry = 3f, low = 5f)
      marks.forEachIndexed { i, m ->
        val (x, align) =
          when (i) {
            0 -> bx to Paint.Align.LEFT
            marks.lastIndex -> bx + bw to Paint.Align.RIGHT
            else -> bx + bw / 2 to Paint.Align.CENTER
          }
        text(m, x, top + barsH + 3 + 10, pal.t3, 10f, Weight.Medium, align)
      }
    }
  }

  /** A block's title: its words in capitals on the left; for the hours, the legend of the glow on the right. */
  private fun DrawScope.title(s: String, w: Float, legend: Boolean) {
    val cy = TITLE / 2
    textMid(s.uppercase(), 0f, cy, pal.t3, 10.5f, Weight.Bold, Paint.Align.LEFT, spacing = 0.06f)
    if (!legend) return
    textMid("soleil", w, cy, pal.t4, 10.5f, Weight.Medium, Paint.Align.RIGHT)
    val ramp = 54f
    val rx = w - measure("soleil", 10.5f, Weight.Medium) - 5 - ramp
    drawRoundRect(
      Brush.horizontalGradient(
        0f to pal.glowNight.copy(alpha = 0.55f),
        0.22f to pal.glowNight.copy(alpha = 0.55f),
        0.3f to pal.glowCloud.copy(alpha = 0.45f),
        1f to pal.glowSun.copy(alpha = 0.85f),
        startX = rx.px,
        endX = (rx + ramp).px,
      ),
      Offset(rx.px, (cy - 3.5f).px),
      Size(ramp.px, 7f.px),
      CornerRadius(3.5f.px),
    )
    textMid("nuit", rx - 5, cy, pal.t4, 10.5f, Weight.Medium, Paint.Align.RIGHT)
  }

  // ----------------------------------------------------------------------------------------------------------- the hours

  private fun rowHeight(r: Row, narrow: Boolean, iconDp: Float): Float =
    when (r) {
      Row.Head -> 15f
      Row.Icon -> iconDp + 6
      Row.Temp -> 18f
      Row.Curve -> 0f
      Row.Rain -> 26f
      Row.Chance -> 13f
      Row.Wind -> if (narrow) 28f else 16f
      Row.SeaTitle -> 15f
      Row.Tide -> 46f
      Row.Surf -> 14f
      Row.Foot -> 17f
    }

  /**
   * The columns of [slots] of [step] hours, [w] × [h] dp, [rows] from the top; the curve of the temperatures takes the
   * height the other rows leave. Under 30 dp a column writes its hour as a number and stacks its wind.
   */
  private fun DrawScope.hours(
    slots: List<HomeBoard.HourSlot>,
    step: Int,
    offsetS: Int,
    w: Float,
    h: Float,
    rows: List<Row>,
    iconDp: Float = 22f,
    tempDp: Float = 13f,
    rx: Float = 8f,
    stroke: Float = 3.5f,
    sea: BoardWidget.Sea? = null,
  ) {
    val n = slots.size
    val cw = w / n
    val narrow = cw < 30
    val curveH = maxOf(20f, h - rows.sumOf { rowHeight(it, narrow, iconDp).toDouble() }.toFloat())
    val y = HashMap<Row, Float>()
    var acc = 0f
    for (r in rows) {
      y[r] = acc
      acc += if (r == Row.Curve) curveH else rowHeight(r, narrow, iconDp)
    }
    fun cx(i: Int) = cw * (i + 0.5f)
    slots.forEachIndexed { i, s -> column(cw * i, cw, h, pal.glow(s.sun, s.day, h.px), i == 0, rx) }
    val hourWord = { s: HomeBoard.HourSlot -> HomeBoard.hourOnly(s.ts, offsetS).let { if (narrow) it.takeWhile { c -> c.isDigit() } else it } }
    y[Row.Head]?.let { yy -> slots.forEachIndexed { i, s -> text(hourWord(s), cx(i), yy + 12, if (i == 0) pal.accent else pal.t2, 11f) } }
    y[Row.Icon]?.let { yy -> slots.forEachIndexed { i, s -> familyIcon(s.kind, cx(i).px, (yy + (iconDp + 6) / 2 + 1).px, iconDp.px, pal) } }
    y[Row.Temp]?.let { yy -> slots.forEachIndexed { i, s -> text("${HomeBoard.fmt(s.temp)}°", cx(i), yy + 14, pal.temperature(s.temp), 13f) } }
    y[Row.Curve]?.let { yy ->
      val temps = slots.map { it.temp }
      val (lo, hi) = BoardWidget.tempScale(temps)
      val span = curveH - 26
      val pts = temps.mapIndexed { i, t -> Offset(cx(i), yy + 6 + span - ((t - lo) / (hi - lo)).toFloat() * span) }
      drawPath(smoothPath(pts.map { Offset(it.x.px, it.y.px) }), tempBrush(temps, w.px), style = Stroke(stroke.px, cap = StrokeCap.Round))
      slots.forEachIndexed { i, s -> text("${HomeBoard.fmt(s.temp)}°", pts[i].x, pts[i].y + 18, pal.temperature(s.temp), tempDp) }
    }
    y[Row.Rain]?.let { yy ->
      val top = 2.5 * step
      slots.forEachIndexed { i, s ->
        val mm = s.mm?.takeIf { it >= 0.1 } ?: return@forEachIndexed
        val bh = maxOf(4f, sqrt(minOf(mm, top) / top).toFloat() * 14)
        val bw = minOf(16f, cw * 0.66f)
        val base = yy + 24
        drawRoundRect(pal.rainOf(mm / step), Offset((cx(i) - bw / 2).px, (base - bh).px), Size(bw.px, bh.px), CornerRadius(3f.px))
        text(HomeBoard.fmt(mm, if (mm < 10) 1 else 0), cx(i), base - bh - 3, pal.rainLight, 10f)
      }
    }
    y[Row.Chance]?.let { yy -> slots.forEachIndexed { i, s -> s.chance?.takeIf { it >= 20 }?.let { text("${HomeBoard.fmt(it)} %", cx(i), yy + 10, pal.t3, 10f, Weight.Medium) } } }
    y[Row.Wind]?.let { yy ->
      slots.forEachIndexed { i, s ->
        val wind = s.wind ?: return@forEachIndexed
        val speed = HomeBoard.fmt(wind)
        if (narrow) {
          s.deg?.let { windArrow(cx(i).px, (yy + 7).px, 9.5f.px, it, pal.wind) }
          text(speed, cx(i), yy + 24, pal.wind, 11.5f)
        } else {
          val tw = measure(speed, 12f, Weight.Bold)
          val a = if (s.deg != null) 12f else 0f
          val left = cx(i) - (a + tw) / 2
          s.deg?.let { windArrow((left + 5).px, (yy + 8).px, 9.5f.px, it, pal.wind) }
          text(speed, left + a, yy + 12, pal.wind, 12f, align = Paint.Align.LEFT)
        }
      }
    }
    if (sea != null) {
      y[Row.SeaTitle]?.let { yy -> text(fit("Marée et surf · ${sea.spot}", w - 8, 10.5f, Weight.Medium), 4f, yy + 11, pal.t3, 10.5f, Weight.Medium, Paint.Align.LEFT) }
      y[Row.Tide]?.let { yy -> tide(sea, slots.first().ts, slots.first().ts + n * step * 3600L, yy, w, offsetS) }
      y[Row.Surf]?.let { yy ->
        slots.forEachIndexed { i, s ->
          val c =
            when (sea.surfAt(s.ts + step * 1800L)) {
              "good" -> pal.green
              "possible" -> pal.yellow
              "poor" -> pal.red
              else -> null
            }
          val bw = cw * 0.64f
          if (c != null) drawRoundRect(c, Offset((cx(i) - bw / 2).px, (yy + 4).px), Size(bw.px, 6f.px), CornerRadius(3f.px))
          else drawRoundRect(pal.hollow, Offset((cx(i) - bw / 2).px, (yy + 6).px), Size(bw.px, 2f.px), CornerRadius(1f.px))
        }
      }
    }
    y[Row.Foot]?.let { yy -> slots.forEachIndexed { i, s -> text(hourWord(s), cx(i), yy + 13, if (i == 0) pal.accent else pal.t2, 11f) } }
  }

  /** The tide of the spot from [start] to [end] (UTC s) across [w]: its curve between its extremes, its waters written on it. */
  private fun DrawScope.tide(sea: BoardWidget.Sea, start: Long, end: Long, yy: Float, w: Float, offsetS: Int) {
    val ex = sea.tide
    val th = rowHeight(Row.Tide, false, 0f)
    if (ex.size < 2) {
      text("pas de marée calculée ici", 4f, yy + th / 2 + 4, pal.t4, 10.5f, Weight.Medium, Paint.Align.LEFT)
      return
    }
    val lo = ex.minOf { it.heightM }
    val hi = ex.maxOf { it.heightM }
    fun x(t: Long) = (t - start).toFloat() / (end - start) * w
    fun yOf(m: Double) = yy + th - 3 - ((m - lo) / (if (hi > lo) hi - lo else 1.0)).toFloat() * (th - 17)
    val pts =
      (0..48).mapNotNull { j ->
        val t = start + (end - start) * j / 48
        Frise.tideHeight(ex, t)?.let { Offset(x(t).px, yOf(it).px) }
      }
    if (pts.size < 2) return
    val fill =
      smoothPath(pts).apply {
        lineTo(pts.last().x, (yy + th).px)
        lineTo(pts.first().x, (yy + th).px)
        close()
      }
    drawPath(fill, pal.rain.copy(alpha = 0.18f))
    drawPath(smoothPath(pts), pal.rain, style = Stroke(2.2f.px, cap = StrokeCap.Round, join = StrokeJoin.Round))
    for (e in ex.filter { it.timeUtc in start..end }) {
      val word = (if (e.high) "PM " else "BM ") + HomeBoard.hm(e.timeUtc, offsetS) + (if (e.high) " · ${HomeBoard.fmt(e.heightM, 1)} m" else "")
      val half = measure(word, 10f, Weight.Medium) / 2
      text(word, x(e.timeUtc).coerceIn(half + 2, w - half - 2), yOf(e.heightM) - 4, pal.t2, 10f, Weight.Medium, halo = true)
    }
  }

  // ------------------------------------------------------------------------------------------------------------ the days

  /** The days: a column per day tinted by its sun, its name, its icon, the highest and lowest as two curves round a band, the rain. */
  private fun DrawScope.days(days: List<HomeBoard.DayColumn>, w: Float, h: Float, iconDp: Float = 24f) {
    val n = days.size
    val cw = w / n
    val tight = cw < 50
    val nameH = 17f
    val iconH = iconDp + 4
    val rainH = 30f
    val curveH = maxOf(30f, h - nameH - iconH - rainH)
    fun cx(i: Int) = cw * (i + 0.5f)
    days.forEachIndexed { i, d -> column(cw * i, cw, h, pal.glow(d.sun, true, h.px), i == 0, 9f) }
    days.forEachIndexed { i, d ->
      text(if (tight) d.nameShort else d.name, cx(i), 14f, if (i == 0) pal.accent else pal.text, 12.5f)
      familyIcon(d.kind, cx(i).px, (nameH + iconH / 2).px, iconDp.px, pal)
    }
    val lo = days.minOf { it.tmin } - 0.5
    val hi = days.maxOf { it.tmax } + 0.5
    val top = nameH + iconH + 19
    val span = maxOf(16f, curveH - 38)
    fun yOf(t: Double) = top + span - ((t - lo) / (hi - lo)).toFloat() * span
    val mx = days.mapIndexed { i, d -> Offset(cx(i).px, yOf(d.tmax).px) }
    val mn = days.mapIndexed { i, d -> Offset(cx(i).px, yOf(d.tmin).px) }
    // One outline along the highest, then back along the lowest: the card's band.
    val band =
      Path().apply {
        smoothInto(this, mx, start = true)
        smoothInto(this, mn.reversed(), start = false)
        close()
      }
    val bounds = band.getBounds()
    // The curves in a layer of their own, so that their dots are hollow: the columns show through them, as the card.
    drawContext.canvas.saveLayer(Rect(0f, 0f, size.width, size.height), LayerPaint())
    drawPath(
      band,
      Brush.verticalGradient(
        listOf(pal.temperature(days.map { it.tmax }.average()).copy(alpha = 0.2f), pal.temperature(days.map { it.tmin }.average()).copy(alpha = 0.16f)),
        startY = bounds.top,
        endY = bounds.bottom,
      ),
    )
    drawPath(smoothPath(mx), tempBrush(days.map { it.tmax }, w.px), style = Stroke(3.5f.px, cap = StrokeCap.Round))
    drawPath(smoothPath(mn), tempBrush(days.map { it.tmin }, w.px), style = Stroke(2.6f.px, cap = StrokeCap.Round))
    (mx + mn).forEach { drawCircle(Color.Black, 3.4f.px, it, blendMode = BlendMode.Clear) }
    drawContext.canvas.restore()
    days.forEachIndexed { i, d ->
      drawCircle(pal.temperature(d.tmax), 3.4f.px, mx[i], style = Stroke(2.2f.px))
      drawCircle(pal.temperature(d.tmin), 3.4f.px, mn[i], style = Stroke(2.2f.px))
      text("${HomeBoard.fmt(d.tmax)}°", cx(i), yOf(d.tmax) - 8, pal.temperature(d.tmax), 14f)
      text("${HomeBoard.fmt(d.tmin)}°", cx(i), yOf(d.tmin) + 17, pal.temperature(d.tmin), 12f, Weight.Medium)
    }
    val ry = h - rainH
    days.forEachIndexed { i, d ->
      val mm = d.rainMm ?: return@forEachIndexed
      val wet = mm >= 0.5
      val bh = if (wet) maxOf(4f, sqrt(minOf(mm, 30.0) / 30).toFloat() * 14) else 2f
      val bw = minOf(22f, cw * 0.5f)
      drawRoundRect(if (wet) pal.rainOf(mm / 6) else pal.hollow, Offset((cx(i) - bw / 2).px, (ry + 15 - bh).px), Size(bw.px, bh.px), CornerRadius(3f.px))
      text(if (wet) "${HomeBoard.fmt(mm, if (mm < 1) 1 else 0)} mm" else "sec", cx(i), ry + 27, if (wet) pal.rainLight else pal.t3, 11f)
    }
  }

  // --------------------------------------------------------------------------------------------------------- the drawing

  /** The density of the picture being drawn, what [px] multiplies by: one picture at a time ([draw] is synchronized). */
  private var dpScale = 1f

  private val Float.px: Float
    get() = this * dpScale

  private fun DrawScope.at(x: Float, y: Float, block: DrawScope.() -> Unit) = translate(x.px, y.px, block)

  /** One column, the card's: its glow, and the green ring of the one under way. */
  private fun DrawScope.column(left: Float, width: Float, height: Float, glow: Brush, ring: Boolean, radius: Float) {
    val x = (left + 1).px
    val cw = maxOf(1f, width - 2).px
    drawRoundRect(glow, Offset(x, 0f), Size(cw, height.px), CornerRadius(radius.px))
    if (ring) {
      val s = 1.5f.px
      drawRoundRect(pal.accent.copy(alpha = 0.75f), Offset(x + s / 2, s / 2), Size(cw - s, height.px - s), CornerRadius(radius.px - s / 2), style = Stroke(s))
    }
  }

  /** The warning's pill, its right end at [right]: the level's colour, the card's sign, the words. */
  private fun DrawScope.pill(words: String, level: String?, right: Float, cy: Float, s: Float) {
    val pw = pillWidth(words, s)
    val ph = s * 1.17f + 2 * (s * 0.18f).roundToInt()
    val left = right - pw
    drawRoundRect(levelColour(level), Offset(left.px, (cy - ph / 2).px), Size(pw.px, ph.px), CornerRadius((ph / 2).px))
    val g = s + 2
    cardGlyph("danger", (left + (s * 0.5f).roundToInt() + g / 2).px, cy.px, g.px, pal.onPill, 2.2f)
    textMid(words, right - (s * 0.7f).roundToInt(), cy, pal.onPill, s, Weight.Bold, Paint.Align.RIGHT)
  }

  private fun pillWidth(words: String, s: Float): Float = (s * 0.5f).roundToInt() + (s + 2) + 4 + measure(words, s, Weight.Bold) + (s * 0.7f).roundToInt()

  private fun levelColour(level: String?): Color =
    when (level) {
      "RED" -> pal.red
      "ORANGE" -> pal.orange
      "YELLOW" -> pal.yellow
      else -> pal.t3
    }

  /** The pin of the place (the family's `epingle`, a box of 24), centred on ([cx], [cy]) dp. */
  private fun DrawScope.pin(cx: Float, cy: Float, size: Float, colour: Color, width: Float) {
    val k = size.px / 24f
    translate((cx - size / 2).px, (cy - size / 2).px) {
      scale(k, k, pivot = Offset.Zero) {
        val stroke = Stroke(width, cap = StrokeCap.Round, join = StrokeJoin.Round)
        drawPath(PIN, colour, style = stroke)
        drawCircle(colour, 2.4f, Offset(12f, 9.5f), style = stroke)
      }
    }
  }

  private val PIN: Path by lazy { PathParser().parsePathString("M12 21 C12 21 5 14 5 9.5 a7 7 0 0 1 14 0 C19 14 12 21 12 21 Z").toPath() }

  /** A horizontal brush through the colours of some temperatures, a stop in the middle of each column. */
  private fun tempBrush(temps: List<Double>, widthPx: Float): Brush =
    if (temps.size == 1) Brush.horizontalGradient(listOf(pal.temperature(temps[0]), pal.temperature(temps[0])))
    else Brush.horizontalGradient(*temps.mapIndexed { i, t -> (i + 0.5f) / temps.size to pal.temperature(t) }.toTypedArray(), startX = 0f, endX = widthPx)

  /**
   * The monotone curve of [smoothPath] (Fritsch–Carlson) appended to [path], from a move ([start]) or a line to its first
   * point: the band of the days needs both curves in one outline (the card's own helper is private to its view).
   */
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
          val q = 3 / sqrt(s)
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

  // ----------------------------------------------------------------------------------------------------------- the texts

  private enum class Weight { Medium, Bold }

  private val mediumFace: Typeface by lazy { Typeface.create("sans-serif-medium", Typeface.NORMAL) }

  private fun paint(size: Float, weight: Weight, spacing: Float = 0f) =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size.px
      typeface = if (weight == Weight.Bold) Typeface.DEFAULT_BOLD else mediumFace
      letterSpacing = spacing
    }

  /** The width of [s] in dp. */
  private fun measure(s: String, size: Float, weight: Weight): Float = paint(size, weight).measureText(s) / dpScale

  /** [s] cut to [max] dp, an ellipsis at its end. */
  private fun fit(s: String, max: Float, size: Float, weight: Weight): String {
    if (measure(s, size, weight) <= max) return s
    var n = s.length - 1
    while (n > 1 && measure(s.take(n).trimEnd() + "…", size, weight) > max) n--
    return s.take(n).trimEnd() + "…"
  }

  /** Writes [s] on the [baseline] (dp), [x] its start, middle or end by [align]; [halo]: outlined in the background's colour. */
  private fun DrawScope.text(
    s: String,
    x: Float,
    baseline: Float,
    colour: Color,
    size: Float,
    weight: Weight = Weight.Bold,
    align: Paint.Align = Paint.Align.CENTER,
    halo: Boolean = false,
    spacing: Float = 0f,
  ) {
    val p = paint(size, weight, spacing).apply { textAlign = align }
    drawIntoCanvas {
      if (halo) {
        p.style = Paint.Style.STROKE
        p.strokeWidth = 3f.px
        p.color = Background.toArgb()
        it.nativeCanvas.drawText(s, x.px, baseline.px, p)
        p.style = Paint.Style.FILL
      }
      p.color = colour.toArgb()
      it.nativeCanvas.drawText(s, x.px, baseline.px, p)
    }
  }

  /** Writes [s] centred on the line [cy] (dp), as a line of text is centred in its box. */
  private fun DrawScope.textMid(s: String, x: Float, cy: Float, colour: Color, size: Float, weight: Weight, align: Paint.Align, spacing: Float = 0f) {
    val fm = paint(size, weight, spacing).fontMetrics
    text(s, x, cy - (fm.ascent + fm.descent) / 2 / dpScale, colour, size, weight, align, spacing = spacing)
  }

  @Synchronized
  private fun draw(context: Context, w: Float, h: Float, block: DrawScope.() -> Unit): Bitmap {
    val density = context.resources.displayMetrics.density
    dpScale = density
    val pw = (w * density).roundToInt().coerceAtLeast(1)
    val ph = (h * density).roundToInt().coerceAtLeast(1)
    val image = ImageBitmap(pw, ph)
    CanvasDrawScope().draw(Density(density), LayoutDirection.Ltr, Canvas(image), Size(pw.toFloat(), ph.toFloat())) { block() }
    return image.asAndroidBitmap()
  }
}
