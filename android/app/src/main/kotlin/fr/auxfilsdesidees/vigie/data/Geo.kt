package fr.auxfilsdesidees.vigie.data

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

/** Distances on the Earth and the rounding of a position: what the place and spot choices need, nothing more. */
object Geo {
  private const val EARTH_KM = 6371.0

  /** Great-circle distance in km (haversine). */
  fun km(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val p1 = Math.toRadians(lat1)
    val p2 = Math.toRadians(lat2)
    val dp = p2 - p1
    val dl = Math.toRadians(lon2 - lon1)
    val a = sin(dp / 2).pow(2) + cos(p1) * cos(p2) * sin(dl / 2).pow(2)
    return 2 * EARTH_KM * asin(sqrt(a.coerceIn(0.0, 1.0)))
  }

  /** The catalogue's spots sorted by distance to the point, nearest first, each with its distance in km. */
  fun nearest(spots: List<CatalogueSpot>, lat: Double, lon: Double): List<Pair<CatalogueSpot, Double>> =
    spots.map { it to km(lat, lon, it.lat, it.lon) }.sortedBy { it.second }

  /** The spots followed by default for a new place: the nearest ones within [SUGGEST_KM], [SUGGEST_COUNT] at most. */
  fun suggested(spots: List<CatalogueSpot>, lat: Double, lon: Double): List<String> =
    nearest(spots, lat, lon).takeWhile { it.second <= SUGGEST_KM }.take(SUGGEST_COUNT).map { it.first.id }

  const val SUGGEST_KM = 60.0
  const val SUGGEST_COUNT = 3

  /**
   * A position rounded to two decimals, about 1 km: the phone's own position never leaves it more precise than that (the
   * site rounds the home the same way).
   */
  fun roundKm(value: Double): Double = (value * 100).roundToLong() / 100.0
}
