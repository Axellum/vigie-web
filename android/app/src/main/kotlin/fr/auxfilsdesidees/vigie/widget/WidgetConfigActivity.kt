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
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.lifecycle.lifecycleScope
import fr.auxfilsdesidees.vigie.MainActivity
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.AppData
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.ui.AccentAction
import fr.auxfilsdesidees.vigie.ui.Glass
import fr.auxfilsdesidees.vigie.ui.SkyPage
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import fr.auxfilsdesidees.vigie.ui.theme.VigieTheme
import kotlinx.coroutines.launch

/**
 * « Quel lieu pour ce widget ? »: opened by the home screen when a place widget is placed (or reconfigured), and by a
 * widget whose place was removed from the app. Lists the followed places; without any, sends to the app first. Leaving
 * without a choice cancels the placing, as Android asks.
 */
class WidgetConfigActivity : ComponentActivity() {
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
    setContent {
      VigieTheme {
        ChoosePlace(
          places,
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
        it[PlaceWidget.NAME] = followed.place.name
        it[PlaceWidget.STAMP] = System.currentTimeMillis()
      }
      PlaceWidget().update(applicationContext, id)
      WidgetRefresh.schedule(applicationContext)
      WidgetRefresh.now(applicationContext)
      setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
      finish()
    }
  }
}

@Composable
private fun ChoosePlace(places: List<FollowedPlace>, onPick: (FollowedPlace) -> Unit, onOpenApp: () -> Unit) {
  SkyPage {
    Text(stringResource(R.string.widget_choose), color = VigieColors.Text, style = MaterialTheme.typography.headlineSmall)
    if (places.isEmpty()) {
      Text(stringResource(R.string.widget_choose_none), color = VigieColors.Text2, style = MaterialTheme.typography.bodyLarge)
      AccentAction(R.drawable.ic_add, stringResource(R.string.widget_open_app), onOpenApp)
      return@SkyPage
    }
    Text(stringResource(R.string.widget_choose_hint), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
    Glass {
      Column {
        places.forEach { f ->
          Row(
            Modifier.fillMaxWidth().clickable { onPick(f) }.heightIn(min = 56.dp).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Icon(painterResource(R.drawable.ic_location), contentDescription = null, tint = VigieColors.Text2, modifier = Modifier.size(20.dp))
            Column(Modifier.padding(start = 12.dp)) {
              Text(f.place.name, color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
              f.place.region?.let { Text(it, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium) }
            }
          }
        }
      }
    }
  }
}
