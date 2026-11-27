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
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.ui.Vigil
import fr.auxfilsdesidees.vigie.ui.board.BoardPalette
import fr.auxfilsdesidees.vigie.ui.board.HomeBoard
import fr.auxfilsdesidees.vigie.ui.board.cardGlyph
import fr.auxfilsdesidees.vigie.ui.board.familyIcon
import fr.auxfilsdesidees.vigie.ui.smoothPath
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import fr.auxfilsdesidees.vigie.ui.windArrow
import kotlin.math.roundToInt
import androidx.compose.ui.graphics.Paint as LayerPaint

/**
 * The widgets drawn as the site's widgets of 2026-11-27 ([BoardWidget.Look]): the frise (piste F) and the home page of the
 * Home Assistant card drawn smaller. A home screen cannot draw, so the whole content of a widget is one picture at the
 * screen's density, laid out here with the card's palette ([BoardPalette.Dark]) and rules ([HomeBoard]). The card's page is
 * the app's native one ([HomeBoardView][fr.auxfilsdesidees.vigie.ui.board.HomeBoardView]) drawn again into the picture, at
 * its sizes (the card's px, dp in the app) and a scale: the app's is laid out by Compose, which a widget cannot run. As the
 * app's home page, the texts keep their size whatever the phone's font scale, so that nothing overlaps.
 */
object BoardArt {
  private val pal = BoardPalette.Dark

  /** The background of the widgets, the card's (its dark theme): `res/drawable/widget_board.xml` holds the same. */
  val Background = Color(0xFF19232E)

  /**
   * A widget's picture, [w] × [h] dp: the card's page, whole or with the block of [forecast], when [card] (the place widget)
   * and the room holds it; else the frise ([BoardWidget.look]).
   */
  fun widget(context: Context, v: BoardWidget.View, w: Float, h: Float, forecast: BoardWidget.Forecast, card: Boolean): Bitmap {
    val medium = BoardWidget.cardPlan(v.point, v.now, false, forecast)
    val large = BoardWidget.cardPlan(v.point, v.now, true, forecast)
    return when (val look = BoardWidget.look(card, w, h, medium.need, large.need)) {
      BoardWidget.Look.Large -> card(context, v, large, BoardWidget.cardFrame(large.need, w, h)!!, w, h)
      BoardWidget.Look.Medium -> card(context, v, medium, BoardWidget.cardFrame(medium.need, w, h)!!, w, h)
      else -> frise(context, v, w, h, look, forecast)
    }
  }

  /** The frise in [look] ([BoardWidget.Look.Line], [BoardWidget.Look.Frise] or [BoardWidget.Look.FriseTall]), [w] × [h] dp. */
  fun frise(context: Context, v: BoardWidget.View, w: Float, h: Float, look: BoardWidget.Look, forecast: BoardWidget.Forecast): Bitmap =
    draw(context, w, h, 1f) {
      when (look) {
        BoardWidget.Look.Line -> friseLine(v, w, h, forecast)
        BoardWidget.Look.FriseTall -> friseTall(v, w, h, forecast)
        else -> friseSmall(v, w, h, forecast)
      }
    }

  /** The card's page of [plan] in [frame] ([BoardWidget.cardFrame]), in a room of [w] × [h] dp. */
  fun card(context: Context, v: BoardWidget.View, plan: BoardWidget.CardPlan, frame: BoardWidget.CardFrame, w: Float, h: Float): Bitmap =
    draw(context, w, h, frame.scale) { at(frame.left / frame.scale, frame.top) { page(v, plan, frame.width) } }

  // ========================================================================================================== the frise

  private const val TOP = 34f
  private const val TOP_TALL = 44f
  private const val SAY = 18f
  private const val FGAP = 5f

  /** The site's small widget: now, the place and the warning on top; the band of the hour and the columns; the sentence of the rain. */
  private fun DrawScope.friseSmall(v: BoardWidget.View, w: Float, h: Float, forecast: BoardWidget.Forecast) {
    top(v, 0f, w, TOP, big = false)
    val y = TOP + FGAP
    band(v, 0f, y, w, h - y - FGAP - SAY, forecast, big = false)
    say(v, 0f, h - SAY, w)
  }

  /**
   * The frise larger, in the middle of the height: its band at most 150 dp; from [BoardWidget.TALL_DAYS_FROM] the band holds
   * the hours and the next days stand under the sentence (the site's large widget where the card draws no home page).
   */
  private fun DrawScope.friseTall(v: BoardWidget.View, w: Float, h: Float, forecast: BoardWidget.Forecast) {
    val days = if (h >= BoardWidget.TALL_DAYS_FROM) BoardWidget.friseColumns(v.point, v.now, BoardWidget.Forecast.Days, 6, false) else emptyList()
    val fixed = TOP_TALL + FGAP + FGAP + SAY + (if (days.isNotEmpty()) FGAP else 0f)
    val free = h - fixed
    val bandH = if (days.isNotEmpty()) minOf(150f, free * 150 / 270) else minOf(150f, free)
    val daysH = if (days.isNotEmpty()) minOf(120f, free - bandH) else 0f
    var y = (h - fixed - bandH - daysH) / 2
    top(v, y, w, TOP_TALL, big = true)
    y += TOP_TALL + FGAP
    band(v, 0f, y, w, bandH, if (days.isNotEmpty()) BoardWidget.Forecast.Hours else forecast, big = true)
    y += bandH + FGAP
    say(v, 0f, y, w)
    if (days.isNotEmpty()) at(0f, y + SAY + FGAP) { friseColumns(days, w, daysH, big = true, offsetS = v.offsetS) }
  }

  /** One row of the grid: now and the place on the left, the band beside them; the sentence of the rain and the warning under them. */
  private fun DrawScope.friseLine(v: BoardWidget.View, w: Float, h: Float, forecast: BoardWidget.Forecast) {
    val bandH = h - SAY - 4
    val left = 84f
    val by = (bandH - 42) / 2
    var x = 0f
    if (v.kind != null) {
      familyIcon(v.kind, 13f.px, (by + 13).px, 26f.px, pal)
      x = 29f
    }
    v.tempC?.let { textMid("${HomeBoard.fmt(it)}°", x, by + 13, pal.temperature(it), 24f, Weight.Bold, Paint.Align.LEFT) }
    pin(5f, by + 35, 10f, pal.t2, 2.2f)
    textMid(fit(v.name, left - 13, 11f, Weight.Bold), 13f, by + 35, pal.text, 11f, Weight.Bold, Paint.Align.LEFT)
    band(v, left + 6, 0f, w - left - 6, bandH, forecast, big = false)
    val ww = warningWidth(v, 10.5f)
    say(v, 0f, h - SAY, w - ww - 8)
    warning(v, w - ww, h - SAY / 2, ww, 10.5f)
  }

  /** The weather now (icon and temperature), then the place and the warning on two lines. */
  private fun DrawScope.top(v: BoardWidget.View, y: Float, w: Float, height: Float, big: Boolean) {
    val cy = y + height / 2
    val icon = if (big) 36f else 30f
    var x = 0f
    if (v.kind != null) {
      familyIcon(v.kind, (icon / 2).px, cy.px, icon.px, pal)
      x += icon + 3
    }
    v.tempC?.let {
      val s = "${HomeBoard.fmt(it)}°"
      textMid(s, x, cy, pal.temperature(it), icon, Weight.Bold, Paint.Align.LEFT)
      x += measure(s, icon, Weight.Bold)
    }
    x += 8
    pin(x + 6, cy - 7.5f, 12f, pal.t2, 2.2f)
    textMid(fit(v.name, w - x - 15, 12f, Weight.Bold), x + 15, cy - 7.5f, pal.text, 12f, Weight.Bold, Paint.Align.LEFT)
    warning(v, x, cy + 7.5f, w - x, 10.5f)
  }

  /**
   * The band: the box of the hour (its twelve steps of rain on a tint of rain, the hour of the first step, « +1 h ») when the
   * API serves the rain of the hour, then the columns of the next hours or days.
   */
  private fun DrawScope.band(v: BoardWidget.View, x: Float, y: Float, w: Float, h: Float, forecast: BoardWidget.Forecast, big: Boolean) {
    if (h < 20 || w < 40) return
    val bars = v.rain?.bars.orEmpty()
    var cx = x
    if (bars.isNotEmpty()) {
      val bw = w * 0.36f
      hourBox(bars, v.offsetS, x, y, bw, h)
      cx += bw + 6
    }
    val room = x + w - cx
    val most = if (bars.isNotEmpty()) 5 else 6
    val count = (room / (if (big) 40f else 34f)).toInt().coerceIn(3, most)
    val cols = BoardWidget.friseColumns(v.point, v.now, forecast, count, bars.isNotEmpty())
    if (cols.isNotEmpty()) at(cx, y) { friseColumns(cols, room, h, big, v.offsetS) }
  }

  private fun DrawScope.hourBox(bars: List<HomeBoard.Bar>, offsetS: Int, x: Float, y: Float, w: Float, h: Float) {
    drawRoundRect(pal.rain.copy(alpha = 0.12f), Offset(x.px, y.px), Size(w.px, h.px), CornerRadius(6f.px))
    drawRoundRect(pal.rain.copy(alpha = 0.45f), Offset((x + 0.5f).px, (y + 0.5f).px), Size((w - 1).px, (h - 1).px), CornerRadius(5.5f.px), style = Stroke(1f.px))
    val ix = x + 5
    val iw = w - 10
    val my = y + 3 + 6.5f
    if (bars[0].known) textMid(HomeBoard.hm(bars[0].at, offsetS), ix, my, pal.rain, 10.5f, Weight.Bold, Paint.Align.LEFT)
    textMid("+1 h", ix + iw, my, pal.t3, 10.5f, Weight.Medium, Paint.Align.RIGHT)
    val by = y + 3 + 13 + 2
    val bh = y + h - 3 - by
    if (bh < 4) return
    val gap = 2f
    val bw = (iw - gap * (bars.size - 1)) / bars.size
    bars.forEachIndexed { i, b ->
      val hh = BoardWidget.barHeight(b.r, bh)
      drawRoundRect(if (b.r > 0) pal.rainOf(b.r) else pal.hollow, Offset((ix + i * (bw + gap)).px, (by + bh - hh).px), Size(bw.px, hh.px), CornerRadius(minOf(2f, bw / 2).px))
    }
  }

  /**
   * The columns of the frise in [w] × [h] (the site's `friseSvg`): the hour or the day, its icon, its temperature (the highest
   * over the lowest for a narrow day, side by side otherwise), and under the temperature of an hour its rain when there is
   * room. No ring: the box of the hour before them is « now ».
   */
  private fun DrawScope.friseColumns(list: List<BoardWidget.FriseColumn>, w: Float, h: Float, big: Boolean, offsetS: Int) {
    val n = list.size
    val cw = w / n
    val ic = if (big) 28f else 19f
    val ts = if (big) 17f else 13f
    val ls = if (big) 12f else 10.5f
    val yLab = ls + 2
    val yIcon = yLab + 3 + ic / 2
    val yTemp = minOf(h - 4, yIcon + ic / 2 + ts + 1)
    val room = h - yTemp >= ts - 1
    list.forEachIndexed { i, x ->
      val cx = cw * (i + 0.5f)
      column(cw * i, cw, h, pal.glow(x.sun, x.day, h.px), false, 6f)
      val label = x.name ?: x.ts?.let { t -> HomeBoard.hourOnly(t, offsetS).let { if (cw < 26) it.takeWhile { c -> c.isDigit() } else it } }.orEmpty()
      text(label, cx, yLab, pal.t2, ls)
      familyIcon(x.kind, cx.px, yIcon.px, ic.px, pal)
      val high = "${HomeBoard.fmt(x.high)}°"
      val low = x.low
      when {
        low == null -> {
          text(high, cx, yTemp, pal.temperature(x.high), ts)
          val mm = x.mm
          if (room && mm != null && mm >= 0.1) text(HomeBoard.fmt(mm, if (mm < 10) 1 else 0), cx, yTemp + ts - 0.5f, pal.rainLight, ts - 3)
        }
        room && cw < 46 -> {
          text(high, cx, yTemp, pal.temperature(x.high), ts)
          text("${HomeBoard.fmt(low)}°", cx, yTemp + ts - 1, pal.temperature(low), ts - 2.5f, Weight.Medium)
        }
        else -> {
          val lowText = "${HomeBoard.fmt(low)}°"
          val a = measure(high, ts, Weight.Bold)
          val b = measure(lowText, ts - 2.5f, Weight.Medium)
          val left = cx - (a + 2 + b) / 2
          text(high, left, yTemp, pal.temperature(x.high), ts, align = Paint.Align.LEFT)
          text(lowText, left + a + 2, yTemp, pal.temperature(low), ts - 2.5f, Weight.Medium, Paint.Align.LEFT)
        }
      }
    }
  }

  /** The sentence of the rain: the umbrella, when it comes and how strong (or until when it stays dry); the age of an old read. */
  private fun DrawScope.say(v: BoardWidget.View, x: Float, y: Float, w: Float) {
    val cy = y + SAY / 2
    cardGlyph("parapluie", (x + 7).px, cy.px, 14f.px, pal.rain, 2.3f)
    val hx = x + 19
    val head = fit(v.sayHead, x + w - hx, 13f, Weight.Bold)
    textMid(head, hx, cy, pal.text, 13f, Weight.Bold, Paint.Align.LEFT)
    val sub = v.age ?: v.saySub
    if (sub.isEmpty()) return
    val sx = hx + measure(head, 13f, Weight.Bold) + 5
    if (x + w - sx > 24) textMid(fit(sub, x + w - sx, 11.5f, Weight.Medium), sx, cy, if (v.age != null) VigieColors.Warning else pal.t2, 11.5f, Weight.Medium, Paint.Align.LEFT)
  }

  /** The width of the warning's words at [size], its sign or its dot included. */
  private fun warningWidth(v: BoardWidget.View, size: Float): Float {
    val words = BoardWidget.pill(v.warnings)
    return if (words != null) 15 + measure(words, size, Weight.Bold)
    else (if (v.warnings.state == Vigil.State.None) 11f else 0f) + measure(v.warnings.short, size, Weight.Medium)
  }

  /**
   * The warning, discreet: its sign and its words in the colour of its level (no pill); without one, its quiet words in grey
   * (« Aucune vigilance », a green dot before them). From [x] on the line [cy], cut at [room].
   */
  private fun DrawScope.warning(v: BoardWidget.View, x: Float, cy: Float, room: Float, size: Float) {
    val words = BoardWidget.pill(v.warnings)
    if (words != null) {
      val c = levelColour(v.warnings.level)
      cardGlyph("danger", (x + 6).px, cy.px, 12f.px, c, 2.3f)
      textMid(fit(words, room - 15, size, Weight.Bold), x + 15, cy, c, size, Weight.Bold, Paint.Align.LEFT)
      return
    }
    var tx = x
    if (v.warnings.state == Vigil.State.None) {
      drawCircle(pal.green, 3f.px, Offset((x + 3).px, cy.px))
      tx += 11
    }
    textMid(fit(v.warnings.short, x + room - tx, size, Weight.Medium), tx, cy, pal.t3, size, Weight.Medium, Paint.Align.LEFT)
  }

  // ===================================================================================================== the card's page

  /** The page: the place and the warning, now, the rain tile, the season, the hours, the days; [w] the card's width. */
  private fun DrawScope.page(v: BoardWidget.View, plan: BoardWidget.CardPlan, w: Float) {
    val ww = warningWidth(v, 11f)
    val cy = BoardWidget.HEAD / 2
    pin(6f, cy, 12f, pal.t2, 2.2f)
    textMid(fit(v.name, w - 15 - ww - 12, 12.5f, Weight.Bold), 15f, cy, pal.text, 12.5f, Weight.Bold, Paint.Align.LEFT)
    warning(v, w - ww, cy, ww, 11f)
    var y = BoardWidget.HEAD + BoardWidget.HEAD_GAP
    at(0f, y) { nowBlock(v.point, v.now, w, plan.facts) }
    y += BoardWidget.NOW
    if (plan.tile && v.rain != null) {
      y += BoardWidget.GAP
      at(0f, y) { rainTile(v.rain, v.age, w) }
      y += BoardWidget.TILE
    }
    plan.season?.let {
      y += BoardWidget.GAP
      at(0f, y) { seasonPill(it, w) }
      y += BoardWidget.SEASON
    }
    if (plan.hours) {
      HomeBoard.hours(v.point, v.now, w)?.let {
        y += BoardWidget.GAP
        at(0f, y) { hoursBlock(it, v.offsetS, w, plan.hoursHeight) }
        y += plan.hoursHeight
      }
    }
    if (plan.days.isNotEmpty()) {
      y += BoardWidget.GAP
      at(0f, y) { daysBlock(plan.days, w, plan.daysHeight) }
    }
  }

  /**
   * Now (the app's `NowBlock`): icon, temperature in its colour, the weather, feeling and humidity, the wind; with [facts],
   * beside it the gusts to come, the pressure, the air and the UV, the sun. Under 370 the gust of now goes, under 340 the
   * humidity too, and the icon and the temperature are smaller: the card's rule.
   */
  private fun DrawScope.nowBlock(p: PointNow, now: Long, w: Float, facts: Boolean) {
    val m = HomeBoard.now(p, now)
    val less = if (w < 340) 2 else if (w < 370) 1 else 0
    val k = (w / 448f).coerceIn(if (less >= 2) 0.72f else 0.8f, 1f)
    val small = if (k < 0.9f) 11f else 12f
    val cy = BoardWidget.NOW / 2
    val icon = (54 * k).roundToInt().toFloat()
    familyIcon(m.kind, (icon / 2).px, cy.px, icon.px, pal)
    var x = icon + 8
    m.temp?.let {
      val s = "${HomeBoard.fmt(it)}°"
      val size = (52 * k).roundToInt().toFloat()
      textMid(s, x, cy, pal.temperature(it), size, Weight.Bold, Paint.Align.LEFT, spacing = -1f / size)
      x += measure(s, size, Weight.Bold, -1f / size) + 8
    }
    val factLines = if (facts) nowFacts(p, now, small) else emptyList()
    val fw = if (factLines.isNotEmpty()) (146 * maxOf(k, 0.8f)).roundToInt().toFloat() else 0f
    val midW = w - x - (if (fw > 0) fw + 8 else 0f)
    // The middle column: the weather, the feeling and the humidity, the wind.
    val lines = ArrayList<Pair<Double?, List<Run>>>()
    m.label?.let { lines += null to listOf(Run(it, pal.text, (15 * minOf(k, 1.1f)).roundToInt().toFloat(), Weight.Bold)) }
    val feels = listOfNotNull(m.feels?.let { "ressenti ${HomeBoard.fmt(it)}°" }, m.humidity?.takeIf { less < 2 }?.let { "${HomeBoard.fmt(it)} %" }).joinToString(" · ")
    if (feels.isNotEmpty()) lines += null to listOf(Run(feels, pal.t2, 12f, Weight.Medium))
    m.wind?.let { wind ->
      val runs = arrayListOf(Run(HomeBoard.fmt(wind), pal.wind, 13f, Weight.Bold), Run(" km/h", pal.t2, 13f, Weight.Medium))
      if (m.gust != null && less < 1) {
        runs += Run(" · raf. ", pal.t2, 13f, Weight.Medium)
        runs += Run(HomeBoard.fmt(m.gust), pal.wind, 13f, Weight.Bold)
      }
      lines += m.deg to runs
    }
    val heights = lines.map { (_, r) -> r.maxOf { it.size } * 1.25f }
    var ly = cy - (heights.sum() + 3 * (lines.size - 1)) / 2
    lines.forEachIndexed { i, (deg, runs) ->
      val mid = ly + heights[i] / 2
      var rx = x
      if (deg != null) {
        windArrow((rx + 6.5f).px, mid.px, 13f.px, deg, pal.wind)
        rx += 13 + 4
      }
      writeRuns(runs, rx, mid, x + midW - rx)
      ly += heights[i] + 3
    }
    if (fw > 0) {
      val fx = w - fw
      val lh = small * 1.3f
      var fy = cy - (lh * factLines.size + 2 * (factLines.size - 1)) / 2
      for ((sunDot, runs) in factLines) {
        val mid = fy + lh / 2
        var rx = fx
        if (sunDot) {
          drawCircle(pal.yellow, 2.5f.px, Offset((rx + 6).px, mid.px))
          rx += 16
        }
        writeRuns(runs, rx, mid, fx + fw - rx)
        fy += lh + 2
      }
    }
  }

  /** The lines beside now (the app's `nowFacts`): (with the sun's dot, the line). */
  private fun nowFacts(p: PointNow, now: Long, size: Float): List<Pair<Boolean, List<Run>>> {
    val off = p.utcOffsetS
    val out = ArrayList<Pair<Boolean, List<Run>>>()
    fun plain(s: String) = Run(s, pal.t2, size, Weight.Medium)
    fun strong(s: String, c: Color) = Run(s, c, size, Weight.Bold)
    HomeBoard.gustPeak(p, now)?.let { (v, at) -> out += false to listOf(plain("Rafales "), strong(HomeBoard.fmt(v), pal.gust(v) ?: pal.wind), plain(" vers ${HomeBoard.hm(at, off)}")) }
    p.pressureHpa?.let { hpa ->
      val tr = HomeBoard.pressureTrend(p, now)
      out += false to listOf(strong(HomeBoard.fmt(hpa), pal.text), plain(" hPa" + if (tr.isNotEmpty()) " $tr" else ""))
    }
    if (p.aqiEu != null || p.uvIndex != null) {
      val runs = ArrayList<Run>()
      p.aqiEu?.let { aqi ->
        val (word, tone) = HomeBoard.air(aqi)
        runs += plain("Air ")
        runs += strong(word, pal.tone(tone))
      }
      p.uvIndex?.let { uv -> runs += plain(if (p.aqiEu != null) " · UV ${HomeBoard.fmt(uv)}" else "UV ${HomeBoard.fmt(uv)}") }
      out += false to runs
    }
    HomeBoard.sunTimes(p, now)?.takeIf { it.rise != null || it.set != null }?.let { s ->
      val set = s.set?.let { "↓ ${HomeBoard.hm(it, off)}" }
      val rise = s.rise?.let { "↑ ${HomeBoard.hm(it, off)}" }
      out += true to listOf(plain((if (s.up) listOf(set, rise) else listOf(rise, set)).filterNotNull().joinToString(" · ")))
    }
    return out
  }

  /**
   * The rain of the next hour (the app's `RainTileView`): when it comes, how strong, a bar per step and the hours under them.
   * Its words have the room they need and the bars take what is left, 60 at least (the site's widget: « Pas de pluie dans
   * l’heure » is otherwise cut); an old read writes its age under « Pluie de l’heure non lue ».
   */
  private fun DrawScope.rainTile(r: BoardWidget.Rain, age: String?, w: Float) {
    val h = BoardWidget.TILE
    drawRoundRect(pal.rain.copy(alpha = 0.12f), Offset.Zero, Size(w.px, h.px), CornerRadius(12f.px))
    drawRoundRect(pal.rain.copy(alpha = 0.45f), Offset(0.5f.px, 0.5f.px), Size((w - 1).px, (h - 1).px), CornerRadius(11.5f.px), style = Stroke(1f.px))
    val cy = h / 2
    cardGlyph("parapluie", 23f.px, cy.px, 22f.px, pal.rain, 2.2f)
    val tx = 44f
    val sub = age ?: r.sub
    val withBars = r.bars.isNotEmpty() && age == null
    val most = w - tx - 12 - (if (withBars) 70f else 0f)
    val textW = minOf(most, maxOf(measure(r.head, 15f, Weight.Bold), if (sub.isEmpty()) 0f else measure(sub, 12f, Weight.Medium)))
    if (sub.isEmpty()) textMid(fit(r.head, textW, 15f, Weight.Bold), tx, cy, pal.text, 15f, Weight.Bold, Paint.Align.LEFT)
    else {
      textMid(fit(r.head, textW, 15f, Weight.Bold), tx, cy - 8, pal.text, 15f, Weight.Bold, Paint.Align.LEFT)
      textMid(fit(sub, textW, 12f, Weight.Medium), tx, cy + 9.5f, if (age != null) VigieColors.Warning else pal.t2, 12f, Weight.Medium, Paint.Align.LEFT)
    }
    if (!withBars) return
    val bx = tx + textW + 10
    val bw = w - 12 - bx
    // The card's container rule: the middle hour goes under 130, all of them under 80.
    val marks = if (bw <= 80) emptyList() else if (bw <= 130 && r.marks.size == 3) listOf(r.marks[0], r.marks[2]) else r.marks
    val top = cy - (30 + (if (marks.size > 1) 3 + 12 else 0)) / 2f
    val n = r.bars.size
    val each = (bw - 4 * (n - 1)) / n
    r.bars.forEachIndexed { i, b ->
      val bh = HomeBoard.tileBar(b.r)
      drawRoundRect(if (b.r > 0) pal.rainOf(b.r) else pal.hollow, Offset((bx + i * (each + 4)).px, (top + 30 - bh).px), Size(each.px, bh.px), CornerRadius(minOf(3f, each / 2).px))
    }
    if (marks.size > 1) {
      val my = top + 30 + 3 + 6
      marks.forEachIndexed { i, m ->
        val (mx, align) =
          when (i) {
            0 -> bx to Paint.Align.LEFT
            marks.lastIndex -> bx + bw to Paint.Align.RIGHT
            else -> bx + bw / 2 to Paint.Align.CENTER
          }
        textMid(m, mx, my, pal.t3, 10f, Weight.Medium, align)
      }
    }
  }

  /** The strongest line of the season (the app's `SeasonPillView`): avalanches, drought, pollen, « +n » for the others. */
  private fun DrawScope.seasonPill(s: HomeBoard.SeasonPill, w: Float) {
    val h = BoardWidget.SEASON
    val col = pal.tone(s.tone)
    val neutral = s.tone == "neutre"
    if (!neutral) drawRoundRect(col.copy(alpha = 0.2f), Offset.Zero, Size(w.px, h.px), CornerRadius(16f.px))
    drawRoundRect(if (neutral) pal.rule else col.copy(alpha = 0.65f), Offset(0.75f.px, 0.75f.px), Size((w - 1.5f).px, (h - 1.5f).px), CornerRadius(15.25f.px), style = Stroke(1.5f.px))
    val cy = h / 2
    cardGlyph(s.glyph, 21f.px, cy.px, 18f.px, col, 2.2f)
    var right = w - 12
    if (s.more > 0) {
      val t = "+${s.more}"
      val bw = maxOf(26f, measure(t, 13f, Weight.Bold) + 12)
      drawRoundRect((if (neutral) pal.t3 else col).copy(alpha = 0.25f), Offset((right - bw).px, (cy - 11).px), Size(bw.px, 22f.px), CornerRadius(11f.px))
      textMid(t, right - bw / 2, cy, col, 13f, Weight.Bold, Paint.Align.CENTER)
      right -= bw + 4
    }
    val runs = arrayListOf(Run(s.text, pal.text, 13f, Weight.Bold))
    if (s.detail.isNotEmpty()) runs += Run(" · ${s.detail}", pal.t2, 12f, Weight.Medium)
    writeRuns(runs, 40f, cy, right - 40)
  }

  /**
   * The next 24 hours (the app's `HoursBlock`, its title left out as in the site's widget): a column per slot, its icon, the
   * temperature curve, the rain, its chance, the wind and the gust, the hour. [height] 206 with the chance, 192 without.
   */
  private fun DrawScope.hoursBlock(h: HomeBoard.Hours, offsetS: Int, w: Float, height: Float) {
    val list = h.slots
    val n = list.size
    val cw = w / n
    val hasP = height > 192f
    val yWind = if (hasP) 158f else 144f
    fun cx(i: Int) = cw * (i + 0.5f)
    list.forEachIndexed { i, x -> column(cw * i, cw, height, pal.glow(x.sun, x.day, height.px), i == 0, 9f) }
    list.forEachIndexed { i, x -> familyIcon(x.kind, cx(i).px, 14f.px, 24f.px, pal) }
    // The curve: at least 4 °C from top to bottom, so that 2° never looks like a fall.
    val temps = list.map { it.temp }
    val mn = temps.min()
    val mx = temps.max()
    val amp = maxOf(4.0, mx - mn)
    val low = (mn + mx) / 2 - amp / 2
    val yRel = temps.map { (66 - (it - low) / amp * 44).toFloat() }
    val pts = yRel.mapIndexed { i, y -> Offset(cx(i).px, (26 + y).px) }
    drawPath(smoothPath(pts), tempBrush(temps, w.px), style = Stroke(4f.px, cap = StrokeCap.Round))
    list.forEachIndexed { i, x -> label("${HomeBoard.fmt(x.temp)}°", cx(i), yRel[i] + 7, 13f, pal.temperature(x.temp), lineHeight = 1.2f) }
    // The rain: its amount over the bar, the bars standing on the same line.
    list.forEachIndexed { i, x ->
      val mm = x.mm?.takeIf { it >= 0.1 } ?: return@forEachIndexed
      val bh = HomeBoard.hourBar(mm, h.step)
      val bw = minOf(18f, cw * 0.7f)
      drawRoundRect(pal.rainOf(mm / h.step), Offset((cx(i) - bw / 2).px, (142 - bh).px), Size(bw.px, bh.px), CornerRadius(4f.px))
      label(HomeBoard.fmt(mm, if (mm < 10) 1 else 0), cx(i), 142 - bh - 2 - 11.7f, 10f, pal.rainLight)
    }
    if (hasP) list.forEachIndexed { i, x -> x.chance?.let { label("${HomeBoard.fmt(it)} %", cx(i), 144f, 10f, pal.t3, Weight.Medium) } }
    // The wind: its arrow and speed, the gust under it (yellow from 60, orange from 80).
    list.forEachIndexed { i, x ->
      val speed = HomeBoard.fmt(x.wind)
      val arrow = if (x.deg != null) 13f else 0f
      val left = cx(i) - (arrow + measure(speed, 12f, Weight.Bold)) / 2
      val mid = yWind + 7.5f
      x.deg?.let { windArrow((left + 5.5f).px, mid.px, 11f.px, it, pal.wind) }
      textMid(speed, left + arrow, mid, pal.wind, 12f, Weight.Bold, Paint.Align.LEFT)
      x.gust?.let { g ->
        val c = pal.gust(g)
        label(HomeBoard.fmt(g), cx(i), yWind + 15f, 10f, c ?: pal.t3, if (c != null) Weight.Bold else Weight.Regular, 1.25f)
      }
    }
    list.forEachIndexed { i, x -> label(HomeBoard.hourOnly(x.ts, offsetS), cx(i), height - 17, 11f, if (i == 0) pal.accent else pal.t2) }
  }

  /**
   * The days (the app's `DaysBlock`, its title left out): a column per day tinted by its sun, its name, its icon, the line of
   * its sunshine when the answer gives it, the highest and lowest as two curves around a band, rain, chance, wind and gust.
   */
  private fun DrawScope.daysBlock(days: List<HomeBoard.DayColumn>, w: Float, height: Float) {
    val n = days.size
    val cw = w / n
    val tight = cw < 50
    val hasP = days.any { it.chance != null }
    val sh = if (days.any { it.sunshineH != null }) 14f else 0f
    val sunColour = pal.iconRoles["vs"] ?: pal.yellow
    fun cx(i: Int) = cw * (i + 0.5f)
    days.forEachIndexed { i, d -> column(cw * i, cw, height, pal.glow(d.sun, true, height.px), i == 0, 10f) }
    days.forEachIndexed { i, d ->
      label(if (tight) d.nameShort else d.name, cx(i), 3f, 13f, if (i == 0) pal.accent else pal.text)
      familyIcon(d.kind, cx(i).px, (3 + 15.2f + 1 + 15).px, 30f.px, pal)
      d.sunshineH?.let { sun ->
        val col =
          when (HomeBoard.sunTone(d)) {
            2 -> sunColour
            1 -> mixSrgb(pal.t3, sunColour, 0.55f)
            else -> pal.t3
          }
        val s = HomeBoard.sunHoursText(sun, tight)
        val left = cx(i) - (8 + measure(s, 11f, Weight.Medium)) / 2
        val mid = 3 + 15.2f + 1 + 30 + 1 + 6.5f
        drawCircle(col, 2.5f.px, Offset((left + 2.5f).px, mid.px))
        textMid(s, left + 8, mid, col, 11f, Weight.Medium, Paint.Align.LEFT)
      }
    }
    val (lo, hi) = HomeBoard.dayScale(days)
    fun yOf(t: Double) = (150 + sh - (t - lo) / (hi - lo) * 76).toFloat()
    val mx = days.mapIndexed { i, d -> Offset(cx(i).px, yOf(d.tmax).px) }
    val mn = days.mapIndexed { i, d -> Offset(cx(i).px, yOf(d.tmin).px) }
    // One outline: along the highest, then back along the lowest (the card's band).
    val band =
      Path().apply {
        smoothInto(this, mx, start = true)
        smoothInto(this, mn.reversed(), start = false)
        close()
      }
    val bounds = band.getBounds()
    // The curves in a layer of their own, so that the dots are hollow: the columns show through them.
    drawContext.canvas.saveLayer(Rect(0f, 0f, w.px, height.px), LayerPaint())
    drawPath(
      band,
      Brush.verticalGradient(
        listOf(pal.temperature(days.map { it.tmax }.average()).copy(alpha = 0.2f), pal.temperature(days.map { it.tmin }.average()).copy(alpha = 0.16f)),
        startY = bounds.top,
        endY = bounds.bottom,
      ),
    )
    drawPath(smoothPath(mx), tempBrush(days.map { it.tmax }, w.px), style = Stroke(4f.px, cap = StrokeCap.Round))
    drawPath(smoothPath(mn), tempBrush(days.map { it.tmin }, w.px), style = Stroke(3f.px, cap = StrokeCap.Round))
    (mx + mn).forEach { drawCircle(Color.Black, 3.75f.px, it, blendMode = BlendMode.Clear) }
    drawContext.canvas.restore()
    days.forEachIndexed { i, d ->
      drawCircle(pal.temperature(d.tmax), 3.75f.px, mx[i], style = Stroke(2.5f.px))
      drawCircle(pal.temperature(d.tmin), 3.75f.px, mn[i], style = Stroke(2.5f.px))
      label("${HomeBoard.fmt(d.tmax)}°", cx(i), yOf(d.tmax) - 26, 15f, pal.temperature(d.tmax), lineHeight = 1.2f)
      label("${HomeBoard.fmt(d.tmin)}°", cx(i), yOf(d.tmin) + 7, 13f, pal.temperature(d.tmin), Weight.Medium, 1.2f)
    }
    // Rain, chance and wind, stacked as the card stacks them.
    val size = if (tight) 11f else 12f
    days.forEachIndexed { i, d ->
      val mm = d.rainMm
      val wet = mm != null && mm >= 0.5
      val bh = HomeBoard.dayBar(mm)
      val bw = minOf(26f, cw * 0.55f)
      drawRoundRect(if (wet) pal.rainOf(mm!! / 6) else pal.hollow, Offset((cx(i) - bw / 2).px, (200 + sh - bh).px), Size(bw.px, bh.px), CornerRadius(4f.px))
      var y = 202f + sh
      if (mm != null) label(if (wet) "${if (mm < 1) HomeBoard.fmt(mm, 1) else HomeBoard.fmt(mm)} mm" else "sec", cx(i), y, size, if (wet) pal.rainLight else pal.t3)
      y += size * 1.17f + 2
      if (hasP) {
        d.chance?.let { label("${HomeBoard.fmt(it)} %", cx(i), y, 10f, pal.t3, Weight.Medium) }
        y += 11.7f + 2
      }
      y += 3
      val runs = ArrayList<Run>()
      if (d.windMax != null) runs += Run(HomeBoard.fmt(d.windMax), pal.wind, size, Weight.Bold)
      if (d.gust != null) runs += Run("/${HomeBoard.fmt(d.gust)}", pal.t3, if (tight) 9f else 10f, Weight.Regular)
      if (runs.isEmpty()) return@forEachIndexed
      val arrow = if (d.deg != null) 11f + (if (tight) 1f else 2f) else 0f
      val tw = runs.sumOf { measure(it.s, it.size, it.weight).toDouble() }.toFloat()
      val left = cx(i) - (arrow + tw) / 2
      val mid = y + size * 1.17f / 2
      d.deg?.let { windArrow((left + 5.5f).px, mid.px, 11f.px, it, pal.wind) }
      writeRuns(runs, left + arrow, mid, tw + 1)
    }
  }

  // ======================================================================================================== the drawing

  /** The density of the picture being drawn and its scale, what [px] multiplies by: one picture at a time ([draw] is synchronized). */
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

  private fun levelColour(level: String?): Color =
    when (level) {
      "RED" -> pal.red
      "ORANGE" -> pal.orange
      "YELLOW" -> pal.yellow
      else -> pal.t3
    }

  /** The pin of the place (the family's `epingle`, a box of 24), centred on ([cx], [cy]). */
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

  /** The card's `mix`: [a] towards [b] by [t], channel by channel in sRGB (Compose's `lerp` goes through Oklab). */
  private fun mixSrgb(a: Color, b: Color, t: Float): Color = Color(red = a.red + (b.red - a.red) * t, green = a.green + (b.green - a.green) * t, blue = a.blue + (b.blue - a.blue) * t)

  /**
   * The monotone curve of [smoothPath] (Fritsch–Carlson) appended to [path], from a move ([start]) or a line to its first
   * point: the band of the days needs both curves in one outline (the app's own helper is private to its view).
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

  // ========================================================================================================== the texts

  private enum class Weight { Regular, Medium, Bold }

  /** A piece of a line of words: its own colour, size and weight (a number in bold in a line of grey words). */
  private data class Run(val s: String, val colour: Color, val size: Float, val weight: Weight)

  private val mediumFace: Typeface by lazy { Typeface.create("sans-serif-medium", Typeface.NORMAL) }

  private fun paint(size: Float, weight: Weight, spacing: Float = 0f) =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = size.px
      typeface =
        when (weight) {
          Weight.Bold -> Typeface.DEFAULT_BOLD
          Weight.Medium -> mediumFace
          Weight.Regular -> Typeface.DEFAULT
        }
      letterSpacing = spacing
    }

  /** The width of [s], in the units of the drawing. */
  private fun measure(s: String, size: Float, weight: Weight, spacing: Float = 0f): Float = paint(size, weight, spacing).measureText(s) / dpScale

  /** [s] cut to [max], an ellipsis at its end. */
  private fun fit(s: String, max: Float, size: Float, weight: Weight): String {
    if (measure(s, size, weight) <= max) return s
    var n = s.length - 1
    while (n > 1 && measure(s.take(n).trimEnd() + "…", size, weight) > max) n--
    return s.take(n).trimEnd() + "…"
  }

  /** Writes [s] on the [baseline], [x] its start, middle or end by [align]. */
  private fun DrawScope.text(
    s: String,
    x: Float,
    baseline: Float,
    colour: Color,
    size: Float,
    weight: Weight = Weight.Bold,
    align: Paint.Align = Paint.Align.CENTER,
    spacing: Float = 0f,
  ) {
    val p = paint(size, weight, spacing).apply {
      textAlign = align
      color = colour.toArgb()
    }
    drawIntoCanvas { it.nativeCanvas.drawText(s, x.px, baseline.px, p) }
  }

  /** Writes [s] centred on the line [cy], as a line of text is centred in its box. */
  private fun DrawScope.textMid(s: String, x: Float, cy: Float, colour: Color, size: Float, weight: Weight, align: Paint.Align, spacing: Float = 0f) {
    val fm = paint(size, weight, spacing).fontMetrics
    text(s, x, cy - (fm.ascent + fm.descent) / 2 / dpScale, colour, size, weight, align, spacing)
  }

  /** The app's `label`: [s] centred on [cx], in a line box of [lineHeight] × [size] starting at [top]. */
  private fun DrawScope.label(s: String, cx: Float, top: Float, size: Float, colour: Color, weight: Weight = Weight.Bold, lineHeight: Float = 1.17f) =
    textMid(s, cx, top + lineHeight * size / 2, colour, size, weight, Paint.Align.CENTER)

  /** Writes [runs] one after the other from [x] on the line [cy], cut with an ellipsis at [max]. */
  private fun DrawScope.writeRuns(list: List<Run>, x: Float, cy: Float, max: Float) {
    var cx = x
    for (r in list) {
      val room = x + max - cx
      if (room <= 4) return
      val w = measure(r.s, r.size, r.weight)
      if (w <= room) {
        textMid(r.s, cx, cy, r.colour, r.size, r.weight, Paint.Align.LEFT)
        cx += w
      } else {
        textMid(fit(r.s, room, r.size, r.weight), cx, cy, r.colour, r.size, r.weight, Paint.Align.LEFT)
        return
      }
    }
  }

  @Synchronized
  private fun draw(context: Context, w: Float, h: Float, scale: Float, block: DrawScope.() -> Unit): Bitmap {
    val density = context.resources.displayMetrics.density
    dpScale = density * scale
    val pw = (w * density).roundToInt().coerceAtLeast(1)
    val ph = (h * density).roundToInt().coerceAtLeast(1)
    val image = ImageBitmap(pw, ph)
    CanvasDrawScope().draw(Density(density), LayoutDirection.Ltr, Canvas(image), Size(pw.toFloat(), ph.toFloat())) { block() }
    return image.asAndroidBitmap()
  }
}
