package fr.auxfilsdesidees.vigie.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import androidx.core.content.edit
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import fr.auxfilsdesidees.vigie.data.AppData
import java.util.concurrent.TimeUnit
import kotlin.reflect.KClass
import kotlinx.coroutines.CancellationException

/**
 * Keeps the widgets current. Every half hour, and at once after a place is chosen, the places shown by a widget are read
 * again when their copy is older than a quarter of an hour; then every widget is drawn again, network or not, so that the
 * age of an old copy stays true. The app calls [redraw] after each read it keeps.
 */
object WidgetRefresh {
  private const val PERIODIC = "vigie-widgets"
  private const val NOW = "vigie-widgets-now"

  /** A copy younger than this is not read again by the refresh (the app may just have read it). */
  internal const val FRESH_S = 15 * 60L

  fun schedule(context: Context) {
    val request = PeriodicWorkRequestBuilder<RefreshWorker>(30, TimeUnit.MINUTES).build()
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, request)
  }

  fun now(context: Context) {
    WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<RefreshWorker>().build())
  }

  /** Stop the half-hourly read once no Vigie widget of either kind is left on the home screen. */
  fun cancelIfNone(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val left = RECEIVERS.sumOf { manager.getAppWidgetIds(ComponentName(context, it.java)).size }
    if (left == 0) WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
  }

  /** The two kinds of widget: the place ([PlaceWidget]) and the frise ([FriseWidget]). */
  private val RECEIVERS: List<KClass<out GlanceAppWidgetReceiver>> = listOf(PlaceWidgetReceiver::class, FriseWidgetReceiver::class)

  private fun widgets(): List<GlanceAppWidget> = listOf(PlaceWidget(), FriseWidget())

  /** The widget behind a home screen's widget id: the frise or the place. */
  fun widgetOf(context: Context, appWidgetId: Int): GlanceAppWidget {
    val provider = AppWidgetManager.getInstance(context).getAppWidgetInfo(appWidgetId)?.provider?.className
    return if (provider == FriseWidgetReceiver::class.java.name) FriseWidget() else PlaceWidget()
  }

  /**
   * Give the home screen's widget list its pictures of the widgets (Android 15 and later), once per install or update
   * of the app and per widget: the system limits how often an app may do it.
   */
  suspend fun publishPreview(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) return
    val installed = context.packageManager.getPackageInfo(context.packageName, android.content.pm.PackageManager.PackageInfoFlags.of(0)).lastUpdateTime
    val prefs = context.getSharedPreferences(PREVIEW_PREFS, Context.MODE_PRIVATE)
    for (receiver in RECEIVERS) {
      val done = "$PREVIEW_DONE:${receiver.java.simpleName}"
      if (prefs.getLong(done, 0L) == installed) continue
      val result = GlanceAppWidgetManager(context).setWidgetPreviews(receiver)
      if (result == GlanceAppWidgetManager.SET_WIDGET_PREVIEWS_RESULT_SUCCESS) prefs.edit { putLong(done, installed) }
    }
  }

  private const val PREVIEW_PREFS = "widgets"
  private const val PREVIEW_DONE = "preview_published_for"

  /** Draw every widget again from the copies on the phone, without the network. */
  suspend fun redraw(context: Context) {
    try {
      publishPreview(context)
    } catch (err: CancellationException) {
      throw err
    } catch (_: Exception) {
      // The widget list keeps its plain picture; the widgets are drawn all the same.
    }
    val manager = GlanceAppWidgetManager(context)
    val stamp = System.currentTimeMillis()
    for (widget in widgets()) {
      for (id in manager.getGlanceIds(widget.javaClass)) {
        updateAppWidgetState(context, id) { it[PlaceWidget.STAMP] = stamp }
        widget.update(context, id)
      }
    }
  }

  /**
   * A widget set on the « Ma position » of before kept that point as its key; once it became the place « Ici »
   * ([AppData.adoptHere]) the widget follows « Ici » instead. A key still followed, or another point, is left alone.
   */
  suspend fun rekeyHere(context: Context) {
    val choices = AppData.places(context).load()
    val here = choices.herePlace ?: return
    val old = here.place.pointKey
    if (choices.places.any { it.key == old }) return
    val manager = GlanceAppWidgetManager(context)
    for (widget in widgets()) {
      for (id in manager.getGlanceIds(widget.javaClass)) {
        if (getAppWidgetState(context, PreferencesGlanceStateDefinition, id)[PlaceWidget.PLACE] != old) continue
        updateAppWidgetState(context, id) {
          it[PlaceWidget.PLACE] = here.key
          it[PlaceWidget.NAME] = here.place.label
        }
        widget.update(context, id)
      }
    }
  }

  /** Read the places of the widgets that need it, then draw them all again. */
  internal suspend fun refresh(context: Context) {
    AppData.adoptHere(context)
    rekeyHere(context)
    val manager = GlanceAppWidgetManager(context)
    val keys =
      widgets()
        .flatMap { manager.getGlanceIds(it.javaClass) }
        .mapNotNull { getAppWidgetState(context, PreferencesGlanceStateDefinition, it)[PlaceWidget.PLACE] }
        .toSet()
    if (keys.isEmpty()) return
    val repository = AppData.repository(context)
    val now = System.currentTimeMillis() / 1000
    for (followed in AppData.places(context).load().places.filter { it.key in keys }) {
      val copy = repository.saved(followed.place, followed.spots)
      if (copy != null && now - copy.point.serverUtc < FRESH_S) continue
      try {
        repository.load(followed.place, followed.spots)
      } catch (err: CancellationException) {
        throw err
      } catch (_: Exception) {
        // No network, or the API failed: the copy stays, with its age.
      }
    }
    redraw(context)
  }
}

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    WidgetRefresh.refresh(applicationContext)
    return Result.success()
  }
}

/**
 * The home screen's door to a Vigie widget: it starts the half-hourly refresh with the first widget and stops it with
 * the last one, of either kind.
 */
abstract class VigieWidgetReceiver : GlanceAppWidgetReceiver() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    super.onUpdate(context, appWidgetManager, appWidgetIds)
    WidgetRefresh.schedule(context)
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    WidgetRefresh.schedule(context)
  }

  override fun onDisabled(context: Context) {
    super.onDisabled(context)
    WidgetRefresh.cancelIfNone(context)
  }
}

class PlaceWidgetReceiver : VigieWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = PlaceWidget()
}

class FriseWidgetReceiver : VigieWidgetReceiver() {
  override val glanceAppWidget: GlanceAppWidget = FriseWidget()
}
