package fr.auxfilsdesidees.vigie.ui.board

import fr.auxfilsdesidees.vigie.data.AvalancheBulletin
import fr.auxfilsdesidees.vigie.data.BeachParser
import fr.auxfilsdesidees.vigie.data.BeachTide
import fr.auxfilsdesidees.vigie.data.NearBeach
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.SkiArea
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The words and the values of the Plages and Pistes tab (the sketches chosen by the author on 28/11/2026, lot 3 of the
 * journey plan): which tab the fourth one is at a place, the sea around, the tiles of a beach kept, the lifts and the
 * sentence of a ski area, its avalanche level at its heights. Pure: the view ([NearbyBoardView]) only draws what this says.
 */
object NearbyBoard {
  private const val NBSP = ' '

  // ------------------------------------------------------------------------------------------------------ the fourth tab

  /** What the fourth tab is at a place: the followed spots (« Mer »), the beaches (« Plages ») or the ski areas (« Pistes »). */
  enum class Fourth {
    Sea,
    Beaches,
    Ski,
  }

  /** A sea beach this close makes the tab « Plages ». */
  const val BEACH_KM = 3.0

  /** A ski area this close makes it « Pistes ». */
  const val SKI_KM = 15.0

  /**
   * « Mer » wherever spots are followed (the author's choice: they stay where they are); else « Plages » by the sea, « Pistes »
   * near a ski area, « Mer » again elsewhere (its « Choisir des spots »). A catalogue not read yet counts as empty.
   */
  fun fourth(followsSpots: Boolean, beaches: List<NearBeach>?, areas: List<SkiArea>?): Fourth =
    when {
      followsSpots -> Fourth.Sea
      beaches.orEmpty().any { it.sea && it.distanceKm <= BEACH_KM } -> Fourth.Beaches
      areas.orEmpty().any { it.distanceKm <= SKI_KM } -> Fourth.Ski
      else -> Fourth.Sea
    }

  // --------------------------------------------------------------------------------------------------------- words

  private val PREFIX = Regex("""^Plages?\s+(de\s+la\s+|de\s+l['’]\s*|des\s+|du\s+|de\s+|d['’]\s*)?""", RegexOption.IGNORE_CASE)
  private val TOWN = Regex("""\s*\([^)]*\)$""")

  /** The name of a chip or a row: « Grande Anse des Salines » for « Plage de Grande Anse des Salines », the town in brackets left out. */
  fun shortName(name: String): String = name.replace(TOWN, "").replace(PREFIX, "").replaceFirstChar { it.uppercaseChar() }.ifBlank { name }

  /** « 1,0 km »: always one decimal, as the list of beaches writes it. */
  fun km(d: Double): String = String.format(Locale.ROOT, "%.1f", d).replace('.', ',') + "${NBSP}km"

  /** « 2 514 »: a height with the space of thousands. */
  fun thousands(n: Int): String {
    val s = kotlin.math.abs(n).toString()
    val out = s.reversed().chunked(3).joinToString(NBSP.toString()).reversed()
    return if (n < 0) "-$out" else out
  }

  fun metres(m: Int): String = "${thousands(m)}${NBSP}m"

  private val AT = listOf("au nord", "au nord-est", "à l’est", "au sud-est", "au sud", "au sud-ouest", "à l’ouest", "au nord-ouest")
  private val TO = listOf("vers le nord", "vers le nord-est", "vers l’est", "vers le sud-est", "vers le sud", "vers le sud-ouest", "vers l’ouest", "vers le nord-ouest")

  /** Where a beach is from the place: « au sud », « à l’ouest ». */
  fun at(fromLat: Double, fromLon: Double, toLat: Double, toLon: Double): String = AT[SeaBoard.sector(BeachParser.bearingDeg(fromLat, fromLon, toLat, toLon))]

  /** Where a current goes: « vers l’ouest ». */
  fun towards(deg: Double): String = TO[SeaBoard.sector(deg)]

  /** The word and the tone of a UV index (WHO's scale). */
  fun uv(v: Double): Pair<String, String> =
    when {
      v < 3 -> "faible" to "green"
      v < 6 -> "modéré" to "yellow"
      v < 8 -> "fort" to "orange"
      v < 11 -> "très fort" to "red"
      else -> "extrême" to "red"
    }

  private val DAY_FULL = listOf("jeudi", "vendredi", "samedi", "dimanche", "lundi", "mardi", "mercredi") // 1970-01-01 was a Thursday

  /** « demain », else the day's full name (« jeudi »). */
  private fun dayFull(day: Long, today: Long): String = if (day == today + 1) "demain" else DAY_FULL[Math.floorMod(day, 7L).toInt()]

  /** « ce matin », « cet après-midi », « ce soir », « cette nuit », at the place. */
  fun moment(now: Long, offsetS: Int): String =
    when (Math.floorMod(now + offsetS, 86_400L) / 3600) {
      in 5..11 -> "ce matin"
      in 12..17 -> "cet après-midi"
      in 18..22 -> "ce soir"
      else -> "cette nuit"
    }

  /** A piece of a line: its text, a tone (`green`, `yellow`, `orange`, `red`, `t3`…) or the colour of a temperature, bold or not. */
  data class Part(val text: String, val tone: String? = null, val tempC: Double? = null, val bold: Boolean = false)

  // ---------------------------------------------------------------------------------------------------- rain and sun

  /**
   * The rain of the next hours: [now] when it rains in the hour under way ([mmNow] mm), else when the first rain starts
   * ([firstUtc], null when none comes in the [span] hours read).
   */
  data class Showers(val now: Boolean, val firstUtc: Long?, val span: Int, val mmNow: Double?)

  fun showers(p: PointNow, now: Long): Showers? {
    val hours = p.hours.filter { it.timeUtc + 3600 > now }.take(24)
    if (hours.isEmpty() || hours.all { it.rainMm == null }) return null
    val first = hours.firstOrNull { (it.rainMm ?: 0.0) >= 0.1 }
    val under = first != null && first.timeUtc <= now
    return Showers(under, first?.timeUtc, hours.size, if (under) first?.rainMm else null)
  }

  /** The next sunset while the sun is up (« coucher »), else the next sunrise (« lever »); null without the point. */
  fun sun(p: PointNow, now: Long): Pair<String, String>? {
    val s = HomeBoard.sunTimes(p, now) ?: return null
    return if (s.up) s.set?.let { HomeBoard.hm(it, p.utcOffsetS) to "coucher" } else s.rise?.let { HomeBoard.hm(it, p.utcOffsetS) to "lever" }
  }

  // ----------------------------------------------------------------------------------------------------- the sea around

  /** A small value of « La mer ici »: big, a word under it, its colour. */
  data class Mini(val value: String, val label: String, val tone: String? = null, val tempC: Double? = null)

  /** The sea and the sky of the place, eight values at most, each only when the API gives it. */
  fun seaAround(p: PointNow, now: Long): List<Mini> {
    val m = p.marine
    val out = ArrayList<Mini>()
    m?.waveM?.let { out += Mini("${HomeBoard.fmt(it, 1)}${NBSP}m", "mer ${SeaBoard.seaState(it)}") }
    m?.swellM?.let { h -> out += Mini("${HomeBoard.fmt(h, 1)}${NBSP}m", "houle" + (m.swellPeriodS?.let { " · ${HomeBoard.fmt(it)}${NBSP}s" } ?: "")) }
    m?.waterC?.let { out += Mini("${HomeBoard.fmt(it)}°", "eau", tempC = it) }
    p.windKmh?.let { w -> out += Mini(HomeBoard.fmt(w), "km/h" + (p.windDeg?.let { " ${SeaBoard.from(it)}" } ?: ""), "wind") }
    p.gustKmh?.let { out += Mini(HomeBoard.fmt(it), "rafales km/h", "wind") }
    p.uvIndex?.let { val (word, tone) = uv(it); out += Mini("UV ${HomeBoard.fmt(it)}", word, tone) }
    showers(p, now)?.let { s ->
      out +=
        when {
          s.now -> Mini("pluie", "en ce moment", "rain")
          s.firstUtc != null -> Mini("sec", "jusqu’à ${HomeBoard.hm(s.firstUtc, p.utcOffsetS)}")
          else -> Mini("sec", "sur ${s.span}${NBSP}h")
        }
    }
    sun(p, now)?.let { (at, word) -> out += Mini(at, word, "sun") }
    return out
  }

  // ------------------------------------------------------------------------------------------------------- a beach kept

  /** A tile of a beach kept: its name in capitals, its value (and unit), a line under it. */
  data class Tile(val key: String, val value: String, val unit: String? = null, val detail: String = "", val tone: String? = null, val tempC: Double? = null)

  /**
   * The tiles of a beach kept, three a row: the sea, the swell, the water, the wind, the air, the UV, the showers, the current
   * and the sun; the tide and the bathing water where Vigie has them (France). Each only when the API gives it.
   */
  fun beachTiles(p: PointNow, now: Long, tide: BeachTide?, quality: String?): List<Tile> {
    val off = p.utcOffsetS
    val m = p.marine
    val out = ArrayList<Tile>()
    m?.waveM?.let { h ->
      val more = listOfNotNull(SeaBoard.seaState(h), m.waveFromDeg?.let(SeaBoard::from), m.wavePeriodS?.let { "${HomeBoard.fmt(it)}${NBSP}s" })
      out += Tile("Mer", "${HomeBoard.fmt(h, 1)}${NBSP}m", detail = more.joinToString(" · "))
    }
    m?.swellM?.let { h ->
      val more = listOfNotNull(m.swellFromDeg?.let(SeaBoard::from), m.swellPeriodS?.let { "${HomeBoard.fmt(it)}${NBSP}s" })
      out += Tile("Houle", "${HomeBoard.fmt(h, 1)}${NBSP}m", detail = more.joinToString(" · "))
    }
    m?.waterC?.let { out += Tile("Eau", "${HomeBoard.fmt(it)}°", detail = "en surface", tempC = it) }
    p.windKmh?.let { w ->
      val more = listOfNotNull(p.windDeg?.let(SeaBoard::from), p.gustKmh?.let { "raf. ${HomeBoard.fmt(it)}" })
      out += Tile("Vent", HomeBoard.fmt(w), "km/h", more.joinToString(" · "), "wind")
    }
    p.tempC?.let { t ->
      val more = p.humidityPct?.let { "humidité ${HomeBoard.fmt(it)}${NBSP}%" } ?: p.feelsLikeC?.let { "ressenti ${HomeBoard.fmt(it)}°" } ?: ""
      out += Tile("Air", "${HomeBoard.fmt(t)}°", detail = more, tempC = t)
    }
    p.uvIndex?.let { u ->
      val (word, tone) = uv(u)
      val today = HomeBoard.localDay(now, off)
      val max = p.days.firstOrNull { HomeBoard.dayOf(it.date) == today }?.uvMax
      out += Tile("UV", HomeBoard.fmt(u), detail = word + (max?.let { " · ${HomeBoard.fmt(it)} au plus" } ?: ""), tone = tone)
    }
    showers(p, now)?.let { s ->
      out +=
        when {
          s.now -> Tile("Averses", "en cours", detail = s.mmNow?.let { "${HomeBoard.fmt(it, 1)}${NBSP}mm cette heure" } ?: "", tone = "rain")
          s.firstUtc != null -> Tile("Averses", "aucune", detail = "prévue avant ${HomeBoard.hm(s.firstUtc, off)}")
          else -> Tile("Averses", "aucune", detail = "sur ${s.span}${NBSP}h")
        }
    }
    m?.currentKmh?.let { c -> out += Tile("Courant", HomeBoard.fmt(c, 1), "km/h", m.currentToDeg?.let(::towards) ?: "") }
    sun(p, now)?.let { (at, word) -> out += Tile("Soleil", at, detail = word, tone = "sun") }
    tide?.let { t ->
      val high = t.nextHigh
      val low = t.nextLow
      val next = listOfNotNull(high?.let { it to true }, low?.let { it to false }).minByOrNull { it.first }
      if (next != null) {
        val more = listOfNotNull(t.rising?.let { if (it) "monte" else "descend" }, t.coefficient?.let { "coef. $it" })
        out += Tile(if (next.second) "Pleine mer" else "Basse mer", HomeBoard.hm(next.first, off), detail = more.joinToString(" · "), tone = "rain")
      }
    }
    SeaBoard.quality(quality)?.let { (word, tone) -> out += Tile("Baignade", word, detail = "qualité de l’eau", tone = tone) }
    return out
  }

  // ------------------------------------------------------------------------------------------------------ a ski area

  /** « 16 remontées (4 télécabines, 8 télésièges, 4 téléskis) · 1 053 à 2 514 m · à 0,2 km ». */
  fun areaLine(a: SkiArea): String {
    fun n(k: Int, one: String, many: String) = if (k <= 0) null else "$k ${if (k == 1) one else many}"
    val kinds = listOfNotNull(n(a.gondolas, "télécabine", "télécabines"), n(a.chairs, "télésiège", "télésièges"), n(a.drags, "téléski", "téléskis"))
    val lifts = a.lifts?.takeIf { it > 0 }?.let { l -> "$l remontée${if (l > 1) "s" else ""}" + (if (kinds.isNotEmpty()) " (${kinds.joinToString(", ")})" else "") }
    val heights =
      when {
        a.footM != null && a.topM != null && a.topM > a.footM -> "${thousands(a.footM)} à ${metres(a.topM)}"
        a.topM != null -> metres(a.topM)
        a.footM != null -> metres(a.footM)
        else -> null
      }
    return listOfNotNull(lifts, heights, "à ${km(a.distanceKm)}").joinToString(" · ")
  }

  /** The level of the bulletin on the area: the higher of its foot and its top, the highest of the bulletin without heights. */
  fun areaLevel(a: SkiArea, b: AvalancheBulletin): Int? {
    val heights = listOfNotNull(a.footM, a.topM)
    if (heights.isEmpty()) return b.maxLevel
    return heights.mapNotNull(b::levelAt).maxOrNull()
  }

  /** The height above which the highest level of the bulletin holds (« 3 au-dessus de 3 000 m »); null when it holds everywhere. */
  fun threshold(b: AvalancheBulletin): Int? {
    val max = b.maxLevel ?: return null
    return b.bands.filter { it.level == max }.mapNotNull { it.lowerM }.minOrNull()
  }

  /** The most fresh snow of the next six days at the top of the area, and the day; null without the forecast. */
  fun snowAhead(top: PointNow, now: Long): Pair<Double, Long>? {
    val today = HomeBoard.localDay(now, top.utcOffsetS)
    val days = top.days.mapNotNull { d -> HomeBoard.dayOf(d.date)?.let { it to d.snowfallCm } }.filter { it.first in (today + 1)..(today + 6) }
    if (days.none { it.second != null }) return null
    val best = days.maxByOrNull { it.second ?: 0.0 } ?: return null
    return (best.second ?: 0.0) to best.first
  }

  /**
   * The sentence of an area: « Ce soir −8° en haut, 1° en bas. Avalanches : 2 limité sur ce domaine, 3 au-dessus de 3 000 m.
   * Peu de neige en vue : 2,5 cm jeudi en haut. » Each part only when known.
   */
  fun areaSentence(a: SkiArea, top: PointNow?, foot: PointNow?, b: AvalancheBulletin?, now: Long, offsetS: Int): List<Part> {
    val out = ArrayList<Part>()
    val t = top?.tempC
    val f = foot?.tempC?.takeIf { foot !== top }
    if (t != null || f != null) {
      out += Part(moment(now, offsetS).replaceFirstChar { it.uppercaseChar() } + " ")
      if (t != null) out += listOf(Part("${HomeBoard.fmt(t)}°", tempC = t), Part(if (f != null) " en haut, " else if (a.topM != null) " en haut. " else ". "))
      if (f != null) out += listOf(Part("${HomeBoard.fmt(f)}°", tempC = f), Part(" en bas. "))
    }
    val level = b?.let { areaLevel(a, it) }
    if (b != null && level != null && level in 1..5) {
      out += Part("Avalanches : ")
      out += Part("$level ${HomeBoard.avalancheWord(level)}", HomeBoard.avalancheTone(level), bold = true)
      val max = b.maxLevel
      val above = threshold(b)
      out += Part(if (max != null && max > level && above != null) " sur ce domaine, $max au-dessus de ${metres(above)}. " else " sur ce domaine. ")
    }
    top?.let { snowAhead(it, now) }?.let { (cm, day) ->
      val onDay = "${dayFull(day, HomeBoard.localDay(now, offsetS))}${if (a.topM != null) " en haut" else ""}"
      out +=
        Part(
          when {
            cm >= 5 -> "De la neige en vue : ${HomeBoard.fmt(cm)}${NBSP}cm $onDay."
            cm >= 0.1 -> "Peu de neige en vue : ${HomeBoard.fmt(cm, 1)}${NBSP}cm $onDay."
            else -> "Pas de neige en vue d’ici six jours."
          }
        )
    }
    return out.let { parts -> if (parts.isNotEmpty()) parts.dropLast(1) + parts.last().copy(text = parts.last().text.trimEnd()) else parts }
  }

  /** The 0 °C isotherm of the hour under way, to 100 m; null where the model does not give it. */
  fun freezingNow(p: PointNow, now: Long): Int? {
    val h = p.hours.lastOrNull { it.timeUtc <= now && it.freezingLevelM != null } ?: p.hours.firstOrNull { it.freezingLevelM != null } ?: return null
    return ((h.freezingLevelM!! / 100).roundToInt() * 100)
  }

  /** The 0 °C isotherm in km at an hour (« 3,1 »), for the line under the hours at the foot; null without it. */
  fun freezingKm(p: PointNow, ts: Long): String? = p.hours.firstOrNull { it.timeUtc == ts }?.freezingLevelM?.let { HomeBoard.fmt(it / 1000, 1) }

  private val PROBLEMS =
    mapOf(
      "wind_slab" to "plaques à vent",
      "wet_snow" to "neige humide",
      "new_snow" to "neige fraîche",
      "persistent_weak_layers" to "sous-couches fragiles",
      "gliding_snow" to "avalanches de fond",
      "cornices" to "corniches",
      "no_distinct_avalanche_problem" to "pas de problème marqué",
    )

  /** The name of an avalanche problem in French; the API's name, its underscores as spaces, for one not known here. */
  fun problem(type: String): String = PROBLEMS[type] ?: type.replace('_', ' ')

  /** « Météo-France, publié à 15 h 56, jusqu’à demain 18 h ». */
  fun bulletinLine(b: AvalancheBulletin, now: Long, offsetS: Int): String {
    val today = HomeBoard.localDay(now, offsetS)
    fun day(ts: Long): String =
      when (HomeBoard.localDay(ts, offsetS) - today) {
        0L -> ""
        -1L -> "hier "
        1L -> "demain "
        else -> DAY_FULL[Math.floorMod(HomeBoard.localDay(ts, offsetS), 7L).toInt()] + " "
      }
    val who = b.attribution?.takeIf { it.startsWith("Météo-France") }?.let { "Météo-France" }
    val parts =
      listOfNotNull(
        who,
        b.publishedUtc?.let { "publié ${day(it)}à ${HomeBoard.hm(it, offsetS)}" },
        b.validUntilUtc?.let { "jusqu’à ${day(it)}${HomeBoard.hm(it, offsetS)}" },
      )
    return parts.joinToString(", ")
  }

  /** The first day of the trend and its words: « Lundi » and « indice de risque limité »; null without a trend. */
  fun trend(b: AvalancheBulletin, now: Long, offsetS: Int): Pair<String, String>? {
    val t = b.trend.firstOrNull() ?: return null
    val day = t.fromUtc?.let { dayFull(HomeBoard.localDay(it, offsetS), HomeBoard.localDay(now, offsetS)).replaceFirstChar { c -> c.uppercaseChar() } } ?: "Ensuite"
    return day to t.text.replaceFirstChar { it.lowercaseChar() }.trimEnd('.')
  }

  /** The heights the band of the bulletin spans: the area's and the bulletin's limits, with a margin, to 100 m. */
  fun bandRange(a: SkiArea, b: AvalancheBulletin): Pair<Int, Int> {
    val marks = listOfNotNull(a.footM, a.topM) + b.bands.flatMap { listOfNotNull(it.lowerM, it.upperM) }
    val lo = ((marks.minOrNull() ?: 1000) - 300).coerceAtLeast(0) / 100 * 100
    val hi = ((marks.maxOrNull() ?: 2500) + 600 + 99) / 100 * 100
    return lo to hi
  }
}
