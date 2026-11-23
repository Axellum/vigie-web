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
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.PreviewSizeMode
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.ui.Vigil
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

/**
 * « Vigie · la frise »: the app's « Heures » tab in small, for one followed place. A header (the place, its sky and
 * temperature, the warnings in a few words), then the frise of the next hours drawn into a picture ([FriseArt]); with
 * the room of three rows or more, the tide and the surf of the favourite spot under it. Same place, same state, same
 * refresh and same touch as the place widget ([PlaceWidget]).
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
  override val previewSizeMode: PreviewSizeMode = SizeMode.Responsive(setOf(DpSize(300.dp, 290.dp)))

  override suspend fun providePreview(context: Context, widgetCategory: Int) {
    val now = System.currentTimeMillis() / 1000
    val offset = phoneOffsetS()
    val view = WidgetModel.sample(now, offset)
    val pictures = Pictures.of(context, view)
    val strip = FriseModel.sample(now, offset)
    provideContent { Frame(Content.Ready("", 0L, view, pictures, null, now), AppWidgetManager.INVALID_APPWIDGET_ID) { FriseReady(it, strip) } }
  }
}

/** The header and the frise, the picture drawn to the room left under the header ([example]: the widget list's). */
@Composable
private fun FriseReady(r: Content.Ready, example: FriseModel.Strip?) {
  val context = LocalContext.current
  val room = LocalSize.current
  val v = r.view
  val strip = remember(r) { example ?: r.snapshot?.let { FriseModel.strip(it, r.nowUtc) } }
  // The frame's padding is 14 dp on the sides and 10 dp at the top and the bottom.
  val headerH = 28.dp
  val ageH = if (v.age != null) 17.dp else 0.dp
  val width = room.width - 28.dp
  val height = room.height - 20.dp - headerH - ageH - 6.dp
  val picture =
    remember(strip, width, height) {
      if (strip == null || width < 40.dp || height < 40.dp) null else FriseArt.draw(context, strip, width.value, height.value, FriseArt.Labels.of(context))
    }
  Column(GlanceModifier.fillMaxSize()) {
    Row(GlanceModifier.fillMaxWidth().height(headerH), verticalAlignment = Alignment.CenterVertically) {
      PlaceName(v.name, 15.sp, 14.dp, TEXT)
      Spacer(GlanceModifier.width(8.dp))
      Picture(r.pictures.skySmall, 24.dp)
      Spacer(GlanceModifier.width(4.dp))
      v.temp?.let { Text(it, style = style(16.sp, color(VigieColors.temperature(v.tempC)), FontWeight.Medium), maxLines = 1) }
      Spacer(GlanceModifier.defaultWeight())
      Warnings(v.warnings)
    }
    v.age?.let { Text(it, style = style(12.sp, AGE), maxLines = 1) }
    Spacer(GlanceModifier.height(6.dp))
    if (picture != null) {
      Image(
        ImageProvider(picture),
        contentDescription = context.getString(R.string.widget_frise_picture),
        modifier = GlanceModifier.size(width, height),
        contentScale = ContentScale.FillBounds,
      )
    }
  }
}

/** The warnings in a few words at the end of the header: the level's pill, or a quiet line with its mark. */
@Composable
private fun Warnings(w: WidgetModel.Warnings) {
  val level = w.level
  if (level != null) {
    Pill(level)
    return
  }
  Row(verticalAlignment = Alignment.CenterVertically) {
    if (w.state == Vigil.State.None) Glyph(R.drawable.ic_check, 14.dp, VigieColors.Good) else Glyph(R.drawable.ic_warning, 14.dp, VigieColors.Text3)
    Spacer(GlanceModifier.width(4.dp))
    Text(w.short, style = style(12.sp, TEXT2), maxLines = 1)
  }
}
