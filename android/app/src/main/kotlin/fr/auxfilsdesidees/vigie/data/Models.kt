package fr.auxfilsdesidees.vigie.data

/**
 * A place: a name, coordinates and, from the place search, the region it is in. [here] marks the place « Ici », which
 * follows the phone: its point is the phone's last position read (rounded to about 1 km) and its [name] the town nearest
 * to it, empty while no town is known.
 */
data class Place(val name: String, val lat: Double, val lon: Double, val region: String? = null, val here: Boolean = false) {
  /** The point at four decimals, « 47.7500,-3.3700 »: the name of the place's copy on the phone. */
  val pointKey: String
    get() = "%.4f,%.4f".format(java.util.Locale.ROOT, lat, lon)

  /** What the screens and the widgets call the place: « Ici · Sainte-Anne » for the place that follows the phone. */
  val label: String
    get() = if (!here) name else if (name.isBlank()) HERE else "$HERE · $name"

  /** The name after « près de »: the town of the place « Ici », or « vous » while it has none. */
  val nearName: String
    get() = if (here && name.isBlank()) "vous" else name

  companion object {
    const val HERE = "Ici"
  }
}

/**
 * A place the user follows, with the spots followed near it; the first spot is the one drawn in the frise. [bell] is the
 * lowest level of alert Vigie sends a notification for at this place; null, none (the bell is off). [parked] are the
 * spots of the place « Ici » left behind by a journey: they come back to [spots] when the phone comes back near them.
 */
data class FollowedPlace(val place: Place, val spots: List<String>, val bell: Bell? = null, val parked: List<String> = emptyList()) {
  /**
   * Two followed places never share a key: the app refuses a second place at the same point. The place « Ici » keeps the
   * same key wherever the phone goes, so that its widgets and its page follow it.
   */
  val key: String
    get() = if (place.here) HERE_KEY else place.pointKey

  companion object {
    const val HERE_KEY = "here"
  }
}

/** The lowest level a place's bell rings for, as the server names it (`minLevel` of `/account/app/device`). */
enum class Bell {
  YELLOW,
  ORANGE,
  RED;

  companion object {
    fun of(name: String?): Bell? = entries.firstOrNull { it.name == name }
  }
}

/** One answer of the place search (`/data/places.json` of the site, from GeoNames). */
data class PlaceHit(val name: String, val region: String?, val country: String?, val lat: Double, val lon: Double, val population: Long?)

/** One spot of the catalogue (`/v1/activities/overview`): its name and where it is. */
data class CatalogueSpot(val id: String, val name: String, val place: String?, val lat: Double, val lon: Double)

/** What `/v1/point` says about a place, reduced to what the screens show. A missing value stays null, never invented. */
data class PointNow(
  val serverUtc: Long,
  val utcOffsetS: Int,
  val provider: String?,
  val alertLevel: String?,
  val tempC: Double?,
  val feelsLikeC: Double?,
  val windKmh: Double?,
  val gustKmh: Double?,
  val windDeg: Double?,
  val rain1hMm: Double?,
  val weatherCode: Int?,
  val days: List<Day>,
  /** The hour-by-hour forecast (`hourly`, up to 72 hours); empty while the API does not serve it. */
  val hours: List<HourWeather> = emptyList(),
  /** The rain of the hour to come (`rain_nowcast`); null when the API does not serve it. */
  val rainSoon: RainNowcast? = null,
  /** The rest of `current`, and the point the weather is read at (the cell of the grid): what the home page shows. */
  val humidityPct: Double? = null,
  val pressureHpa: Double? = null,
  val uvIndex: Double? = null,
  /** The European air quality index of `current`. */
  val aqiEu: Double? = null,
  val lat: Double? = null,
  val lon: Double? = null,
  /** `pressure_history`: the pressure of the last hours, oldest first. */
  val pressureHistory: List<PressureReading> = emptyList(),
  /** `short_term`: AROME-PI by 15 minutes over the next hours; null when the API does not serve it. */
  val shortTerm: ShortTerm? = null,
  /** What the home page says of the season: avalanches, drought, pollen. */
  val season: SeasonData = SeasonData(),
  /** `probabilities`: the chances of the ensembles (PE-AROME, France) by window of a few hours; null without them. */
  val probabilities: Probabilities? = null,
  /** `weather_attribution`: the credit of the weather of the place, named at the foot of the Details page. */
  val weatherAttribution: String? = null,
)

/**
 * `rain_nowcast` of `/v1/point`: the millimetres of each step of [stepMinutes] over the next hour; with PIAF (France) also
 * the twelve 5-minute rates in mm/h ([rate5mMmH]). [startUtc] is the start of the first step (an older API has none).
 */
data class RainNowcast(
  val stepMinutes: Int,
  val mmPerStep: List<Double>,
  val rate5mMmH: List<Double>? = null,
  val startUtc: Long? = null,
  /** Its credit: it names PIAF where the radar nowcast of Météo-France gives the rain (else Open-Meteo's forecast). */
  val attribution: String? = null,
)

data class Day(
  val date: String,
  val code: Int?,
  val tminC: Double?,
  val tmaxC: Double?,
  val rainMm: Double?,
  val rainProbabilityPct: Double? = null,
  /** The strongest mean wind of the day. */
  val windMaxKmh: Double? = null,
  /** Its hours of sunshine (`sunshine_h`, Open-Meteo's sunshine duration), 0 to 24. */
  val sunshineH: Double? = null,
)

data class PressureReading(val timeUtc: Long, val hpa: Double)

/**
 * `probabilities` of `/v1/point`: the windows of `short_range` (the ensembles of PE-AROME, [members] scenarios, a window of
 * [windowHours] hours) and the credit of the block.
 */
data class Probabilities(val members: Int?, val windowHours: Int?, val windows: List<ChanceWindow>, val attribution: String?)

/**
 * One window of the ensembles, ending at [toUtc]: its chances in % by name of the API (`rain_1mm_pct`, `gust_30kt_pct`,
 * `gust_50kt_pct`, `storm_pct`, `snow_1mm_pct`, `hail_pct`…); a chance the API does not give is absent.
 */
data class ChanceWindow(val toUtc: Long, val pct: Map<String, Double>)

/**
 * AROME-PI of `short_term`: a step every [intervalMinutes] from its [ShortStep.timeUtc]. [hailLevel] (`none`, `small_hail`,
 * `hail`) and [visibilityLevel] (`none`, `reduced`, `very_reduced`) are the worst the API worked out over the steps.
 */
data class ShortTerm(
  val intervalMinutes: Int,
  val steps: List<ShortStep>,
  val hailLevel: String? = null,
  val visibilityLevel: String? = null,
  val attribution: String? = null,
)

/** One step of AROME-PI: its strongest gust and its precipitation (`none`, `rain`, `snow`, `drizzle`, `freezing`…). */
data class ShortStep(val timeUtc: Long, val gustKmh: Double?, val precipitation: String?)

/**
 * The parts of `/v1/point` the home page reads for the season: avalanches (`avalanche`), drought (`drought`, VigiEau) and
 * pollen (`air_quality.pollens`). Each is null when the API does not give it.
 */
data class SeasonData(val avalanche: Avalanche? = null, val drought: Drought? = null, val pollen: Pollen? = null)

data class Avalanche(val status: String?, val maxDangerLevel: Int?, val validUntilUtc: Long?, val regionName: String?)

data class Drought(val status: String?, val maxLevel: String?, val restrictionsInForce: Boolean?)

/** Grains per m³: now by species, and the peak of each day ([PollenDay.peaks], species to value). */
data class Pollen(val now: Map<String, Double>, val days: List<PollenDay>)

data class PollenDay(val date: String, val peaks: Map<String, Double>)

/** One hour of `hourly`, starting at [timeUtc]. */
data class HourWeather(
  val timeUtc: Long,
  val tempC: Double?,
  val rainMm: Double?,
  val windKmh: Double?,
  val gustKmh: Double?,
  val windDeg: Double?,
  val weatherCode: Int?,
  val isDay: Boolean?,
  /** The chance of rain of the hour, when the forecast gives one. */
  val rainProbabilityPct: Double? = null,
  val cloudCoverPct: Double? = null,
)

/** One spot of `/v1/activities/overview` with its verdicts for the next 24 hours. */
data class Spot(val id: String, val name: String, val place: String?, val activities: List<ActivityVerdict>)

/**
 * The verdict of one activity at one spot. [verdict] and [now] are `good`, `possible`, `poor` or null; [reason] is a code
 * such as `swell_period.short`; [bestStartUtc]/[bestEndUtc] bound the best slot, end excluded.
 */
data class ActivityVerdict(
  val id: String,
  val available: Boolean,
  val verdict: String?,
  val now: String?,
  val reason: String?,
  val bestStartUtc: Long?,
  val bestEndUtc: Long?,
)

/** A high or low water of the spot, from the API's tide model. */
data class TideExtreme(val timeUtc: Long, val high: Boolean, val heightM: Double)

/** The verdict of one activity for the hour starting at [timeUtc]; [daylight] false = a night hour (no verdict shown). */
data class HourVerdict(val timeUtc: Long, val daylight: Boolean?, val verdict: String?)

/** An official coastal warning over the spot: its level (`YELLOW`, `ORANGE`, `RED`…) and when it applies, when known. */
data class CoastAlert(val level: String?, val startUtc: Long?, val endUtc: Long?)

/**
 * The hours of one spot from `/v1/activities/{spot}`: the verdict of each activity hour by hour, the tide, the coastal
 * warnings. [vigilanceKnown] false = the warnings could not be read (an empty list then means nothing).
 */
data class SpotHours(
  val id: String,
  val name: String,
  val activities: Map<String, List<HourVerdict>>,
  val tide: List<TideExtreme>,
  val vigilanceKnown: Boolean,
  val alerts: List<CoastAlert>,
)

/**
 * One official warning over a place (`/v1/vigilances?lat&lon`), in its issuer's words. [endUtc] is `ends_utc`, else
 * `expires_utc` (the end of the bulletin), as the site's widget reads it. [river] is a river section near the place
 * (Vigicrues), [distanceKm] how far; an area that holds the place has none.
 */
data class Vigilance(
  val id: String,
  val source: String?,
  val issuer: String?,
  val level: String?,
  val phenomenon: String?,
  val event: String?,
  val area: String?,
  val river: Boolean,
  val distanceKm: Double?,
  val onsetUtc: Long?,
  val endUtc: Long?,
  val sentUtc: Long?,
  val headline: String?,
  val description: String?,
  val instruction: String?,
  val web: String?,
  val attribution: String?,
)

/**
 * The official warnings of a place. [covered] false = no official source is read for the place (a country without one,
 * or the open sea); [unavailable] = every source of the place failed at the API, so an empty list proves nothing.
 */
data class Vigilances(val covered: Boolean, val unavailable: Boolean, val items: List<Vigilance>, val disclaimer: String?)

/**
 * Everything one refresh reads. [favourite] is null when its hours could not be read, [vigilances] when the official
 * warnings could not be read (the rest still shows).
 */
data class Snapshot(
  val place: Place,
  val point: PointNow,
  val spots: List<Spot>,
  val spotsStale: Boolean,
  val favourite: SpotHours? = null,
  val vigilances: Vigilances? = null,
)
