package fr.auxfilsdesidees.vigie.ui

import fr.auxfilsdesidees.vigie.data.PointNow
import kotlin.math.roundToInt

/**
 * The rain of the hour to come, read and worded as the site's widget does it (vigie-web `src/lib/widget/model.ts`,
 * `rainView`, and the sentences of `src/lib/widget/text.ts`), so that the app and the widget say the same thing for the
 * same place at the same time. Pure: tested on the JVM.
 */
object RainHour {
  /** A step wetter than this is rain, in mm per step: the API's own threshold for `rain_expected_60m`. */
  const val WET_STEP_MM = 0.05

  /** A forecast of the hour to come is worth nothing once the reading is older than this. */
  const val MAX_AGE_S = 30 * 60L

  enum class Status { None, Now, Soon, Unknown }

  /** [inMin]: minutes until the first wet step (0 when it rains now); [forMin]: minutes of rain from there; [maxMmH]: strongest rate. */
  data class View(val status: Status, val inMin: Int? = null, val forMin: Int? = null, val maxMmH: Double? = null)

  private val UNKNOWN = View(Status.Unknown)
  private val STALE = Regex("""\(stale""", RegexOption.IGNORE_CASE)

  /** The rain of the hour at [nowUtc] (the phone's clock): unknown when the reading is stale or older than [MAX_AGE_S]. */
  fun view(p: PointNow, nowUtc: Long): View {
    val rain = p.rainSoon ?: return UNKNOWN
    if (rain.mmPerStep.isEmpty()) return UNKNOWN
    if (STALE.containsMatchIn(p.provider.orEmpty())) return UNKNOWN
    if (p.serverUtc > 0 && nowUtc - p.serverUtc > MAX_AGE_S) return UNKNOWN
    val step = rain.stepMinutes
    val wet = rain.mmPerStep.map { it > WET_STEP_MM }
    val first = wet.indexOf(true)
    if (first < 0) return View(Status.None, maxMmH = 0.0)
    var last = first
    while (last + 1 < wet.size && wet[last + 1]) last++
    val rates = rain.mmPerStep.map { it * 60 / step }
    return View(
      status = if (first == 0) Status.Now else Status.Soon,
      inMin = first * step,
      forMin = (last - first + 1) * step,
      maxMmH = rates.filterIndexed { i, _ -> wet[i] }.max(),
    )
  }

  /** The widget's title: « Pluie en cours », « Pluie dans 15 min », « Pas de pluie dans l’heure », « Pluie de l’heure non lue ». */
  fun title(v: View): String =
    when (v.status) {
      Status.Now -> "Pluie en cours"
      Status.Soon -> "Pluie dans ${v.inMin ?: 0}${NBSP}min"
      Status.None -> "Pas de pluie dans l’heure"
      Status.Unknown -> "Pluie de l’heure non lue"
    }

  /** The widget's detail: « environ 30 min · jusqu’à 2,4 mm/h », « prévision du modèle », nothing when unread. */
  fun detail(v: View): String? =
    when (v.status) {
      Status.Now, Status.Soon -> "environ ${v.forMin ?: 0}${NBSP}min · jusqu’à ${rate(v.maxMmH)}${NBSP}mm/h"
      Status.None -> "prévision du modèle"
      Status.Unknown -> null
    }

  /** « 2,4 », « 3 »: one decimal at most, French comma, as the widget's `number(lang, v, 1)`. */
  internal fun rate(v: Double?): String {
    if (v == null) return "—"
    val tenths = (v * 10).roundToInt()
    return if (tenths % 10 == 0) "${tenths / 10}" else "${tenths / 10},${tenths % 10}"
  }

  private const val NBSP = ' '
}
