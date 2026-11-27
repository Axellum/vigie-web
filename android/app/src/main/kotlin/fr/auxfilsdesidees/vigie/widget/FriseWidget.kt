package fr.auxfilsdesidees.vigie.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.PreviewSizeMode
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.currentState
import androidx.glance.layout.ContentScale
import androidx.glance.layout.size
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition
import fr.auxfilsdesidees.vigie.R

/**
 * « Vigie · la frise »: the next twelve hours of a followed place, hour by hour, in the look of the home page of the Home
 * Assistant card ([BoardArt.frise], piste B of 2026-11-27): the header (the place, the weather now, the warning), the
 * « Lueur » columns; with the room of about three rows, the rain tile of the hour above them; with about four, the tide
 * and the surf of the favourite spot under them. Same place, same state, same refresh and same touch as the place widget
 * ([PlaceWidget]).
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
      Frame(content, appWidgetId) { FriseReady(it, null) }
    }
  }

  /** The widget list's picture: the same code on made-up hours (Android 15 and later; see [WidgetRefresh.publishPreview]). */
  // The size the widget list shows it at (four cells by two): the columns alone, no room for the tide.
  override val previewSizeMode: PreviewSizeMode = SizeMode.Responsive(setOf(DpSize(300.dp, 200.dp)))

  override suspend fun providePreview(context: Context, widgetCategory: Int) {
    val now = System.currentTimeMillis() / 1000
    val offset = phoneOffsetS()
    val view = BoardWidget.sample(now, offset)
    val sea = BoardWidget.seaOf(FriseModel.sample(now, offset))
    provideContent { Frame(Content.Ready("", 0L, view, null, now), AppWidgetManager.INVALID_APPWIDGET_ID) { FriseReady(it, sea) } }
  }
}

/** The frise drawn as one picture in the room of the widget ([example]: the sea of the widget list's example). */
@Composable
private fun FriseReady(r: Content.Ready, example: BoardWidget.Sea?) {
  val context = LocalContext.current
  val room = room()
  val sea = remember(r) { example ?: r.snapshot?.let { BoardWidget.sea(it, r.nowUtc) } }
  val picture =
    remember(r.view, sea, room) {
      if (room.width < 40.dp || room.height < 40.dp) null else BoardArt.frise(context, r.view, sea, room.width.value, room.height.value)
    }
  if (picture != null) {
    Image(
      ImageProvider(picture),
      contentDescription = context.getString(R.string.widget_frise_picture),
      modifier = GlanceModifier.size(room.width, room.height),
      contentScale = ContentScale.FillBounds,
    )
  }
}
