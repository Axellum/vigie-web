package fr.auxfilsdesidees.vigie.notify

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import fr.auxfilsdesidees.vigie.data.AppData

/**
 * Receives the messages of Firebase Cloud Messaging. When the app is closed or in the background, Android
 * shows a notification message itself and this service is not called; when the app is open, the message comes
 * here and the app shows it the same way.
 */
class VigieMessagingService : FirebaseMessagingService() {
  @Suppress("OVERRIDE_DEPRECATION") // The server addresses a token, which Firebase may renew.
  override fun onNewToken(token: String) {
    VigieNotifications.remember(this, token)
    // A new token: the server of the bells must send to it from now on.
    if (AppData.places(this).load().belled.isNotEmpty()) PhoneBells.later(this)
  }

  override fun onMessageReceived(message: RemoteMessage) {
    val notification = message.notification ?: return
    VigieNotifications.show(
      this,
      notification.title,
      notification.body,
      notification.channelId,
      message.data[VigieNotifications.EXTRA_URL],
      message.data[VigieNotifications.EXTRA_TAG],
      message.data[VigieNotifications.EXTRA_POINT],
    )
  }
}
