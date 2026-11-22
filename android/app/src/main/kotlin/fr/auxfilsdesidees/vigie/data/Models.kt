package fr.auxfilsdesidees.vigie.data

/** A place followed by the app: a name and coordinates (public places only). */
data class Place(val name: String, val lat: Double, val lon: Double)

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
)

data class Day(val date: String, val code: Int?, val tminC: Double?, val tmaxC: Double?, val rainMm: Double?)

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

/** Everything one refresh reads, with the time it was read. */
data class Snapshot(val place: Place, val point: PointNow, val spots: List<Spot>, val spotsStale: Boolean)
