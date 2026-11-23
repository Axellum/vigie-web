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

  fun places(context: Context): PlacesStore =
    PlacesStore(PrefsKeyValue(context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)))

  fun copies(context: Context): OfflineCopies = OfflineCopies(FolderShelf(File(context.applicationContext.noBackupFilesDir, COPIES)))

  /** The public API, or a local one in a debug build (the app's launch extra; the widgets always read the public one). */
  fun repository(context: Context, baseUrl: String = VigieRepository.BASE_URL): VigieRepository =
    VigieRepository(baseUrl, copies = copies(context))
}

/** The app's private preferences on the phone (never shared with another app). */
private class PrefsKeyValue(private val prefs: SharedPreferences) : KeyValue {
  override fun read(key: String): String? = prefs.getString(key, null)

  override fun write(key: String, value: String) = prefs.edit { putString(key, value) }
}
