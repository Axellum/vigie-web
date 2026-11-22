package fr.auxfilsdesidees.vigie.ui

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The phone's position, approximate only (the « coarse » permission: a few hundred metres to a few kilometres), asked
 * once when the user touches « Utiliser ma position ». No Google service: the system's own location providers. The
 * caller rounds it to about 1 km before anything leaves the phone.
 */
object Locator {
  const val PERMISSION = Manifest.permission.ACCESS_COARSE_LOCATION

  fun granted(context: Context): Boolean = ContextCompat.checkSelfPermission(context, PERMISSION) == PackageManager.PERMISSION_GRANTED

  /** The current position, or the last known one, or null (location off, nothing within 20 s, permission withdrawn). */
  suspend fun locate(context: Context): Location? {
    val lm = context.getSystemService(LocationManager::class.java) ?: return null
    return try {
      val provider = provider(lm) ?: return lastKnown(lm)
      withTimeoutOrNull(20_000L) {
        suspendCancellableCoroutine { cont ->
          val signal = CancellationSignal()
          cont.invokeOnCancellation { signal.cancel() }
          LocationManagerCompat.getCurrentLocation(lm, provider, signal, ContextCompat.getMainExecutor(context)) { cont.resume(it) }
        }
      } ?: lastKnown(lm)
    } catch (err: SecurityException) {
      null
    }
  }

  /** The network first (enough for 1 km); on Android 12 and later, the fused or GPS provider also give a coarse position. */
  private fun provider(lm: LocationManager): String? {
    val candidates = buildList {
      add(LocationManager.NETWORK_PROVIDER)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        add(LocationManager.FUSED_PROVIDER)
        add(LocationManager.GPS_PROVIDER)
      }
    }
    return candidates.firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) }
  }

  private fun lastKnown(lm: LocationManager): Location? =
    try {
      lm.getLastKnownLocation(LocationManager.PASSIVE_PROVIDER)
    } catch (err: SecurityException) {
      null
    }
}
