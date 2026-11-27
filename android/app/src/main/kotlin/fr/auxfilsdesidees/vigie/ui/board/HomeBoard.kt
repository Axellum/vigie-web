package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.HourWeather
import fr.auxfilsdesidees.vigie.data.PointNow
import kotlin.math.PI
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * What the home page says, worked out as the Home Assistant card works it out (`vigie-card.js` of vigie-api, its home page:
 * `nowBlock`, `rainTile`, `seasonPill`, `hoursBlock`, `daysBlock`), so the app and the card never say two things. Pure
 * functions of the point and the clock: the views of `HomeBoardView.kt` only draw what comes out of here. The words are
 * the card's French ones.
 */
object HomeBoard {
  private const val NBSP = ' '

  // ------------------------------------------------------------------------------------------------------- numbers, clock

  /** A number as the card writes it in French: rounded to [digits], a comma, « – » without one. */
  fun fmt(v: Double?, digits: Int = 0): String {
    if (v == null || v.isNaN()) return "–"
    val s =
      if (digits == 0) v.roundToInt().toString()
      else {
        val p = Math.pow(10.0, digits.toDouble())
        val r = (v * p).roundToLong() / p
        if (r == floor(r)) r.toLong().toString() else r.toString()
      }
    return s.replace('.', ',')
  }

  /** « 15 h 42 », « 15 h » on the hour, at the place. */
  fun hm(ts: Long, offsetS: Int): String {
    val s = Math.floorMod(ts + offsetS, 86_400L)
    val h = s / 3600
    val m = s % 3600 / 60
    return if (m == 0L) "$h${NBSP}h" else "$h${NBSP}h${NBSP}${m.toString().padStart(2, '0')}"
  }

  /** « 15 h »: the hour alone. */
  fun hourOnly(ts: Long, offsetS: Int): String = "${Math.floorMod(ts + offsetS, 86_400L) / 3600}${NBSP}h"

  /** The local day of [ts] at the place, as days since 1970-01-01. */
  fun localDay(ts: Long, offsetS: Int): Long = Math.floorDiv(ts + offsetS, 86_400L)

  /** Days since 1970-01-01 of a date `2026-11-27`; null when it does not read. */
  fun dayOf(iso: String): Long? {
    if (iso.length < 10) return null
    val y = iso.substring(0, 4).toLongOrNull() ?: return null
    val m = iso.substring(5, 7).toLongOrNull() ?: return null
    val d = iso.substring(8, 10).toLongOrNull() ?: return null
    val yy = if (m <= 2) y - 1 else y
    val era = Math.floorDiv(yy, 400L)
    val yoe = yy - era * 400
    val doy = (153 * (if (m > 2) m - 3 else m + 9) + 2) / 5 + d - 1
    return era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468
  }

  private val DAY_NAMES = listOf("Jeu", "Ven", "Sam", "Dim", "Lun", "Mar", "Mer") // 1970-01-01 was a Thursday

  /** « Sam », the short name of a day (days since 1970). */
  fun dayName(day: Long): String = DAY_NAMES[Math.floorMod(day, 7L).toInt()]

  /** The day of the month of a day (days since 1970). */
  fun dayOfMonth(day: Long): Int {
    val z = day + 719_468
    val era = Math.floorDiv(z, 146_097L)
    val doe = z - era * 146_097
    val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
    val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    val mp = (5 * doy + 2) / 153
    return (doy - (153 * mp + 2) / 5 + 1).toInt()
  }

  /** « demain », « après-demain », a day's short name in small letters, or nothing for today; then the hour when asked. */
  fun dayWord(ts: Long, now: Long, offsetS: Int, withHour: Boolean): String {
    val d = localDay(ts, offsetS) - localDay(now, offsetS)
    val day = when (d) { 0L -> ""; 1L -> "demain"; 2L -> "après-demain"; else -> dayName(localDay(ts, offsetS)).lowercase() }
    return listOf(day, if (withHour) hm(ts, offsetS) else "").filter { it.isNotEmpty() }.joinToString(" ")
  }

  // ---------------------------------------------------------------------------------------------------------- the sky

  /** Is the sun up at a place (refraction and the sun's radius: −0.833°)? The card's `sunUp`. */
  fun sunUp(lat: Double, lon: Double, ts: Long): Boolean {
    val d = ts / 86_400.0 - 10_957.5
    val g = rad(357.529 + 0.98560028 * d)
    val q = 280.459 + 0.98564736 * d
    val l = rad(q + 1.915 * sin(g) + 0.02 * sin(2 * g))
    val e = rad(23.439 - 0.00000036 * d)
    val ra = atan2(cos(e) * sin(l), cos(l))
    val dec = asin(sin(e) * sin(l))
    val gmst = (18.697374558 + 24.06570982441908 * d) % 24
    val ha = rad(gmst * 15 + lon) - ra
    return asin(sin(rad(lat)) * sin(dec) + cos(rad(lat)) * cos(dec) * cos(ha)) > rad(-0.833)
  }

  private fun rad(d: Double) = d * PI / 180

  /** The icon of a WMO weather code, as the Meridien screen chooses it. */
  fun wmoKind(code: Int?): String? =
    when {
      code == null -> null
      code == 0 -> "soleil"
      code <= 2 -> "eclaircies"
      code == 45 || code == 48 -> "brouillard"
      code in 51..55 -> "bruine"
      code == 56 || code == 57 || code == 66 || code == 67 -> "pluie_verglacante"
      code == 65 -> "pluie_forte"
      code in 51..67 -> "pluie"
      code == 75 -> "neige_forte"
      code == 77 -> "grains_de_neige"
      code in 71..77 -> "neige"
      code == 80 || code == 81 -> "averses"
      code == 82 -> "averses_violentes"
      code == 85 || code == 86 -> "averses_neige"
      code == 96 || code == 99 -> "orage_grele"
      code >= 95 -> "orage"
      else -> "couvert"
    }

  private val NIGHT = mapOf("soleil" to "lune", "eclaircies" to "nuit_nuageuse", "averses" to "averses_nuit", "averses_neige" to "averses_neige_nuit")

  /** The night icon of a kind when [isDay] is false. */
  fun atNight(kind: String?, isDay: Boolean?): String? = if (isDay == false) NIGHT[kind] ?: kind else kind

  private val WMO =
    mapOf(
      0 to "Ciel clair", 1 to "Peu nuageux", 2 to "Éclaircies", 3 to "Couvert", 45 to "Brouillard", 48 to "Brouillard givrant",
      51 to "Bruine faible", 53 to "Bruine", 55 to "Bruine forte", 56 to "Bruine verglaçante", 57 to "Bruine verglaçante",
      61 to "Pluie faible", 63 to "Pluie", 65 to "Forte pluie", 66 to "Pluie verglaçante", 67 to "Pluie verglaçante",
      71 to "Neige faible", 73 to "Neige", 75 to "Forte neige", 77 to "Grains de neige", 80 to "Averses faibles", 81 to "Averses",
      82 to "Fortes averses", 85 to "Averses de neige", 86 to "Fortes averses de neige", 95 to "Orage", 96 to "Orage avec grêle",
      99 to "Orage avec grêle",
    )

  /** The share of sun of a weather code, when the hours give no cloud cover. */
  fun sunOfCode(code: Int?): Double =
    when {
      code == null -> 0.3
      code == 0 -> 0.9
      code == 1 -> 0.75
      code == 2 -> 0.5
      code == 3 -> 0.12
      code <= 48 -> 0.1
      else -> 0.06
    }

  /** The share of sun of some hours: 1 − the cloud cover of their hours of daylight; null without one. */
  fun sunOfHours(hours: List<HourWeather>): Double? {
    val lit = hours.filter { it.isDay != false && it.cloudCoverPct != null }
    return if (lit.isEmpty()) null else lit.sumOf { 1 - it.cloudCoverPct!! / 100 } / lit.size
  }

  /** Day or night at an hour: its flag, else the sun [midS] seconds after its start, else day. */
  fun isDayAt(p: PointNow, h: HourWeather, midS: Long = 1800): Boolean =
    h.isDay ?: if (p.lat != null && p.lon != null) sunUp(p.lat, p.lon, h.timeUtc + midS) else true

  /** Where the wind of some hours comes from: the mean of their vectors weighted by the speed; null without wind. */
  fun windFrom(hours: List<HourWeather>): Double? {
    var x = 0.0
    var y = 0.0
    for (h in hours) if (h.windDeg != null && h.windKmh != null) {
      x += sin(rad(h.windDeg)) * h.windKmh
      y += cos(rad(h.windDeg)) * h.windKmh
    }
    return if (x == 0.0 && y == 0.0) null else (atan2(x, y) * 180 / PI + 360) % 360
  }

  /** The hours from the hour under way. */
  fun currentHours(p: PointNow, now: Long): List<HourWeather> = p.hours.filter { it.timeUtc >= now - Math.floorMod(now, 3600L) }

  // ------------------------------------------------------------------------------------------------------------- now

  /** The weather now: icon, temperature, its words, feeling, wind. */
  data class Now(val kind: String?, val temp: Double?, val label: String?, val feels: Double?, val humidity: Double?, val wind: Double?, val gust: Double?, val deg: Double?)

  fun now(p: PointNow, now: Long): Now {
    val first = currentHours(p, now).firstOrNull()
    val isDay = first?.isDay ?: if (p.lat != null && p.lon != null) sunUp(p.lat, p.lon, now) else null
    var label = p.weatherCode?.let { WMO[it] }
    if (isDay == false && p.weatherCode == 0) label = "Nuit claire"
    return Now(atNight(wmoKind(p.weatherCode), isDay), p.tempC, label, p.feelsLikeC, p.humidityPct, p.windKmh, p.gustKmh, p.windDeg)
  }

  /** The highest gust of the next hours: AROME-PI's 15-minute steps where there are, else the next 12 hours. */
  fun gustPeak(p: PointNow, now: Long): Pair<Double, Long>? {
    val steps = p.shortTerm?.steps.orEmpty().filter { it.gustKmh != null && it.timeUtc + 900 > now }
    if (steps.isNotEmpty()) return steps.maxBy { it.gustKmh!! }.let { it.gustKmh!! to it.timeUtc }
    val hours = currentHours(p, now).take(12).filter { it.gustKmh != null }
    return hours.maxByOrNull { it.gustKmh!! }?.let { it.gustKmh!! to it.timeUtc }
  }

  /** The trend of the pressure, the rule of the Vigie site: 1 hPa or more in 3 hours. « ↗ », « ↘ », « → » or nothing. */
  fun pressureTrend(p: PointNow, now: Long): String {
    val ph = p.pressureHistory
    if (ph.size < 2) return ""
    val last = ph.last()
    if (now - last.timeUtc > 3 * 3600) return ""
    val target = last.timeUtc - 10_800
    val old = ph.minBy { kotlin.math.abs(it.timeUtc - target) }
    val hours = (last.timeUtc - old.timeUtc) / 3600.0
    if (hours < 1.5) return ""
    val per3 = (last.hpa - old.hpa) * 3 / hours
    return if (per3 >= 1) "↗" else if (per3 <= -1) "↘" else "→"
  }

  /** The next sunrise and sunset to the minute, and whether the sun is up now; null without the point. */
  data class SunTimes(val up: Boolean, val rise: Long?, val set: Long?)

  fun sunTimes(p: PointNow, now: Long): SunTimes? {
    val lat = p.lat ?: return null
    val lon = p.lon ?: return null
    val upNow = sunUp(lat, lon, now)
    var rise: Long? = null
    var set: Long? = null
    var prev = upNow
    var i = 1
    while (i <= 156 && !(rise != null && set != null)) {
      val ts = now + i * 600L
      val u = sunUp(lat, lon, ts)
      if (u != prev) {
        var a = ts - 600
        var b = ts
        while (b - a > 60) {
          val m = (a + b) / 2
          if (sunUp(lat, lon, m) == prev) a = m else b = m
        }
        if (u && rise == null) rise = b
        if (!u && set == null) set = b
        prev = u
      }
      i++
    }
    return SunTimes(upNow, rise, set)
  }

  private val AQI_FROM = intArrayOf(20, 40, 60, 80, 100)
  private val AQI_TONE = listOf("vert", "vert", "jaune", "orange", "rouge", "rouge")
  private val AQI_WORD = listOf("bon", "assez bon", "moyen", "dégradé", "mauvais", "très mauvais")

  /** The word and the tone of the European air quality index, in the bands of the site. */
  fun air(aqi: Double): Pair<String, String> {
    val i = AQI_FROM.count { aqi >= it }
    return AQI_WORD[i] to AQI_TONE[i]
  }

  // ------------------------------------------------------------------------------------------------------------- rain

  /** A step of the rain of the hour: its rate in mm/h, its length, and its start ([known] false: counted from now). */
  data class Bar(val r: Double, val minutes: Int, val known: Boolean, val at: Long)

  /** The steps of the nowcast still to come: twelve 5-minute rates (PIAF) or four 15-minute amounts, in mm/h. */
  fun nowcastBars(p: PointNow, now: Long): List<Bar> {
    val rn = p.rainSoon ?: return emptyList()
    val rates = rn.rate5mMmH?.takeIf { it.isNotEmpty() }
    val minutes = if (rates != null) 5 else rn.stepMinutes
    val start = rn.startUtc
    val series = rates ?: rn.mmPerStep.map { it * 60 / minutes }
    return series.mapIndexed { i, r -> Bar(r, minutes, start != null, (start ?: now) + i * minutes * 60L) }
      .filter { !it.known || it.at + it.minutes * 60 > now }
  }

  /** Minutes to the first rain of the hour: 0 when it rains now, −1 for none in the hour, null without a nowcast. */
  fun nowcastFirst(p: PointNow, now: Long): Int? {
    val rn = p.rainSoon ?: return null
    val rates = rn.rate5mMmH?.takeIf { it.isNotEmpty() }
    val series = rates ?: rn.mmPerStep
    if (series.isEmpty()) return null
    val minutes = if (rates != null) 5 else rn.stepMinutes
    val start = rn.startUtc
    for (i in series.indices) {
      if (!(series[i] > 0)) continue
      if (start == null) return i * minutes
      val from = start + i * minutes * 60L
      if (from + minutes * 60 <= now) continue
      return maxOf(0, ceil((from - now) / 60.0).toInt())
    }
    return -1
  }

  private val SNOWY = setOf("snow", "wet_snow", "snow_pellets")

  /** The kind of precipitation of a WMO code, in the words of AROME-PI. */
  fun wmoPrecip(code: Int?): String =
    when {
      code == null -> "rain"
      code in 71..77 || code == 85 || code == 86 -> "snow"
      code == 56 || code == 57 || code == 66 || code == 67 -> "freezing"
      code in 51..55 -> "drizzle"
      else -> "rain"
    }

  /** The kind of precipitation at a time: AROME-PI's step there, else the hour, else the weather now. */
  fun kindAt(p: PointNow, now: Long, ts: Long): String {
    val st = p.shortTerm
    val m = (st?.intervalMinutes ?: 15) * 60L
    st?.steps?.firstOrNull { it.timeUtc <= ts && ts < it.timeUtc + m && it.precipitation != null && it.precipitation != "none" }?.let { return it.precipitation!! }
    val h = currentHours(p, now).firstOrNull { it.timeUtc <= ts && ts < it.timeUtc + 3600 }
    return wmoPrecip(h?.weatherCode ?: p.weatherCode)
  }

  /** One slot of the rain to come: [wet], its kind in the words of AROME-PI when known, its rate in mm/h when known. */
  data class Slot(val from: Long, val to: Long, val wet: Boolean, val r: Double?, val kind: String? = null)

  /** The rain from now on: the nowcast, then AROME-PI by 15 minutes, then the hours; each only after the one before. */
  fun rainSlots(p: PointNow, now: Long): List<Slot> {
    val out = ArrayList<Slot>()
    var end = now
    fun push(from: Long, to: Long, wet: Boolean, r: Double?, kind: String?) {
      if (to <= end) return
      out += Slot(maxOf(from, end), to, wet, r, kind)
      end = to
    }
    for (b in nowcastBars(p, now)) push(b.at, b.at + b.minutes * 60, b.r > 0, b.r, null)
    val st = p.shortTerm
    val m = (st?.intervalMinutes ?: 15) * 60L
    for (s in st?.steps.orEmpty()) if (s.precipitation != null) push(s.timeUtc, s.timeUtc + m, s.precipitation != "none", null, s.precipitation.takeIf { it != "none" })
    for (h in currentHours(p, now)) if (h.rainMm != null) push(h.timeUtc, h.timeUtc + 3600, h.rainMm >= 0.1, h.rainMm, wmoPrecip(h.weatherCode))
    return out
  }

  private fun intensity(r: Double): String = if (r >= 3) "forte" else if (r >= 1) "modérée" else "faible"

  /** After a dry hour: when the next rain comes, or until when it stays dry; empty when the forecast does not say. */
  fun nextRain(p: PointNow, now: Long, after: Long): String {
    val slots = rainSlots(p, now)
    val wet = slots.firstOrNull { it.wet && it.to > after }
    fun dayAndHour(ts: Long): Pair<String, String> = dayWord(ts, now, p.utcOffsetS, false).let { if (it.isEmpty()) "" else "$it " } to hm(ts, p.utcOffsetS)
    if (wet != null) {
      val (d, t) = dayAndHour(maxOf(wet.from, after))
      return "Prochaine pluie ${d}vers $t"
    }
    val last = slots.lastOrNull()
    if (last != null && last.to > after) {
      val (d, t) = dayAndHour(last.to)
      return "Sec jusqu’à $d$t"
    }
    return ""
  }

  /** The rain tile: its two lines, its bars (mm/h), and the hours written under them. */
  data class RainTile(val head: String, val sub: String, val bars: List<Bar>, val marks: List<String>)

  private val STALE = Regex("""\(stale""", RegexOption.IGNORE_CASE)

  /** A reading older than half an hour (a copy kept without network), or flagged stale by the API: its hour is not read. */
  fun nowcastStale(p: PointNow, now: Long): Boolean =
    (p.serverUtc > 0 && now - p.serverUtc > fr.auxfilsdesidees.vigie.ui.RainHour.MAX_AGE_S) || STALE.containsMatchIn(p.provider.orEmpty())

  /**
   * The tile, null without a nowcast. A reading older than half an hour (a copy kept without network) or flagged stale by the
   * API says nothing of the hour to come: « Pluie de l’heure non lue », as the rest of the app (`RainHour`).
   */
  fun rainTile(p: PointNow, now: Long): RainTile? {
    val first = nowcastFirst(p, now) ?: return null
    if (nowcastStale(p, now)) return RainTile("Pluie de l’heure non lue", "", emptyList(), emptyList())
    val bars = nowcastBars(p, now)
    val wet = bars.filter { it.r > 0 }
    val snow = first >= 0 && kindAt(p, now, now + first * 60L) in SNOWY
    val head =
      when {
        first < 0 -> "Pas de pluie dans l’heure"
        first == 0 -> if (snow) "Il neige" else "Il pleut"
        else -> if (snow) "Neige dans $first${NBSP}min" else "Pluie dans $first${NBSP}min"
      }
    val sub =
      if (wet.isNotEmpty()) {
        val a = intensity(wet[0].r)
        val b = intensity(wet.maxOf { it.r })
        if (a == b) a else "$a, puis $b"
      } else nextRain(p, now, now + 3600)
    val marks =
      if (bars.isNotEmpty() && bars[0].known) listOf(0, (bars.size - 1) / 2, bars.size - 1).distinct().map { hm(bars[it].at, p.utcOffsetS) }
      else emptyList()
    return RainTile(head, sub, bars, marks)
  }

  // ----------------------------------------------------------------------------------------------------------- season

  /** The strongest line of the season: its glyph, its tone, its words, the others counted, a detail. */
  data class SeasonPill(val glyph: String, val tone: String, val text: String, val more: Int, val detail: String)

  private val TONE_RANK = mapOf("neutre" to 0, "vert" to 0, "jaune" to 1, "orange" to 2, "rouge" to 3)
  private val DROUGHT_RANK = mapOf("vigilance" to 1, "alerte" to 2, "alerte_renforcee" to 3, "crise" to 4)
  private val DROUGHT_TONE = mapOf("vigilance" to "jaune", "alerte" to "orange", "alerte_renforcee" to "orange", "crise" to "rouge")
  private val DROUGHT_WORD = mapOf("vigilance" to "vigilance", "alerte" to "alerte", "alerte_renforcee" to "alerte renforcée", "crise" to "crise")
  private val AVALANCHE_WORD = listOf("", "faible", "limité", "marqué", "fort", "très fort")
  private val POLLEN_SPECIES = listOf("alder", "birch", "grass", "mugwort", "olive", "ragweed")
  private val SPECIES = mapOf("alder" to "aulne", "birch" to "bouleau", "grass" to "graminées", "mugwort" to "armoise", "olive" to "olivier", "ragweed" to "ambroisie")

  /**
   * Avalanches, drought and pollen when there is something to say (forest fires come from another answer the app does not
   * read yet), the strongest first; the card's `seasonItems` then `seasonPill` (on the home page the detail goes when
   * « +n » is there).
   */
  fun seasonPill(p: PointNow, now: Long): SeasonPill? {
    data class Item(val glyph: String, val tone: String, val text: String, val detail: String)
    val items = ArrayList<Item>()
    val av = p.season.avalanche
    val l = av?.maxDangerLevel
    if (av != null && av.status == "active" && l != null && l in 1..5 && (av.validUntilUtc == null || av.validUntilUtc > now)) {
      val tone = if (l <= 1) "vert" else if (l == 2) "jaune" else if (l == 3) "orange" else "rouge"
      items += Item("montagne", tone, "Avalanches · risque $l (${AVALANCHE_WORD[l]})", av.regionName.orEmpty())
    }
    val dr = p.season.drought
    val rank = DROUGHT_RANK[dr?.maxLevel] ?: 0
    if (dr != null && dr.status == "available" && rank >= DROUGHT_RANK.getValue("alerte")) {
      items += Item("secheresse", DROUGHT_TONE.getValue(dr.maxLevel!!), "Sécheresse · ${DROUGHT_WORD.getValue(dr.maxLevel)}", if (dr.restrictionsInForce == true) "restrictions d’eau" else "")
    }
    val pol = p.season.pollen
    if (pol != null) {
      val today = localDay(now, p.utcOffsetS)
      val days = pol.days.filter { (dayOf(it.date) ?: Long.MIN_VALUE) >= today }
      val peaks =
        POLLEN_SPECIES.mapNotNull { s ->
          val peak = maxOf(0.0, days.mapNotNull { it.peaks[s] }.maxOrNull() ?: 0.0, pol.now[s] ?: 0.0)
          if (peak >= 1) s to peak else null
        }.sortedByDescending { it.second }
      if (peaks.isNotEmpty()) {
        val (s, peak) = peaks[0]
        items += Item("fleur", "neutre", "Pollens · ${SPECIES.getValue(s)}", "jusqu’à ${fmt(peak, 1)}${NBSP}grains/m³")
      }
    }
    if (items.isEmpty()) return null
    val sorted = items.sortedByDescending { TONE_RANK[it.tone] ?: 0 }
    val top = sorted[0]
    val more = sorted.size - 1
    return SeasonPill(top.glyph, top.tone, top.text, more, if (more > 0) "" else top.detail)
  }

  // ------------------------------------------------------------------------------------------------------------ hours

  /** A column of the hours: its start, temperature, icon, sun, rain, its chance, wind and gust, where the wind comes from. */
  data class HourSlot(
    val ts: Long,
    val temp: Double,
    val kind: String?,
    val day: Boolean,
    val sun: Double?,
    val mm: Double?,
    val chance: Double?,
    val wind: Double?,
    val gust: Double?,
    val deg: Double?,
  )

  data class Hours(val step: Int, val slots: List<HourSlot>)

  /**
   * The next 24 hours by 1, 2 or 3 hours, as the width [w] allows (a column of at least 34 by hour, 28 by 2 hours): the
   * temperature at the start of the slot, its most significant weather (the highest code), the sum of its rain, its highest
   * chance of rain, its mean wind and its highest gust. Null under 4 columns.
   */
  fun hours(p: PointNow, now: Long, w: Float): Hours? {
    val hours = currentHours(p, now).filter { it.tempC != null }
    val step = if (w / 24 >= 34) 1 else if (w / 12 >= 28) 2 else 3
    val n = minOf(hours.size / step, 24 / step)
    if (n < 4) return null
    val slots =
      (0 until n).map { i ->
        val g = hours.subList(i * step, (i + 1) * step)
        val code = g.mapNotNull { it.weatherCode }.maxOrNull()
        val day = isDayAt(p, g[0], step * 1800L)
        val mm = g.mapNotNull { it.rainMm }
        val chance = g.mapNotNull { it.rainProbabilityPct }
        val wind = g.mapNotNull { it.windKmh }
        val gust = g.mapNotNull { it.gustKmh }
        HourSlot(
          ts = g[0].timeUtc,
          temp = g[0].tempC!!,
          kind = atNight(wmoKind(code), day),
          day = day,
          sun = if (day) sunOfHours(g) ?: sunOfCode(code) else null,
          mm = if (mm.isEmpty()) null else mm.sum(),
          chance = chance.maxOrNull(),
          wind = if (wind.isEmpty()) null else wind.average(),
          gust = gust.maxOrNull(),
          deg = windFrom(g),
        )
      }
    return Hours(step, slots)
  }

  // ------------------------------------------------------------------------------------------------------------- days

  /**
   * A column of the days: its name, icon, highest and lowest, rain and its chance, strongest wind, gust, direction, sun;
   * [sunshineH] its hours of sunshine when the answer gives them, [share] their share of its daylight.
   */
  data class DayColumn(
    val name: String,
    val nameShort: String,
    val kind: String?,
    val tmax: Double,
    val tmin: Double,
    val rainMm: Double?,
    val chance: Double?,
    val windMax: Double?,
    val gust: Double?,
    val deg: Double?,
    val sun: Double,
    val sunshineH: Double? = null,
    val share: Double? = null,
  )

  /** The hours of daylight of a local [day] (days since 1970 at the place), counted by 10 minutes; null without the place. */
  fun daylightHours(p: PointNow, day: Long): Double? {
    val lat = p.lat ?: return null
    val lon = p.lon ?: return null
    val start = day * 86_400 - p.utcOffsetS
    var n = 0
    for (k in 0 until 144) if (sunUp(lat, lon, start + k * 600L + 300)) n++
    return n / 6.0
  }

  /** The hours of sunshine of a day as the card says them: « 7 h », « 30 min » (« 0,5 h » in a narrow column), « 0 h ». */
  fun sunHoursText(h: Double, tight: Boolean): String =
    when {
      h == 0.0 || h >= 0.95 -> "${fmt(h)} h"
      tight -> "${fmt(maxOf(0.1, h), 1)} h"
      else -> "${maxOf(10, (h * 6).roundToInt() * 10)} min"
    }

  /** The tone of a day's line of sunshine: 2 the sun's colour (45 % of its daylight and more), 1 half-way (20 %), 0 grey. */
  fun sunTone(d: DayColumn): Int {
    val k = d.share ?: ((d.sunshineH ?: 0.0) / 9)
    return if (k >= 0.45) 2 else if (k >= 0.2) 1 else 0
  }

  /**
   * The days from today ([max] at most, none under 2). The gust and the direction come from the hours when they cover the
   * day (today: the hours still to come); a gust no stronger than the wind of the day is left out (not « 33/24 »). Where the
   * answer gives a day's hours of sunshine, their share of its daylight tints its column; else the cloud cover of its hours,
   * then its weather code (the card's `daysBlock`).
   */
  fun days(p: PointNow, now: Long, max: Int): List<DayColumn> {
    val off = p.utcOffsetS
    val today = localDay(now, off)
    val nowHour = now - Math.floorMod(now, 3600L)
    val list = p.days.filter { d -> (dayOf(d.date) ?: Long.MIN_VALUE) >= today && d.tmaxC != null && d.tminC != null }.take(max)
    if (list.size < 2) return emptyList()
    return list.mapIndexed { i, d ->
      val day = dayOf(d.date)!!
      val hrs = p.hours.filter { localDay(it.timeUtc, off) == day && it.timeUtc >= nowHour }
      val start = day * 86_400 - off
      val need = ((start + 86_400 - maxOf(start, nowHour)) / 3600.0).roundToInt()
      val whole = need > 0 && hrs.size >= need - 1 // an hour of slack for the change of time
      val gusts = hrs.mapNotNull { it.gustKmh }
      val gust = if (whole && gusts.isNotEmpty()) gusts.max() else null
      val light = d.sunshineH?.let { daylightHours(p, day) }
      val share = if (light != null && light > 0) (d.sunshineH!! / light).coerceIn(0.0, 1.0) else null
      DayColumn(
        name = if (i == 0) "Auj." else "${dayName(day)} ${dayOfMonth(day)}",
        nameShort = if (i == 0) "Auj." else dayName(day),
        kind = wmoKind(d.code),
        tmax = d.tmaxC!!,
        tmin = d.tminC!!,
        rainMm = d.rainMm,
        chance = d.rainProbabilityPct,
        windMax = d.windMaxKmh,
        gust = gust?.takeUnless { d.windMaxKmh != null && it <= d.windMaxKmh },
        deg = if (whole) windFrom(hrs) else null,
        sun = share ?: sunOfHours(hrs.filter { it.isDay == true }) ?: sunOfCode(d.code),
        sunshineH = d.sunshineH,
        share = share,
      )
    }
  }

  /** The height of a rain bar of the hours (mm over a slot of [step] hours), as the card: 0 when dry, 4 to 22 px. */
  fun hourBar(mm: Double, step: Int): Float {
    val top = 2.5 * step
    return if (mm <= 0) 0f else maxOf(4.0, sqrt(minOf(mm, top) / top) * 22).toFloat()
  }

  /** The height of a rain bar of the days: 2 px when dry, 4 to 24 px. */
  fun dayBar(mm: Double?): Float = if (mm != null && mm > 0) maxOf(4.0, sqrt(minOf(mm, 30.0) / 30) * 24).toFloat() else 2f

  /** The height of a bar of the rain tile (a rate in mm/h): 3 px when dry, 5 to 30 px. */
  fun tileBar(r: Double): Float = if (r > 0) (5 + sqrt(minOf(r, 4.0) / 4) * 25).toFloat() else 3f

  /** The lowest and highest of the days' scale: a degree of room under and over. */
  fun dayScale(days: List<DayColumn>): Pair<Double, Double> =
    (floor(days.minOf { it.tmin }) - 1) to (ceil(days.maxOf { it.tmax }) + 1)
}
