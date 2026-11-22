package fr.auxfilsdesidees.vigie.ui.theme

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

/**
 * The « Ciel » theme of the Vigie family's visual charter (values copied from Meridien's `visuel_themes.hpp`):
 * a sky gradient, dark glass cards, one colour per meaning, never a colour alone (always a word with it).
 */
object VigieColors {
  val SkyTop = Color(0xFF123F7D)
  val SkyBottom = Color(0xFF2A5A8F)
  /** Glass: #0A1220 at 44 % over the sky, with a 1.5 dp border of white at 8 %. */
  val Glass = Color(0x700A1220)
  val GlassBorder = Color(0x14FFFFFF)
  val Bar = Color(0xE60A1220)

  val Text = Color(0xFFF6F8FB)
  val Text2 = Color(0xFFD3DCE6)
  val Text3 = Color(0xFFB4C2D2)
  val Rule = Color(0xFF5E738C)
  val Accent = Color(0xFFFFC857)
  val Warning = Color(0xFFFFCF66)
  val OnPill = Color(0xFF10151C)

  val Good = Color(0xFF7FE0A8)
  val Possible = Color(0xFFFFD25C)
  val Orange = Color(0xFFFFA24D)
  val Poor = Color(0xFFFF9A90)

  val Wind = Color(0xFF8FD6FF)
  val Rain = Color(0xFF5CB8FF)

  /** Official level colour; green is never shown as an alert, an unknown level stays neutral. */
  fun level(level: String?): Color =
    when (level?.uppercase()) {
      "YELLOW" -> Possible
      "ORANGE" -> Orange
      "RED" -> Poor
      else -> Text3
    }

  /** Verdict colour; an unknown verdict takes the rule colour, never a verdict colour. */
  fun verdict(v: String?): Color =
    when (v) {
      "good" -> Good
      "possible" -> Possible
      "poor" -> Poor
      else -> Rule
    }

  private val RAMP =
    listOf(
      -10.0 to Color(0xFF8FC4FF),
      0.0 to Color(0xFF62D8FF),
      12.0 to Color(0xFF84E8A0),
      24.0 to Color(0xFFFFCB52),
      36.0 to Color(0xFFFF7555),
    )

  /** Temperature ramp of the charter (−10, 0, 12, 24, 36 °C), linear between its stops. */
  fun temperature(c: Double?): Color {
    if (c == null) return Text
    if (c <= RAMP.first().first) return RAMP.first().second
    for (i in 0 until RAMP.size - 1) {
      val (t0, c0) = RAMP[i]
      val (t1, c1) = RAMP[i + 1]
      if (c <= t1) return lerp(c0, c1, ((c - t0) / (t1 - t0)).toFloat())
    }
    return RAMP.last().second
  }
}
