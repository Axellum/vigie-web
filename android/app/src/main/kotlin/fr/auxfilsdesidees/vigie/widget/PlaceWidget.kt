package fr.auxfilsdesidees.vigie.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.PreviewSizeMode
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextAlign
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import fr.auxfilsdesidees.vigie.MainActivity
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.AppData
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

/**
 * « Vigie · mon lieu »: the home page of the Home Assistant card drawn smaller, as the site's medium and large widgets
 * (2026-11-27): the whole page when the widget has the room for it, else now, the rain of the hour and the next hours or
 * the next days (chosen per widget, [FORECAST]); too small for the card, the frise ([BoardWidget.look]). Its place is chosen
 * when it is placed ([WidgetConfigActivity]) and kept in its own state; it shows the last read of that place kept by the
 * app ([fr.auxfilsdesidees.vigie.data.OfflineCopies]), with its age once it is old. Touching it opens the app on that
 * place.
 */
class PlaceWidget : GlanceAppWidget() {
  override val sizeMode: SizeMode = SizeMode.Exact

  override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

  override suspend fun provideGlance(context: Context, id: GlanceId) {
    val appWidgetId = GlanceAppWidgetManager(context).getAppWidgetId(id)
    val first = load(context, getAppWidgetState(context, PreferencesGlanceStateDefinition, id))
    provideContent {
      // A new place or a new read changes the widget's state (its place, its stamp): the content is read again.
      val prefs = currentState<Preferences>()
      var content by remember { mutableStateOf(first) }
      val key = prefs[PLACE]
      val stamp = prefs[STAMP] ?: 0L
      LaunchedEffect(key, stamp) { if (content.key != key || content.stamp != stamp) content = load(context, prefs) }
      val forecast = BoardWidget.forecast(prefs[FORECAST])
      Frame(content, appWidgetId) { WidgetReady(it, forecast, card = true) }
    }
  }

  /**
   * The widget list's picture, drawn by the same code from an example (Android 15 and later; see
   * [WidgetRefresh.publishPreview]): four cells by three, the card with the next hours.
   */
  override val previewSizeMode: PreviewSizeMode = SizeMode.Responsive(setOf(DpSize(300.dp, 320.dp)))

  override suspend fun providePreview(context: Context, widgetCategory: Int) {
    val now = System.currentTimeMillis() / 1000
    val view = BoardWidget.sample(now, phoneOffsetS())
    provideContent { Frame(Content.Ready("", 0L, view, null, now), AppWidgetManager.INVALID_APPWIDGET_ID) { WidgetReady(it, BoardWidget.Forecast.Hours, card = true) } }
  }

  companion object {
    /** The key of the followed place shown ([fr.auxfilsdesidees.vigie.data.FollowedPlace.key]) and its name, kept for « no longer followed ». */
    val PLACE = stringPreferencesKey("place")
    val NAME = stringPreferencesKey("name")

    /** Changed at every new read or new place: the widget then reads its place again. */
    val STAMP = longPreferencesKey("stamp")

    /** The next hours or the next days ([BoardWidget.forecast]: `hours` or `days`), chosen with the place. */
    val FORECAST = stringPreferencesKey("forecast")

    internal suspend fun load(context: Context, prefs: Preferences): Content {
      val key = prefs[PLACE]
      val stamp = prefs[STAMP] ?: 0L
      if (key == null) return Content.NoPlace(stamp)
      val followed = AppData.places(context).load().places.firstOrNull { it.key == key } ?: return Content.Gone(key, stamp, prefs[NAME])
      val snapshot = AppData.repository(context).saved(followed.place, followed.spots) ?: return Content.Waiting(key, stamp, followed.place.label)
      val now = System.currentTimeMillis() / 1000
      return Content.Ready(key, stamp, BoardWidget.view(followed.place.label, snapshot, now), snapshot, now)
    }
  }
}

/** The phone's offset from UTC now, in seconds: the made-up examples of the widget list are in the phone's time. */
internal fun phoneOffsetS(): Int = java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 1000

/** What a widget shows; [key] and [stamp] are those of the state it was read for. */
internal sealed interface Content {
  val key: String?
  val stamp: Long

  data class NoPlace(override val stamp: Long) : Content {
    override val key: String? = null
  }

  data class Gone(override val key: String, override val stamp: Long, val name: String?) : Content

  data class Waiting(override val key: String, override val stamp: Long, val name: String) : Content

  /** [snapshot] is the read the view comes from (null for the widget list's example), read at [nowUtc]. */
  data class Ready(
    override val key: String,
    override val stamp: Long,
    val view: BoardWidget.View,
    val snapshot: Snapshot?,
    val nowUtc: Long,
  ) : Content
}

// ------------------------------------------------------------------------------------------------------------- the frame

internal fun color(c: Color) = ColorProvider(c)

internal val TEXT = color(VigieColors.Text)
internal val TEXT2 = color(VigieColors.Text2)

internal fun style(size: TextUnit, c: ColorProvider = TEXT, weight: FontWeight = FontWeight.Normal, align: TextAlign = TextAlign.Start) =
  TextStyle(color = c, fontSize = size, fontWeight = weight, textAlign = align)

/**
 * What every Vigie widget shares: the card's background, the touch (the app on the place, or the choice of a place) and
 * the messages of a widget without its read; [ready] draws the read in the room left by the padding ([room]).
 */
@Composable
internal fun Frame(content: Content, appWidgetId: Int, ready: @Composable (Content.Ready) -> Unit) {
  val context = LocalContext.current
  val open =
    when (content) {
      is Content.Ready -> placeIntent(context, content.key)
      is Content.Waiting -> placeIntent(context, content.key)
      else -> chooseIntent(context, appWidgetId)
    }
  Box(
    GlanceModifier.fillMaxSize()
      .appWidgetBackground()
      .cornerRadius(24.dp)
      .background(ImageProvider(R.drawable.widget_board))
      .clickable(actionStartActivity(open))
      .padding(horizontal = PADDING_H, vertical = PADDING_V)
  ) {
    when (content) {
      is Content.Ready -> ready(content)
      is Content.Waiting -> Message(content.name, context.getString(R.string.loading))
      is Content.Gone -> Message(content.name, context.getString(R.string.widget_gone))
      is Content.NoPlace -> Message(null, context.getString(R.string.widget_no_place))
    }
  }
}

/** The app on the widget's place; one address per place, so that two widgets never share their touch. */
private fun placeIntent(context: Context, key: String): Intent =
  Intent(context, MainActivity::class.java)
    .setData(Uri.parse("vigie-widget://place/$key"))
    .putExtra(MainActivity.EXTRA_PLACE, key)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)

/** The choice of a place, for a widget without one (its place was removed from the app). */
private fun chooseIntent(context: Context, appWidgetId: Int): Intent =
  Intent(context, WidgetConfigActivity::class.java)
    .setData(Uri.parse("vigie-widget://choose/$appWidgetId"))
    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

@Composable
private fun Message(name: String?, text: String) {
  Column(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
    if (name != null) {
      PlaceName(name, 16.sp, 15.dp, TEXT)
      Spacer(GlanceModifier.height(6.dp))
    }
    Text(text, style = style(14.sp, TEXT2), maxLines = 3)
  }
}

@Composable
internal fun PlaceName(name: String, size: TextUnit, icon: Dp, c: ColorProvider, modifier: GlanceModifier = GlanceModifier) {
  Row(modifier, verticalAlignment = Alignment.CenterVertically) {
    Glyph(R.drawable.ic_location, icon, VigieColors.Text2)
    Spacer(GlanceModifier.width(5.dp))
    Text(name, style = style(size, c), maxLines = 1)
  }
}

@Composable
internal fun Glyph(res: Int, size: Dp, tint: Color) {
  Image(ImageProvider(res), contentDescription = null, modifier = GlanceModifier.size(size), colorFilter = ColorFilter.tint(color(tint)))
}

private val PADDING_H = 12.dp
private val PADDING_V = 10.dp

/** The room a widget draws its read in: what the home screen gives, less the frame's padding. */
@Composable
internal fun room(): DpSize = LocalSize.current.let { DpSize(it.width - PADDING_H * 2, it.height - PADDING_V * 2) }

/**
 * The read drawn as one picture, in the look the room asks for ([BoardWidget.look]): the card's page for the place widget
 * ([card]) when it holds, else the frise; [forecast] the next hours or the next days.
 */
@Composable
internal fun WidgetReady(r: Content.Ready, forecast: BoardWidget.Forecast, card: Boolean) {
  val context = LocalContext.current
  val room = room()
  val picture =
    remember(r.view, room, forecast, card) {
      if (room.width < 40.dp || room.height < 30.dp) null else BoardArt.widget(context, r.view, room.width.value, room.height.value, forecast, card)
    }
  if (picture != null) {
    Image(ImageProvider(picture), contentDescription = BoardWidget.describe(r.view), modifier = GlanceModifier.size(room.width, room.height), contentScale = ContentScale.FillBounds)
  }
}
