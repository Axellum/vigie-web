package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.Vigilance
import fr.auxfilsdesidees.vigie.data.Vigilances
import kotlin.math.max
import kotlin.math.min

/**
 * The official warnings of a place, read as the site's widget reads them (vigie-web `src/lib/widget/model.ts`
 * `vigilanceView`, words of `src/lib/widget/text.ts`, `src/lib/i18n.ts` and `src/lib/sentence.ts`), so that the app,
 * the widget and the Home Assistant card say the same thing. Never `local_alert_level` of `/v1/point`: that is a level
 * worked out by Vigie over a wide radius, not the warning of the place. Pure functions: tested on the JVM.
 */
object Vigil {
  private const val NBSP = ' '

  enum class State { Unread, NoSource, None, Warnings }

  /**
   * What the banner of the Accueil says: the highest level in force, the names of its phenomena, until when (the latest
   * end among them), and how many other phenomena are in force at lower levels. [live] = every warning in force or to
   * come, the strongest first.
   */
  data class View(val state: State, val level: String?, val labels: List<String>, val until: Long?, val more: Int, val live: List<Vigilance>)

  fun rank(level: String?): Int =
    when (level) {
      "GREEN" -> 0
      "YELLOW" -> 1
      "ORANGE" -> 2
      "RED" -> 3
      else -> -1
    }

  /** In force or still to come (no end, or an end after [nowUtc]); the strongest first, then the earliest. */
  fun live(v: Vigilances, nowUtc: Long): List<Vigilance> =
    v.items
      .filter { it.endUtc == null || it.endUtc > nowUtc }
      .sortedWith(compareByDescending<Vigilance> { rank(it.level) }.thenBy { it.onsetUtc ?: Long.MIN_VALUE })

  /** [v] null = the warnings could not be read; a place no source covers, or whose sources all failed, says so. */
  fun view(v: Vigilances?, nowUtc: Long): View {
    if (v == null) return View(State.Unread, null, emptyList(), null, 0, emptyList())
    val live = live(v, nowUtc)
    if (live.isEmpty()) {
      val state =
        when {
          !v.covered -> State.NoSource
          v.unavailable -> State.Unread
          else -> State.None
        }
      return View(state, null, emptyList(), null, 0, emptyList())
    }
    val top = live.maxOf { rank(it.level) }
    val highest = live.filter { rank(it.level) == top }
    val labels = highest.map(::bannerLabel).distinct()
    val others = live.filter { rank(it.level) != top }.map(::bannerLabel).filter { it !in labels }.distinct()
    return View(State.Warnings, highest.first().level, labels, highest.mapNotNull { it.endUtc }.maxOrNull(), others.size, live)
  }

  private val PHENOMENA =
    mapOf(
      "wind" to "Vent",
      "rain" to "Pluie",
      "thunderstorm" to "Orages",
      "snow-ice" to "Neige, verglas",
      "heat" to "Canicule",
      "cold" to "Grand froid",
      "flood" to "Crues, inondations",
      "avalanche" to "Avalanches",
      "coastal" to "Vagues, submersion",
      "fire" to "Feux de forêt",
      "fog" to "Brouillard",
    )

  private val ISSUER_LEVEL = Regex("""^(vigilance|warning|avertissement)\s+(rouge|orange|jaune|verte|red|yellow|green)\s+""", RegexOption.IGNORE_CASE)

  /** The site's name of the phenomenon, else the issuer's words without their level (« Vigilance jaune X » → « X »). */
  fun label(w: Vigilance): String {
    if (w.phenomenon != "other") PHENOMENA[w.phenomenon]?.let { return it }
    val bare = w.event?.replace(ISSUER_LEVEL, "")?.trim()
    return if (bare.isNullOrEmpty()) "Autre" else bare.replaceFirstChar { it.uppercase() }
  }

  /** On the banner, a river section says which river and how far: « Crues : Canche, à 0,6 km ». */
  fun bannerLabel(w: Vigilance): String {
    if (!w.river || w.area == null) return label(w)
    return "Crues : ${where(w)}"
  }

  /** Where it applies: the area of the issuer (« Corse-du-Sud »), or the river and its distance (« Canche, à 0,6 km »). */
  fun where(w: Vigilance): String? {
    val area = w.area ?: return null
    return if (w.distanceKm != null) "$area, à ${Words.km(w.distanceKm)}" else area
  }

  /** « Vigilance orange », the banner's title (the widget's words). */
  fun levelTitle(level: String?): String = if (rank(level) < 0) "Vigilance" else "Vigilance ${Words.warningLevel(level)}"

  /** « Orange », the word of a level's pill. */
  fun levelShort(level: String?): String = Words.warningLevel(level).replaceFirstChar { it.uppercase() }

  /** « 16 h », « 16 h 30 »: the widget's clock. */
  fun shortClock(t: Long, offsetS: Int): String {
    val s = Math.floorMod(t + offsetS, 86_400L)
    val m = s % 3600 / 60
    return if (m == 0L) "${s / 3600}${NBSP}h" else "${s / 3600}${NBSP}h${NBSP}${m.toString().padStart(2, '0')}"
  }

  private val MONTHS = listOf("janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc.")

  /** « mar. 24 nov. » */
  private fun dateShort(key: Long): String = "${Words.dayShort(key).lowercase()} ${Words.dayOfMonth(key)} ${MONTHS[Words.monthOf(key) - 1]}"

  /** « jusqu'à 16 h », « jusqu'à demain 16 h », « jusqu'au mar. 24 nov., 16 h » (the site's words). */
  fun until(t: Long, nowUtc: Long, offsetS: Int): String {
    val key = Words.dayKey(t, offsetS)
    return when (key - Words.dayKey(nowUtc, offsetS)) {
      0L -> "jusqu'à ${shortClock(t, offsetS)}"
      1L -> "jusqu'à demain ${shortClock(t, offsetS)}"
      else -> "jusqu'au ${dateShort(key)}, ${shortClock(t, offsetS)}"
    }
  }

  /** « 17 h », « demain 6 h », « hier 22 h », « mar. 24 nov. 6 h »: a moment near [nowUtc]. */
  private fun moment(t: Long, nowUtc: Long, offsetS: Int): String {
    val key = Words.dayKey(t, offsetS)
    val clock = shortClock(t, offsetS)
    return when (key - Words.dayKey(nowUtc, offsetS)) {
      0L -> clock
      1L -> "demain $clock"
      -1L -> "hier $clock"
      else -> "${dateShort(key)} $clock"
    }
  }

  /** « Depuis 17 h · jusqu'à demain 16 h », « Dès 20 h · … », « En cours, sans heure de fin » (a river section). */
  fun period(w: Vigilance, nowUtc: Long, offsetS: Int): String {
    val start = w.onsetUtc?.let { if (it <= nowUtc) "depuis ${moment(it, nowUtc, offsetS)}" else "dès ${moment(it, nowUtc, offsetS)}" }
    val end = w.endUtc?.let { until(it, nowUtc, offsetS) }
    val s =
      when {
        start == null && end == null -> "en cours, sans heure de fin"
        end == null -> "$start · sans heure de fin"
        start == null -> end
        else -> "$start · $end"
      }
    return s.replaceFirstChar { it.uppercase() }
  }

  /** One warning drawn on the frise, from [start] to [end] (cut to the frise's window). */
  data class Lane(val warning: Vigilance, val start: Long, val end: Long)

  /** The warnings with a start or an end that cross [t0, t1[, cut to it; a warning with neither has no place here. */
  fun lanes(live: List<Vigilance>, t0: Long, t1: Long): List<Lane> =
    live.filter { it.onsetUtc != null || it.endUtc != null }.mapNotNull { w ->
      val s = max(w.onsetUtc ?: t0, t0)
      val e = min(w.endUtc ?: t1, t1)
      if (e > s) Lane(w, s, e) else null
    }

  /** The warnings without any hour (a river section in flood): the banner says them, the frise cannot place them. */
  fun untimed(live: List<Vigilance>): List<Vigilance> = live.filter { it.onsetUtc == null && it.endUtc == null }

  /** The warnings with hours that apply at [t]. */
  fun at(live: List<Vigilance>, t: Long): List<Vigilance> =
    live.filter { (it.onsetUtc != null || it.endUtc != null) && (it.onsetUtc ?: Long.MIN_VALUE) <= t && t < (it.endUtc ?: Long.MAX_VALUE) }

  private val SOURCES =
    mapOf(
      "meteofrance" to "Météo-France",
      "vigicrues" to "Vigicrues",
      "meteoalarm" to "MeteoAlarm",
      "dwd" to "DWD",
      "eccc" to "Environnement Canada",
      "metservice" to "MetService",
      "noaa_nws" to "NOAA NWS",
    )

  /** « Météo-France, Vigicrues »: who issued the warnings shown. */
  fun issuers(live: List<Vigilance>): String = live.map { it.issuer ?: SOURCES[it.source] ?: it.source ?: "?" }.distinct().joinToString(", ")

  /**
   * The issuers' own credits, word for word, each once: the API joins several with « | » (« Source: Météo-France… |
   * Source: Vigicrues… »), and the same one comes back on every warning of a source; then the API's disclaimer.
   */
  fun fullCredits(live: List<Vigilance>, disclaimer: String?): List<String> =
    (live.mapNotNull { it.attribution }.flatMap { it.split(" | ") } + listOfNotNull(disclaimer))
      .map { it.trim() }
      .filter { it.isNotEmpty() }
      .distinct()
}
