package fr.auxfilsdesidees.vigie.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.Vigilance
import fr.auxfilsdesidees.vigie.ui.theme.VigieColors

/**
 * The banner of the Accueil (sketch A, chosen by the author): the highest official warning of the place, the names of its
 * phenomena, until when, « +1 » when others are in force; touched, it opens [WarningsScreen]. Without a warning, one
 * discreet line, in the words of the site's widget.
 */
@Composable
internal fun WarningBanner(view: Vigil.View, nowUtc: Long, offsetS: Int, onOpen: () -> Unit) {
  if (view.state != Vigil.State.Warnings) {
    val (icon, text, color) =
      when (view.state) {
        Vigil.State.None -> Triple(R.drawable.ic_check, R.string.vigil_none, VigieColors.Good)
        Vigil.State.NoSource -> Triple(R.drawable.ic_check, R.string.vigil_nosource, VigieColors.Text3)
        else -> Triple(R.drawable.ic_warning, R.string.vigil_unread, VigieColors.Text3)
      }
    Row(Modifier.padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
      Icon(painterResource(icon), contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
      Spacer(Modifier.width(8.dp))
      Text(stringResource(text), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
    }
    return
  }
  val color = VigieColors.warning(view.level)
  val shape = RoundedCornerShape(18.dp)
  val until = view.until?.let { Vigil.until(it, nowUtc, offsetS) } ?: stringResource(R.string.vigil_no_end)
  val label = stringResource(R.string.vigil_open)
  Column(
    Modifier.fillMaxWidth()
      .clip(shape)
      .background(VigieColors.Glass)
      .background(color.copy(alpha = 0.16f))
      .border(1.5.dp, color, shape)
      .clickable(role = Role.Button, onClick = onOpen)
      .semantics { contentDescription = label }
      .padding(horizontal = 14.dp, vertical = 12.dp),
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Icon(painterResource(R.drawable.ic_warning), contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
      Spacer(Modifier.width(8.dp))
      Text(Vigil.levelTitle(view.level), color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.width(8.dp).weight(1f))
      Text(until, color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    Row(Modifier.padding(start = 28.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(
        view.labels.joinToString(" · "),
        color = VigieColors.Text,
        style = MaterialTheme.typography.bodyLarge,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
      )
      if (view.more > 0) {
        Spacer(Modifier.width(8.dp))
        Text(
          "+${view.more}",
          color = VigieColors.Text,
          style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
          modifier = Modifier.background(Color.White.copy(alpha = 0.14f), RoundedCornerShape(50)).padding(horizontal = 9.dp, vertical = 2.dp),
        )
      }
      Spacer(Modifier.width(6.dp))
      Icon(painterResource(R.drawable.ic_chevron), contentDescription = null, tint = VigieColors.Text3, modifier = Modifier.size(18.dp))
    }
  }
}

/**
 * « Vigilances à X »: every official warning of the place shown, the strongest first, each with its period, where it
 * applies, the issuer's bulletin (folded) and its advice, then the sources as the issuers word them.
 */
@Composable
internal fun WarningsScreen(viewModel: HomeViewModel, onBack: () -> Unit) {
  val app by viewModel.app.collectAsStateWithLifecycle()
  val followed = app.choices.currentPlace
  SkyPage {
    Row(verticalAlignment = Alignment.CenterVertically) {
      IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back), tint = VigieColors.Text) }
      Text(
        stringResource(R.string.vigil_title, followed?.place?.name.orEmpty()),
        color = VigieColors.Text,
        style = MaterialTheme.typography.headlineSmall,
      )
    }
    val state = followed?.let { app.stateOf(it) }
    if (state !is HomeState.Ready) {
      Text(stringResource(R.string.loading), color = VigieColors.Text2)
      return@SkyPage
    }
    val snap = state.snapshot
    val now = snap.point.serverUtc
    val off = snap.point.utcOffsetS
    val view = Vigil.view(snap.vigilances, now)
    if (view.state != Vigil.State.Warnings) WarningBanner(view, now, off) {}
    view.live.forEach { WarningCard(it, now, off) }
    if (view.live.isNotEmpty()) {
      // One short French line, as the Home Assistant card writes it; the issuers' own credits (in English, with the date of
      // their last update) stay one touch away, word for word.
      Text(stringResource(R.string.vigil_sources), color = VigieColors.Text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 6.dp))
      Credits(stringResource(R.string.vigil_credit_short, Vigil.issuers(view.live)))
      val full = Vigil.fullCredits(view.live, snap.vigilances?.disclaimer)
      if (full.isNotEmpty()) {
        var shown by rememberSaveable { mutableStateOf(false) }
        TextLink(stringResource(if (shown) R.string.vigil_credit_fold else R.string.vigil_credit_full)) { shown = !shown }
        if (shown) full.forEach { Credits(it) }
      }
    }
  }
}

/** One warning: its level and phenomenon, its period, where, the bulletin folded under « Lire le bulletin ». */
@Composable
private fun WarningCard(w: Vigilance, nowUtc: Long, offsetS: Int) {
  val color = VigieColors.warning(w.level)
  var open by rememberSaveable(w.id) { mutableStateOf(false) }
  Glass {
    Row(Modifier.height(IntrinsicSize.Min)) {
      Box(Modifier.width(4.dp).fillMaxHeight().background(color, RoundedCornerShape(2.dp)))
      Spacer(Modifier.width(12.dp))
      Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text(
            Vigil.levelShort(w.level),
            color = VigieColors.OnPill,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            modifier = Modifier.background(color, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 3.dp),
          )
          Spacer(Modifier.width(10.dp))
          Text(Vigil.label(w), color = VigieColors.Text, style = MaterialTheme.typography.titleMedium)
        }
        Text(Vigil.period(w, nowUtc, offsetS), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
        Vigil.where(w)?.let { Text(it, color = VigieColors.Text3, style = MaterialTheme.typography.labelMedium) }
        val description = w.description?.trim()?.takeIf { it.isNotEmpty() }
        if (description != null) {
          Text(
            if (open) description else excerpt(description),
            color = VigieColors.Text2,
            style = MaterialTheme.typography.bodyMedium,
          )
          if (open && !w.instruction.isNullOrBlank()) {
            Text(stringResource(R.string.vigil_advice), color = VigieColors.Text, style = MaterialTheme.typography.titleSmall)
            Text(w.instruction.trim(), color = VigieColors.Text2, style = MaterialTheme.typography.bodyMedium)
          }
          if (description.length > EXCERPT || !w.instruction.isNullOrBlank()) {
            TextLink(stringResource(if (open) R.string.vigil_fold else R.string.vigil_read)) { open = !open }
          }
        }
        w.web?.let { url ->
          val uri = LocalUriHandler.current
          TextLink(url.substringAfter("://").substringBefore('/')) { runCatching { uri.openUri(url) } }
        }
      }
    }
  }
}

private const val EXCERPT = 220

/** The start of a bulletin, cut at a word. */
private fun excerpt(s: String): String {
  if (s.length <= EXCERPT) return s
  val cut = s.lastIndexOf(' ', EXCERPT).takeIf { it > EXCERPT / 2 } ?: EXCERPT
  return s.substring(0, cut).trimEnd(',', ';', ':', ' ') + "…"
}

@Composable
private fun TextLink(text: String, onClick: () -> Unit) {
  Text(
    text,
    color = VigieColors.Accent,
    style = MaterialTheme.typography.titleSmall,
    modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClick = onClick).heightIn(min = 40.dp).padding(vertical = 10.dp),
  )
}
