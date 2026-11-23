package fr.auxfilsdesidees.vigie.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
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
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.compose.ui.unit.DpSize
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
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
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
import fr.auxfilsdesidees.vigie.ui.RainHour
import fr.auxfilsdesidees.vigie.ui.Vigil
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

/**
 * « Vigie · mon lieu »: the place widget, the three sizes of the site's `/widget` page (small, medium, large) chosen by
 * the room the home screen gives it. Its place is chosen when it is placed ([WidgetConfigActivity]) and kept in its own
 * state; it shows the last read of that place kept by the app ([fr.auxfilsdesidees.vigie.data.OfflineCopies]), with its
 * age once it is old. Touching it opens the app on that place.
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
      Widget(content, appWidgetId)
    }
  }

  /** The widget list's picture, drawn by the same code from an example (Android 15 and later; see [WidgetRefresh.publishPreview]). */
  override val previewSizeMode: PreviewSizeMode = SizeMode.Responsive(setOf(DpSize(300.dp, 200.dp)))

  override suspend fun providePreview(context: Context, widgetCategory: Int) {
    val view = WidgetModel.sample(System.currentTimeMillis() / 1000, java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()) / 1000)
    val pictures = Pictures.of(context, view)
    provideContent { Widget(Content.Ready("", 0L, view, pictures), AppWidgetManager.INVALID_APPWIDGET_ID) }
  }

  companion object {
    /** The key of the followed place shown ([fr.auxfilsdesidees.vigie.data.FollowedPlace.key]) and its name, kept for « no longer followed ». */
    val PLACE = stringPreferencesKey("place")
    val NAME = stringPreferencesKey("name")

    /** Changed at every new read or new place: the widget then reads its place again. */
    val STAMP = longPreferencesKey("stamp")

    internal suspend fun load(context: Context, prefs: Preferences): Content {
      val key = prefs[PLACE]
      val stamp = prefs[STAMP] ?: 0L
      if (key == null) return Content.NoPlace(stamp)
      val followed = AppData.places(context).load().places.firstOrNull { it.key == key } ?: return Content.Gone(key, stamp, prefs[NAME])
      val snapshot = AppData.repository(context).saved(followed.place, followed.spots) ?: return Content.Waiting(key, stamp, followed.place.name)
      val view = WidgetModel.view(followed.place.name, snapshot, System.currentTimeMillis() / 1000)
      return Content.Ready(key, stamp, view, Pictures.of(context, view))
    }
  }
}

/** What a widget shows; [key] and [stamp] are those of the state it was read for. */
internal sealed interface Content {
  val key: String?
  val stamp: Long

  data class NoPlace(override val stamp: Long) : Content {
    override val key: String? = null
  }

  data class Gone(override val key: String, override val stamp: Long, val name: String?) : Content

  data class Waiting(override val key: String, override val stamp: Long, val name: String) : Content

  data class Ready(override val key: String, override val stamp: Long, val view: WidgetModel.View, val pictures: Pictures) : Content
}

/** The bitmaps of one view, drawn once for every size. */
internal class Pictures(val skyBig: Bitmap?, val skySmall: Bitmap?, val arrow: Bitmap?, val days: List<Bitmap?>) {
  companion object {
    fun of(context: Context, v: WidgetModel.View): Pictures =
      Pictures(
        skyBig = v.sky?.let { WidgetArt.sky(context, it, 54f) },
        skySmall = v.sky?.let { WidgetArt.sky(context, it, 42f) },
        arrow = v.wind?.fromDeg?.let { WidgetArt.arrow(context, it, 22f) },
        days = v.days.map { d -> d.sky?.let { WidgetArt.sky(context, it, 30f) } },
      )
  }
}

// ------------------------------------------------------------------------------------------------------------- the frame

private fun color(c: Color) = ColorProvider(c)

private val TEXT = color(VigieColors.Text)
private val TEXT2 = color(VigieColors.Text2)
private val TEXT3 = color(VigieColors.Text3)
private val AGE = color(VigieColors.Warning)

private fun style(size: TextUnit, c: ColorProvider = TEXT, weight: FontWeight = FontWeight.Normal, align: TextAlign = TextAlign.Start) =
  TextStyle(color = c, fontSize = size, fontWeight = weight, textAlign = align)

@Composable
private fun Widget(content: Content, appWidgetId: Int) {
  val context = androidx.glance.LocalContext.current
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
      .background(ImageProvider(R.drawable.widget_sky))
      .clickable(actionStartActivity(open))
      .padding(horizontal = 14.dp, vertical = 10.dp)
  ) {
    when (content) {
      is Content.Ready -> Ready(content.view, content.pictures)
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
private fun PlaceName(name: String, size: TextUnit, icon: Dp, c: ColorProvider, modifier: GlanceModifier = GlanceModifier) {
  Row(modifier, verticalAlignment = Alignment.CenterVertically) {
    Glyph(R.drawable.ic_location, icon, VigieColors.Text2)
    Spacer(GlanceModifier.width(5.dp))
    Text(name, style = style(size, c), maxLines = 1)
  }
}

@Composable
private fun Glyph(res: Int, size: Dp, tint: Color) {
  Image(ImageProvider(res), contentDescription = null, modifier = GlanceModifier.size(size), colorFilter = ColorFilter.tint(color(tint)))
}

@Composable
private fun Picture(bitmap: Bitmap?, size: Dp) {
  if (bitmap != null) Image(ImageProvider(bitmap), contentDescription = null, modifier = GlanceModifier.size(size))
  else Spacer(GlanceModifier.size(size))
}

/** The size by the room the home screen gives: a single row is the small one, a square of four the large one. */
@Composable
private fun Ready(v: WidgetModel.View, pictures: Pictures) {
  val room = LocalSize.current
  when {
    room.height < 150.dp -> Small(v, room.width)
    room.height < 300.dp || room.width < 250.dp -> Medium(v, pictures, room.height, room.width)
    else -> Large(v, pictures, room.height)
  }
}

// ------------------------------------------------------------------------------------------------------------- the sizes

/**
 * Small: the place and its warning pill, the rain of the hour and the temperature, the bars (or the age of the data).
 * Narrow (two cells by one on a phone, 140 dp): the temperature goes up beside the name and the pill down beside the
 * bars, so that the rain keeps its whole line. Sized to fit the single row of a phone's grid (about 95 dp).
 */
@Composable
private fun Small(v: WidgetModel.View, width: Dp) {
  val narrow = width < 180.dp
  val level = v.warnings.level
  val temp = v.temp?.let { it to style(if (narrow) 18.sp else 20.sp, color(VigieColors.temperature(v.tempC))) }
  Column(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      PlaceName(v.name, 14.sp, 14.dp, TEXT2, GlanceModifier.defaultWeight())
      if (narrow) temp?.let { (t, s) -> Text(t, style = s, maxLines = 1) } else if (level != null) Pill(level)
    }
    Spacer(GlanceModifier.height(3.dp))
    Row(GlanceModifier.fillMaxWidth().height(28.dp), verticalAlignment = Alignment.CenterVertically) {
      Glyph(R.drawable.widget_umbrella, 18.dp, VigieColors.Rain)
      Spacer(GlanceModifier.width(6.dp))
      Text(v.rain.short, style = style(16.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
      if (!narrow) temp?.let { (t, s) -> Text(t, style = s, maxLines = 1) }
    }
    val pill = narrow && level != null
    val age = if (narrow) v.ageShort else v.age
    if (pill || age != null || v.rain.bars.isNotEmpty()) {
      Spacer(GlanceModifier.height(4.dp))
      Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        if (pill && level != null) {
          Pill(level)
          Spacer(GlanceModifier.width(6.dp))
        }
        when {
          age != null -> Text(age, style = style(12.sp, AGE), maxLines = 1, modifier = GlanceModifier.defaultWeight())
          v.rain.bars.isNotEmpty() -> Bars(v.rain.bars, 12.dp, GlanceModifier.defaultWeight())
        }
      }
    }
  }
}

/** Medium: the header, the warnings, the rain of the hour with its bars, the wind (left out when the room is short). */
@Composable
private fun Medium(v: WidgetModel.View, pictures: Pictures, height: Dp, width: Dp) {
  // The heights of the blocks as measured on a Pixel 6 Pro (22/11/2026): what is left is shared between the gaps.
  val warnH = if (v.warnings.level != null) 54.dp else 32.dp
  val rainH = 12.dp + 21.dp + (if (v.age != null || v.rain.detail != null) 17.dp else 0.dp) + (if (v.rain.bars.isNotEmpty()) 17.dp else 0.dp)
  val base = 20.dp + 42.dp + warnH + rainH + 6.dp * 2
  // The wind goes first when the home screen gives less room than the four blocks need (the site's `data-drop`).
  val wind = v.wind?.takeIf { height >= base + 6.dp + 21.dp }
  val used = base + (if (wind != null) 6.dp + 21.dp else 0.dp)
  val gap = spread(6.dp, height - used, if (wind != null) 3 else 2)
  Column(GlanceModifier.fillMaxSize()) {
    Row(GlanceModifier.fillMaxWidth().height(42.dp), verticalAlignment = Alignment.CenterVertically) {
      Column(GlanceModifier.defaultWeight()) {
        PlaceName(v.name, 16.sp, 15.dp, TEXT)
        if (v.condition.isNotEmpty()) Text(v.condition, style = style(13.sp, TEXT3), maxLines = 1)
      }
      Picture(pictures.skySmall, 40.dp)
      Spacer(GlanceModifier.width(6.dp))
      v.temp?.let { Text(it, style = style(34.sp, color(VigieColors.temperature(v.tempC)))) }
    }
    Spacer(GlanceModifier.height(gap))
    WarningsCard(v.warnings, compact = true)
    Spacer(GlanceModifier.height(gap))
    RainCard(v, inline = false)
    if (wind != null) {
      Spacer(GlanceModifier.height(gap))
      // Its note « prévision du modèle » only where the line has room for it.
      WindLine(wind, pictures.arrow, note = width >= 360.dp)
    }
  }
}

/** Large: a bigger header, the warnings, the rain on one line, the wind, the five days (the days go first when short). */
@Composable
private fun Large(v: WidgetModel.View, pictures: Pictures, height: Dp) {
  val wind = v.wind
  val warnH = if (v.warnings.level != null) 58.dp else 36.dp
  val rainH = 14.dp + 21.dp + (if (v.age != null || v.rain.detail != null) 16.dp else 0.dp)
  val base = 20.dp + 54.dp + warnH + 8.dp + rainH + (if (wind != null) 8.dp + 52.dp else 0.dp) + 8.dp
  val daysH = 98.dp
  val days = v.days.isNotEmpty() && height >= base + 8.dp + daysH
  val used = base + (if (days) 8.dp + daysH else 0.dp)
  val gap = spread(8.dp, height - used, 2 + (if (wind != null) 1 else 0) + (if (days) 1 else 0))
  Column(GlanceModifier.fillMaxSize()) {
    Row(GlanceModifier.fillMaxWidth().height(54.dp), verticalAlignment = Alignment.CenterVertically) {
      Picture(pictures.skyBig, 52.dp)
      Spacer(GlanceModifier.width(10.dp))
      v.temp?.let { Text(it, style = style(44.sp, color(VigieColors.temperature(v.tempC)))) }
      Column(GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.End) {
        PlaceName(v.name, 16.sp, 15.dp, TEXT)
        if (v.condition.isNotEmpty()) Text(v.condition, style = style(13.sp, TEXT3, align = TextAlign.End), maxLines = 1)
      }
    }
    Spacer(GlanceModifier.height(gap))
    WarningsCard(v.warnings, compact = false)
    Spacer(GlanceModifier.height(gap))
    RainCard(v, inline = true)
    if (wind != null) {
      Spacer(GlanceModifier.height(gap))
      Column(GlanceModifier.fillMaxWidth().background(ImageProvider(R.drawable.widget_card)).padding(horizontal = 10.dp, vertical = 7.dp)) {
        WindLine(wind, pictures.arrow, note = false)
        Text(wind.note, style = style(12.sp, TEXT3), maxLines = 1, modifier = GlanceModifier.padding(start = 31.dp))
      }
    }
    if (days) {
      Spacer(GlanceModifier.height(gap))
      Days(v.days, pictures.days)
    }
  }
}

/**
 * A gap between two blocks: [min], plus its share of the room left free so that nothing piles at the bottom (most of
 * it: the heights are estimates). A home screen draws at most ten children in a column: no flexible spacers here.
 */
private fun spread(min: Dp, free: Dp, gaps: Int): Dp = min + (free * 0.8f / gaps.coerceAtLeast(1)).coerceAtLeast(0.dp)

// ------------------------------------------------------------------------------------------------------------- the blocks

private fun levelColor(level: String?): Color = VigieColors.warning(level)

private fun alertCard(level: String?): Int =
  when (level) {
    "RED" -> R.drawable.widget_alert_red
    "ORANGE" -> R.drawable.widget_alert_orange
    "YELLOW" -> R.drawable.widget_alert_yellow
    else -> R.drawable.widget_card
  }

private fun pillShape(level: String?): Int =
  when (level) {
    "RED" -> R.drawable.widget_pill_red
    "ORANGE" -> R.drawable.widget_pill_orange
    "YELLOW" -> R.drawable.widget_pill_yellow
    else -> R.drawable.widget_pill_grey
  }

/** « Orange » on its colour, with the warning sign: the small size's warning. */
@Composable
private fun Pill(level: String) {
  Row(
    GlanceModifier.background(ImageProvider(pillShape(level))).padding(start = 6.dp, end = 8.dp, top = 2.dp, bottom = 2.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Glyph(R.drawable.ic_warning, 12.dp, VigieColors.OnPill)
    Spacer(GlanceModifier.width(4.dp))
    Text(Vigil.levelShort(level), style = style(12.sp, color(VigieColors.OnPill), FontWeight.Medium), maxLines = 1)
  }
}

/** The warnings: on their level's colour with their names and end when there are some, else one quiet line. */
@Composable
private fun WarningsCard(w: WidgetModel.Warnings, compact: Boolean) {
  if (w.level != null) {
    Column(GlanceModifier.fillMaxWidth().background(ImageProvider(alertCard(w.level))).padding(horizontal = 10.dp, vertical = 7.dp)) {
      Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Glyph(R.drawable.ic_warning, 18.dp, levelColor(w.level))
        Spacer(GlanceModifier.width(7.dp))
        Text(w.title, style = style(if (compact) 15.sp else 16.sp), maxLines = 1)
        Spacer(GlanceModifier.defaultWeight())
        w.until?.let { Text(it, style = style(13.sp, TEXT2), maxLines = 1) }
      }
      Row(GlanceModifier.fillMaxWidth().padding(start = 25.dp, top = 3.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(w.detail, style = style(13.sp, TEXT2), maxLines = 1, modifier = GlanceModifier.defaultWeight())
        if (w.more > 0) {
          Spacer(GlanceModifier.width(6.dp))
          Box(GlanceModifier.background(ImageProvider(R.drawable.widget_pill_grey)).padding(horizontal = 7.dp, vertical = 1.dp)) {
            Text("+${w.more}", style = style(12.sp, color(VigieColors.OnPill), FontWeight.Medium))
          }
        }
      }
    }
  } else {
    val quiet = w.state == Vigil.State.None
    Row(
      GlanceModifier.fillMaxWidth().height(if (compact) 32.dp else 36.dp).background(ImageProvider(R.drawable.widget_card)).padding(horizontal = 10.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      if (quiet) Glyph(R.drawable.ic_check, 16.dp, VigieColors.Good) else Glyph(R.drawable.ic_warning, 16.dp, VigieColors.Text3)
      Spacer(GlanceModifier.width(8.dp))
      Text(w.title, style = style(14.sp, TEXT2), maxLines = 1)
    }
  }
}

/**
 * The rain of the hour: its title, its detail (« prévision du modèle », « environ 30 min · jusqu’à 2,4 mm/h ») and its
 * bars, or the age of the data in yellow once it is old. [inline]: the large size, bars at the end of the title's line.
 */
@Composable
private fun RainCard(v: WidgetModel.View, inline: Boolean) {
  val rain = v.rain
  val wet = rain.status == RainHour.Status.Now || rain.status == RainHour.Status.Soon
  Column(GlanceModifier.fillMaxWidth().background(ImageProvider(R.drawable.widget_card)).padding(horizontal = 10.dp, vertical = 6.dp)) {
    Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
      Glyph(R.drawable.widget_umbrella, 18.dp, VigieColors.Rain)
      Spacer(GlanceModifier.width(7.dp))
      Text(rain.title, style = style(16.sp), maxLines = 1, modifier = GlanceModifier.defaultWeight())
      // On the title's line only when it rains, as the site's widget: « Pluie dans 15 min » leaves room for them.
      if (inline && wet && rain.bars.isNotEmpty()) {
        Spacer(GlanceModifier.width(8.dp))
        Bars(rain.bars, 16.dp, GlanceModifier.width(86.dp))
      }
    }
    // Under the title, as the site's widget: the age of old data in yellow, else the detail of the rain.
    val note = v.age ?: rain.detail
    if (note != null) Text(note, style = style(12.sp, if (v.age != null) AGE else TEXT3), maxLines = 1, modifier = GlanceModifier.padding(start = 25.dp, top = 1.dp))
    if (!inline && rain.bars.isNotEmpty()) {
      Spacer(GlanceModifier.height(5.dp))
      Bars(rain.bars, 12.dp, GlanceModifier.fillMaxWidth())
    }
  }
}

/**
 * The bars of the hour, one per step, from the bottom: rounded shapes the home screen stretches without drawing. One
 * child per bar (the gaps are paddings), ten at most ([WidgetModel.fewer]).
 */
@Composable
private fun Bars(bars: List<WidgetModel.Bar>, height: Dp, modifier: GlanceModifier) {
  val shown = WidgetModel.fewer(bars)
  Row(modifier.height(height), verticalAlignment = Alignment.Bottom) {
    shown.forEachIndexed { i, b ->
      val shape =
        when (b.tone) {
          WidgetModel.Tone.Dry -> R.drawable.widget_bar_dry
          WidgetModel.Tone.Light -> R.drawable.widget_bar_light
          WidgetModel.Tone.Rain -> R.drawable.widget_bar_rain
          WidgetModel.Tone.Heavy -> R.drawable.widget_bar_heavy
        }
      Box(
        GlanceModifier.defaultWeight().height(height).padding(start = if (i > 0) 3.dp else 0.dp, end = if (i < shown.lastIndex) 3.dp else 0.dp),
        contentAlignment = Alignment.BottomCenter,
      ) {
        Box(GlanceModifier.fillMaxWidth().height(maxOf(3.dp, height * b.pct / 100f)).background(ImageProvider(shape))) {}
      }
    }
  }
}

/** « 37 km/h O · rafales 63 » after the arrow, and « prévision du modèle » at the end of the line ([note]). */
@Composable
private fun WindLine(w: WidgetModel.Wind, arrow: Bitmap?, note: Boolean) {
  Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
    Picture(arrow, 21.dp)
    Spacer(GlanceModifier.width(9.dp))
    // Two sizes on one line: aligned by their foot, near enough to one baseline.
    Row(verticalAlignment = Alignment.Bottom) {
      Text("${w.kmh}", style = style(15.sp), maxLines = 1)
      Text(WidgetModel.KMH, style = style(12.sp, TEXT3), maxLines = 1)
      if (w.dir.isNotEmpty()) Text(" ${w.dir}", style = style(15.sp), maxLines = 1)
      w.gust?.let { Text(" · rafales $it", style = style(12.sp, TEXT2), maxLines = 1) }
    }
    if (note) {
      Spacer(GlanceModifier.defaultWeight())
      Spacer(GlanceModifier.width(8.dp))
      Text(w.note, style = style(12.sp, TEXT3), maxLines = 1)
    }
  }
}

/** The five days: the short day (today in the accent colour), the sky, the highest and the lowest. */
@Composable
private fun Days(days: List<WidgetModel.DayView>, pictures: List<Bitmap?>) {
  Row(GlanceModifier.fillMaxWidth().background(ImageProvider(R.drawable.widget_card)).padding(vertical = 7.dp)) {
    days.forEachIndexed { i, d ->
      Column(GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(d.label, style = style(13.sp, if (d.today) color(VigieColors.Accent) else TEXT2, align = TextAlign.Center), maxLines = 1)
        Picture(pictures.getOrNull(i), 30.dp)
        d.maxC?.let { Text(fr.auxfilsdesidees.vigie.ui.Words.degrees(it), style = style(15.sp, color(VigieColors.temperature(it)), align = TextAlign.Center)) }
        d.minC?.let { Text(fr.auxfilsdesidees.vigie.ui.Words.degrees(it), style = style(13.sp, color(VigieColors.temperature(it)), align = TextAlign.Center)) }
      }
    }
  }
}
