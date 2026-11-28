package fr.auxfilsdesidees.vigie.data

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import java.io.File

/**
 * Where the app and its widgets find the same data on the phone: the followed places (the app's private preferences) and
 * the last read of each place (a folder that the phone's backup leaves out: it is redone in seconds). One place for both,
 * so that a widget shows what the app read, and the other way round.
 */
object AppData {
  private const val PREFS = "vigie"
  private const val COPIES = "places"
  private const val BEACHES = "beaches"

  fun places(context: Context): PlacesStore =
    PlacesStore(PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)))

  fun copies(context: Context): OfflineCopies = OfflineCopies(FolderShelf(File(context.applicationContext.noBackupFilesDir, COPIES)))

  /**
   * The public API and site, or local ones in a debug build (the app's launch extras; the widgets always read the public
   * ones).
   */
  fun repository(context: Context, baseUrl: String = VigieRepository.BASE_URL, siteUrl: String = VigieRepository.BASE_URL): VigieRepository =
    VigieRepository(baseUrl, siteUrl, copies = copies(context))

  /** The name the app gave the phone's position before « Ici » followed it (a point taken once). */
  private val OLD_POSITION_NAMES = setOf("Ma position")

  /**
   * Once, after the update that brought « Ici »: the « Ma position » of before becomes the place « Ici » that follows the
   * phone, with its spots, its bell and its rank ([Choices.adoptHere]). The app and the widgets' refresh both call it;
   * the second call finds nothing to do.
   */
  fun adoptHere(context: Context) {
    val store = places(context)
    val before = store.load()
    val after = before.adoptHere(OLD_POSITION_NAMES)
    if (after != before) store.save(after)
  }

  /** The beaches of the Sea page, their last reads in a folder of their own (beside the places', which keep only theirs). */
  fun beaches(context: Context, baseUrl: String = VigieRepository.BASE_URL): BeachReader =
    BeachReader(baseUrl, FolderShelf(File(context.applicationContext.noBackupFilesDir, BEACHES)))
}

/** The app's private preferences on the phone (never shared with another app). */
private class PrefsKeyValue(private val prefs: SharedPreferences) : KeyValue {
  override fun read(key: String): String? = prefs.getString(key, null)

  override fun write(key: String, value: String) = prefs.edit { putString(key, value) }
}
