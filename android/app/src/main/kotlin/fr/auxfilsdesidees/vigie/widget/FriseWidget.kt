package fr.auxfilsdesidees.vigie.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.PreviewSizeMode
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.currentState
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition

/**
 * « Vigie · la frise »: the site's small widget (piste F of 2026-11-27, [BoardArt.frise]) at every size: the weather now,
 * the place and the warning; the next hour as its twelve steps of rain, then the next hours or the next days (chosen per
 * widget, [PlaceWidget.FORECAST]); the sentence of the rain. Taller, the frise is drawn larger in the middle of the height,
 * with the days under the hours from about four rows. Same place, same state, same refresh and same touch as the place
 * widget ([PlaceWidget]).
 */
class FriseWidget : GlanceAppWidget() {
  override val sizeMode: SizeMode = SizeMode.Exact

  override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
    val first = PlaceWidget.load(context, getAppWidgetState(context, PreferencesGlanceStateDefinition, id))
    provideContent {
      val prefs = currentState<Preferences>()
      var content by remember { mutableStateOf(first) }
      val key = prefs[PlaceWidget.PLACE]
      val stamp = prefs[PlaceWidget.STAMP] ?: 0L
      LaunchedEffect(key, stamp) { if (content.key != key || content.stamp != stamp) content = PlaceWidget.load(context, prefs) }
      val forecast = BoardWidget.forecast(prefs[PlaceWidget.FORECAST])
      Frame(content, appWidgetId) { WidgetReady(it, forecast, card = false) }
    }
  }

  /** The widget list's picture: the same code on made-up hours (Android 15 and later; see [WidgetRefresh.publishPreview]). */
  override val previewSizeMode: PreviewSizeMode = SizeMode.Responsive(setOf(DpSize(300.dp, 200.dp)))

  override suspend fun providePreview(context: Context, widgetCategory: Int) {
    val now = System.currentTimeMillis() / 1000
    val view = BoardWidget.sample(now, phoneOffsetS())
    provideContent { Frame(Content.Ready("", 0L, view, null, now), AppWidgetManager.INVALID_APPWIDGET_ID) { WidgetReady(it, BoardWidget.Forecast.Hours, card = false) } }
  }
}
