package fr.auxfilsdesidees.vigie.widget

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.getAppWidgetState
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.lifecycle.lifecycleScope
import fr.auxfilsdesidees.vigie.MainActivity
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.AppData
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.ui.AccentAction
import fr.auxfilsdesidees.vigie.ui.Glass
import fr.auxfilsdesidees.vigie.ui.SkyPage
import fr.auxfilsdesidees.vigie.ui.Words
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import fr.auxfilsdesidees.vigie.ui.theme.VigieTheme
import kotlinx.coroutines.launch

/**
 * « Quel lieu pour ce widget ? »: opened by the home screen when a place widget is placed (or reconfigured), and by a
 * widget whose place was removed from the app. Lists the followed places; without any, sends to the app first. Above
 * them, the next hours or the next days ([PlaceWidget.FORECAST], the site's `fc`): the widget's own when it is
 * reconfigured, kept with the place picked. Leaving without a choice cancels the placing, as Android asks.
 */
class WidgetConfigActivity : ComponentActivity() {
  private var forecast by mutableStateOf(BoardWidget.Forecast.Hours)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val appWidgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID) ?: AppWidgetManager.INVALID_APPWIDGET_ID
    setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
    if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
      finish()
      return
    }
    enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT), navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT))
    val places = AppData.places(this).load().places
    lifecycleScope.launch {
      // A widget reconfigured keeps its forecast unless another one is chosen.
      runCatching {
        val id = GlanceAppWidgetManager(applicationContext).getGlanceIdBy(appWidgetId)
        forecast = BoardWidget.forecast(getAppWidgetState(applicationContext, PreferencesGlanceStateDefinition, id)[PlaceWidget.FORECAST])
      }
    }
    setContent {
      VigieTheme {
        ChoosePlace(
          places,
          forecast,
          onForecast = { forecast = it },
          onPick = { pick(appWidgetId, it) },
          onOpenApp = {
            startActivity(Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            finish()
          },
        )
      }
    }
  }

  private fun pick(appWidgetId: Int, followed: FollowedPlace) {
    lifecycleScope.launch {
      val id = GlanceAppWidgetManager(applicationContext).getGlanceIdBy(appWidgetId)
      updateAppWidgetState(applicationContext, id) {
        it[PlaceWidget.PLACE] = followed.key
        it[PlaceWidget.NAME] = followed.place.label
        it[PlaceWidget.FORECAST] = BoardWidget.key(forecast)
        it[PlaceWidget.STAMP] = System.currentTimeMillis()
      }
      WidgetRefresh.widgetOf(applicationContext, appWidgetId).update(applicationContext, id)
      WidgetRefresh.schedule(applicationContext)
      WidgetRefresh.now(applicationContext)
      setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
      finish()
    }
  }
}

@Composable
private fun ChoosePlace(
  places: List<FollowedPlace>,
  forecast: BoardWidget.Forecast,
  onForecast: (BoardWidget.Forecast) -> Unit,
  onPick: (FollowedPlace) -> Unit,
  onOpenApp: () -> Unit,
) {
  SkyPage {
    Text(stringResource(R.string.widget_choose), color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
    if (places.isEmpty()) {
      Text(stringResource(R.string.widget_choose_none), color = VigieColors.Text2, style = MaterialTheme.typography.bodyLarge)
      AccentAction(R.drawable.ic_add, stringResource(R.string.widget_open_app), onOpenApp)
      return@SkyPage
    }
    Text(stringResource(R.string.widget_choose_hint), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
    Text(stringResource(R.string.widget_forecast), color = VigieColors.Text, style = MaterialTheme.typography.titleSmall)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      listOf(BoardWidget.Forecast.Hours to R.string.widget_forecast_hours, BoardWidget.Forecast.Days to R.string.widget_forecast_days).forEach { (f, words) ->
        FilterChip(
          selected = forecast == f,
          onClick = { onForecast(f) },
          label = { Text(stringResource(words)) },
          colors = FilterChipDefaults.filterChipColors(labelColor = VigieColors.Text2, selectedLabelColor = VigieColors.Text, selectedContainerColor = VigieColors.Accent.copy(alpha = 0.3f)),
        )
      }
    }
    Text(stringResource(R.string.widget_forecast_hint), color = VigieColors.Text3, style = MaterialTheme.typography.bodySmall)
    Glass {
      Column {
        places.forEach { f ->
          Row(
            Modifier.fillMaxWidth().clickable { onPick(f) }.heightIn(min = 56.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Icon(painterResource(R.drawable.ic_location), contentDescription = null, tint = VigieColors.Text2, modifier = Modifier.size(20.dp))
            Column(Modifier.padding(start = 12.dp)) {
              Text(f.place.label, color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
              Words.where(f.place.region)?.let { Text(it, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium) }
            }
          }
        }
      }
    }
  }
}
