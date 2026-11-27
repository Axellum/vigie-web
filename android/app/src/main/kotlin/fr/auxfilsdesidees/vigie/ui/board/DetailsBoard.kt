package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.ShortStep
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/**
 * What the Details page says, worked out as the Home Assistant card works it out (`vigie-card.js` of vigie-api, its Details
 * page: `rainChips`, `minutesBlock`, `quarterBlock`, `hours48Block`, `chancesBlock` and its credits). Pure functions of the
 * point, the clock and the width [w]: the positions are the card's px, in dp here, so `DetailsBoardView.kt` only draws. The
 * words are the card's French ones. The narrow layout of the card (one column), the one of a phone.
 */
object DetailsBoard {
  private const val NBSP = ' '

  /** Is the point read by Météo-France? The card's `inFrance`, without the climate normals the app does not read. */
  fun inFrance(p: PointNow): Boolean = p.provider?.startsWith("Météo-France") == true

  /** Whether the page has something to show: the card's rule for its bar of pages (`availablePages`). */
  fun available(p: PointNow, now: Long): Boolean =
    p.shortTerm?.steps.orEmpty().isNotEmpty() ||
      p.probabilities?.windows.orEmpty().isNotEmpty() ||
      (inFrance(p) && (HomeBoard.nowcastFirst(p, now) != null || HomeBoard.currentHours(p, now).size >= 12))

  private val KIND =
    mapOf(
      "rain" to "Pluie", "drizzle" to "Bruine", "freezing" to "Pluie verglaçante", "snow" to "Neige", "wet_snow" to "Neige mouillée",
      "rain_snow" to "Pluie et neige", "ice_pellets" to "Granules de glace", "snow_pellets" to "Neige roulée", "hail" to "Grêle",
    )

  /** The word of a kind of precipitation of AROME-PI (`rain`, `snow`…); « Précipitations » for one the card does not know. */
  fun kindWord(kind: String?): String = KIND[kind] ?: "Précipitations"

  // ------------------------------------------------------------------------------------------------------- the chips

  /** The first local noon at least 12 hours ahead (« demain midi » in the evening). */
  fun nextNoon(p: PointNow, now: Long): Long {
    var ts = HomeBoard.localDay(now, p.utcOffsetS) * 86_400 + 12 * 3600 - p.utcOffsetS
    while (ts - now < 12 * 3600) ts += 86_400
    return ts
  }

  /** One period of the rain until noon: [wet], its words (« Pluie », « Sec », « Accalmie »…) and its end (« 14 h 50 »). */
  data class Chip(val wet: Boolean, val what: String, val to: String)

  data class Chips(val title: String, val chips: List<Chip>)

  /**
   * The rain until [until], said in a few periods: « Sec → 14 h 50 », « Pluie → 16 h 15 », « Accalmie → 17 h 30 »… A dry gap
   * of 30 minutes or less between two rains is part of the rain, a rain whose known rates all stay under 1 mm/h is light, a
   * dry period between two rains under 3 hours is a lull. Eight at most; null when nothing is known.
   */
  fun chips(p: PointNow, now: Long, until: Long = nextNoon(p, now)): Chips? {
    class Run(val wet: Boolean, val from: Long, var to: Long, var kind: String?, val rs: MutableList<Double>)
    val runs = ArrayList<Run>()
    for (s in HomeBoard.rainSlots(p, now)) {
      if (s.from >= until) break
      val to = minOf(s.to, until)
      val last = runs.lastOrNull()
      if (last != null && last.wet == s.wet) {
        last.to = to
        last.kind = last.kind ?: s.kind
        s.r?.let { last.rs += it }
      } else runs += Run(s.wet, s.from, to, s.kind, s.r?.let { mutableListOf(it) } ?: mutableListOf())
    }
    var i = 1
    while (i < runs.size - 1) {
      if (!runs[i].wet && runs[i].to - runs[i].from <= 1800 && runs[i - 1].wet && runs[i + 1].wet) {
        val a = runs[i - 1]
        val b = runs[i + 1]
        val merged = Run(true, a.from, b.to, a.kind ?: b.kind, (a.rs + b.rs).toMutableList())
        runs.subList(i - 1, i + 2).clear()
        runs.add(i - 1, merged)
        i -= 1
      }
      i++
    }
    if (runs.isEmpty()) return null
    val chips =
      runs.take(8).mapIndexed { k, r ->
        val what =
          if (r.wet) {
            val word = kindWord(r.kind ?: "rain")
            if (r.rs.isNotEmpty() && r.rs.max() < 1) "$word faible" else word
          } else if (k > 0 && k < runs.size - 1 && r.to - r.from < 3 * 3600) "Accalmie" else "Sec"
        Chip(r.wet, what, HomeBoard.hm(r.to, p.utcOffsetS))
      }
    val day = HomeBoard.dayWord(until, now, p.utcOffsetS, false)
    return Chips("La pluie d’ici ${if (day.isEmpty()) "" else "$day "}midi", chips)
  }

  // ----------------------------------------------------------------------------------------------- within the hour

  /** A label under the bars of the hour: its text, [role] `accent` (now), `first` (the first rain) or `plain`. */
  data class MinuteLabel(val text: String, val role: String)

  data class Minutes(val title: String, val source: String, val bars: List<HomeBoard.Bar>, val labels: List<MinuteLabel>)

  /**
   * The hour to come, a bar per step of the nowcast: its title, its source (« radar PIAF · mm/h »), the bars and the hours
   * written under them (now, the first rain, then one in two away from it). Null without a nowcast, or when its hour is not
   * read (an old copy: the rain tile then says « Pluie de l’heure non lue »).
   */
  fun minutes(p: PointNow, now: Long): Minutes? {
    val bars = HomeBoard.nowcastBars(p, now)
    if (bars.isEmpty() || HomeBoard.nowcastFirst(p, now) == null || HomeBoard.nowcastStale(p, now)) return null
    val n = bars.size
    val firstWet = bars.indexOfFirst { it.r > 0 }
    val src = if (p.rainSoon?.attribution?.contains("PIAF") == true) "radar PIAF" else "Open-Meteo"
    val labels =
      bars.mapIndexed { i, b ->
        val show = i == 0 || i == firstWet || n <= 6 || (i % 2 == 0 && abs(i - firstWet) > 1)
        val text = if (!show) "" else if (i == 0 && (!b.known || b.at <= now)) "maint." else if (b.known) HomeBoard.hm(b.at, p.utcOffsetS) else ""
        MinuteLabel(text, if (i == 0) "accent" else if (i == firstWet) "first" else "plain")
      }
    return Minutes("Dans l’heure · toutes les ${bars[0].minutes}${NBSP}min", "$src · mm/h", bars, labels)
  }

  /** The height of a bar of the hour (a rate in mm/h): 3 when dry, 5 to 48. */
  fun minuteBar(r: Double): Float = if (r > 0) maxOf(5.0, minOf(r, 4.0) * 12).toFloat() else 3f

  // ------------------------------------------------------------------------------------------------ by quarter hour

  /** A point of the gust curve: where it is drawn (card px), its value and its time. */
  data class GustPoint(val x: Float, val y: Float, val v: Double, val ts: Long)

  /**
   * The gusts of the quarter hours as a curve on 48 px: its points, the dashed line of 80 km/h when it is within the scale
   * ([y80]), the peak and where its label goes (left edge at [peakLeft], or its right edge at [peakRight]; top [peakTop]),
   * the side of the unit (« rafales km/h », on the left when the peak is on the right).
   */
  data class GustCurve(
    val points: List<GustPoint>,
    val y80: Float?,
    val peak: GustPoint,
    val peakText: String,
    val peakLeft: Float?,
    val peakRight: Float?,
    val peakTop: Float,
    val unitOnLeft: Boolean,
  )

  /** A period of the same precipitation over [n] steps from step [i0]: wet or dry, and its word when it has room. */
  data class QuarterRun(val wet: Boolean, val i0: Int, val n: Int, val text: String)

  data class Quarter(
    val title: String,
    val right: String,
    val n: Int,
    val gusts: GustCurve?,
    val runs: List<QuarterRun>,
    /** The hours written under the runs: (step, « 14 h »). */
    val marks: List<Pair<Int, String>>,
  )

  private val HAIL = mapOf("none" to "non", "small_hail" to "petite grêle", "hail" to "grêle")
  private val VISIBILITY = mapOf("none" to "bonne", "reduced" to "réduite", "very_reduced" to "très réduite")

  /**
   * AROME-PI by quarter hour until its last step (20 at most, 2 at least): the gusts and their peak, the periods of rain, the
   * hail and the visibility over them (« grêle : non » only when there is room, from 420 px).
   */
  fun quarter(p: PointNow, now: Long, w: Float): Quarter? {
    val st = p.shortTerm ?: return null
    val m = st.intervalMinutes * 60L
    val steps: List<ShortStep> = st.steps.filter { it.timeUtc + m > now }.take(20)
    if (steps.size < 2) return null
    val off = p.utcOffsetS
    val n = steps.size
    val cw = w / n
    fun said(level: String?) = level != null && (level != "none" || w >= 420)
    val right =
      listOfNotNull(
        st.hailLevel.takeIf(::said)?.let { "grêle$NBSP: ${HAIL[it] ?: it}" },
        st.visibilityLevel.takeIf(::said)?.let { "visibilité$NBSP: ${VISIBILITY[it] ?: it}" },
      ).joinToString(" · ")
    val title = "Jusqu’à ${HomeBoard.hm(steps.last().timeUtc + m, off)} · par quart d’heure"
    // The gusts: a scale of 30 km/h at least, by tens, 5 km/h of room under and over.
    val gv = steps.mapNotNull { it.gustKmh }
    val gusts =
      if (gv.size < 2) null
      else {
        val lo = maxOf(0.0, floor((gv.min() - 5) / 10) * 10)
        val hi = maxOf(lo + 30, ceil((gv.max() + 5) / 10) * 10)
        fun y(v: Double) = (46 - (v - lo) / (hi - lo) * 36).toFloat()
        val pts = steps.mapIndexedNotNull { i, s -> s.gustKmh?.let { GustPoint(cw * (i + 0.5f), y(it), it, s.timeUtc) } }
        val best = pts.reduce { a, b -> if (b.v > a.v) b else a }
        GustCurve(
          points = pts,
          y80 = if (lo < 80 && 80 < hi) y(80.0) else null,
          peak = best,
          peakText = "${HomeBoard.fmt(best.v)} à ${HomeBoard.hm(best.ts, off)}",
          peakLeft = if (best.x > w - 100) null else maxOf(0f, best.x - 6),
          peakRight = if (best.x > w - 100) best.x + 6 else null,
          peakTop = if (best.y >= 22) best.y - 22 else best.y + 7,
          unitOnLeft = best.x > w / 2,
        )
      }
    // The periods: a box per run of the same precipitation, its word when the box is 34 px wide or more.
    data class Acc(val wet: Boolean, val i0: Int, var n: Int, val kind: String?)
    val acc = ArrayList<Acc>()
    steps.forEachIndexed { i, s ->
      val wet = s.precipitation != null && s.precipitation != "none"
      val last = acc.lastOrNull()
      if (last != null && last.wet == wet) last.n += 1 else acc += Acc(wet, i, 1, if (wet) s.precipitation else null)
    }
    val runs =
      acc.map { r ->
        val text = if (r.n * cw - 2 >= 34) (if (r.wet) kindWord(r.kind).lowercase() else "sec") else ""
        QuarterRun(r.wet, r.i0, r.n, text)
      }
    // The hours: the first step and the full hours, three steps apart at least.
    val marks = ArrayList<Int>()
    steps.forEachIndexed { i, s ->
      if ((i == 0 || Math.floorMod(s.timeUtc + off, 3600L) < 60) && (marks.isEmpty() || i - marks.last() >= 3)) marks += i
    }
    return Quarter(title, right, n, gusts, runs, marks.map { it to HomeBoard.hm(steps[it].timeUtc, off) })
  }

  // ------------------------------------------------------------------------------------------------------- 48 hours

  /** One hour of the 48: day or night and its share of sun (the « Lueur »), its rain, its chance, its wind. */
  data class Hour48(val ts: Long, val day: Boolean, val sun: Double?, val mm: Double, val chance: Double?, val wind: Double?, val deg: Double?)

  data class Hours48(
    val title: String,
    val legend: String,
    val hours: List<Hour48>,
    /** Where a day starts: (hour, « Sam »). */
    val days: List<Pair<Int, String>>,
    /** The wind is written every that many hours, as the width allows. */
    val windEvery: Int,
    val hasChance: Boolean,
    val hourLabels: List<Pair<Int, String>>,
  )

  /** The next 48 hours hour by hour (12 at least): a column per hour, the days apart, the rain, its chance, the wind. */
  fun hours48(p: PointNow, now: Long, w: Float): Hours48? {
    val hrs = HomeBoard.currentHours(p, now).take(48)
    if (hrs.size < 12) return null
    val off = p.utcOffsetS
    val n = hrs.size
    val cw = w / n
    val hasP = hrs.any { it.rainProbabilityPct != null }
    val list =
      hrs.map { h ->
        val day = HomeBoard.isDayAt(p, h)
        Hour48(
          ts = h.timeUtc,
          day = day,
          sun = if (day) HomeBoard.sunOfHours(listOf(h)) ?: HomeBoard.sunOfCode(h.weatherCode) else null,
          mm = h.rainMm?.takeIf { it >= 0.1 } ?: 0.0,
          chance = h.rainProbabilityPct,
          wind = h.windKmh,
          deg = h.windDeg,
        )
      }
    val days = hrs.indices.filter { it > 0 && Math.floorMod(hrs[it].timeUtc + off, 86_400L) / 3600 == 0L }
      .map { it to HomeBoard.dayName(HomeBoard.localDay(hrs[it].timeUtc, off)) }
    val every = if (cw * 3 >= 30) 3 else if (cw * 4 >= 30) 4 else 6
    return Hours48(
      title = "$n${NBSP}h · heure par heure",
      legend = if (hasP) "mm · chance de pluie · vent" else "mm · vent",
      hours = list,
      days = days,
      windEvery = every,
      hasChance = hasP,
      hourLabels = hrs.indices.filter { it % 6 == 0 }.map { it to HomeBoard.hourOnly(hrs[it].timeUtc, off) },
    )
  }

  /** The height of a rain bar of the 48 hours (mm in the hour): 0 when dry, 3 to 44. */
  fun hour48Bar(mm: Double): Float = if (mm > 0) maxOf(3.0, minOf(mm, 2.0) / 2 * 44).toFloat() else 0f

  /** The y of a chance of rain on the dashed curve (40 at 0 %, 8 at 100 %). */
  fun chanceY(pct: Double): Float = (40 - pct / 100 * 32).toFloat()

  // -------------------------------------------------------------------------------------------------------- chances

  /** A row of the chances: its label, its [tone] (`rain`, `orange`, `red`, `yellow`, `t2`) and a chance per window. */
  data class ChanceRow(val label: String, val tone: String, val values: List<Double?>)

  data class Chances(val title: String, val source: String, val labelWidth: Float, val hours: List<String>, val rows: List<ChanceRow>)

  private class RowSpec(val key: String, val label: String, val tone: String, val always: Boolean)

  private val ROWS =
    listOf(
      RowSpec("rain_1mm_pct", "Pluie ≥${NBSP}1${NBSP}mm", "rain", true),
      RowSpec("gust_30kt_pct", "Rafales ≥${NBSP}56", "orange", true),
      RowSpec("gust_50kt_pct", "Rafales ≥${NBSP}93", "red", false),
      RowSpec("storm_pct", "Orage", "yellow", true),
      RowSpec("snow_1mm_pct", "Neige ≥${NBSP}1${NBSP}mm", "t2", false),
      RowSpec("hail_pct", "Grêle", "t2", false),
    )

  /**
   * The chances per window of the ensembles (PE-AROME), as many windows as the width holds (4 to 16, 34 px each): rain of
   * 1 mm or more, gusts of 56 km/h (30 kt) or more and thunderstorms always; gusts of 93 km/h (50 kt), snow and hail when a
   * window has some. Each window is named by its end.
   */
  fun chances(p: PointNow, now: Long, w: Float): Chances? {
    val pr = p.probabilities ?: return null
    val all = pr.windows.filter { it.toUtc > now }
    if (all.isEmpty()) return null
    val lab = 84f
    val win = all.take(floor((w - lab) / 34).toInt().coerceIn(4, 16))
    val rows =
      ROWS.filter { r -> win.any { it.pct[r.key] != null } && (r.always || win.any { (it.pct[r.key] ?: 0.0) > 0 }) }
        .map { r -> ChanceRow(r.label, r.tone, win.map { it.pct[r.key] }) }
    val source = if (pr.members != null) "${pr.members} scénarios PE-AROME · fin du créneau" else "PE-AROME · fin du créneau"
    return Chances("Chances par ${pr.windowHours ?: 3}${NBSP}h", source, lab, win.map { HomeBoard.hourOnly(it.toUtc, p.utcOffsetS) }, rows)
  }

  /** The alpha of a cell of the chances: 0.08 at 0 %, 0.9 at 100 %. */
  fun chanceAlpha(v: Double): Float = (0.08 + v.coerceIn(0.0, 100.0) / 100 * 0.82).toFloat()

  // -------------------------------------------------------------------------------------------------------- credits

  private val PROVIDERS =
    listOf(
      "Météo-France", "Vigicrues", "VigiEau", "MeteoAlarm", "Open-Meteo", "Copernicus", "SLF", "Avalanche.report", "EOT20",
      "OpenStreetMap", "USGS", "EMSC", "NOAA", "ECMWF", "DWD",
    )

  /** The foot of the page: who the values are from, and the models (« Données : Météo-France, … (PIAF, AROME-PI) · … »). */
  fun credits(p: PointNow): String? {
    val text = listOfNotNull(p.rainSoon?.attribution, p.shortTerm?.attribution, p.probabilities?.attribution, p.weatherAttribution).joinToString(" ")
    val names = PROVIDERS.filter { text.contains(it) }
    val models =
      listOfNotNull(
        "PIAF".takeIf { p.rainSoon?.attribution?.contains("PIAF") == true },
        "AROME-PI".takeIf { p.shortTerm?.steps.orEmpty().isNotEmpty() },
        "PE-AROME".takeIf { p.probabilities?.windows.orEmpty().isNotEmpty() },
      )
    val extra = if (models.isEmpty()) "" else " (${models.joinToString(", ")})"
    if (names.isEmpty()) return extra.trim().ifEmpty { null }
    return "Données$NBSP: ${names.joinToString(", ")}$extra · relayées par Vigie"
  }
}
