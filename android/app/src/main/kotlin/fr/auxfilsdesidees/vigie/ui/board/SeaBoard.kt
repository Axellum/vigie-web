package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.Beach
import fr.auxfilsdesidees.vigie.data.SeaHour
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * The Sea page of the Home Assistant card (`pageSea` of `vigie-card.js`, sketch « Mer · sous-menu des plages » chosen on
 * 2026-11-27), as pure functions so that the JVM tests it: a tab per followed spot, the name with the tide and the water, six
 * tiles (waves, swell, wind, the baïnes, the class of the water, the lifeguards or the sun), the verdicts of the activities
 * hour by hour, the tide of 24 hours and the next hours by 3 hours, then who the values are from. The words are the card's
 * French ones; the sizes are its narrow layout's px, in dp ([SeaBoardView]).
 */
internal object SeaBoard {
  private const val NBSP = ' '

  /** A piece of text and the tone it is written in (`text`, `t2`, `t3`, `green`, `yellow`, `orange`, `red`, `wind`, `sun`). */
  data class Part(val text: String, val tone: String? = null, val bold: Boolean = false)

  // ------------------------------------------------------------------------------------------------------------ the tabs

  private val PREFIX = Regex("""^(plages?|beach)\s+(de\s+la\s+|de\s+l['’]\s*|des\s+|du\s+|de\s+|d['’]\s*)?""", RegexOption.IGNORE_CASE)

  /** « Plage des Corsaires » → « Corsaires » in the tabs; the whole name under them. Null without a name. */
  fun shortName(name: String?): String? {
    val n = name?.trim()?.takeIf { it.isNotEmpty() } ?: return null
    val s = n.replace(PREFIX, "").trim()
    return if (s.isEmpty()) n else s.replaceFirstChar { it.uppercase() }
  }

  fun beachN(i: Int) = "Plage ${i + 1}"

  // ---------------------------------------------------------------------------------------------------------- the hours

  private fun hourFrom(now: Long) = now - Math.floorMod(now, 3600L)

  /** The hour an item stands for: the nearest whole hour (the API gives whole hours). */
  private fun hourOf(t: Long) = Math.round(t / 3600.0) * 3600

  /** The forecast's hours from the one under way. */
  fun hours(b: Beach, now: Long): List<SeaHour> {
    val from = hourFrom(now)
    return b.hours.filter { hourOf(it.timeUtc) >= from }
  }

  // ------------------------------------------------------------------------------------------------------------ the head

  /** The name, « La mer descend · basse mer 15 h 20 · coef. 85 (estimé) », and the water (« 15° ») when known. */
  data class Head(val name: String, val line: String?, val water: String?)

  fun head(b: Beach, name: String, now: Long, offsetS: Int): Head {
    val h0 = hours(b, now).firstOrNull()
    val next = b.extremes.firstOrNull { it.timeUtc > now }
    val trend = h0?.tideTrend?.takeIf { it == "rising" || it == "falling" } ?: next?.let { if (it.high) "rising" else "falling" }
    val parts = mutableListOf<String>()
    if (trend != null) parts += if (trend == "rising") "La mer monte" else "La mer descend"
    if (next != null) parts += "${if (next.high) "pleine mer" else "basse mer"} ${HomeBoard.hm(next.timeUtc, offsetS)}"
    b.coefficients.minByOrNull { abs(it.brestHighWaterUtc - now) }?.let { parts += "coef. ${HomeBoard.fmt(it.value, 1)} (estimé)" }
    return Head(name, parts.takeIf { it.isNotEmpty() }?.joinToString(" · "), b.waterC?.let { "${HomeBoard.fmt(it)}°" })
  }

  // ----------------------------------------------------------------------------------------------------------- the tiles

  /** A tile: its name (a part of it may be coloured), its value with the arrow of [deg], and a line under it. */
  data class Tile(val key: List<Part>, val value: String, val tone: String, val deg: Double?, val detail: List<Part>)

  /** The Douglas scale of the API (`classify_sea_state_douglas`), from the height of the waves at the spot. */
  fun seaState(m: Double): String =
    when {
      m < 0.1 -> "calme"
      m < 0.5 -> "belle"
      m < 1.25 -> "agitée"
      m < 2.5 -> "forte"
      m < 4 -> "très forte"
      m < 6 -> "grosse"
      else -> "énorme"
    }

  private val FROM = listOf("du nord", "du nord-est", "d’est", "du sud-est", "du sud", "du sud-ouest", "d’ouest", "du nord-ouest")

  /** The eighth of the compass [deg] is in (the card's `sector`). */
  fun sector(deg: Double): Int = (Math.round((((deg % 360) + 360) % 360) / 45) % 8).toInt()

  private val QUALITY = mapOf("excellent" to ("Excellente" to "green"), "good" to ("Bonne" to "green"), "sufficient" to ("Suffisante" to "yellow"), "poor" to ("Insuffisante" to "red"), "unclassified" to ("Non classée" to "t3"))

  /**
   * The baïnes (the rule of the Vigie site, `src/lib/sea/bathing.ts`): the ocean beaches from Charente-Maritime to the Basque
   * Country, facing the open Atlantic and not on rock.
   */
  fun onBaineCoast(b: Beach): Boolean {
    val s = b.spot
    val lat = s.lat ?: return false
    val lon = s.lon ?: return false
    if (lat < 43.35 || lat > 46.4 || lon > -1) return false
    val f = s.facingDeg ?: return false
    if (f < 200 || f > 340) return false
    return s.bottom != "rock"
  }

  /** Their current runs the strongest from three hours before to three hours after low water, within the next 24 hours. */
  data class BaineWindow(val low: Long, val from: Long, val to: Long, val now: Boolean)

  fun baineWindow(b: Beach, now: Long, horizon: Long = 24 * 3600L): BaineWindow? {
    for (low in b.extremes.filter { !it.high }) {
      val from = low.timeUtc - 3 * 3600
      val to = low.timeUtc + 3 * 3600
      if (to <= now) continue
      return if (from - now > horizon) null else BaineWindow(low.timeUtc, from, to, from <= now)
    }
    return null
  }

  /**
   * The six tiles: what the sea, the swell and the wind do in the hour under way, then the baïnes, the class of the water and
   * the lifeguards, the sun on the tiles left. [level]: the shorter words, when a word of a tile would be cut (1: without the
   * directions in words, the arrows keep them; 2: without the state of the sea either, and the shorter names).
   */
  fun tiles(b: Beach, now: Long, offsetS: Int, level: Int = 0): List<Tile> {
    val h0 = hours(b, now).firstOrNull()
    val tight = level >= 2
    fun dir(deg: Double?) = if (level < 1 && deg != null) FROM[sector(deg)] else null
    fun line(vararg p: String?) = listOf(Part(p.filterNotNull().filter { it.isNotEmpty() }.joinToString(" · ")))
    val tiles = mutableListOf<Tile>()
    h0?.waveM?.let { m ->
      val key = if (tight) "Vagues" else "Vagues · ${seaState(m)}"
      tiles += Tile(listOf(Part(key)), "${HomeBoard.fmt(m, 1)}${NBSP}m", "text", h0.waveFromDeg, line(h0.wavePeriodS?.let { "${HomeBoard.fmt(it)}${NBSP}s" }, dir(h0.waveFromDeg)))
    }
    h0?.swellM?.let { m ->
      tiles += Tile(listOf(Part("Houle")), "${HomeBoard.fmt(m, 1)}${NBSP}m", "text", h0.swellFromDeg, line(h0.swellPeriodS?.let { "${HomeBoard.fmt(it)}${NBSP}s" }, dir(h0.swellFromDeg)))
    }
    h0?.windKmh?.let { v ->
      val rel = mapOf("onshore" to ("de mer" to "orange"), "offshore" to ("de terre" to "green"), "cross_shore" to ("le long de la côte" to "t2"))[h0.windRelative]
      val key = if (rel != null && !(tight && h0.windRelative == "cross_shore")) listOf(Part("Vent "), Part(rel.first, rel.second, bold = true)) else listOf(Part("Vent"))
      val detail = mutableListOf<Part>()
      h0.gustKmh?.let { g ->
        detail += Part("rafales ")
        detail += Part(HomeBoard.fmt(g), gustTone(g), bold = true)
      }
      dir(h0.windFromDeg)?.let { detail += Part(if (detail.isEmpty()) it else " · $it") }
      tiles += Tile(key, "${HomeBoard.fmt(v)}${NBSP}km/h", "wind", h0.windFromDeg, detail)
    }
    if (onBaineCoast(b)) {
      baineWindow(b, now)?.let { w ->
        tiles += Tile(listOf(Part("Baïnes")), if (w.now) "En cours" else "dès ${HomeBoard.hm(w.from, offsetS)}", if (w.now) "orange" else "yellow", null, listOf(Part("jusqu’à ${HomeBoard.hm(w.to, offsetS)}")))
      }
    }
    QUALITY[b.bathing?.quality]?.let { (word, tone) ->
      tiles += Tile(listOf(Part(if (tight) "Qualité" else "Qualité de l’eau")), word, tone, null, listOf(Part(if (tight) "sur 4 ans" else "classe sur 4 ans")))
    }
    if (b.spot.lifeguarded == true) {
      tiles += Tile(listOf(Part(if (tight) "Surveillance" else "Plage surveillée")), "En saison", "text", null, listOf(Part(if (tight) "selon les jours" else "pas tous les jours")))
    }
    if (tiles.size < 6) {
      val today = b.sun.firstOrNull { it.sunriseUtc <= now && now < it.sunsetUtc }
      val next = b.sun.firstOrNull { it.sunriseUtc > now }
      if (today != null) tiles += Tile(listOf(Part("Coucher du soleil")), HomeBoard.hm(today.sunsetUtc, offsetS), "sun", null, listOf(Part(next?.let { "lever ${HomeBoard.hm(it.sunriseUtc, offsetS)}" } ?: "")))
      else if (next != null) tiles += Tile(listOf(Part("Lever du soleil")), HomeBoard.hm(next.sunriseUtc, offsetS), "sun", null, listOf(Part("coucher ${HomeBoard.hm(next.sunsetUtc, offsetS)}")))
    }
    return tiles
  }

  /** The strong gusts: orange from 80 km/h, yellow from 60, else the colour of the words around. */
  fun gustTone(v: Double): String? = if (v >= 80) "orange" else if (v >= 60) "yellow" else null

  // ------------------------------------------------------------------------------------------------------ the activities

  private val ACTIVITIES = mapOf("surf" to "Surf", "kite" to "Kite / wing", "boat" to "Bateau", "shore_fishing" to "Pêche à pied")
  private val VERDICT = mapOf("good" to ("Bon" to "green"), "possible" to ("Possible" to "yellow"), "poor" to ("Déconseillé" to "red"))

  /** An activity's row: its name, its verdict and why, and its 24 hours from the one under way (null: night or no verdict). */
  data class ActivityRow(val name: String, val word: String, val tone: String, val why: String?, val available: Boolean, val strip: List<String?>)

  fun activities(b: Beach, now: Long, offsetS: Int): List<ActivityRow> {
    val from = hourFrom(now)
    return b.activities.filter { it.id in ACTIVITIES }.map { a ->
      var why: String? = null
      val (word, tone) =
        when {
          !a.available -> "Ne peut pas être jugé ici" to "t3"
          a.verdict == null || a.verdict !in VERDICT -> "Pas de verdict" to "t3"
          else -> {
            if (a.verdict == "good" && a.bestStartUtc != null && a.bestEndUtc != null) {
              why = if (a.bestStartUtc <= now) "au mieux jusqu’à ${HomeBoard.hm(a.bestEndUtc, offsetS)}" else "au mieux ${HomeBoard.hm(a.bestStartUtc, offsetS)}–${HomeBoard.hm(a.bestEndUtc, offsetS)}"
            } else if (a.verdict != "good") why = reason(a.reason)
            VERDICT.getValue(a.verdict)
          }
        }
      val byTs = a.hours.associateBy { hourOf(it.timeUtc) }
      val strip = if (a.available) List(24) { i -> byTs[from + i * 3600]?.takeIf { it.daylight != false }?.verdict?.let { VERDICT[it]?.second } } else emptyList()
      ActivityRow(ACTIVITIES.getValue(a.id), word, tone, why?.takeIf { it.isNotEmpty() }, a.available, strip)
    }
  }

  /** The hours over the strips: every quarter of the 24 hours from the one under way. */
  fun ticks(now: Long, offsetS: Int): List<String> = listOf(0, 6, 12, 18).map { HomeBoard.hourOnly(hourFrom(now) + it * 3600L, offsetS) }

  /** The widths of the name and of the verdict in a row of [w] dp: the card's `nameW` and `verdW`. */
  fun activityWidths(w: Float): Pair<Float, Float> = (w * 0.24f).coerceIn(88f, 120f).roundToInt().toFloat() to (w * 0.27f).coerceIn(100f, 150f).roundToInt().toFloat()

  private val CRITERION =
    mapOf(
      "wind" to "Vent", "gust_gap" to "Rafales", "wind_direction" to "Vent", "wind_force" to "Vent", "gust_force" to "Rafales", "sea_height" to "Vagues",
      "low_water" to "Basse mer", "coefficient" to "Coefficient", "swell_height" to "Houle", "swell_period" to "Période", "swell_direction" to "Houle",
      "tide" to "Marée", "vigilance" to "Vigilance",
    )
  private val STATE =
    mapOf(
      "swell_height.too_small" to "trop petite", "swell_height.small" to "petite", "swell_height.right" to "bonne", "swell_height.big" to "forte",
      "swell_height.too_big" to "trop forte", "swell_period.short" to "courte", "swell_period.medium" to "moyenne", "swell_period.long" to "longue",
      "swell_direction.facing" to "de face", "swell_direction.oblique" to "de biais", "swell_direction.off_axis" to "hors de l’axe", "wind.light" to "léger",
      "wind.offshore" to "de terre", "wind.cross_shore" to "parallèle à la côte", "wind.onshore" to "de mer", "wind.strong" to "trop fort",
      "wind.in_range" to "dans la plage voulue", "wind.a_bit_light" to "un peu faible", "wind.a_bit_strong" to "un peu fort", "wind.too_light" to "trop faible",
      "wind.too_strong" to "trop fort", "tide.right_stage" to "bon moment", "tide.wrong_stage" to "mauvais moment", "gust_gap.steady" to "régulières",
      "gust_gap.gusty" to "marquées", "gust_gap.very_gusty" to "très marquées", "wind_direction.offshore" to "de terre",
      "wind_direction.cross_shore" to "parallèle à la côte", "wind_direction.onshore" to "de mer", "wind_force.up_to_moderate" to "modéré ou moins",
      "wind_force.up_to_fresh" to "frais ou moins", "wind_force.fresh" to "frais", "wind_force.strong" to "fort", "wind_force.strong_or_more" to "fort ou plus",
      "wind_force.near_gale_or_more" to "coup de vent ou plus", "gust_force.up_to_fresh" to "modérées", "gust_force.strong" to "fortes",
      "gust_force.gale_or_more" to "coup de vent ou plus", "sea_height.low" to "faibles", "sea_height.moderate" to "modérées", "sea_height.high" to "fortes",
      "low_water.in_window" to "dans les 2 h avant", "low_water.outside_window" to "loin de la basse mer", "coefficient.small" to "petit",
      "coefficient.moderate" to "moyen", "coefficient.large" to "grand", "coefficient.very_large" to "très fort", "vigilance.red" to "rouge",
      "vigilance.orange" to "orange",
    )

  /** « Houle : forte » from `swell_height.big`, the card's short words; null for a code it does not know (never shown raw). */
  fun reason(code: String?): String? {
    val state = STATE[code ?: return null] ?: return null
    val crit = CRITERION[code.substringBefore('.')]
    return if (crit != null) "$crit : $state" else state
  }

  // ------------------------------------------------------------------------------------------------------------- the tide

  /** A high or low water on the curve: its point, its words and where they are centred. */
  data class TideMark(val x: Float, val y: Float, val text: String, val low: Boolean, val textX: Float)

  /** An hour under the curve: its words, where they stand (`start`, `middle`, `end`) and whether it is the hour under way. */
  data class TideHour(val x: Float, val text: String, val anchor: String, val accent: Boolean)

  data class TideCurve(val w: Float, val h: Float, val points: List<Pair<Float, Float>>, val nowX: Float, val y0: Float, val y1: Float, val marks: List<TideMark>, val hours: List<TideHour>)

  /** The tide of the next 24 hours at the beach in [w] × [h] dp (`tideCurve` of the card); null with fewer than 6 heights. */
  fun tide(b: Beach, now: Long, offsetS: Int, w: Float, h: Float): TideCurve? {
    val pts0 = hours(b, now).filter { it.tideM != null && it.timeUtc >= now - 1800 && it.timeUtc <= now + 24 * 3600 }
    if (pts0.size < 6) return null
    val fs = 12f
    val y0 = 24f
    val y1 = h - 20
    val pad = 4f
    val t0 = pts0.first().timeUtc
    val t1 = pts0.last().timeUtc
    val amp = max(0.2, pts0.maxOf { abs(it.tideM!!) }) * 1.12
    fun x(t: Long) = pad + ((t - t0).toFloat() / (t1 - t0)) * (w - 2 * pad)
    fun y(v: Double) = (y1 - ((v + amp) / (2 * amp)) * (y1 - y0)).toFloat()
    val points = pts0.map { x(it.timeUtc) to y(it.tideM!!) }
    fun half(txt: String) = txt.length * (fs + 1) * 0.29f
    fun fit(px: Float, txt: String) = max(half(txt), min(w - half(txt), px))
    val taken = mutableListOf<Pair<Float, Float>>()
    val marks =
      b.extremes.filter { it.timeUtc in t0..t1 && it.heightM.isFinite() }.map { e ->
        val px = x(e.timeUtc)
        val txt = "${if (e.high) "PM" else "BM"} ${HomeBoard.hm(e.timeUtc, offsetS)}"
        val xt = fit(px, txt)
        if (!e.high) taken += (xt - half(txt)) to (xt + half(txt))
        TideMark(px, y(e.heightM), txt, !e.high, xt)
      }
    val hours =
      listOf(t0 to "start", (t0 + t1) / 2 to "middle", t1 to "end").mapIndexedNotNull { k, (t, a) ->
        val txt = HomeBoard.hourOnly(t, offsetS)
        val l = txt.length * fs * 0.6f
        val px = x(t)
        val g = when (a) { "start" -> px; "end" -> px - l; else -> px - l / 2 }
        if (taken.any { (p0, p1) -> g - 8 < p1 && p0 < g + l + 8 }) null else TideHour(px, txt, a, k == 0)
      }
    return TideCurve(w, h, points, x(now), y0, y1, marks, hours)
  }

  // ------------------------------------------------------------------------------------------------------------ the table

  /** A cell of the table: its words, its background (a tone and its strength, none for an empty one) and a wind arrow. */
  data class Cell(val text: String, val tone: String? = null, val alpha: Float = 0f, val deg: Double? = null)

  data class Table(val hours: List<String>, val waves: List<Cell>, val periods: List<Cell>, val winds: List<Cell>)

  /** The next hours by 3 hours (8 slots at most, 4 at least): the waves, their period and the wind, tinted by their strength. */
  fun table(b: Beach, now: Long, offsetS: Int): Table? {
    val from = hourFrom(now)
    val byTs = hours(b, now).associateBy { hourOf(it.timeUtc) }
    val slots = (0 until 8).map { from + it * 3 * 3600L }.filter { it in byTs }
    if (slots.size < 4) return null
    val list = slots.map { byTs.getValue(it) }
    fun wave(m: Double) = when { m >= 4 -> "red" to 0.42f; m >= 3 -> "orange" to 0.4f; m >= 2 -> "yellow" to 0.34f; m >= 1 -> "rain" to 0.3f; else -> "rain" to 0.14f }
    fun wind(v: Double) = when { v >= 80 -> "red" to 0.42f; v >= 60 -> "orange" to 0.4f; v >= 40 -> "yellow" to 0.34f; v >= 20 -> "wind" to 0.28f; else -> "wind" to 0.12f }
    return Table(
      hours = slots.map { HomeBoard.hourOnly(it, offsetS) },
      waves = list.map { h -> h.waveM?.let { m -> wave(m).let { (t, a) -> Cell(HomeBoard.fmt(m, 1), t, a) } } ?: Cell("–") },
      periods = list.map { h -> Cell(h.wavePeriodS?.let { HomeBoard.fmt(it) } ?: "–", "t4", 0.12f) },
      winds = list.map { h -> h.windKmh?.let { v -> wind(v).let { (t, a) -> Cell(HomeBoard.fmt(v), t, a, h.windFromDeg) } } ?: Cell("–") },
    )
  }

  // ---------------------------------------------------------------------------------------------------------- the credits

  private val PROVIDERS = listOf("Météo-France", "Vigicrues", "VigiEau", "MeteoAlarm", "Open-Meteo", "Copernicus", "SLF", "Avalanche.report", "EOT20", "OpenStreetMap", "USGS", "EMSC", "NOAA", "ECMWF", "DWD")

  /** Credited by the spot's own data (its lifeguards, the nature of its bottom), on this page only. */
  private val SEA_PROVIDERS = listOf("GIP Littoral", "Shom")

  /** « Données : Open-Meteo, Copernicus, EOT20… · relayées par Vigie »; null when no credit reads. */
  fun credits(b: Beach): String? {
    val all = listOfNotNull(b.forecastCredit, b.activitiesCredit, b.waterCredit).joinToString(" ")
    val spot = listOfNotNull(b.forecastCredit, b.activitiesCredit).joinToString(" ")
    val names = PROVIDERS.filter { it in all } + SEA_PROVIDERS.filter { it in spot } + listOfNotNull(if (b.bathing?.quality in QUALITY) "ministère de la Santé (data.gouv.fr)" else null)
    return if (names.isEmpty()) null else "Données${NBSP}: ${names.joinToString(", ")} · relayées par Vigie"
  }
}
