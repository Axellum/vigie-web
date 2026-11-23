package fr.auxfilsdesidees.vigie.widget

import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.ui.RainHour
import fr.auxfilsdesidees.vigie.ui.Sky
import fr.auxfilsdesidees.vigie.ui.Vigil
import fr.auxfilsdesidees.vigie.ui.Words
import fr.auxfilsdesidees.vigie.ui.skyOf
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * What the place widget shows, read from the last good read of the place as the site's widget reads it (vigie-web
 * `src/lib/widget/model.ts` and `components/PlaceView.svelte`): the same blocks, the same words. Pure: tested on the JVM.
 * Times are UTC seconds; [nowUtc] is the phone's clock.
 */
object WidgetModel {
  private const val NBSP = ' '

  /** One step of the rain bars: [pct] of the bars' height, and its tone. */
  data class Bar(val pct: Int, val tone: Tone)

  enum class Tone { Dry, Light, Rain, Heavy }

  /** The rain of the hour: a title, the long one (« Pas de pluie dans l’heure ») and the short one of the small size. */
  data class Rain(val status: RainHour.Status, val title: String, val short: String, val detail: String?, val bars: List<Bar>)

  /** The official warnings: a level and its words when there are some, else one quiet line. */
  data class Warnings(val state: Vigil.State, val level: String?, val title: String, val until: String?, val detail: String, val more: Int) {
    /** The few words of the frise's header, beside the place: « Aucune vigilance », « Vigilances non lues »… */
    val short: String
      get() =
        when (state) {
          Vigil.State.None -> "Aucune vigilance"
          Vigil.State.NoSource -> "Pas de vigilance lue ici"
          Vigil.State.Unread -> "Vigilances non lues"
          Vigil.State.Warnings -> title
        }
  }

  /** The wind of the forecast: « 37 km/h O · rafales 63 », « prévision du modèle ». */
  data class Wind(val kmh: Int, val fromDeg: Double?, val dir: String, val gust: Int?, val note: String)

  data class DayView(val label: String, val sky: Sky?, val maxC: Double?, val minC: Double?, val today: Boolean)

  /**
   * The whole widget. [age] says when the data was read once it is old (« Données de 21 h 37, il y a 2 h »), null while
   * it is fresh; the rain of the hour is then unknown, as on the site's widget.
   */
  data class View(
    val name: String,
    val tempC: Double?,
    val temp: String?,
    val sky: Sky?,
    val condition: String,
    val warnings: Warnings,
    val rain: Rain,
    val wind: Wind?,
    val days: List<DayView>,
    val age: String?,
  ) {
    /** The age without « il y a … », for the narrowest size: « Données de 21 h 37 ». */
    val ageShort: String?
      get() = age?.substringBefore(", il y a")
  }

  fun view(name: String, s: Snapshot, nowUtc: Long): View {
    val p = s.point
    val old = p.serverUtc > 0 && nowUtc - p.serverUtc >= Words.OLD_READ_S
    val day = dayAt(p, nowUtc)
    val condition =
      listOfNotNull(
          p.weatherCode?.let { Words.weatherAt(it, day) },
          p.feelsLikeC?.let { "ressenti ${Words.degrees(it)}" },
        )
        .joinToString(" · ")
    return View(
      name = name,
      tempC = p.tempC,
      temp = p.tempC?.let(Words::degrees),
      sky = skyOf(p.weatherCode, day != false),
      condition = condition,
      warnings = warnings(s, nowUtc),
      rain = rain(p, nowUtc, old),
      wind = wind(p),
      days = days(p, nowUtc),
      age = if (old) "Données ${Words.readTime(p.serverUtc, nowUtc, p.utcOffsetS)}" else null,
    )
  }

  /**
   * The example the home screen's widget list shows (Android 15 and later): made-up values for « Mon lieu », never a
   * real read, with the days from the phone's today.
   */
  fun sample(nowUtc: Long, offsetS: Int): View {
    val today = Words.dayKey(nowUtc, offsetS)
    val week = listOf(Triple(2, 16.0, 9.0), Triple(61, 14.0, 8.0), Triple(3, 13.0, 7.0), Triple(1, 15.0, 6.0), Triple(80, 12.0, 7.0))
    return View(
      name = "Mon lieu",
      tempC = 14.0,
      temp = Words.degrees(14.0),
      sky = skyOf(2, true),
      condition = "${Words.weatherAt(2, true)} · ressenti ${Words.degrees(12.0)}",
      warnings = Warnings(Vigil.State.None, null, "Aucune vigilance en cours", null, "", 0),
      rain = Rain(RainHour.Status.None, "Pas de pluie dans l’heure", "Pas de pluie", "prévision du modèle", List(4) { Bar(8, Tone.Dry) }),
      wind = Wind(22, 250.0, compass(250.0), 41, "prévision du modèle"),
      days = week.mapIndexed { i, (code, max, min) -> DayView(dayLabel(today + i), skyOf(code, true), max, min, i == 0) },
      age = null,
    )
  }

  /** Day or night now: the hour of `hourly` under way, else the first one; null when the API did not say. */
  internal fun dayAt(p: PointNow, nowUtc: Long): Boolean? =
    (p.hours.firstOrNull { nowUtc >= it.timeUtc && nowUtc < it.timeUtc + 3600 } ?: p.hours.firstOrNull())?.isDay

  internal fun warnings(s: Snapshot, nowUtc: Long): Warnings {
    val v = Vigil.view(s.vigilances, nowUtc)
    return when (v.state) {
      Vigil.State.Warnings ->
        Warnings(
          state = v.state,
          level = v.level,
          title = Vigil.levelTitle(v.level),
          until = v.until?.let { Vigil.until(it, nowUtc, s.point.utcOffsetS) },
          detail = v.labels.joinToString(" · "),
          more = v.more,
        )
      Vigil.State.None -> Warnings(v.state, null, "Aucune vigilance en cours", null, "", 0)
      Vigil.State.NoSource -> Warnings(v.state, null, "Pas de vigilance officielle lue ici", null, "", 0)
      Vigil.State.Unread -> Warnings(v.state, null, "Vigilances non lues", null, "", 0)
    }
  }

  /** The rain of the hour and its bars, as the site's `rainView`; nothing when the reading is old ([old]). */
  internal fun rain(p: PointNow, nowUtc: Long, old: Boolean): Rain {
    val v = if (old) RainHour.View(RainHour.Status.Unknown) else RainHour.view(p, nowUtc)
    val short =
      when (v.status) {
        RainHour.Status.None -> "Pas de pluie"
        RainHour.Status.Unknown -> "Pluie non lue"
        else -> RainHour.title(v)
      }
    return Rain(v.status, RainHour.title(v), short, RainHour.detail(v), if (v.status == RainHour.Status.Unknown) emptyList() else bars(p))
  }

  /** A dry step is a low bar in the rule's colour; a wet one rises with the square root of its rate (« Light » < 1 mm/h < « Rain » < 3 mm/h ≤ « Heavy »). */
  internal fun bars(p: PointNow): List<Bar> {
    val rain = p.rainSoon ?: return emptyList()
    if (rain.mmPerStep.isEmpty() || rain.stepMinutes <= 0) return emptyList()
    val rates = rain.mmPerStep.map { it * 60 / rain.stepMinutes }
    val top = max(3.0, rates.max())
    return rain.mmPerStep.mapIndexed { i, mm ->
      if (mm <= RainHour.WET_STEP_MM) Bar(8, Tone.Dry)
      else {
        val r = rates[i]
        Bar(min(100, max(22, (sqrt(r / top) * 100).roundToInt())), if (r < 1) Tone.Light else if (r < 3) Tone.Rain else Tone.Heavy)
      }
    }
  }

  /**
   * At most [max] bars: a home screen draws at most ten children in a row. Neighbouring steps then share a bar, the
   * wettest of them (the API serves four steps of a quarter of an hour today: nothing changes).
   */
  fun fewer(bars: List<Bar>, max: Int = 10): List<Bar> {
    if (bars.size <= max) return bars
    val per = (bars.size + max - 1) / max
    return bars.chunked(per).map { group -> group.maxWith(compareBy<Bar> { it.tone.ordinal }.thenBy { it.pct }) }
  }

  internal fun wind(p: PointNow): Wind? {
    val kmh = p.windKmh ?: return null
    return Wind(kmh.roundToInt(), p.windDeg, compass(p.windDeg), p.gustKmh?.roundToInt(), "prévision du modèle")
  }

  private val POINTS = listOf("N", "NE", "E", "SE", "S", "SO", "O", "NO")

  /** One of eight points, where the wind comes from (the site's `compass`); empty when unknown. */
  fun compass(deg: Double?): String = if (deg == null) "" else POINTS[(((deg % 360 + 360) % 360) / 45).roundToInt() % 8]

  /** « 37 km/h » with its no-break space: what the wind line writes after the number. */
  const val KMH = "${NBSP}km/h"

  /** The days of the forecast from the place's today on, five at most, today first (the site's `daysView`). */
  internal fun days(p: PointNow, nowUtc: Long): List<DayView> {
    val today = Words.dayKey(nowUtc, p.utcOffsetS)
    return p.days
      .mapNotNull { d -> dateKey(d.date)?.let { it to d } }
      .filter { (key, _) -> key >= today }
      .take(5)
      .map { (key, d) -> DayView(dayLabel(key), skyOf(d.code, true), d.tmaxC, d.tminC, key == today) }
  }

  /** « Lun » … « Dim »: the short day of the site's widget (`dayLabel`), without its dot. */
  fun dayLabel(key: Long): String = Words.dayShort(key).removeSuffix(".")

  /** Days since 1970-01-01 of a « 2026-11-22 » date; null when it does not read. */
  fun dateKey(date: String): Long? {
    val m = DATE.matchEntire(date) ?: return null
    val (y, mo, d) = m.destructured
    return daysFromCivil(y.toLong(), mo.toInt(), d.toInt())
  }

  private val DATE = Regex("""(\d{4})-(\d{2})-(\d{2})""")

  /** The civil calendar without java.time (the app runs from Android 7): the inverse of [Words.dayOfMonth]. */
  private fun daysFromCivil(year: Long, month: Int, day: Int): Long {
    val y = if (month <= 2) year - 1 else year
    val era = Math.floorDiv(y, 400L)
    val yoe = y - era * 400
    val mp = (month + 9) % 12
    val doy = (153 * mp + 2) / 5 + day - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
  }
}
