package fr.auxfilsdesidees.vigie.ui.board

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp

/**
 * The colours of the home page: the dark palette of the Home Assistant card (`PALETTES.dark` of `vigie-card.js`), so the
 * home of the app and the card's look the same: the temperature ramp, the rain and wind blues, the green accent of the hour
 * and the day under way, and the « Lueur » of the columns (grey to gold with the sun, navy at night).
 */
internal class BoardPalette(
  val text: Color,
  val t2: Color,
  val t3: Color,
  val t4: Color,
  val rule: Color,
  val accent: Color,
  val onPill: Color,
  val green: Color,
  val yellow: Color,
  val orange: Color,
  val red: Color,
  val wind: Color,
  val rain: Color,
  val rainLight: Color,
  val rainHeavy: Color,
  val ramp: List<Color>,
  val glowNight: Color,
  val glowCloud: Color,
  val glowSun: Color,
  val glowStrength: Float,
  val hollow: Color,
  val iconRoles: Map<String, Color>,
) {
  /** The colour of a temperature on the ramp of the card (−10, 0, 12, 24, 36 °C); [t2] without one. */
  fun temperature(t: Double?): Color {
    if (t == null) return t2
    if (t <= STOPS[0]) return ramp[0]
    for (i in 1 until 5) if (t <= STOPS[i]) return lerp(ramp[i - 1], ramp[i], ((t - STOPS[i - 1]) / (STOPS[i] - STOPS[i - 1])).toFloat())
    return ramp[4]
  }

  /** The colour of a rain rate in mm per hour: light under 1, moderate under 3, heavy above. */
  fun rainOf(mmH: Double): Color = if (mmH >= 3) rainHeavy else if (mmH >= 1) rain else rainLight

  /** The strong gusts: orange from 80 km/h, yellow from 60, else none. */
  fun gust(v: Double): Color? = if (v >= 80) orange else if (v >= 60) yellow else null

  /** The colour of a tone of the card (`vert`, `jaune`, `orange`, `rouge`, `neutre`). */
  fun tone(t: String): Color = when (t) { "vert" -> green; "jaune" -> yellow; "orange" -> orange; "rouge" -> red; else -> t2 }

  /**
   * The « Lueur » of a column: the tint of its sky at the top, fading downwards. [sun] is the share of sun (0 to 1, a guess of
   * 0.3 without one), [day] false a night column. The card's `glow`.
   */
  fun glow(sun: Double?, day: Boolean, height: Float): Brush {
    val s = (sun ?: 0.3).coerceIn(0.0, 1.0).toFloat()
    val col = if (day) lerp(glowCloud, glowSun, s) else glowNight
    val a = (if (day) 0.11f + 0.21f * s else 0.16f) * glowStrength
    return Brush.verticalGradient(
      0f to col.copy(alpha = minOf(0.62f, a * 2.3f)),
      0.38f to col.copy(alpha = a * 0.9f),
      1f to col.copy(alpha = 0.03f),
      startY = 0f,
      endY = height,
    )
  }

  companion object {
    private val STOPS = doubleArrayOf(-10.0, 0.0, 12.0, 24.0, 36.0)

    private fun c(hex: Long) = Color(0xFF000000 or hex)

    val Dark =
      BoardPalette(
        text = c(0xF4F7FA),
        t2 = c(0xCBD5DF),
        t3 = c(0xA3B1C0),
        t4 = c(0x7D8B9B),
        rule = c(0x2C3947),
        accent = c(0x3DDC97),
        onPill = c(0x10151C),
        green = c(0x6FE3B0),
        yellow = c(0xFFD25C),
        orange = c(0xFFA24D),
        red = c(0xFF6B5E),
        wind = c(0x7FD1FF),
        rain = c(0x58B4FF),
        rainLight = c(0x7FD1FF),
        rainHeavy = c(0x3A8CF0),
        ramp = listOf(c(0x7FB2FF), c(0x5CD6FF), c(0x7BE495), c(0xFFC94A), c(0xFF6B4A)),
        glowNight = c(0x6F8FE0),
        glowCloud = c(0xA9B6C4),
        glowSun = c(0xFFC94A),
        glowStrength = 1f,
        hollow = c(0x3A4654),
        iconRoles =
          mapOf(
            "vs" to c(0xFFC83D),
            "vl" to c(0xEFE9CF),
            "vn" to c(0xE3EAF2),
            "vm" to c(0x8F9DB2),
            "ve" to c(0x58B4FF),
            "vg" to c(0xFFFFFF),
            "vx" to c(0xFFD93D),
            "vb" to c(0xAAB6C4),
          ),
      )
  }
}
