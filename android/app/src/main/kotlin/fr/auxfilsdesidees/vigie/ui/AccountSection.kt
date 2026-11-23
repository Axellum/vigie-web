package fr.auxfilsdesidees.vigie.ui

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.LifecycleResumeEffect
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.Bell
import fr.auxfilsdesidees.vigie.notify.AccountState
import fr.auxfilsdesidees.vigie.notify.PhoneAccount
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** How often the page asks the server whether the code was entered, while the page is shown. */
private const val POLL_MS = 3_000L

/**
 * The part « Compte Vigie » of the page of the places: link the app to an account by a code (shown here, entered on the
 * account page), then the account's name and zones, a test and « Délier ». [denied]: the person just refused Android's
 * permission, so nothing was asked.
 */
@Composable
internal fun AccountSection(ui: AccountUi, denied: Boolean, onLink: () -> Unit, onPoll: suspend () -> Unit, onCancel: () -> Unit, onUnlink: () -> Unit, onTest: () -> Unit) {
  val context = LocalContext.current
  var noBrowser by remember { mutableStateOf(false) }
  Section(stringResource(R.string.account_header))
  Glass {
    when (val state = ui.state) {
      AccountState.Unlinked -> {
        Line(stringResource(R.string.account_intro), VigieColors.Text2)
        Notes(ui, denied)
        GhostButton(stringResource(R.string.account_link), enabled = !ui.busy, onClick = onLink)
      }
      is AccountState.Waiting -> {
        // Asks the server while the page is shown: back from the browser, the first question goes at once.
        val scope = rememberCoroutineScope()
        LifecycleResumeEffect(state.link.code) {
          val job =
            scope.launch {
              while (true) {
                onPoll()
                delay(POLL_MS)
              }
            }
          onPauseOrDispose { job.cancel() }
        }
        val spoken = stringResource(R.string.account_code_spoken, state.link.code.toCharArray().joinToString(" "))
        Text(
          state.link.code,
          color = VigieColors.Accent,
          style = MaterialTheme.typography.headlineMedium,
          fontFamily = FontFamily.Monospace,
          fontWeight = FontWeight.SemiBold,
          letterSpacing = 3.sp,
          modifier = Modifier.semantics { contentDescription = spoken },
        )
        Line(stringResource(R.string.account_code_hint), VigieColors.Text2)
        if (noBrowser) Line(stringResource(R.string.account_no_browser), VigieColors.Warning)
        Notes(ui, denied)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          GhostButton(stringResource(R.string.account_open), enabled = true, Modifier.weight(1f)) {
            noBrowser = !openPage(context, PhoneAccount.pageUrl(context, state.link.code))
          }
          GhostButton(stringResource(R.string.account_cancel), enabled = !ui.busy, Modifier.weight(1f), onCancel)
        }
      }
      is AccountState.Linked -> {
        val account = state.account
        Line(if (account == null) stringResource(R.string.account_linked_unknown) else stringResource(R.string.account_linked, account.name), VigieColors.Text)
        if (account != null) {
          if (account.zones.isEmpty()) {
            Line(stringResource(R.string.account_no_zone), VigieColors.Text2)
          } else {
            Line(pluralStringResource(R.plurals.account_zones, account.zones.size, account.zones.size), VigieColors.Text2)
            account.zones.forEach { z -> Line(stringResource(R.string.account_zone, z.name, stringResource(bellLabel(levelOf(z.minLevel)))), VigieColors.Text) }
          }
          if (account.quietHours) Line(stringResource(R.string.account_quiet), VigieColors.Text2)
        }
        Notes(ui, denied)
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
          GhostButton(stringResource(R.string.notify_test), enabled = !ui.busy, Modifier.weight(1f), onTest)
          GhostButton(stringResource(R.string.account_unlink), enabled = !ui.busy, Modifier.weight(1f), onUnlink)
        }
      }
    }
  }
  Credits(stringResource(R.string.account_privacy))
}

/** The result of the last action, then what failed. */
@Composable
private fun Notes(ui: AccountUi, denied: Boolean) {
  if (ui.busy) Line(stringResource(R.string.account_busy), VigieColors.Text2)
  if (denied) Line(stringResource(R.string.account_denied), VigieColors.Warning)
  when (ui.note) {
    AccountNote.LINKED -> Line(stringResource(R.string.account_note_linked), VigieColors.Good)
    AccountNote.EXPIRED -> Line(stringResource(R.string.account_note_expired), VigieColors.Text2)
    AccountNote.DROPPED -> Line(stringResource(R.string.account_note_dropped), VigieColors.Text2)
    AccountNote.UNLINKED -> Line(stringResource(R.string.account_note_unlinked), VigieColors.Text2)
    AccountNote.TEST_SENT -> Line(stringResource(R.string.notify_test_sent), VigieColors.Good)
    AccountNote.TEST_NONE -> Line(stringResource(R.string.notify_test_none), VigieColors.Warning)
    null -> {}
  }
  ui.error?.let { Line(it, VigieColors.Warning) }
}

/** The lowest level of a zone, as a bell says it: yellow for anything else. */
private fun levelOf(level: String): Bell =
  when (level) {
    "RED" -> Bell.RED
    "ORANGE" -> Bell.ORANGE
    else -> Bell.YELLOW
  }

/** The account page in the phone's browser; false when the phone has none. */
private fun openPage(context: Context, url: String): Boolean =
  try {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    true
  } catch (err: ActivityNotFoundException) {
    false
  }
