package fr.auxfilsdesidees.vigie.data

import java.math.BigDecimal
import java.math.RoundingMode
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull

/**
 * The base maps of the sea map (the sketches chosen by the author on 28/11/2026): the site's dark plan (OpenFreeMap, the
 * whole world) at first, the IGN's plan and its photographs as options (France and its overseas departments). [id] is
 * what the phone keeps of the choice.
 */
enum class MapBackground(val id: String) {
  Dark("dark"),
  PlanIgn("plan-ign"),
  PhotoIgn("photo-ign");

  companion object {
    /** The background kept on the phone; the dark plan for anything else. */
    fun of(id: String?): MapBackground = entries.firstOrNull { it.id == id } ?: Dark
  }
}

/** The four activities of the sea map, as the chips of the site's `/sea` page (the API's ids). */
enum class MapActivity(val id: String) {
  Surf("surf"),
  Kite("kite"),
  Boat("boat"),
  ShoreFishing("shore_fishing"),
}

/**
 * A pin of the sea map: a spot that can be judged for the activity chosen, its verdict and the few figures of the current
 * hour that activity is judged on, with the way the tide goes.
 */
data class MapPin(
  val id: String,
  val name: String,
  val place: String?,
  val lat: Double,
  val lon: Double,
  /** good, possible, poor; null when the API could not judge it. */
  val verdict: String?,
  /** 0 good, 1 possible, 2 poor, 3 no verdict: where two pins would touch, the lower is kept. */
  val rank: Int,
  /** The figures of the hour: `2,5 m · 12 s`, `26 km/h`, `tiers bas`; null when the API gave none. */
  val text: String?,
  /** rising or falling, on every spot the tide model reaches; null elsewhere. */
  val tide: String?,
  /**
   * Where the wind of the hour comes from, in degrees, for the kite and the boat (whose figure is the wind), as the site's
   * arrow after the speed; to 15° (a few pictures for the whole coast, the same arrow to the eye). Null otherwise.
   */
  val windFrom: Int? = null,
)

/**
 * The sea map of the app, as the site's (`src/lib/sea/map.ts` of vigie-web, page `/sea`): one pin per spot that can be
 * judged for the activity chosen, in the blue of its verdict, with the figures of the current hour (the swell for the surf,
 * the wind for the kite and the boat, the tide for shore fishing) and the way the tide goes. The verdicts are the API's
 * (`/v1/activities/overview`), the figures of the hour too (`/v1/surf/overview`, joined by the spot's id); a figure the
 * API did not give is left out, never guessed. Nothing here is for safety.
 *
 * The base map is the site's dark style (`/data/basemap/dark.json`, OpenFreeMap), with the site's two changes: the names
 * in French where the tiles have them, and its own land and water.
 */
object SeaMap {
  /** The site's `--map-land` and `--map-water` of the dark theme (`src/app.css`). */
  const val LAND = "#1b2a33"
  const val WATER = "#0a141b"

  /** The blue ramp of the site's surf map, dark theme (`--surf-q0` to `--surf-q3`): the verdict's band, -1 without one. */
  val BAND_COLOURS = mapOf(0 to "#2a3b46", 1 to "#2f6185", 2 to "#4f97c9", 3 to "#9fd3f5")

  /** The band of a verdict (`BAND` of the site): good 3, possible 2, poor 0, none -1. */
  fun band(verdict: String?): Int =
    when (verdict) {
      "good" -> 3
      "possible" -> 2
      "poor" -> 0
      else -> -1
    }

  private fun rank(verdict: String?): Int =
    when (verdict) {
      "good" -> 0
      "possible" -> 1
      "poor" -> 2
      else -> 3
    }

  /**
   * One pin per spot of the overview whose [activity] is available, with the figures of its current hour when the surf
   * overview has the spot (without it, the pins keep their verdict and nothing else). A spot without a point is left out.
   */
  fun pins(overview: String, surf: String?, activity: MapActivity): List<MapPin> {
    val now: Map<String, JsonObject> =
      surf?.let { text ->
        runCatching {
            Json.parseToJsonElement(text).obj()["spots"].arr().mapNotNull { it.objOrNull() }.mapNotNull { s ->
              val id = s["id"].str() ?: return@mapNotNull null
              s["now"].objOrNull()?.let { id to it }
            }
          }
          .getOrNull()
          ?.toMap()
      } ?: emptyMap()
    return Json.parseToJsonElement(overview).obj()["spots"].arr().mapNotNull { it.objOrNull() }.mapNotNull { s ->
      val id = s["id"].str() ?: return@mapNotNull null
      val lat = s["lat"].dbl() ?: return@mapNotNull null
      val lon = s["lon"].dbl() ?: return@mapNotNull null
      val a = s["activities"].arr().mapNotNull { it.objOrNull() }.firstOrNull { it["id"].str() == activity.id } ?: return@mapNotNull null
      if (a["available"].bool() != true) return@mapNotNull null
      val verdict = a["verdict"].str()?.takeIf { it in VERDICTS }
      val hour = now[id]
      MapPin(
        id = id,
        name = s["name"].str() ?: id,
        place = s["place"].str(),
        lat = lat,
        lon = lon,
        verdict = verdict,
        rank = rank(verdict),
        text = pinText(activity, hour),
        tide = hour?.get("tide").objOrNull()?.get("trend").str()?.takeIf { it == "rising" || it == "falling" },
        windFrom =
          if (activity == MapActivity.Kite || activity == MapActivity.Boat) hour?.get("wind").objOrNull()?.get("from_deg").dbl()?.let(::windStep)
          else null,
      )
    }
  }

  /**
   * The figures a pin shows for an activity, from the current hour of the spot (`now` of `/v1/surf/overview`): the swell's
   * height and period for the surf, the mean wind for the kite and the boat, the third of the tide range for shore
   * fishing (else its height). Null when the API gave none of them.
   */
  fun pinText(activity: MapActivity, now: JsonObject?): String? {
    now ?: return null
    return when (activity) {
      MapActivity.Surf -> {
        val swell = now["swell"].objOrNull() ?: return null
        val height = swell["height_m"].dbl() ?: return null
        val period = swell["period_s"].dbl()
        if (period == null) "${number(height, 1)}${NBSP}m" else "${number(height, 1)}${NBSP}m · ${number(period, 0)}${NBSP}s"
      }
      MapActivity.Kite,
      MapActivity.Boat -> now["wind"].objOrNull()?.get("speed_kmh").dbl()?.let { "${number(it, 0)}${NBSP}km/h" }
      MapActivity.ShoreFishing -> {
        val tide = now["tide"].objOrNull() ?: return null
        when (tide["stage"].str()) {
          "low" -> "tiers bas"
          "mid" -> "mi-marée"
          "high" -> "tiers haut"
          else -> tide["height_m"].dbl()?.let { h -> "${if (h >= 0) "+" else ""}${number(h, 1)}${NBSP}m" }
        }
      }
    }
  }

  /** A direction to the nearest 15°, from 0 to 345. */
  internal fun windStep(deg: Double): Int = ((Math.round(deg / 15.0) * 15) % 360 + 360).toInt() % 360

  /**
   * The name of the picture of a pin's label: pins that look the same share one (the verdict's band, the way the tide
   * goes, the wind's direction, the figures). Null for a pin without figures, which is a dot only.
   */
  fun labelKey(pin: MapPin): String? = pin.text?.let { "vigie-pin:${band(pin.verdict)}:${pin.tide ?: "-"}:${pin.windFrom ?: "-"}:$it" }

  /**
   * The pins as GeoJSON for the map: a point each, with its id, its band (the colour of its dot), its rank (the lower is
   * placed first where labels would touch), the name of its label's picture when it has one, and `followed` for the spots
   * in [followed] (a star in place of the dot).
   */
  fun features(pins: List<MapPin>, followed: Set<String> = emptySet()): String =
    collection(
      pins.map { p ->
        point(
          p.lat,
          p.lon,
          buildMap {
            put("id", JsonPrimitive(p.id))
            put("band", JsonPrimitive(band(p.verdict)))
            put("rank", JsonPrimitive(p.rank))
            labelKey(p)?.let { put("label", JsonPrimitive(it)) }
            if (p.id in followed) put("followed", JsonPrimitive(true))
          },
        )
      }
    )

  /** The name of the picture of a followed place on the map: a star and its name in a pill. */
  fun placeKey(name: String): String = "vigie-place:$name"

  /** The followed places the map marks ([Favourites.places]), as GeoJSON: their key and the name of their picture. */
  fun placeFeatures(places: List<FollowedPlace>): String =
    collection(places.map { f -> point(f.place.lat, f.place.lon, mapOf("key" to JsonPrimitive(f.key), "image" to JsonPrimitive(placeKey(f.place.label)))) })

  private fun collection(features: List<JsonObject>): String =
    JsonObject(mapOf("type" to JsonPrimitive("FeatureCollection"), "features" to JsonArray(features))).toString()

  private fun point(lat: Double, lon: Double, properties: Map<String, JsonElement>): JsonObject =
    JsonObject(
      mapOf(
        "type" to JsonPrimitive("Feature"),
        "geometry" to JsonObject(mapOf("type" to JsonPrimitive("Point"), "coordinates" to JsonArray(listOf(JsonPrimitive(lon), JsonPrimitive(lat))))),
        "properties" to JsonObject(properties),
      )
    )

  /**
   * A number as the site writes it in French (`toLocaleString('fr-FR', { maximumFractionDigits })`): at most [digits]
   * decimals, half away from zero, no trailing zero, a comma.
   */
  internal fun number(value: Double, digits: Int): String {
    val text = BigDecimal(value.toString()).setScale(digits, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString()
    return (if (text == "-0") "0" else text).replace('.', ',')
  }

  /**
   * The site's dark style (`/data/basemap/dark.json`) changed as the site changes it once loaded (`MapView.svelte`): every
   * label that names a place in English takes its French name where the tiles have one (`name:fr`), and the land and the
   * water take the site's colours. The rest is kept as served.
   */
  fun styleForApp(style: String): String {
    val root = Json.parseToJsonElement(style).obj()
    val layers =
      root["layers"].arr().map { element ->
        val layer = element.objOrNull() ?: return@map element
        when {
          layer["id"].str() == "background" -> layer.withPaint("background-color", LAND)
          layer["id"].str() == "water" -> layer.withPaint("fill-color", WATER)
          layer["type"].str() == "symbol" -> layer.inFrench()
          else -> layer
        }
      }
    return JsonObject(root + ("layers" to JsonArray(layers))).toString()
  }

  /**
   * The layers of the base map that name the towns, the ones a touch opens a town's sheet from: OpenMapTiles' `place`
   * layer (the dark plan and the photos), or the IGN's `toponyme_localite_ponc` (its plan). The names of countries,
   * regions and seas are not towns. Empty for a style that is not read.
   */
  fun townLayers(style: String): List<String> =
    runCatching { Json.parseToJsonElement(style).obj()["layers"].arr() }
      .getOrDefault(emptyList())
      .mapNotNull { it.objOrNull() }
      .filter { it["type"].str() == "symbol" }
      .filter { layer ->
        val id = layer["id"].str().orEmpty()
        when (layer["source-layer"].str()) {
          "place" -> TOWN_WORDS.any { id.contains(it) } || TOWN_CLASSES.any { layer["filter"].toString().contains("\"$it\"") }
          IGN_TOWNS -> id.contains("localite")
          else -> false
        }
      }
      .mapNotNull { it["id"].str() }

  /** The classes of OpenMapTiles' places that are towns: a touch on another (a country, a region) opens nothing. */
  val TOWN_CLASSES = setOf("city", "town", "village", "hamlet", "suburb")
  private val TOWN_WORDS = setOf("city", "town", "village", "hamlet", "suburb")
  private const val IGN_TOWNS = "toponyme_localite_ponc"

  /** The names a town's label is read from: French first (OpenMapTiles), the IGN's `texte`, then the others. */
  val TOWN_NAMES = listOf("name:fr", "texte", "name", "name_en")

  /** Whether [text] is a map style: an object with its layers. */
  fun isStyle(text: String): Boolean = runCatching { Json.parseToJsonElement(text).obj()["layers"] is JsonArray }.getOrDefault(false)

  /** The style of the IGN's plan (the Géoplateforme's vector tiles), served as it is: in French, with its own colours. */
  const val PLAN_IGN_STYLE = "https://data.geopf.fr/annexes/ressources/vectorTiles/styles/PLAN.IGN/standard.json"

  /** The IGN's aerial photographs (WMTS, zoom 0 to 19, France and its overseas departments). */
  const val IGN_PHOTOS =
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
  private const val PHOTOS = "ign-photos"
  private const val WATER_OVER = "water-over-photos"

  /**
   * The app's dark style ([styleForApp]) over the IGN's photographs (the sketch chosen on 28/11/2026): the photos under the
   * names, and the dark sea over the photos, since out at sea the IGN serves white pictures. Nothing else of the base map
   * is kept: its roads and borders are on the photos. The names are written in white, ringed with dark, to be read on them.
   */
  fun styleWithPhotos(appStyle: String): String {
    val root = Json.parseToJsonElement(appStyle).obj()
    val layers = root["layers"].arr().mapNotNull { it.objOrNull() }
    val water = layers.firstOrNull { it["id"].str() == "water" }
    val photos = JsonObject(mapOf("id" to JsonPrimitive(PHOTOS), "type" to JsonPrimitive("raster"), "source" to JsonPrimitive(PHOTOS), "paint" to JsonObject(mapOf("raster-fade-duration" to JsonPrimitive(0)))))
    val kept =
      buildList {
        layers.firstOrNull { it["id"].str() == "background" }?.let(::add)
        add(photos)
        water?.let { add(JsonObject(it + ("id" to JsonPrimitive(WATER_OVER)))) }
        layers.filter { it["type"].str() == "symbol" }.forEach { add(if (it["layout"].objOrNull()?.get("text-field") != null) it.onPhotos() else it) }
      }
    val source =
      JsonObject(
        mapOf(
          "type" to JsonPrimitive("raster"),
          "tiles" to JsonArray(listOf(JsonPrimitive(IGN_PHOTOS))),
          "tileSize" to JsonPrimitive(256),
          "maxzoom" to JsonPrimitive(19),
          "attribution" to JsonPrimitive("© IGN"),
        )
      )
    val sources = root["sources"].objOrNull() ?: JsonObject(emptyMap())
    return JsonObject(root + mapOf("sources" to JsonObject(sources + (PHOTOS to source)), "layers" to JsonArray(kept))).toString()
  }

  private fun JsonObject.onPhotos(): JsonObject {
    val paint = this["paint"].objOrNull() ?: JsonObject(emptyMap())
    val white = mapOf("text-color" to JsonPrimitive(PHOTO_TEXT), "text-halo-color" to JsonPrimitive(PHOTO_HALO), "text-halo-width" to JsonPrimitive(1.6))
    return JsonObject(this + ("paint" to JsonObject(paint + white)))
  }

  private const val PHOTO_TEXT = "#f6f8fb"
  private const val PHOTO_HALO = "#0a141b"

  private fun JsonObject.withPaint(key: String, value: String): JsonObject {
    val paint = this["paint"].objOrNull() ?: JsonObject(emptyMap())
    return JsonObject(this + ("paint" to JsonObject(paint + (key to JsonPrimitive(value)))))
  }

  /** `localizedTextField` of the site: `["coalesce", ["get", "name:fr"], <the field>]` when the field reads `name_en`. */
  private fun JsonObject.inFrench(): JsonObject {
    val layout = this["layout"].objOrNull() ?: return this
    val field = layout["text-field"] ?: return this
    if (!field.toString().contains("\"name_en\"")) return this
    val french = JsonArray(listOf(JsonPrimitive("coalesce"), JsonArray(listOf(JsonPrimitive("get"), JsonPrimitive("name:fr"))), field))
    return JsonObject(this + ("layout" to JsonObject(layout + ("text-field" to french))))
  }

  private val VERDICTS = setOf("good", "possible", "poor")
  private const val NBSP = ' '

  private fun JsonElement.obj(): JsonObject = this as? JsonObject ?: JsonObject(emptyMap())

  private fun JsonElement?.objOrNull(): JsonObject? = this as? JsonObject

  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()

  private fun JsonElement?.prim(): JsonPrimitive? = if (this == null || this is JsonNull) null else this as? JsonPrimitive

  private fun JsonElement?.str(): String? = prim()?.takeIf { it.isString }?.contentOrNull

  private fun JsonElement?.dbl(): Double? = prim()?.takeUnless { it.isString }?.doubleOrNull

  private fun JsonElement?.bool(): Boolean? = prim()?.booleanOrNull
}

/**
 * The reads of the sea map: the site's dark style, the API's verdicts of every spot and the figures of their current hour
 * (two requests to the API each time the map opens, none to `/v1/point`), and the weather of a town whose sheet is opened:
 * `/v1/point` there, as the Accueil reads it, through the map's [gate] (the server limits that route per address).
 */
class SeaMapReader(
  private val baseUrl: String = VigieRepository.BASE_URL,
  private val siteUrl: String = VigieRepository.BASE_URL,
  private val gate: PointGate = PointGate(),
  /** The images of the forecast wind. */
  private val fetchBytes: suspend (String) -> ByteArray = { VigieRepository.httpGetBytes(it) },
  private val fetch: suspend (String) -> String = VigieRepository::httpGet,
) {
  /** The weather of [place] for its sheet, after waiting for the gate. */
  suspend fun point(place: Place): PointNow {
    gate.take()
    return VigieParser.point(fetch(String.format(java.util.Locale.ROOT, "%s/v1/point?lat=%.4f&lon=%.4f&compact=false", baseUrl, place.lat, place.lon)))
  }

  suspend fun style(): String = SeaMap.styleForApp(fetch("$siteUrl/data/basemap/dark.json"))

  /** The IGN's plan, its style as the IGN serves it; an [Exception] when the answer is not a style (a page of maintenance). */
  suspend fun planIgn(): String = fetch(SeaMap.PLAN_IGN_STYLE).also { require(SeaMap.isStyle(it)) { "the IGN's plan is not a style" } }

  suspend fun overview(): String = fetch("$baseUrl/v1/activities/overview")

  /** The radar's images of [area] on the site (the API's, relayed and kept a few minutes by the site). */
  suspend fun radar(area: RadarArea): Radar = MapWeather.radar(fetch("$siteUrl/data/radar.json?area=${area.id}"), area)

  /** The wind measured in [box] (whole degrees, [MapWeather.windQueryBox]), on the site. */
  suspend fun wind(box: GeoBox): WindMap = MapWeather.wind(fetch("$siteUrl/data/wind.json?bbox=${MapWeather.windBox(box)}"), box)

  /** The address of the tiles of one radar image. */
  fun radarTiles(area: RadarArea, epoch: Long): String = MapWeather.radarTiles(siteUrl, area, epoch)

  /** The grids of the forecast wind of the hour, on the site. */
  suspend fun windField(): WindFieldAnswer = WindField.answer(fetch("$siteUrl/data/wind-field.json"))

  /** The image of one grid (a PNG), on the site: it never changes, its address holds its hour. */
  suspend fun windFieldImage(level: FieldLevel): ByteArray = fetchBytes("$siteUrl${level.image}")

  /** The weather of the towns' [cells] (at most [TownWeather.PER_REQUEST]), on the site: never `/v1/points` from the phone. */
  suspend fun towns(cells: List<TownCell>): TownsAnswer = TownWeather.towns(fetch(TownWeather.url(siteUrl, cells)))

  /** The figures of the hour are a bonus: without them the pins keep their verdict. */
  suspend fun surf(): String? =
    try {
      fetch("$baseUrl/v1/surf/overview")
    } catch (err: kotlinx.coroutines.CancellationException) {
      throw err
    } catch (err: Exception) {
      null
    }
}
