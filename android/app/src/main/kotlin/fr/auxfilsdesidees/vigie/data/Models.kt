package fr.auxfilsdesidees.vigie.data

/** A place: a name, coordinates and, from the place search, the region it is in. */
data class Place(val name: String, val lat: Double, val lon: Double, val region: String? = null)

/** A place the user follows, with the spots followed near it; the first spot is the one drawn in the frise. */
data class FollowedPlace(val place: Place, val spots: List<String>) {
  /** Two followed places never share a key: the app refuses a second place at the same point. */
  val key: String
    get() = "%.4f,%.4f".format(java.util.Locale.ROOT, place.lat, place.lon)
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
)

data class Day(val date: String, val code: Int?, val tminC: Double?, val tmaxC: Double?, val rainMm: Double?)

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

/** Everything one refresh reads. [favourite] is null when its hours could not be read (the rest still shows). */
data class Snapshot(
  val place: Place,
  val point: PointNow,
  val spots: List<Spot>,
  val spotsStale: Boolean,
  val favourite: SpotHours? = null,
)
