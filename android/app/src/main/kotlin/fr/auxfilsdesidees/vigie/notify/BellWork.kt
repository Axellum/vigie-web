package fr.auxfilsdesidees.vigie.notify

import android.content.Context
import android.content.pm.ApplicationInfo
import androidx.core.content.edit
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import fr.auxfilsdesidees.vigie.data.AppData
import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.KeyValue
import fr.auxfilsdesidees.vigie.data.VigieRepository
import java.io.IOException
import java.util.TimeZone
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

/**
 * The bells on the phone: the sync with the server ([BellSync]) over the app's preferences, run at once by the page of
 * the places and again by WorkManager when it failed, when Firebase gives a new token, and once a day while a bell is on
 * (the server forgets a phone it has not heard of for 60 days).
 */
object PhoneBells {
  private const val PREFS = "notifications"
  private const val KEY_SITE = "debug_site_url"
  private const val NOW = "vigie-bells"
  private const val DAILY = "vigie-bells-daily"

  private fun prefs(context: Context): KeyValue {
    val p = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return object : KeyValue {
      override fun read(key: String): String? = p.getString(key, null)

      override fun write(key: String, value: String) = p.edit { putString(key, value) }
    }
  }

  /** The site that keeps the bells: the public one, or a local one a debug build was started with (loopback only). */
  private fun siteUrl(context: Context): String {
    val debug = (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    return prefs(context).read(KEY_SITE)?.takeIf { debug && it.isNotEmpty() } ?: VigieRepository.BASE_URL
  }

  /** A debug build only (see `MainActivity.localApi`): the bells go to this local site until the next start without it. */
  fun useLocalSite(context: Context, url: String?) = prefs(context).write(KEY_SITE, url.orEmpty())

  private fun sync(context: Context): BellSync =
    BellSync(prefs(context), BellServer(siteUrl(context))) { VigieNotifications.token(context) }

  /** Tells the server the bells of now; a failure is tried again in the background ([retry], the page's call). */
  suspend fun run(context: Context, retry: Boolean = true): BellState {
    val choices = AppData.places(context).load()
    // The categories exist before the first message: Android files a message of an unknown category elsewhere.
    if (choices.belled.isNotEmpty() && VigieNotifications.available(context)) VigieNotifications.makeChannels(context)
    val state =
      try {
        if (choices.belled.isNotEmpty() && !VigieNotifications.available(context)) BellState.Failed(NO_FIREBASE)
        else sync(context).sync(choices, TimeZone.getDefault().id)
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        BellState.Failed(describe(err))
      }
    val work = WorkManager.getInstance(context)
    when (state) {
      is BellState.Failed -> if (retry && state.message != NO_FIREBASE) later(context)
      is BellState.On -> work.enqueueUniquePeriodicWork(DAILY, ExistingPeriodicWorkPolicy.KEEP, daily())
      BellState.Off -> work.cancelUniqueWork(DAILY)
    }
    return state
  }

  /** A test notification: how many were sent, or why not. */
  suspend fun test(context: Context): Result<Int?> =
    try {
      Result.success(sync(context).test())
    } catch (err: CancellationException) {
      throw err
    } catch (err: Exception) {
      Result.failure(IOException(describe(err)))
    }

  /** Sync in the background, as soon as the network is there. */
  fun later(context: Context) {
    val request =
      OneTimeWorkRequestBuilder<BellWorker>()
        .setConstraints(online())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, request)
  }

  private fun daily() = PeriodicWorkRequestBuilder<BellWorker>(1, TimeUnit.DAYS).setConstraints(online()).build()

  private fun online() = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

  private const val NO_FIREBASE = "Cette version de l'appli ne reçoit pas de notification."

  fun describe(err: Exception): String =
    when (err) {
      is ApiException ->
        when (err.status) {
          503 -> "Le serveur de Vigie ne peut plus prendre de téléphone pour l'instant."
          429 -> "Trop d'essais d'un coup : réessayez dans une heure."
          404 -> "Le serveur de Vigie n'envoie pas encore de notification."
          else -> "Le serveur de Vigie a répondu une erreur (${err.status})."
        }
      is IOException -> "Pas de réponse du serveur de Vigie. Nouvel essai plus tard."
      else -> "Les notifications n'ont pas pu être réglées. Nouvel essai plus tard."
    }
}

/** The background sync of the bells: tried again (with growing pauses) while it fails. */
class BellWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result =
    when (PhoneBells.run(applicationContext, retry = false)) {
      is BellState.Failed -> if (runAttemptCount < MAX_TRIES) Result.retry() else Result.failure()
      else -> Result.success()
    }

  private companion object {
    const val MAX_TRIES = 6
  }
}
