package fr.auxfilsdesidees.vigie.ui.board

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import fr.auxfilsdesidees.vigie.R
import fr.auxfilsdesidees.vigie.data.AvalancheBulletin
import fr.auxfilsdesidees.vigie.data.BeachTide
import fr.auxfilsdesidees.vigie.data.NearBeach
import fr.auxfilsdesidees.vigie.data.PointNow
import fr.auxfilsdesidees.vigie.data.SkiArea

/*
 * The Plages and Pistes tab, in the card of the head (the sketches chosen by the author on 28/11/2026): chips (« Autour »
 * and the beaches kept, or the ski areas), then « Autour » (the sea here, the beaches within 14 km, the wind and showers of
 * 24 hours), a beach (its tiles, its 24 hours, its 7 days with the UV) or an area (its sentence, top and foot, the avalanche
 * level at its heights and the bulletin, 24 hours at the top and at the foot with the 0 °C, 7 days at the top with the
 * snow). The hours and the days are the Accueil's columns ([drawHours], [drawDays]) with a line of their own under them. The
 * words are [NearbyBoard]'s; the sizes are the card's px in dp, the texts keep their size whatever the phone's font scale.
 */

/** A chip of the tab: its label, a star when it is kept, [more] a dashed chip that opens the list. */
data class NearbyChip(val label: String, val kept: Boolean = false, val more: Boolean = false)

/** The colour of a tone of [NearbyBoard] (and of the season's words). */
internal fun BoardPalette.nearbyTone(t: String?, tempC: Double? = null): Color =
  if (tempC != null) temperature(tempC)
  else
    when (t) {
      "green", "vert" -> green
      "yellow", "jaune" -> yellow
      "orange" -> orange
      "red", "rouge" -> red
      "wind" -> wind
      "rain" -> rain
      "t2" -> t2
      "t3" -> t3
      "sun" -> iconRoles["vs"] ?: yellow
      else -> text
    }

private fun parts(list: List<NearbyBoard.Part>, pal: BoardPalette): AnnotatedString = buildAnnotatedString {
  list.forEach { p ->
    if (p.tone == null && p.tempC == null && !p.bold) append(p.text)
    else withStyle(SpanStyle(color = pal.nearbyTone(p.tone, p.tempC), fontWeight = FontWeight.Bold)) { append(p.text) }
  }
}

/** The chips, one row that wraps; the one shown in the green of the hour, a star before a kept one. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun NearbyChips(chips: List<NearbyChip>, selected: Int, onSelect: (Int) -> Unit) {
  val pal = BoardPalette.Dark
  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    chips.forEachIndexed { i, c ->
      val on = i == selected
      val shape = RoundedCornerShape(999.dp)
      val edge = if (on) pal.accent else pal.rule
      Row(
        Modifier.clip(shape)
          .background(if (on) pal.accent.copy(alpha = 0.14f) else Color.Transparent)
          .then(
            if (c.more) Modifier.drawBehind { drawRoundRect(edge, style = Stroke(1.5f * density, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4 * density, 3 * density))), cornerRadius = androidx.compose.ui.geometry.CornerRadius(size.height / 2)) }
            else Modifier.border(1.5.dp, edge, shape)
          )
          .clickable { onSelect(i) }
          .semantics {
            role = Role.Tab
            this.selected = on
          }
          .padding(horizontal = 12.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
      ) {
        if (c.kept) Icon(painterResource(R.drawable.ic_star), null, tint = pal.nearbyTone("sun"), modifier = Modifier.size(13.dp))
        Text(c.label, color = if (on) pal.accent else if (c.more) pal.t3 else pal.t2, fontSize = fs(14f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}

/** The star of a beach or an area: full when kept; a touch keeps it or lets it go. */
@Composable
private fun Star(kept: Boolean, size: Int, onClick: () -> Unit, pal: BoardPalette) {
  val words = if (kept) "Ne plus garder" else "Garder"
  Box(Modifier.size((size + 16).dp).clip(RoundedCornerShape(999.dp)).clickable(role = Role.Button, onClick = onClick).semantics { contentDescription = words }, contentAlignment = Alignment.Center) {
    Icon(painterResource(if (kept) R.drawable.ic_star else R.drawable.ic_star_outline), null, tint = if (kept) pal.nearbyTone("sun") else pal.t3, modifier = Modifier.size(size.dp))
  }
}

/** A block's title: its name in capitals, then a note in small letters (« LA MER ICI · lue à Sainte-Anne à 13 h 10 »). */
@Composable
private fun Title(name: String, note: String, pal: BoardPalette) {
  Text(
    buildAnnotatedString {
      withStyle(SpanStyle(color = pal.t3, fontWeight = FontWeight.Bold, letterSpacing = 0.06.em)) { append(name.uppercase()) }
      if (note.isNotEmpty()) withStyle(SpanStyle(color = pal.t4, fontWeight = FontWeight.Medium, fontSize = fs(11f))) { append(" · $note") }
    },
    fontSize = fs(11f),
    maxLines = 2,
    overflow = TextOverflow.Ellipsis,
  )
}

/** A framed block (the card's tiles: a line of 1.5 px, corners of 12). */
@Composable
private fun Frame(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
  val pal = BoardPalette.Dark
  Column(modifier.border(1.5.dp, pal.rule, RoundedCornerShape(12.dp)).padding(horizontal = 10.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) { content() }
}

/** A line of small values under columns, one under each (the UV, the snow, the 0 °C). */
@Composable
private fun UnderColumns(values: List<String>, colour: Color) {
  Row(Modifier.fillMaxWidth()) {
    values.forEach { Text(it, color = colour, fontSize = fs(11f), fontWeight = FontWeight.Bold, textAlign = TextAlign.Center, maxLines = 1, modifier = Modifier.weight(1f)) }
  }
}

/** 24 hours in the Accueil's columns, a title over them, [under] a line under each column. */
@Composable
private fun HoursColumns(title: String, note: String, p: PointNow, now: Long, w: Float, pal: BoardPalette, under: ((HomeBoard.HourSlot) -> String)? = null, underColour: Color = pal.t2) {
  val h = HomeBoard.hours(p, now, w) ?: return
  val measurer = rememberTextMeasurer()
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Title(title, note, pal)
    Canvas(Modifier.width(w.dp).height(hoursHeight(h.slots).dp)) { drawHours(measurer, h, p.utcOffsetS, w, pal) }
    if (under != null) UnderColumns(h.slots.map(under), underColour)
  }
}

/** 7 days in the Accueil's columns, [under] a line under each day. */
@Composable
private fun DaysColumns(title: String, note: String, p: PointNow, now: Long, w: Float, pal: BoardPalette, under: (String) -> String, underColour: Color) {
  val days = HomeBoard.days(p, now, 7).takeIf { it.size >= 2 } ?: return
  val measurer = rememberTextMeasurer()
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    Title(title, note, pal)
    Canvas(Modifier.width(w.dp).height(daysHeight(days).dp)) { drawDays(measurer, days, w, pal) }
    UnderColumns(days.map { under(it.date) }, underColour)
  }
}

@Composable
private fun Credit(text: String, pal: BoardPalette) {
  Text(text, color = pal.t4, fontSize = fs(11.5f), fontWeight = FontWeight.Medium, modifier = Modifier.padding(top = 6.dp))
}

@Composable
private fun Status(text: String?, pal: BoardPalette) {
  if (text != null) Text(text, color = pal.t2, fontSize = fs(14f), fontWeight = FontWeight.Medium, modifier = Modifier.padding(vertical = 8.dp))
}

/** The credit of the sea: the models its attribution names. */
private fun seaCredit(p: PointNow?): String? {
  val a = p?.marine?.attribution ?: return null
  return listOfNotNull("Open-Meteo".takeIf { "Open-Meteo" in a }, "DWD".takeIf { "DWD" in a }, "Copernicus".takeIf { "Copernicus" in a }).takeIf { it.isNotEmpty() }?.joinToString(", ")
}

// ------------------------------------------------------------------------------------------------------------ Autour

/**
 * « Autour »: the sea and the sky of the place ([around], read with its sea; [aroundStatus] while it is not there), the
 * beaches of [beaches] within 14 km with where they are from the place ([lat], [lon]) and their star, the wind and the
 * showers of 24 hours. [showAll] opens the rest of the list.
 */
@Composable
fun AroundBoardView(
  readNote: String,
  around: PointNow?,
  aroundStatus: String?,
  beaches: List<NearBeach>,
  lat: Double,
  lon: Double,
  kept: List<String>,
  showAll: Boolean,
  onShowAll: () -> Unit,
  onOpen: (NearBeach) -> Unit,
  onStar: (NearBeach) -> Unit,
  now: Long,
) {
  val pal = BoardPalette.Dark
  ProvideTextStyle(TextStyle(lineHeight = 1.17.em)) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
      val w = maxWidth.value
      Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Title("La mer ici", readNote, pal)
        if (around == null) Status(aroundStatus, pal)
        else {
          val minis = NearbyBoard.seaAround(around, now)
          Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            minis.chunked(4).forEach { row ->
              Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { m ->
                  Column(
                    Modifier.weight(1f).fillMaxHeight().border(1.5.dp, pal.rule, RoundedCornerShape(12.dp)).padding(horizontal = 4.dp, vertical = 6.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(1.dp),
                  ) {
                    Text(m.value, color = pal.nearbyTone(m.tone, m.tempC), fontSize = fs(18f), fontWeight = FontWeight.Bold, maxLines = 1)
                    Text(m.label, color = pal.t2, fontSize = fs(11f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                  }
                }
                repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
              }
            }
          }
        }
        if (beaches.isNotEmpty()) {
          Frame(Modifier.fillMaxWidth()) {
            Title("${beaches.size} plage${if (beaches.size > 1) "s" else ""} à moins de 14 km", "", pal)
            val shown = if (showAll) beaches else beaches.take(10)
            shown.forEachIndexed { i, b ->
              Row(
                Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(pal.rule, Offset(0f, 0f), Offset(size.width, 0f), density) } else Modifier).clickable { onOpen(b) }.padding(vertical = 5.dp),
                verticalAlignment = Alignment.CenterVertically,
              ) {
                Column(Modifier.weight(1f)) {
                  Text(NearbyBoard.shortName(b.name), color = pal.text, fontSize = fs(14.5f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                  Text("${NearbyBoard.km(b.distanceKm)} ${NearbyBoard.at(lat, lon, b.lat, b.lon)} · ${if (b.sea) "mer" else "lac ou rivière"}", color = pal.t3, fontSize = fs(12f), fontWeight = FontWeight.Medium, maxLines = 1)
                }
                Star(b.id in kept, 20, { onStar(b) }, pal)
              }
            }
            if (!showAll && beaches.size > 10) {
              Text("voir les ${beaches.size - 10} autres", color = pal.accent, fontSize = fs(14f), fontWeight = FontWeight.Bold, modifier = Modifier.clickable(onClick = onShowAll).padding(vertical = 6.dp))
            }
          }
        }
        around?.let { HoursColumns("Le vent et les averses, 24 h", "", it, now, w, pal) }
        Credit(
          listOfNotNull(
              "Plages : © les contributeurs d’OpenStreetMap (ODbL), IGN",
              seaCredit(around)?.let { "mer : $it" },
              around?.provider?.let { "temps : $it" },
              "lever et coucher du soleil calculés par Vigie",
            )
            .joinToString(" · "),
          pal,
        )
      }
    }
  }
}

// --------------------------------------------------------------------------------------------------------- a beach

/**
 * A beach (kept, or opened from the list): its name, how far and where it is, its star; its tiles, its 24 hours and its
 * 7 days with the UV. [point] is its weather and sea read at the beach; [status] while it is not there.
 */
@Composable
fun BeachBoardView(
  beach: NearBeach,
  where: String,
  kept: Boolean,
  onStar: () -> Unit,
  point: PointNow?,
  status: String?,
  tide: BeachTide?,
  quality: String?,
  now: Long,
) {
  val pal = BoardPalette.Dark
  ProvideTextStyle(TextStyle(lineHeight = 1.17.em)) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
      val w = maxWidth.value
      Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(beach.name, color = pal.text, fontSize = fs(19f), fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            val read = point?.let { " · mer et temps lus à la plage à ${HomeBoard.hm(it.serverUtc, it.utcOffsetS)}" } ?: ""
            Text("$where$read", color = pal.t2, fontSize = fs(12.5f), fontWeight = FontWeight.Medium, lineHeight = 1.25.em)
          }
          Star(kept, 26, onStar, pal)
        }
        if (point == null) Status(status, pal)
        else {
          val tiles = NearbyBoard.beachTiles(point, now, tide, quality)
          Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            tiles.chunked(3).forEach { row ->
              Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                row.forEach { t -> TileView(t, pal, Modifier.weight(1f).fillMaxHeight()) }
                repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
              }
            }
          }
          HoursColumns("24 heures à la plage", "", point, now, w, pal)
          val uvOf = point.days.associate { it.date to it.uvMax }
          DaysColumns("7 jours", "pluie, vent le plus fort, UV au plus", point, now, w, pal, { d -> uvOf[d]?.let { "UV ${HomeBoard.fmt(it)}" } ?: "" }, pal.orange)
          Credit(
            listOfNotNull(
                "Plage : © les contributeurs d’OpenStreetMap (ODbL), IGN",
                seaCredit(point)?.let { "mer : $it" },
                point.provider?.let { "temps : $it" },
                tide?.let { "marée calculée par Vigie (EOT20), pas pour la navigation" },
                quality?.let { "eau de baignade : ministère de la Santé" },
                "lever et coucher du soleil calculés par Vigie",
              )
              .joinToString(" · "),
            pal,
          )
        }
      }
    }
  }
}

@Composable
private fun TileView(t: NearbyBoard.Tile, pal: BoardPalette, modifier: Modifier) {
  Column(modifier.border(1.5.dp, pal.rule, RoundedCornerShape(12.dp)).padding(horizontal = 9.dp, vertical = 7.dp), verticalArrangement = Arrangement.spacedBy(1.dp)) {
    Text(t.key.uppercase(), color = pal.t3, fontSize = fs(11f), fontWeight = FontWeight.Bold, letterSpacing = 0.05.em, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Text(
      buildAnnotatedString {
        withStyle(SpanStyle(color = pal.nearbyTone(t.tone, t.tempC))) { append(t.value) }
        if (t.unit != null) withStyle(SpanStyle(color = pal.t2, fontSize = fs(12f), fontWeight = FontWeight.Medium)) { append(" ${t.unit}") }
      },
      fontSize = fs(22f),
      fontWeight = FontWeight.Bold,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis,
    )
    if (t.detail.isNotEmpty()) Text(t.detail, color = pal.t2, fontSize = fs(11.5f), fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 1.2.em)
  }
}

// ------------------------------------------------------------------------------------------------------- a ski area

/** The list of the areas around, opened by « + n autour »: one row each, its lifts and heights, its star. */
@Composable
fun AreasListView(areas: List<SkiArea>, kept: List<String>, onOpen: (SkiArea) -> Unit, onStar: (SkiArea) -> Unit) {
  val pal = BoardPalette.Dark
  Frame(Modifier.fillMaxWidth()) {
    Title("${areas.size} domaine${if (areas.size > 1) "s" else ""} à moins de 15 km", "", pal)
    areas.forEachIndexed { i, a ->
      Row(
        Modifier.fillMaxWidth().then(if (i > 0) Modifier.drawBehind { drawLine(pal.rule, Offset(0f, 0f), Offset(size.width, 0f), density) } else Modifier).clickable { onOpen(a) }.padding(vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(Modifier.weight(1f)) {
          Text(NearbyBoard.shortName(a.name), color = pal.text, fontSize = fs(14.5f), fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
          Text(NearbyBoard.areaLine(a), color = pal.t3, fontSize = fs(12f), fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Star(a.id in kept, 20, { onStar(a) }, pal)
      }
    }
  }
}

/**
 * A ski area: its name, lifts and heights, its star; the sentence; the top and the foot ([top], [foot], read at their
 * heights); the avalanche level on the area and the 0 °C; the bulletin ([bulletin], with its band of heights and the slopes
 * of its problems); 24 hours at the top, at the foot with the 0 °C, 7 days at the top with the snow.
 */
@Composable
fun SkiBoardView(
  area: SkiArea,
  kept: Boolean,
  onStar: () -> Unit,
  top: PointNow?,
  foot: PointNow?,
  status: String?,
  bulletin: AvalancheBulletin?,
  onBulletin: (String) -> Unit,
  now: Long,
) {
  val pal = BoardPalette.Dark
  val any = top ?: foot
  ProvideTextStyle(TextStyle(lineHeight = 1.17.em)) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
      val w = maxWidth.value
      Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(NearbyBoard.shortName(area.name), color = pal.text, fontSize = fs(19f), fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(NearbyBoard.areaLine(area), color = pal.t2, fontSize = fs(12.5f), fontWeight = FontWeight.Medium, lineHeight = 1.25.em)
          }
          Star(kept, 26, onStar, pal)
        }
        if (any == null) Status(status, pal) else SkiBody(area, top, foot, any, bulletin, onBulletin, now, w, pal)
      }
    }
  }
}

@Composable
private fun SkiBody(area: SkiArea, top: PointNow?, foot: PointNow?, any: PointNow, bulletin: AvalancheBulletin?, onBulletin: (String) -> Unit, now: Long, w: Float, pal: BoardPalette) {
  val off = any.utcOffsetS
  Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        val sentence = NearbyBoard.areaSentence(area, top, foot, bulletin, now, off)
        if (sentence.isNotEmpty()) Text(parts(sentence, pal), color = pal.text, fontSize = fs(15f), fontWeight = FontWeight.Medium, lineHeight = 1.35.em)
        Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          HeightBlock(if (area.topM != null) "En haut · ${NearbyBoard.metres(area.topM)}" else "Sur le domaine", top, pal, Modifier.weight(1f).fillMaxHeight())
          if (foot != null && foot !== top) HeightBlock("En bas · ${area.footM?.let(NearbyBoard::metres) ?: ""}", foot, pal, Modifier.weight(1f).fillMaxHeight())
        }
        val level = bulletin?.let { NearbyBoard.areaLevel(area, it) }?.takeIf { it in 1..5 }
        val iso = NearbyBoard.freezingNow(foot ?: top!!, now)
        if (level != null || iso != null) {
          Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (level != null) LevelBlock(level, bulletin!!, pal, Modifier.weight(1f).fillMaxHeight())
            if (iso != null) {
              Frame(Modifier.weight(1f).fillMaxHeight()) {
                Title("Iso 0", "", pal)
                Text(NearbyBoard.metres(iso), color = pal.text, fontSize = fs(24f), fontWeight = FontWeight.Bold, maxLines = 1)
                Text(NearbyBoard.moment(now, off), color = pal.t2, fontSize = fs(12f), fontWeight = FontWeight.Medium)
              }
            }
          }
        }
        if (bulletin != null) BulletinBlock(area, bulletin, now, off, onBulletin, pal)
        top?.let { HoursColumns("24 heures en haut", area.topM?.let(NearbyBoard::metres) ?: "", it, now, w, pal) }
        foot?.takeIf { it !== top }?.let { f ->
          val hasIso = f.hours.any { it.freezingLevelM != null }
          HoursColumns("24 heures en bas", listOfNotNull(area.footM?.let(NearbyBoard::metres), "iso 0 en km".takeIf { hasIso }).joinToString(" · "), f, now, w, pal, if (hasIso) ({ s -> NearbyBoard.freezingKm(f, s.ts) ?: "" }) else null, pal.rain)
        }
        top?.let { t ->
          val snowOf = t.days.associate { it.date to it.snowfallCm }
          DaysColumns("7 jours en haut", "neige fraîche en cm", t, now, w, pal, { d -> snowOf[d]?.let { if (it >= 0.1) HomeBoard.fmt(it, 1) else "—" } ?: "" }, pal.text)
        }
        Credit(
          listOfNotNull(
              "Domaines : © les contributeurs d’OpenStreetMap (ODbL)",
              "remontées et altitudes : IGN",
              bulletin?.let { "avalanches : ${if (it.attribution?.startsWith("Météo-France") == true) "Météo-France (BRA)" else it.attribution ?: ""}" },
              any.provider?.let { "temps : $it" },
            )
            .joinToString(" · "),
          pal,
        )
  }
}

@Composable
private fun HeightBlock(title: String, p: PointNow?, pal: BoardPalette, modifier: Modifier) {
  Frame(modifier) {
    Title(title, "", pal)
    if (p != null) HeightNow(p, pal)
  }
}

@Composable
private fun HeightNow(p: PointNow, pal: BoardPalette) {
  Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
    Text("${HomeBoard.fmt(p.tempC)}°", color = pal.temperature(p.tempC), fontSize = fs(30f), fontWeight = FontWeight.Bold, maxLines = 1)
    val more = listOfNotNull(p.feelsLikeC?.let { "ressenti ${HomeBoard.fmt(it)}°" }, p.windKmh?.let { "vent ${HomeBoard.fmt(it)} km/h" })
    if (more.isNotEmpty()) Text(more.joinToString(" · "), color = pal.t2, fontSize = fs(12f), fontWeight = FontWeight.Medium, maxLines = 2)
  }
}

@Composable
private fun LevelBlock(level: Int, b: AvalancheBulletin, pal: BoardPalette, modifier: Modifier) {
  val col = pal.nearbyTone(HomeBoard.avalancheTone(level))
  Row(modifier.border(1.5.dp, pal.rule, RoundedCornerShape(12.dp)).padding(horizontal = 10.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
    Box(Modifier.size(42.dp).background(col, RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
      Text("$level", color = pal.onPill, fontSize = fs(24f), fontWeight = FontWeight.Bold)
    }
    Column {
      Title("Avalanches ici", "", pal)
      Text(HomeBoard.avalancheWord(level), color = col, fontSize = fs(16f), fontWeight = FontWeight.Bold, maxLines = 1)
      val max = b.maxLevel
      Text(if (max != null && max > level) "$max plus haut" else b.region?.let { "massif $it" } ?: "", color = pal.t2, fontSize = fs(12f), fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
}

/** The bulletin: who and when, the levels by height with the area's top and foot, the slopes of each problem, its words, the trend, the link. */
@Composable
private fun BulletinBlock(area: SkiArea, b: AvalancheBulletin, now: Long, offsetS: Int, onOpen: (String) -> Unit, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  Frame(Modifier.fillMaxWidth()) {
    Title("Bulletin avalanches${b.region?.let { " · $it" } ?: ""}", "", pal)
    Text(NearbyBoard.bulletinLine(b, now, offsetS), color = pal.t2, fontSize = fs(12f), fontWeight = FontWeight.Medium)
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
      if (b.bands.isNotEmpty()) {
        val (lo, hi) = NearbyBoard.bandRange(area, b)
        Canvas(Modifier.weight(1f).height(160.dp)) {
          val k = density
          val h = size.height / k
          val x0 = size.width / k * 0.45f
          fun y(m: Int) = h - 4 - (m - lo).toFloat() / (hi - lo) * (h - 8)
          b.bands.forEach { r ->
            val a = maxOf(r.lowerM ?: lo, lo)
            val z = minOf(r.upperM ?: hi, hi)
            if (z <= a) return@forEach
            drawRect(pal.nearbyTone(HomeBoard.avalancheTone(r.level)), Offset(x0 * k, y(z) * k), Size(16 * k, (y(a) - y(z)) * k))
            textAt(measurer, "${r.level} ${HomeBoard.avalancheWord(r.level)}", x0 + 22, (y(a) + y(z)) / 2 - 7.5f, 12.5f, pal.text, FontWeight.Bold, -1)
          }
          NearbyBoard.threshold(b)?.takeIf { it in lo..hi }?.let { t -> textAt(measurer, NearbyBoard.metres(t), x0 - 6, y(t) - 7f, 11f, pal.t3, FontWeight.Medium, 1) }
          listOfNotNull(area.topM?.let { it to "haut" }, area.footM?.let { it to "bas" }).forEach { (m, word) ->
            if (m !in lo..hi) return@forEach
            drawLine(pal.text, Offset((x0 - 4) * k, y(m) * k), Offset((x0 + 20) * k, y(m) * k), 2 * k)
            textAt(measurer, "$word ${NearbyBoard.metres(m)}", x0 - 8, y(m) - 7.5f, 11.5f, pal.text, FontWeight.Bold, 1)
          }
        }
      }
      if (b.problems.isNotEmpty()) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
          b.problems.take(3).forEach { p ->
            Rose(p.aspects, pal.orange, pal)
            Text(NearbyBoard.problem(p.type), color = pal.orange, fontSize = fs(12f), fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
          }
        }
      }
    }
    listOfNotNull(b.activity, b.snowpack).forEach { Text("« ${it.trim()} »", color = pal.t2, fontSize = fs(13f), fontWeight = FontWeight.Medium, lineHeight = 1.3.em, modifier = Modifier.padding(bottom = 4.dp)) }
    NearbyBoard.trend(b, now, offsetS)?.let { (day, words) ->
      Text(
        buildAnnotatedString {
          withStyle(SpanStyle(color = pal.accent, fontWeight = FontWeight.Bold)) { append(day) }
          append(" : $words")
        },
        color = pal.text,
        fontSize = fs(13f),
        fontWeight = FontWeight.Medium,
      )
    }
    b.url?.let { url -> Text("lire tout le bulletin", color = pal.accent, fontSize = fs(14f), fontWeight = FontWeight.Bold, modifier = Modifier.clickable { onOpen(url) }.padding(vertical = 4.dp)) }
  }
}

/** The slopes of a problem: eight sectors, those of [aspects] in [colour], N at the top and the four letters around. */
@Composable
private fun Rose(aspects: List<String>, colour: Color, pal: BoardPalette) {
  val measurer = rememberTextMeasurer()
  val order = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")
  Canvas(Modifier.size(72.dp).semantics { contentDescription = aspects.joinToString(" ") }) {
    val k = density
    val c = Offset(size.width / 2, size.height / 2)
    val r = 26 * k
    order.forEachIndexed { i, a ->
      drawArc(
        if (a in aspects) colour else pal.text.copy(alpha = 0.08f),
        startAngle = i * 45f - 90f - 22.5f + 1.5f,
        sweepAngle = 42f,
        useCenter = true,
        topLeft = Offset(c.x - r, c.y - r),
        size = Size(2 * r, 2 * r),
      )
    }
    listOf("N" to 0f, "E" to 90f, "S" to 180f, "O" to 270f).forEach { (l, deg) ->
      val a = Math.toRadians((deg - 90).toDouble())
      val x = c.x / k + 32 * kotlin.math.cos(a).toFloat()
      val y = c.y / k + 32 * kotlin.math.sin(a).toFloat()
      textAt(measurer, l, x, y - 6f, 9.5f, pal.t3, FontWeight.Bold, 0)
    }
  }
}
