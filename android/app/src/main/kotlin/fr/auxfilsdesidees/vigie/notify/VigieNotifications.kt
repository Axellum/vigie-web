package fr.auxfilsdesidees.vigie.notify

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import com.google.android.gms.tasks.Task
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import fr.auxfilsdesidees.vigie.MainActivity
import fr.auxfilsdesidees.vigie.R
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * The notifications of the app, through Firebase Cloud Messaging. The server names the category of each
 * message (`src/lib/server/fcm.ts`): [CHANNEL_RED] for a red alert, [CHANNEL_ALERTS] for the others and the
 * test. The app makes both categories; the person sets the sound and the vibration of each in Android.
 */
object VigieNotifications {
  const val CHANNEL_RED = "vigie-red"
  const val CHANNEL_ALERTS = "vigie-alerts"

  /** The `data` of a message, which Android puts in the extras of the app's launch when it is touched. */
  const val EXTRA_URL = "url"
  const val EXTRA_TAG = "tag"

  /** The point of the place a bell rang for (`lat,lon`), to open its warnings ([Bells.placeOf]). */
  const val EXTRA_POINT = "place"

  private const val PREFS = "notifications"
  private const val KEY_TOKEN = "fcm_token"

  /** Whether this build has a Firebase config: the builds of the CI have none, and offer no notification. */
  fun available(context: Context): Boolean = FirebaseApp.getApps(context).isNotEmpty()

  /** Whether Android lets the app show a notification (the permission of Android 13, the app's switch). */
  fun allowed(context: Context): Boolean {
    if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
        PackageManager.PERMISSION_GRANTED
  }

  /** Makes the two categories (Android 8 and later); making them again changes nothing the person set. */
  fun makeChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val red =
      NotificationChannel(CHANNEL_RED, context.getString(R.string.notify_channel_red), NotificationManager.IMPORTANCE_HIGH)
        .apply { description = context.getString(R.string.notify_channel_red_description) }
    val others =
      NotificationChannel(
          CHANNEL_ALERTS,
          context.getString(R.string.notify_channel_alerts),
          NotificationManager.IMPORTANCE_DEFAULT,
        )
        .apply { description = context.getString(R.string.notify_channel_alerts_description) }
    context.getSystemService(NotificationManager::class.java).createNotificationChannels(listOf(red, others))
  }

  /**
   * The registration token the server sends to, made at the first call: the automatic start of Firebase
   * Messaging stays off (manifest) until the person turns the notifications on.
   */
  @Suppress("DEPRECATION") // The server addresses a token (FCM HTTP v1 `message.token`), not an installation.
  suspend fun token(context: Context): String {
    val messaging = FirebaseMessaging.getInstance()
    messaging.isAutoInitEnabled = true
    val token = messaging.token.await()
    remember(context, token)
    return token
  }

  /** Keeps the last token Firebase gave (a new one comes after a restore or when Firebase renews it). */
  fun remember(context: Context, token: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putString(KEY_TOKEN, token) }
  }

  fun lastToken(context: Context): String? =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TOKEN, null)

  /**
   * Shows a message that came while the app was open: Android shows the others itself, in the category the
   * server named. Touching it opens the app with the message's address, as Android does.
   */
  @SuppressLint("MissingPermission") // allowed() checks the permission just before.
  fun show(context: Context, title: String?, body: String?, channel: String?, url: String?, tag: String?, point: String? = null) {
    if (!allowed(context)) return
    makeChannels(context)
    val red = channel == CHANNEL_RED
    val open =
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        url?.let { putExtra(EXTRA_URL, it) }
        tag?.let { putExtra(EXTRA_TAG, it) }
        point?.let { putExtra(EXTRA_POINT, it) }
      }
    val pending =
      PendingIntent.getActivity(
        context,
        (tag ?: url ?: "").hashCode(),
        open,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    val notification =
      NotificationCompat.Builder(context, if (red) CHANNEL_RED else CHANNEL_ALERTS)
        .setSmallIcon(R.drawable.ic_notification)
        .setColor(ACCENT)
        .setContentTitle(title)
        .setContentText(body)
        .setStyle(NotificationCompat.BigTextStyle().bigText(body))
        .setPriority(if (red) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
        .setAutoCancel(true)
        .setContentIntent(pending)
        .build()
    NotificationManagerCompat.from(context).notify(tag, 0, notification)
  }

  /** The accent of the charter (`VigieColors.Accent`), which Android gives the small icon. */
  private const val ACCENT = 0xFFFFC857.toInt()
}

/** The result of a Play services task, without one more library for it. */
private suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { cont ->
  addOnCompleteListener { task ->
    val failure = task.exception
    if (task.isSuccessful) cont.resume(task.result)
    else cont.resumeWithException(failure ?: IllegalStateException("Firebase task cancelled"))
  }
}
