package fr.auxfilsdesidees.vigie.data

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Where the choices are kept: the app's private preferences on the phone, an in-memory map in the tests. */
interface KeyValue {
  fun read(key: String): String?

  fun write(key: String, value: String)
}

/**
 * What the user chose: the followed places in their order, and the one shown last ([current]). Every change returns a new
 * value; the spot lists never hold the same spot twice, and the first spot of a place is the one drawn in the frise.
 */
data class Choices(val places: List<FollowedPlace>, val current: Int) {
  val currentPlace: FollowedPlace?
    get() = places.getOrNull(current)

  fun select(index: Int): Choices = copy(current = index.coerceIn(0, (places.size - 1).coerceAtLeast(0)))

  /** The place added at the end and shown; null when a place at the same point is already followed. */
  fun add(place: FollowedPlace): Choices? =
    if (places.any { it.key == place.key }) null else Choices(places + place.copy(spots = place.spots.distinct()), places.size)

  /** Without the place at [index]; the shown place stays the same one when it can, else its neighbour. */
  fun remove(index: Int): Choices {
    if (index !in places.indices) return this
    val rest = places.filterIndexed { k, _ -> k != index }
    val shown = if (current > index) current - 1 else current
    return Choices(rest, shown.coerceIn(0, (rest.size - 1).coerceAtLeast(0)))
  }

  fun follow(index: Int, spot: String): Choices = spots(index) { if (spot in it) it else it + spot }

  fun unfollow(index: Int, spot: String): Choices = spots(index) { it - spot }

  /** [spot] first: the one the frise draws. */
  fun star(index: Int, spot: String): Choices = spots(index) { listOf(spot) + (it - spot) }

  /** The bell of the place at [index]: the lowest level it rings for, null for none. */
  fun bell(index: Int, bell: Bell?): Choices = copy(places = places.mapIndexed { k, f -> if (k == index) f.copy(bell = bell) else f })

  /** The places with a bell, the ones the server is told about. */
  val belled: List<FollowedPlace>
    get() = places.filter { it.bell != null }

  /** Where the place « Ici » is in the list; -1 without one. */
  val hereIndex: Int
    get() = places.indexOfFirst { it.place.here }

  val herePlace: FollowedPlace?
    get() = places.getOrNull(hereIndex)

  /**
   * « Utiliser ma position »: the place « Ici » goes to [place] and is shown. The first time it is added at the end with
   * [spots]; after that it keeps its spots, its bell and its rank (the spots follow it as in [moveHere]).
   */
  fun useHere(place: Place, spots: List<String>, catalogue: List<CatalogueSpot>? = null): Choices {
    val at = place.copy(here = true)
    val index = hereIndex
    return if (index < 0) Choices(places + FollowedPlace(at, spots.distinct()), places.size) else moveHere(at, catalogue).copy(current = index)
  }

  /**
   * The place « Ici » at its new point. With the [catalogue], its spots follow the phone: those within
   * [Geo.SUGGEST_KM] of the new point stay, in their order; the others are parked and come back when the phone comes back
   * near them; none near, the nearest spots of the catalogue are followed. Without the catalogue the spots stay as they
   * were. Nothing changes without a place « Ici ».
   */
  fun moveHere(place: Place, catalogue: List<CatalogueSpot>?): Choices {
    val index = hereIndex
    if (index < 0) return this
    val before = places[index]
    val at = place.copy(here = true)
    val moved =
      if (catalogue == null) {
        before.copy(place = at)
      } else {
        val where = catalogue.associateBy { it.id }
        val all = (before.spots + before.parked).distinct()
        val near = all.filter { id -> where[id]?.let { Geo.km(at.lat, at.lon, it.lat, it.lon) <= Geo.SUGGEST_KM } == true }
        val spots = near.ifEmpty { Geo.suggested(catalogue, at.lat, at.lon) }
        before.copy(place = at, spots = spots, parked = all.filter { it !in spots })
      }
    return copy(places = places.mapIndexed { k, f -> if (k == index) moved else f })
  }

  /**
   * The « Ma position » of before (a point taken once, named [names]) becomes the place « Ici », which then follows the
   * phone: its spots, its bell and its rank stay; it has no town until the next position is read. Only the first one,
   * and only when there is no place « Ici » yet. A place without a name is taken too: it is a place « Ici » whose mark
   * a version of the app from before « Ici » dropped when it saved the places (the place search never gives one).
   */
  fun adoptHere(names: Set<String>): Choices {
    if (hereIndex >= 0) return this
    val index = places.indexOfFirst { it.place.name in names || it.place.name.isBlank() }
    if (index < 0) return this
    return copy(places = places.mapIndexed { k, f -> if (k == index) f.copy(place = f.place.copy(name = "", region = null, here = true)) else f })
  }

  /** A spot followed again is no longer parked. */
  private fun spots(index: Int, change: (List<String>) -> List<String>): Choices =
    copy(
      places =
        places.mapIndexed { k, f ->
          if (k != index) {
            f
          } else {
            val next = change(f.spots).distinct()
            f.copy(spots = next, parked = f.parked.filter { it !in next })
          }
        }
    )

  companion object {
    val EMPTY = Choices(emptyList(), 0)
  }
}

/**
 * The followed places and their spots, kept on the phone only (nothing is sent anywhere but the coordinates asked to the
 * API). Stored as one small JSON text; an unreadable text reads as no choice (the first-launch steps then come back).
 */
class PlacesStore(private val kv: KeyValue) {
  fun load(): Choices = kv.read(KEY)?.let(::decode) ?: Choices.EMPTY

  fun save(choices: Choices) = kv.write(KEY, encode(choices))

  companion object {
    private const val KEY = "followed_places"

    fun encode(c: Choices): String =
      buildJsonObject {
          put("current", c.current)
          put(
            "places",
            buildJsonArray {
              c.places.forEach { f ->
                add(
                  buildJsonObject {
                    put("name", f.place.name)
                    put("lat", f.place.lat)
                    put("lon", f.place.lon)
                    f.place.region?.let { put("region", it) }
                    put("spots", JsonArray(f.spots.map(::JsonPrimitive)))
                    f.bell?.let { put("bell", it.name) }
                    if (f.place.here) put("here", true)
                    if (f.parked.isNotEmpty()) put("parked", JsonArray(f.parked.map(::JsonPrimitive)))
                  }
                )
              }
            },
          )
        }
        .toString()

    fun decode(text: String): Choices? =
      try {
        val root = Json.parseToJsonElement(text) as? JsonObject ?: return null
        // One place « Ici » at most: a second one would read as a fixed place at its last point.
        var hereSeen = false
        val places =
          (root["places"] as? JsonArray).orEmpty().mapNotNull { e ->
            val o = e as? JsonObject ?: return@mapNotNull null
            val name = o["name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
            val lat = o["lat"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val lon = o["lon"]?.jsonPrimitive?.doubleOrNull ?: return@mapNotNull null
            val region = (o["region"] as? JsonPrimitive)?.contentOrNull
            val spots = (o["spots"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            val bell = Bell.of((o["bell"] as? JsonPrimitive)?.contentOrNull)
            val here = !hereSeen && (o["here"] as? JsonPrimitive)?.booleanOrNull == true
            if (here) hereSeen = true
            val parked = (o["parked"] as? JsonArray).orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }
            FollowedPlace(Place(name, lat, lon, region, here), spots, bell, parked)
          }
        val current = root["current"]?.jsonPrimitive?.intOrNull ?: 0
        Choices(places, current.coerceIn(0, (places.size - 1).coerceAtLeast(0)))
      } catch (err: IllegalArgumentException) {
        null
      }
  }
}
