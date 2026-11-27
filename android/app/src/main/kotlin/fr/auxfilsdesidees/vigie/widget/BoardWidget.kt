package fr.auxfilsdesidees.vigie.widget

import fr.auxfilsdesidees.vigie.data.Day
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.RainNowcast
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.Vigilances
import fr.auxfilsdesidees.vigie.ui.Vigil
import fr.auxfilsdesidees.vigie.ui.Words
import fr.auxfilsdesidees.vigie.ui.board.HomeBoard
import fr.auxfilsdesidees.vigie.ui.board.daysHeight
import fr.auxfilsdesidees.vigie.ui.board.hoursHeight
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.sqrt

/**
 * What the widgets show, as the site's widgets of 2026-11-27 (vigie-web `/widget`, chosen by the author): a widget with the
 * room for it is the home page of the Home Assistant card itself, drawn smaller ([Look.Medium]: now, the rain of the hour and
 * the next hours or the next days; [Look.Large]: the whole page); a smaller one is « the frise » (piste F): the weather now,
 * the place and the warning, then the next hour as its twelve steps of rain followed by the next hours or days, and the
 * sentence of the rain. Everything comes from the card's own rules ([HomeBoard]), so the widgets, the app and the card
 * never say two things. Pure: tested on the JVM.
 */
object BoardWidget {
  /**
   * The rain of the hour, the card's tile: [head] (« Pluie dans 40 min »), [sub] (« faible, puis modérée »), the steps still
   * to come in mm/h and the hours written under them. An old read keeps the head « Pluie de l’heure non lue » and no bars.
   */
  data class Rain(val head: String, val sub: String, val bars: List<HomeBoard.Bar>, val marks: List<String>)

  data class View(
    val name: String,
    /** The read of the place: the card's blocks are drawn from it. */
    val point: PointNow,
    /** The instant the widget is drawn for (UTC s). */
    val now: Long,
    /** The icon of the weather now (`eclaircies`, `lune`…), null when the API did not say. */
    val kind: String?,
    val tempC: Double?,
    val warnings: WidgetModel.Warnings,
    /** The card's rain tile; null when the API serves no rain of the hour here (outside France). */
    val rain: Rain?,
    /** The sentence of the rain of the frise: [sayHead] in bold, [saySub] after it. */
    val sayHead: String,
    val saySub: String,
    /** « Données de 21 h 37, il y a 2 h » once the read is old, null while it is fresh. */
    val age: String?,
  ) {
    val offsetS: Int
      get() = point.utcOffsetS
  }

  fun view(name: String, s: Snapshot, now: Long): View {
    val p = s.point
    val base = WidgetModel.view(name, s, now)
    val tile = HomeBoard.rainTile(p, now)
    val rain =
      when {
        tile == null -> null
        base.age != null -> Rain("Pluie de l’heure non lue", "", emptyList(), emptyList())
        else -> Rain(tile.head, tile.sub, tile.bars, tile.marks)
      }
    val (head, sub) = if (rain == null) base.rain.title to "" else say(rain.head, rain.sub)
    return View(name, p, now, HomeBoard.now(p, now).kind, p.tempC, base.warnings, rain, head, sub, base.age)
  }

  /**
   * The sentence of the rain of the frise: the tile's two lines, but a dry hour followed by a known dry spell said in one
   * sentence, short enough for a small widget (« Pas de pluie avant demain vers 9 h » rather than « Pas de pluie dans
   * l’heure » and a « Prochaine pluie… » cut in the middle), as the site's small widget says it.
   */
  fun say(head: String, sub: String): Pair<String, String> {
    if (head != "Pas de pluie dans l’heure") return head to sub
    return when {
      sub.startsWith("Prochaine pluie ") -> "Pas de pluie" to "avant ${sub.removePrefix("Prochaine pluie ")}"
      sub.startsWith("Sec jusqu’à ") -> "Pas de pluie" to "jusqu’à ${sub.removePrefix("Sec jusqu’à ")}"
      else -> head to sub
    }
  }

  // ---------------------------------------------------------------------------------------------- what a widget draws

  /** The next hours or the next days: the frise's columns and the block of the medium widget (the site's `fc`). */
  enum class Forecast { Hours, Days }

  /** The forecast kept in a widget's state (`hours` or `days`), the hours when it says nothing. */
  fun forecast(s: String?): Forecast = if (s == "days") Forecast.Days else Forecast.Hours

  fun key(f: Forecast): String = if (f == Forecast.Days) "days" else "hours"

  /**
   * The looks of a widget: [Line] one row of the grid (the frise on one line, the weather now beside it); [Frise] the site's
   * small widget; [FriseTall] the frise larger, in the middle of the height (with the days under it when there is room);
   * [Medium] and [Large] the card's home page.
   */
  enum class Look { Line, Frise, FriseTall, Medium, Large }

  /** Under this height (dp of room) a widget is one row of the grid; from this one the frise is drawn larger. */
  const val LINE_BELOW = 96f
  const val TALL_FROM = 200f

  /** From this height the tall frise has the days under its hours. */
  const val TALL_DAYS_FROM = 300f

  /**
   * The look for a room of [w] × [h] dp (the widget less its padding). The place widget ([card]) is the card as soon as the
   * card holds at [MIN_SCALE] at least ([cardFrame]): the whole page first, else the page with the chosen block; the frise
   * widget is always the frise.
   */
  fun look(card: Boolean, w: Float, h: Float, needMedium: Float, needLarge: Float): Look =
    when {
      h < LINE_BELOW -> Look.Line
      card && cardFrame(needLarge, w, h) != null -> Look.Large
      card && cardFrame(needMedium, w, h) != null -> Look.Medium
      h >= TALL_FROM -> Look.FriseTall
      else -> Look.Frise
    }

  // ------------------------------------------------------------------------------------------------------ the frise

  /**
   * A column of the frise: an hour ([ts], its temperature in [high], its rain in [mm]) or a day ([name], its highest and its
   * lowest), its icon and the sun that tints it.
   */
  data class FriseColumn(val ts: Long?, val name: String?, val kind: String?, val sun: Double?, val day: Boolean, val high: Double, val low: Double?, val mm: Double?)

  /**
   * The columns of the frise: [count] hours one by one, or [count] days, from now; [afterBox]: the box of the hour stands
   * before them and is « now », so they start one step later (the site's `friseColumns`). No days under two.
   */
  fun friseColumns(p: PointNow, now: Long, forecast: Forecast, count: Int, afterBox: Boolean): List<FriseColumn> {
    val skip = if (afterBox) 1 else 0
    if (forecast == Forecast.Days) {
      val days = HomeBoard.days(p, now, count + skip).drop(skip)
      return if (days.size < 2) emptyList() else days.map { FriseColumn(null, it.nameShort, it.kind, it.sun, true, it.tmax, it.tmin, it.rainMm) }
    }
    return slots(p, now, 1).take(count + skip).drop(skip).map { FriseColumn(it.ts, null, it.kind, it.sun, it.day, it.temp, null, it.mm) }
  }

  /**
   * The slots of [step] hours (1 or 3) as the card cuts them ([HomeBoard.hours]): its step comes from the width it is given,
   * so the width that makes it pick [step] is passed (34 per hour by the hour, anything narrow by three hours).
   */
  fun slots(p: PointNow, now: Long, step: Int): List<HomeBoard.HourSlot> =
    HomeBoard.hours(p, now, if (step == 1) 24 * 34f else 1f)?.takeIf { it.step == step }?.slots.orEmpty()

  /** The height of a bar of the box of the hour, [height] tall: the square root keeps a light rain visible next to a downpour. */
  fun barHeight(r: Double, height: Float, dry: Float = 3f): Float = if (r > 0) maxOf(4f, 4 + sqrt(minOf(r, 4.0) / 4).toFloat() * (height - 4)) else dry

  // ------------------------------------------------------------------------------------------------------- the card

  /** The blocks of the card's page a widget draws, and the height they need at scale 1 (the card's px, dp in the app). */
  data class CardPlan(
    val facts: Boolean,
    val tile: Boolean,
    val season: HomeBoard.SeasonPill?,
    val hours: Boolean,
    val hoursHeight: Float,
    val days: List<HomeBoard.DayColumn>,
    val daysHeight: Float,
  ) {
    val need: Float
      get() =
        HEAD + HEAD_GAP + NOW + (if (tile) GAP + TILE else 0f) + (if (season != null) GAP + SEASON else 0f) +
          (if (hours) GAP + hoursHeight else 0f) + (if (days.isNotEmpty()) GAP + daysHeight else 0f)
  }

  /** The heights of the card's blocks in the widget (the card's px): the line of the place, now, the rain tile, the season. */
  const val HEAD = 20f
  const val HEAD_GAP = 6f
  const val NOW = 68f
  const val TILE = 56f
  const val SEASON = 34f
  const val GAP = 8f

  /**
   * The page of [large] (everything: the facts of now, the season, the hours and the days) or of the medium widget (now
   * without its facts, the rain, and the block of [forecast]; the other one when it is missing), as the site's widget
   * leaves out what it has no room for. The heights of the hours and the days are those the app draws them at
   * ([hoursHeight], [daysHeight]).
   */
  fun cardPlan(p: PointNow, now: Long, large: Boolean, forecast: Forecast): CardPlan {
    val hourly = slots(p, now, 1)
    val hoursOk = hourly.size >= 4
    val days = HomeBoard.days(p, now, 7)
    val wantHours = hoursOk && (large || forecast == Forecast.Hours || days.isEmpty())
    val wantDays = days.isNotEmpty() && (large || forecast == Forecast.Days || !hoursOk)
    val hoursHeight = hoursHeight(hourly)
    val daysHeight = daysHeight(days)
    return CardPlan(
      facts = large,
      tile = HomeBoard.rainTile(p, now) != null,
      season = if (large) HomeBoard.seasonPill(p, now) else null,
      hours = wantHours,
      hoursHeight = hoursHeight,
      days = if (wantDays) days else emptyList(),
      daysHeight = daysHeight,
    )
  }

  /** The smallest scale the card is drawn at: under it its words are too small on a phone, the frise is drawn instead. */
  const val MIN_SCALE = 0.7f

  /**
   * The card is never drawn larger than in the app, nor wider than its narrow layout (it turns wide from 640), nor narrower
   * than [CARD_MIN_WIDTH]: a narrow widget draws it smaller (a widget of three cells, 272 dp of room on the Pixel, at 0.82).
   */
  const val MAX_SCALE = 1f
  const val CARD_MAX_WIDTH = 600f
  const val CARD_MIN_WIDTH = 330f

  /**
   * Where the card stands in a room of [w] × [h] dp: its [scale] (the height and the width ask for it, rounded down to the
   * hundredth), its [width] in the card's px, its [left] in dp (in the middle of a room wider than the card may be) and its
   * [top] in the card's px (the blocks in the middle of the height). Null when the card would be drawn under [MIN_SCALE].
   */
  data class CardFrame(val scale: Float, val width: Float, val left: Float, val top: Float)

  fun cardFrame(need: Float, w: Float, h: Float): CardFrame? {
    if (need <= 0 || w <= 0 || h <= 0) return null
    val scale = floor(minOf(MAX_SCALE, h / need, w / CARD_MIN_WIDTH) * 100) / 100
    if (scale < MIN_SCALE) return null
    val width = minOf(w / scale, CARD_MAX_WIDTH)
    return CardFrame(scale, width, (w - width * scale) / 2, maxOf(0f, (h / scale - need) / 2))
  }

  // ---------------------------------------------------------------------------------------------------- the warning

  /**
   * The words of the warning: the first hazard and the level (« Vent jaune »), the others counted (« Vent jaune +1 »); the
   * level alone when the hazards are unknown; null without a warning.
   */
  fun pill(w: WidgetModel.Warnings): String? {
    val level = w.level ?: return null
    val hazards = w.detail.split(" · ").map { it.trim() }.filter { it.isNotEmpty() }
    val base = hazards.firstOrNull()?.let { "$it ${Words.warningLevel(level)}" } ?: Vigil.levelShort(level)
    val more = w.more + (hazards.size - 1).coerceAtLeast(0)
    return if (more > 0) "$base +$more" else base
  }

  /** What a screen reader says of the widget: the place, the temperature, the rain of the hour, the warnings. */
  fun describe(v: View): String =
    listOfNotNull(v.name, v.tempC?.let { "${HomeBoard.fmt(it)}°" }, v.age ?: listOf(v.sayHead, v.saySub).filter { it.isNotEmpty() }.joinToString(" "), pill(v.warnings) ?: v.warnings.short).joinToString(", ")

  // ---------------------------------------------------------------------------------------------------- the example

  /**
   * The example the widget list shows (Android 15 and later): made-up weather for « Mon lieu » from the phone's current
   * hour, never a real read: a mild day, a shower in the evening, rain within the hour.
   */
  fun sample(now: Long, offsetS: Int): View {
    val hour = Math.floorDiv(now, 3600L) * 3600L
    val hours =
      (0 until 30).map { i ->
        val t = hour + i * 3600L
        val local = Math.floorMod(t + offsetS, 86_400L) / 3600
        val day = local in 8..16
        val rain = if (i in 3..5) 0.6 + 0.5 * (i - 3) else 0.0
        val code = if (rain > 0) 61 else if (day) 2 else 1
        HourWeather(t, 12.0 + 3 * cos((local - 15) / 24.0 * 2 * PI), rain, 14.0 + i % 7, 26.0 + i % 9, 240.0, code, day, rainProbabilityPct = if (rain > 0) 80.0 else 10.0, cloudCoverPct = if (rain > 0) 100.0 else 40.0)
      }
    val today = HomeBoard.localDay(now, offsetS)
    val week = listOf(Triple(2, 15.0, 8.0), Triple(61, 13.0, 7.0), Triple(3, 12.0, 6.0), Triple(1, 14.0, 5.0), Triple(80, 11.0, 6.0), Triple(2, 12.0, 4.0), Triple(3, 13.0, 6.0))
    val days = week.mapIndexed { i, (code, max, min) -> Day(isoDate(today + i), code, min, max, if (code >= 61) 6.0 else 0.0, if (code >= 61) 80.0 else 10.0) }
    val start = Math.floorDiv(now, 300L) * 300L
    val p =
      PointNow(
        serverUtc = now,
        utcOffsetS = offsetS,
        provider = null,
        alertLevel = null,
        tempC = 13.0,
        feelsLikeC = 11.0,
        windKmh = 15.0,
        gustKmh = 28.0,
        windDeg = 240.0,
        rain1hMm = 0.0,
        weatherCode = 2,
        days = days,
        hours = hours,
        rainSoon = RainNowcast(15, listOf(0.0, 0.0, 0.1, 0.4), listOf(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.8, 1.4, 2.0), start),
        humidityPct = 82.0,
        pressureHpa = 1016.0,
      )
    return view("Mon lieu", Snapshot(Place("Mon lieu", 0.0, 0.0), p, emptyList(), false, vigilances = Vigilances(true, false, emptyList(), null)), now)
  }

  /** « 2026-11-27 » of a day counted from 1970-01-01, without java.time (the app runs from Android 7). */
  fun isoDate(day: Long): String {
    val z = day + 719_468
    val era = Math.floorDiv(z, 146_097L)
    val doe = z - era * 146_097
    val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    val d = doy - (153 * mp + 2) / 5 + 1
    val m = if (mp < 10) mp + 3 else mp - 9
    val y = yoe + era * 400 + (if (m <= 2) 1 else 0)
    return "%04d-%02d-%02d".format(y, m, d)
  }
}
