package fr.auxfilsdesidees.vigie.ui

import kotlin.math.floor
import kotlin.math.roundToInt

/**
 * The French words of the screens, the same as the clickable prototype and the site (vigie-web `src/lib/activities.ts`).
 * Pure functions: tested on the JVM. Times are in UTC seconds; [offsetS] is the place's offset from `/v1/point`.
 */
object Words {
  private const val NBSP = ' '

  fun weather(code: Int?): String =
    when {
      code == null -> "—"
      code == 0 -> "Ciel clair"
      code == 1 -> "Peu nuageux"
      code == 2 -> "Éclaircies"
      code == 3 -> "Couvert"
      code == 45 || code == 48 -> "Brouillard"
      code in 51..55 -> "Bruine"
      code == 56 || code == 57 -> "Bruine verglaçante"
      code == 61 -> "Pluie faible"
      code == 63 -> "Pluie"
      code == 65 -> "Forte pluie"
      code == 66 || code == 67 -> "Pluie verglaçante"
      code in 71..77 || code == 85 || code == 86 -> "Neige"
      code == 80 || code == 81 -> "Averses"
      code == 82 -> "Fortes averses"
      code >= 95 -> "Orage"
      else -> "Nuageux"
    }

  private val DIRS = listOf("nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest")

  /** « du nord », « d'ouest », « de sud-ouest »: where the wind comes from. */
  fun windFrom(deg: Double?): String {
    if (deg == null) return ""
    val n = DIRS[(((deg % 360 + 360) % 360) / 45).roundToInt() % 8]
    return when (n) {
      "nord", "sud" -> "du $n"
      "est", "ouest" -> "d'$n"
      else -> "de $n"
    }
  }

  /** « 14° », « −3° » (typographic minus), never « −0° ». */
  fun degrees(c: Double?): String {
    if (c == null) return "—"
    val n = c.roundToInt()
    return if (n < 0) "−${-n}°" else "$n°"
  }

  fun kmh(v: Double?): String = if (v == null) "—" else "${v.roundToInt()}${NBSP}km/h"

  /** A distance: one decimal under 10 km (« 4,2 km »), whole kilometres beyond. */
  fun km(d: Double): String {
    if (d >= 9.95) return "${d.roundToInt()}${NBSP}km"
    val tenths = (d * 10).roundToInt()
    return if (tenths % 10 == 0) "${tenths / 10}${NBSP}km" else "${tenths / 10},${tenths % 10}${NBSP}km"
  }

  private const val VOWELS = "aeiouyàâäéèêëîïôöùûüÿæœ"

  /** « près d'Ajaccio », « près de Brest »: elided before a vowel (an initial « h » is left alone: muet or aspiré, unknown). */
  fun near(name: String): String = if (name.firstOrNull()?.lowercaseChar()?.let { it in VOWELS } == true) "près d'$name" else "près de $name"

  /** A population with French grouping (« 58 112 hab. »), a narrow no-break space between the groups. */
  fun population(n: Long): String = "${n.toString().reversed().chunked(3).joinToString(" ").reversed()}${NBSP}hab."

  /** Where a place of the search is: its region, and its country code when it is not France. */
  fun placeWhere(region: String?, country: String?): String =
    listOfNotNull(region, country?.takeIf { it != "FR" }).joinToString(", ")

  /** « 0 mm », « 0,4 mm », « 12 mm »: French decimal comma, one decimal under 10 mm. */
  fun mm(v: Double?): String {
    if (v == null) return "—"
    if (v >= 10) return "${v.roundToInt()}${NBSP}mm"
    val tenths = (v * 10).roundToInt()
    return if (tenths % 10 == 0) "${tenths / 10}${NBSP}mm" else "${tenths / 10},${tenths % 10}${NBSP}mm"
  }

  fun activity(id: String): String =
    when (id) {
      "surf" -> "Surf"
      "kite" -> "Kite / wing"
      "boat" -> "Bateau"
      "shore_fishing" -> "Pêche à pied"
      else -> id
    }

  /** The short name of an activity, for the rows of the frise. */
  fun activityShort(id: String): String = if (id == "shore_fishing") "Pêche" else activity(id)

  /** The colour word of an official warning level, so that the colour is never alone. */
  fun warningLevel(level: String?): String =
    when (level) {
      "GREEN" -> "verte"
      "YELLOW" -> "jaune"
      "ORANGE" -> "orange"
      "RED" -> "rouge"
      else -> "niveau inconnu"
    }

  /** The three words of a verdict, never « sûr »; unknown says so. */
  fun verdict(v: String?): String =
    when (v) {
      "good" -> "Bon"
      "possible" -> "Possible"
      "poor" -> "Déconseillé"
      else -> "Inconnu"
    }

  private val CRITERION =
    mapOf(
      "wind" to "Vent",
      "gust_gap" to "Écart des rafales avec le vent",
      "wind_direction" to "Côté d’où vient le vent",
      "wind_force" to "Force du vent",
      "gust_force" to "Force des rafales",
      "sea_height" to "Hauteur des vagues",
      "low_water" to "Avant la basse mer",
      "coefficient" to "Coefficient (estimé par Vigie)",
      "swell_height" to "Hauteur de la houle",
      "swell_period" to "Période de la houle",
      "swell_direction" to "Angle de la houle avec la plage",
      "tide" to "Marée",
      "vigilance" to "Vigilance côtière",
    )

  private val STATE =
    mapOf(
      "swell_height.too_small" to "trop petite", "swell_height.small" to "petite", "swell_height.right" to "bonne",
      "swell_height.big" to "forte", "swell_height.too_big" to "trop forte", "swell_period.short" to "courte",
      "swell_period.medium" to "moyenne", "swell_period.long" to "longue", "swell_direction.facing" to "de face",
      "swell_direction.oblique" to "de biais", "swell_direction.off_axis" to "hors de l’axe de la plage",
      "wind.light" to "léger", "wind.offshore" to "de terre", "wind.cross_shore" to "parallèle à la côte",
      "wind.onshore" to "de mer", "wind.strong" to "trop fort", "wind.in_range" to "dans la plage voulue",
      "wind.a_bit_light" to "un peu faible", "wind.a_bit_strong" to "un peu fort", "wind.too_light" to "trop faible",
      "wind.too_strong" to "trop fort", "tide.right_stage" to "bon moment de la marée",
      "tide.wrong_stage" to "mauvais moment de la marée", "gust_gap.steady" to "régulier",
      "gust_gap.gusty" to "rafales marquées", "gust_gap.very_gusty" to "rafales très marquées",
      "wind_direction.offshore" to "de terre", "wind_direction.cross_shore" to "parallèle à la côte",
      "wind_direction.onshore" to "de mer", "wind_force.up_to_moderate" to "modéré ou moins",
      "wind_force.up_to_fresh" to "frais ou moins", "wind_force.fresh" to "frais", "wind_force.strong" to "fort",
      "wind_force.strong_or_more" to "fort ou plus", "wind_force.near_gale_or_more" to "près du coup de vent ou plus",
      "gust_force.up_to_fresh" to "frais ou moins", "gust_force.strong" to "fortes",
      "gust_force.gale_or_more" to "coup de vent ou plus", "sea_height.low" to "faible",
      "sea_height.moderate" to "modérée", "sea_height.high" to "importante",
      "low_water.in_window" to "dans les 2 h avant la basse mer",
      "low_water.outside_window" to "hors des 2 h avant la basse mer", "coefficient.small" to "petit",
      "coefficient.moderate" to "moyen", "coefficient.large" to "grand", "coefficient.very_large" to "très fort",
      "vigilance.red" to "rouge", "vigilance.orange" to "orange",
    )

  /** States that already name their criterion: written alone, « Rafales très marquées » rather than twice. */
  private val SELF_CONTAINED =
    setOf("gust_gap.gusty", "gust_gap.very_gusty", "low_water.in_window", "low_water.outside_window", "tide.right_stage", "tide.wrong_stage")

  /** « Période de la houle : courte » from `swell_period.short`; null for an unknown code (nothing is guessed). */
  fun reason(code: String?): String? {
    if (code == null) return null
    val state = STATE[code] ?: return null
    if (code in SELF_CONTAINED) return state.replaceFirstChar { it.uppercase() }
    val crit = CRITERION[code.substringBefore('.')] ?: return null
    return "$crit : $state"
  }

  private fun localHour(t: Long, offsetS: Int): Int = (Math.floorMod(t + offsetS, 86_400L) / 3600).toInt()

  /** The local day of [t]: days since 1970-01-01 (a Thursday) at the place. */
  internal fun dayKey(t: Long, offsetS: Int): Long = floor((t + offsetS) / 86_400.0).toLong()

  private val DAYS = listOf("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")
  private val DAYS_SHORT = listOf("Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim.")

  /** « lundi » … « dimanche » for a local day key (days since 1970-01-01, a Thursday). */
  fun dayName(key: Long): String = DAYS[Math.floorMod(key + 3, 7L).toInt()]

  /** « Lun. » … « Dim. » for a local day key. */
  fun dayShort(key: Long): String = DAYS_SHORT[Math.floorMod(key + 3, 7L).toInt()]

  /** Month (1 to 12) of a local day key, same civil calendar as [dayOfMonth]. */
  fun monthOf(key: Long): Int {
    val z = key + 719_468
    val era = Math.floorDiv(z, 146_097L)
    val doe = z - era * 146_097
    val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    return (if (mp < 10) mp + 3 else mp - 9).toInt()
  }

  /** Day of the month of a local day key (civil calendar, without java.time: the app runs from Android 7). */
  fun dayOfMonth(key: Long): Int {
    val z = key + 719_468
    val era = Math.floorDiv(z, 146_097L)
    val doe = z - era * 146_097
    val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    return (doy - (153 * mp + 2) / 5 + 1).toInt()
  }

  /** « 21 h » */
  fun hour(t: Long, offsetS: Int): String = "${localHour(t, offsetS)}${NBSP}h"

  /** The pill of a frise day: « Auj. », then « Lun. 23 ». */
  fun dayPill(t: Long, nowUtc: Long, offsetS: Int): String {
    val key = dayKey(t, offsetS)
    return if (key == dayKey(nowUtc, offsetS)) "Auj." else "${dayShort(key)} ${dayOfMonth(key)}"
  }

  /** « Dimanche · 21 h », the title of the reading under the frise. */
  fun readoutTitle(t: Long, offsetS: Int): String =
    "${dayName(dayKey(t, offsetS)).replaceFirstChar { it.uppercase() }} · ${hour(t, offsetS)}"

  /** « maintenant », « dans 7 h ». */
  fun fromNow(hours: Long): String = if (hours <= 0) "maintenant" else "dans $hours${NBSP}h"

  /**
   * « Nuit claire » for a clear night, as the Home Assistant card says it; otherwise the words of [weather]. [day] null
   * (the API did not say) reads as day: « Ciel clair » is true at night too.
   */
  fun weatherAt(code: Int?, day: Boolean?): String = if (day == false && code == 0) "Nuit claire" else weather(code)

  /** « Éclaircies, de 8° à 13°, 4 mm. »: one day of `daily` (rain said from half a millimetre). */
  fun daySentence(d: fr.auxfilsdesidees.vigie.data.Day): String {
    val rain = d.rainMm?.takeIf { it >= 0.5 }?.let { ", ${it.roundToInt()}${NBSP}mm" } ?: ""
    return "${weather(d.code)}, de ${degrees(d.tminC)} à ${degrees(d.tmaxC)}$rain."
  }

  /**
   * The next 12 hours in one sentence, as the prototype: « Sec ces 12 prochaines heures. », « Sec jusqu'à 18 h, rafales
   * fortes vers 21 h. ». Null when the rain of one of these hours is unknown (nothing is claimed dry without data).
   */
  fun next12Hours(hours: List<fr.auxfilsdesidees.vigie.data.HourWeather>, offsetS: Int): String? {
    val h = hours.take(12)
    if (h.isEmpty() || h.any { it.rainMm == null }) return null
    val iRain = h.indexOfFirst { it.rainMm!! >= 0.1 }
    val iHeavy = h.indexOfFirst { it.rainMm!! >= 1.0 }
    val lastWind = h.indexOfLast { (it.gustKmh ?: 0.0) >= 50.0 }
    val title =
      when {
        iRain < 0 -> "Sec ces 12 prochaines heures"
        iRain == 0 -> if (iHeavy == 0) "Il pleut" else "Quelques gouttes"
        else -> "Sec jusqu'à ${hour(h[iRain].timeUtc, offsetS)}"
      }
    val wind =
      when {
        lastWind < 0 -> ""
        (h[0].gustKmh ?: 0.0) >= 50.0 -> ", rafales fortes jusqu'à ${hour(h[lastWind].timeUtc + 3600, offsetS)}"
        else -> ", rafales fortes vers ${hour(h[lastWind].timeUtc, offsetS)}"
      }
    return "$title$wind."
  }

  /** « monte » / « descend » before the next extreme, and « pleine mer 18 h 42 » / « basse mer 12 h 10 ». */
  fun tideTrend(next: fr.auxfilsdesidees.vigie.data.TideExtreme, offsetS: Int): Pair<String, String> =
    if (next.high) "monte" to "pleine mer ${clock(next.timeUtc, offsetS)}"
    else "descend" to "basse mer ${clock(next.timeUtc, offsetS)}"

  /** « aujourd'hui », « demain » or the day's name, relative to [nowUtc]. */
  fun relativeDay(t: Long, nowUtc: Long, offsetS: Int): String =
    when (dayKey(t, offsetS) - dayKey(nowUtc, offsetS)) {
      0L -> "aujourd'hui"
      1L -> "demain"
      else -> dayName(dayKey(t, offsetS))
    }

  /** « 15 h 42 » */
  fun clock(t: Long, offsetS: Int): String {
    val s = Math.floorMod(t + offsetS, 86_400L)
    return "${s / 3600}${NBSP}h${NBSP}${(s % 3600 / 60).toString().padStart(2, '0')}"
  }

  /** The best slot [start, end[ in French: « jusqu'à 14 h » or « demain de 9 h à 14 h ». */
  fun slot(start: Long?, end: Long?, nowUtc: Long, offsetS: Int): String? {
    if (start == null || end == null) return null
    val h = { t: Long -> "${localHour(t, offsetS)}${NBSP}h" }
    if (start <= nowUtc) return "jusqu'à ${h(end)}"
    return "${relativeDay(start, nowUtc, offsetS)} de ${h(start)} à ${h(end)}"
  }

  /** The sentence under a verdict: when to go, or why not. */
  fun verdictLine(a: fr.auxfilsdesidees.vigie.data.ActivityVerdict, nowUtc: Long, offsetS: Int): String {
    if (!a.available) return "Pas de calcul ici."
    if (a.verdict == null) return "Pas assez de données."
    if (a.verdict == "poor") return reason(a.reason) ?: "Pas ces 24 heures."
    val s = slot(a.bestStartUtc, a.bestEndUtc, nowUtc, offsetS) ?: return reason(a.reason) ?: ""
    return s.replaceFirstChar { it.uppercase() }
  }
}
