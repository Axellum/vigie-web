package fr.auxfilsdesidees.vigie.notify

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import fr.auxfilsdesidees.vigie.data.ApiException
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CancellationException

/**
 * The link to an account on the phone ([AccountLinking] over the app's preferences, the same site as the bells): read
 * by the page of the places, and run again by WorkManager when Firebase gives a new token, so the account's alerts
 * follow it.
 */
object PhoneAccount {
  private const val NOW = "vigie-account"

  fun linking(context: Context): AccountLinking =
    AccountLinking(PhoneBells.prefs(context), AccountServer(PhoneBells.siteUrl(context))) { VigieNotifications.token(context) }

  /** Whether the phone is linked to an account (it has a secret). */
  fun linked(context: Context): Boolean = linking(context).secret != null

  /** The account page that fills the code in: the part after `#` never leaves the phone's browser. */
  fun pageUrl(context: Context, code: String): String = "${PhoneBells.siteUrl(context).trimEnd('/')}/account#link=$code"

  /** Gives the new token and reads the account again in the background, as soon as the network is there. */
  fun later(context: Context) {
    val request =
      OneTimeWorkRequestBuilder<AccountWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
        .build()
    WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, request)
  }

  fun describe(err: Exception): String =
    when (err) {
      is ApiException ->
        when (err.status) {
          404 -> "Le serveur de Vigie ne relie pas encore l'appli à un compte."
          429 -> "Trop de codes demandés d'un coup : réessayez dans quelques minutes."
          else -> "Le serveur de Vigie a répondu une erreur (${err.status})."
        }
      is IOException -> "Pas de réponse du serveur de Vigie. Vérifiez la connexion."
      else -> "Le compte n'a pas pu être lu. Nouvel essai plus tard."
    }
}

/** The background read of the account (a new token first): tried again, with growing pauses, while the network fails. */
class AccountWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result =
    try {
      PhoneAccount.linking(applicationContext).refresh()
      Result.success()
    } catch (err: CancellationException) {
      throw err
    } catch (err: IOException) {
      if (runAttemptCount < MAX_TRIES) Result.retry() else Result.failure()
    } catch (err: Exception) {
      Result.failure()
    }

  private companion object {
    const val MAX_TRIES = 6
  }
}
