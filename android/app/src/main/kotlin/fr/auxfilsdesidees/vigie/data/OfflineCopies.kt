package fr.auxfilsdesidees.vigie.data

import java.io.File
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.put

/** Where the copies are kept, one text per name: a folder of the app on the phone, a map in the tests. */
interface Shelf {
  fun read(name: String): String?

  fun write(name: String, text: String)

  fun delete(name: String)

  fun names(): List<String>
}

/**
 * The texts of the last good read of a place, as the API served them: the point, the activities overview cut down to the
 * place's spots, the favourite spot's hours and the official warnings (the last three null when they were not read).
 */
data class RawRead(val point: String, val overview: String?, val favourite: String?, val vigilances: String?)

/**
 * The last good read of every followed place, kept on the phone so that the place shows at once, and without network,
 * with the time of that read. Nothing leaves the phone; a place no longer followed loses its copy. An unreadable copy
 * reads as no copy: the place then waits for the network as before.
 */
class OfflineCopies(private val shelf: Shelf) {
  fun save(place: Place, raw: RawRead) {
    val text =
      buildJsonObject {
          put("version", VERSION)
          put("point", raw.point)
          put("overview", raw.overview)
          put("favourite", raw.favourite)
          put("vigilances", raw.vigilances)
        }
        .toString()
    shelf.write(nameOf(place), text)
  }

  fun read(place: Place): RawRead? =
    try {
      val root = shelf.read(nameOf(place))?.let { Json.parseToJsonElement(it) as? JsonObject }
      val point = root?.text("point")
      if (root == null || point == null || (root["version"] as? JsonPrimitive)?.contentOrNull != VERSION.toString()) null
      else RawRead(point, root.text("overview"), root.text("favourite"), root.text("vigilances"))
    } catch (err: Exception) {
      null
    }

  fun forget(place: Place) = shelf.delete(nameOf(place))

  /** Remove the copies of the places no longer followed (a removal cut short, a read that ended after it). */
  fun keepOnly(places: List<Place>) {
    val kept = places.map(::nameOf).toSet()
    shelf.names().filter { it !in kept }.forEach(shelf::delete)
  }

  private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.contentOrNull

  companion object {
    private const val VERSION = 1

    /** « 47.7500_-3.3700 »: the followed place's key, the same four decimals, fit for a file name. */
    fun nameOf(place: Place): String = FollowedPlace(place, emptyList()).key.replace(',', '_')
  }
}

/** A folder of the app on the phone, one file per name, each written whole before it replaces the old one. */
class FolderShelf(private val dir: File) : Shelf {
  override fun read(name: String): String? = file(name).takeIf { it.isFile }?.readText(Charsets.UTF_8)

  override fun write(name: String, text: String) {
    dir.mkdirs()
    val tmp = File(dir, "$name$SUFFIX.tmp")
    tmp.writeText(text, Charsets.UTF_8)
    if (!tmp.renameTo(file(name))) {
      tmp.delete()
      error("copy not kept: $name")
    }
  }

  override fun delete(name: String) {
    file(name).delete()
  }

  override fun names(): List<String> = dir.listFiles().orEmpty().map { it.name }.filter { it.endsWith(SUFFIX) }.map { it.removeSuffix(SUFFIX) }

  private fun file(name: String) = File(dir, "$name$SUFFIX")

  private companion object {
    const val SUFFIX = ".json"
  }
}
