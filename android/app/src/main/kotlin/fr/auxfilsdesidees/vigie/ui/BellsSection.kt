package fr.auxfilsdesidees.vigie.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.LifecycleResumeEffect
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.Bell
import fr.auxfilsdesidees.vigie.notify.BellState
import fr.auxfilsdesidees.vigie.notify.VigieNotifications
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

/**
 * The bells of the places (sketch B of the notifications, chosen by the author): a pill at the end of each place's line
 * says what it warns for, touching it opens the four choices, and a « Notifications » part says what the server keeps,
 * sends a test and opens Android's settings of the app's notifications.
 */
@StringRes
internal fun bellLabel(bell: Bell?): Int =
  when (bell) {
    Bell.YELLOW -> R.string.bell_yellow
    Bell.ORANGE -> R.string.bell_orange
    Bell.RED -> R.string.bell_red
    null -> R.string.bell_never
  }

/** The pill of a place's bell: the colour of the lowest level it rings for, grey and struck for « jamais ». */
@Composable
internal fun BellPill(bell: Bell?, place: String, onClick: () -> Unit) {
  val fill = if (bell == null) VigieColors.Rule else VigieColors.warning(bell.name)
  val ink = if (bell == null) VigieColors.Text else VigieColors.OnPill
  val label = stringResource(bellLabel(bell))
  val described = stringResource(R.string.bell_of, place, label)
  // The pill is drawn small, the touch area stays 48 dp high.
  Box(
    Modifier.heightIn(min = 48.dp)
      .clip(RoundedCornerShape(12.dp))
      .clickable(role = Role.Button, onClick = onClick)
      .semantics(mergeDescendants = true) { contentDescription = described }
      .padding(horizontal = 4.dp),
    contentAlignment = Alignment.Center,
  ) {
    Row(
      Modifier.background(fill, RoundedCornerShape(50)).padding(start = 8.dp, end = 10.dp, top = 3.dp, bottom = 3.dp),
      verticalAlignment = Alignment.CenterVertically,
    ) {
      Icon(painterResource(if (bell == null) R.drawable.ic_bell_off else R.drawable.ic_bell), contentDescription = null, tint = ink, modifier = Modifier.size(15.dp))
      Spacer(Modifier.width(4.dp))
      Text(label, color = ink, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
  }
}

/** « Prévenir pour … »: four choices, one on; a choice closes the window at once. */
@Composable
internal fun BellDialog(place: String, bell: Bell?, onChoose: (Bell?) -> Unit, onClose: () -> Unit) {
  Dialog(onDismissRequest = onClose) {
    val shape = RoundedCornerShape(22.dp)
    Column(
      Modifier.fillMaxWidth().background(VigieColors.Bar, shape).border(1.5.dp, VigieColors.GlassBorder, shape).padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
      Text(stringResource(R.string.bell_title, place), color = VigieColors.Text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(bottom = 6.dp))
      CHOICES.forEach { (choice, label) ->
        val on = choice == bell
        Row(
          Modifier.fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .selectable(selected = on, role = Role.RadioButton) { onChoose(choice) }
            .heightIn(min = 52.dp)
            .padding(horizontal = 4.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Text(stringResource(label), color = VigieColors.Text, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
          Switch(
            checked = on,
            onCheckedChange = null,
            colors =
              SwitchDefaults.colors(
                checkedThumbColor = VigieColors.OnPill,
                checkedTrackColor = VigieColors.Accent,
                checkedBorderColor = VigieColors.Accent,
                uncheckedThumbColor = VigieColors.Text3,
                uncheckedTrackColor = Color(0xFF46586C),
                uncheckedBorderColor = Color(0xFF46586C),
              ),
          )
        }
      }
      Text(stringResource(R.string.bell_circle), color = VigieColors.Text3, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(top = 6.dp))
      TextButton(onClick = onClose, modifier = Modifier.align(Alignment.End)) { Text(stringResource(R.string.bell_close), color = VigieColors.Accent) }
    }
  }
}

private val CHOICES =
  listOf(
    Bell.YELLOW to R.string.bell_choice_yellow,
    Bell.ORANGE to R.string.bell_choice_orange,
    Bell.RED to R.string.bell_choice_red,
    null to R.string.bell_choice_never,
  )

/**
 * The part « Notifications » of the page of the places: what the server keeps for this phone (or why not), the result of
 * a test, the test and Android's settings of the app's notifications, and what leaves the phone. [denied]: the person
 * just refused Android's permission, so the bell stayed off.
 */
@Composable
internal fun NotificationsSection(bells: BellsUi, belled: Int, denied: Boolean, onTest: () -> Unit) {
  val context = LocalContext.current
  var allowed by remember { mutableStateOf(VigieNotifications.allowed(context)) }
  // Back from Android's settings: the permission may have changed there.
  LifecycleResumeEffect(Unit) {
    allowed = VigieNotifications.allowed(context)
    onPauseOrDispose {}
  }
  Section(stringResource(R.string.notify_header))
  Glass {
    val state = bells.state
    when {
      !allowed && denied -> Line(stringResource(R.string.notify_denied), VigieColors.Warning)
      belled == 0 -> Line(stringResource(R.string.notify_none), VigieColors.Text2)
      !allowed -> Line(stringResource(R.string.notify_blocked), VigieColors.Warning)
      bells.busy -> Line(stringResource(R.string.notify_busy), VigieColors.Text2)
      state is BellState.Failed -> Line(state.message, VigieColors.Warning)
      else -> Line(pluralStringResource(R.plurals.notify_on, belled, belled), VigieColors.Text)
    }
    when (val note = bells.test) {
      TestNote.Sent -> Line(stringResource(R.string.notify_test_sent), VigieColors.Good)
      TestNote.NotSent -> Line(stringResource(R.string.notify_test_none), VigieColors.Warning)
      TestNote.Forgotten -> Line(stringResource(R.string.notify_test_forgotten), VigieColors.Text2)
      is TestNote.Failed -> Line(note.message, VigieColors.Warning)
      null -> {}
    }
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
      GhostButton(stringResource(R.string.notify_test), enabled = belled > 0 && !bells.busy && !bells.testing, Modifier.weight(1f), onTest)
      GhostButton(stringResource(R.string.notify_settings), enabled = true, Modifier.weight(1f)) { openNotificationSettings(context) }
    }
  }
  Credits(stringResource(R.string.notify_privacy))
}

@Composable
internal fun Line(text: String, color: Color) {
  Text(text, color = color, style = MaterialTheme.typography.bodyMedium)
}

/** A round outlined button of the sketch (« Envoyer un essai », « Son et vibreur »), 48 dp high. */
@Composable
internal fun GhostButton(label: String, enabled: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
  val shape = RoundedCornerShape(50)
  Box(
    modifier
      .heightIn(min = 48.dp)
      .clip(shape)
      .border(1.5.dp, Color.White.copy(alpha = if (enabled) 0.22f else 0.10f), shape)
      .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
      .padding(horizontal = 12.dp),
    contentAlignment = Alignment.Center,
  ) {
    Text(label, color = if (enabled) VigieColors.Text else VigieColors.Text3, style = MaterialTheme.typography.titleSmall, maxLines = 1)
  }
}

/** Android's page of the app's notifications (sound, vibration, each category); the app's page before Android 8. */
private fun openNotificationSettings(context: Context) {
  val intent =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    } else {
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
    }
  context.startActivity(intent)
}
