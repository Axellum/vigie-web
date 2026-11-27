package fr.auxfilsdesidees.vigie.widget

import fr.auxfilsdesidees.vigie.data.Day
import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.RainNowcast
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.TideExtreme
import fr.auxfilsdesidees.vigie.data.Vigilances
import fr.auxfilsdesidees.vigie.ui.Vigil
import fr.auxfilsdesidees.vigie.ui.Words
import fr.auxfilsdesidees.vigie.ui.board.HomeBoard
import kotlin.math.PI
import kotlin.math.cos

/**
 * What the widgets show in the look of the home page of the Home Assistant card (piste B of the sketches chosen on
 * 2026-11-27: « the columns first »): the weather now in the header, the rain of the hour on one line with its twelve
 * 5-minute bars, the « Lueur » columns of the next hours, the days. Everything comes from the card's own rules
 * ([HomeBoard]), so the widgets, the app and the card never say two things. Pure: tested on the JVM.
 */
object BoardWidget {
  /**
   * The rain of the hour: [head] (« Pluie dans 40 min »), [sub] (« faible, puis modérée »), the bars still to come in
   * mm/h and the hours written under them. No bars when the API serves no nowcast or the read is too old: [head] then
   * says so (« Pluie de l’heure non lue »).
   */
  data class Rain(val head: String, val sub: String, val bars: List<HomeBoard.Bar>, val marks: List<String>) {
    /** The hour the bars end at, written at the end of the compact line when there is no warning to show there. */
    val end: String?
      get() = marks.lastOrNull()
  }

  data class View(
    val name: String,
    /** The icon of the weather now (`eclaircies`, `lune`…), null when the API did not say. */
    val kind: String?,
    val tempC: Double?,
    val warnings: WidgetModel.Warnings,
    val rain: Rain,
    /** « Données de 21 h 37, il y a 2 h » once the read is old, null while it is fresh. */
    val age: String?,
    /** The next hours one by one (12 at most), and by three hours (8 at most): the card's slots. */
    val hourly: List<HomeBoard.HourSlot>,
    val byThree: List<HomeBoard.HourSlot>,
    /** The days from today, five at most (none under two, as the card). */
    val days: List<HomeBoard.DayColumn>,
    val offsetS: Int,
  )

  fun view(name: String, s: Snapshot, now: Long): View {
    val p = s.point
    val base = WidgetModel.view(name, s, now)
    val tile = HomeBoard.rainTile(p, now)
    val rain =
      if (tile != null && base.age == null) Rain(tile.head, tile.sub, tile.bars, tile.marks)
      else Rain(if (base.age != null) "Pluie de l’heure non lue" else base.rain.title, "", emptyList(), emptyList())
    return View(
      name = name,
      kind = HomeBoard.now(p, now).kind,
      tempC = p.tempC,
      warnings = base.warnings,
      rain = rain,
      age = base.age,
      hourly = slots(p, now, 1).take(12),
      byThree = slots(p, now, 3),
      days = HomeBoard.days(p, now, 5),
      offsetS = p.utcOffsetS,
    )
  }

  /**
   * The slots of [step] hours (1 or 3) as the card cuts them ([HomeBoard.hours]): its step comes from the width it is
   * given, so the width that makes it pick [step] is passed (34 per hour by the hour, anything narrow by three hours).
   */
  fun slots(p: PointNow, now: Long, step: Int): List<HomeBoard.HourSlot> =
    HomeBoard.hours(p, now, if (step == 1) 24 * 34f else 1f)?.takeIf { it.step == step }?.slots.orEmpty()

  /** The three formats of the place widget. */
  enum class Format { Compact, Medium, Large }

  /**
   * The format for the room the home screen gives (dp, the frame included): a single row of the grid is the compact one,
   * a square of four the large one, as the earlier widget.
   */
  fun format(width: Float, height: Float): Format =
    when {
      height < 150 -> Format.Compact
      height < 300 || width < 250 -> Format.Medium
      else -> Format.Large
    }

  /**
   * The words of the warning's pill: the first hazard and the level (« Vent jaune »), the others counted (« Vent jaune
   * +1 »); the level alone when the hazards are unknown; null without a warning.
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
    listOfNotNull(v.name, v.tempC?.let { "${HomeBoard.fmt(it)}°" }, v.age ?: v.rain.head, pill(v.warnings) ?: v.warnings.short).joinToString(", ")

  /**
   * The tide and the surf of the favourite spot under the frise's columns: its [spot] name, its high and low waters, the
   * surf's verdict hour by hour from [startUtc] (null: unknown or night).
   */
  data class Sea(val spot: String, val tide: List<TideExtreme>, val startUtc: Long, val surf: List<String?>) {
    /** The surf's verdict of the hour holding [t]. */
    fun surfAt(t: Long): String? = surf.getOrNull(Math.floorDiv(t - startUtc, 3600L).toInt())
  }

  /** The sea of [s]'s favourite spot, read as the frise reads it ([FriseModel.strip]); null without a spot. */
  fun sea(s: Snapshot, now: Long): Sea? = seaOf(FriseModel.strip(s, now))

  fun seaOf(strip: FriseModel.Strip): Sea? = strip.spot?.let { Sea(it, strip.tide, strip.startUtc, strip.sea) }

  /** The highest of the slots' temperatures and the lowest, on 4 °C at least: a flat day stays flat (the card's curve). */
  fun tempScale(temps: List<Double>): Pair<Double, Double> {
    val mn = temps.min()
    val mx = temps.max()
    val amp = maxOf(4.0, mx - mn)
    val low = (mn + mx) / 2 - amp / 2
    return low to low + amp
  }

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
    val week = listOf(Triple(2, 15.0, 8.0), Triple(61, 13.0, 7.0), Triple(3, 12.0, 6.0), Triple(1, 14.0, 5.0), Triple(80, 11.0, 6.0))
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
