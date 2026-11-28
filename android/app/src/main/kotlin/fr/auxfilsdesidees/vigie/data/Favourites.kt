package fr.auxfilsdesidees.vigie.data

/**
 * What a star of the sea map did, to say it and to undo it with « Annuler ». [place] is the key of the followed place
 * concerned ([FollowedPlace.key]), [placeName] what the screens call it.
 */
sealed interface Starred {
  val place: String
  val placeName: String

  /** The spot joined a place already followed: it is in that place's Mer tab. */
  data class Joined(val spot: String, val spotName: String, override val place: String, override val placeName: String) : Starred

  /** The spot came with a new followed place, its town: an Accueil of its own, its Mer tab, the widgets. */
  data class WithPlace(val spot: String, val spotName: String, override val place: String, override val placeName: String) : Starred

  /** A town followed alone, without spots (the author's choice of 28/11/2026): an Accueil of its own and the widgets. */
  data class Town(override val place: String, override val placeName: String) : Starred
}

/**
 * The star of the sea map (the sketches chosen by the author on 28/11/2026): it writes in the followed places the app
 * already has, so that the Accueil, the Mer tab and the widgets read it without a change, and nothing new is stored.
 *
 * A spot joins the nearest followed place within [Geo.SUGGEST_KM] (the rule of the spots offered when a place is added);
 * none that near, its town becomes a followed place, with it. A town is followed alone. Taking the star away takes away
 * the spot, or the place, as the cross of « Mes lieux et mes spots ». The shown place does not change: the star says
 * where the spot went, and the map stays where it is.
 */
object Favourites {
  /** Every followed spot, those parked by « Ici » while the phone is away too: they keep their star. */
  fun spots(c: Choices): Set<String> = c.places.flatMap { it.spots + it.parked }.toSet()

  /**
   * The followed places the map marks: not « Ici », which moves with the phone and is not a favourite; and not a place
   * without a name.
   */
  fun places(c: Choices): List<FollowedPlace> = c.places.filter { !it.place.here && it.place.name.isNotBlank() }

  /** The followed place at the same point as [place] (four decimals, as two followed places are told apart); null without one. */
  fun placeAt(c: Choices, place: Place): FollowedPlace? = c.places.firstOrNull { !it.place.here && it.place.pointKey == place.pointKey }

  /** The index of the followed place a spot at [lat], [lon] joins: the nearest one within [Geo.SUGGEST_KM], else -1. */
  fun nearestPlace(c: Choices, lat: Double, lon: Double): Int =
    c.places.indices
      .map { it to Geo.km(lat, lon, c.places[it].place.lat, c.places[it].place.lon) }
      .filter { it.second <= Geo.SUGGEST_KM }
      .minByOrNull { it.second }
      ?.first ?: -1

  /**
   * The star on [spot]: it joins the nearest followed place within [Geo.SUGGEST_KM]; else [town] (the site's town nearest
   * to it, or the spot's own point when the site named none) becomes a followed place with it. Null when the spot is
   * followed already.
   */
  fun starSpot(c: Choices, spot: CatalogueSpot, town: Place?): Pair<Choices, Starred>? {
    if (spot.id in spots(c)) return null
    val near = nearestPlace(c, spot.lat, spot.lon)
    val at =
      if (near >= 0) near
      else {
        val place = town ?: Place(spot.place?.takeIf { it.isNotBlank() } ?: spot.name, spot.lat, spot.lon)
        // A town already followed at the same point (farther than the rule, from a spot far out at sea): the spot joins it.
        c.places.indexOfFirst { it.key == FollowedPlace(place, emptyList()).key }.takeIf { it >= 0 }
          ?: return Choices(c.places + FollowedPlace(place, listOf(spot.id)), c.current) to
            Starred.WithPlace(spot.id, spot.name, FollowedPlace(place, emptyList()).key, place.label)
      }
    val target = c.places[at]
    return c.follow(at, spot.id) to Starred.Joined(spot.id, spot.name, target.key, target.place.label)
  }

  /** The star taken away from a spot: it is no longer followed, wherever it was (parked too). The places stay. */
  fun unstarSpot(c: Choices, spotId: String): Choices =
    c.copy(places = c.places.map { f -> if (spotId in f.spots || spotId in f.parked) f.copy(spots = f.spots - spotId, parked = f.parked - spotId) else f })

  /** The star on a town: followed alone, at the end, the shown place unchanged. Null when a place there is followed already. */
  fun starTown(c: Choices, place: Place): Pair<Choices, Starred>? {
    val town = place.copy(here = false)
    val followed = FollowedPlace(town, emptyList())
    if (c.places.any { it.key == followed.key }) return null
    return Choices(c.places + followed, c.current) to Starred.Town(followed.key, town.label)
  }

  /** What « Annuler » leaves: the spot no longer followed, or the place added taken away. */
  fun undo(c: Choices, s: Starred): Choices =
    when (s) {
      is Starred.Joined -> unstarSpot(c, s.spot)
      is Starred.WithPlace,
      is Starred.Town -> c.places.indexOfFirst { it.key == s.place }.let { if (it < 0) c else c.remove(it) }
    }
}
