package fr.auxfilsdesidees.vigie.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.Dp
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * The drawings of the frise, ported from the family's sketch library (`android-esquisses/lib.js`): weather icons on a
 * 100 × 100 box, the wind arrow, the monotone curve. Same shapes and colours as the prototype Axel chose.
 */
enum class Sky { Sun, Moon, Cloud, FewClouds, CloudyNight, Rain, Showers, Storm, Snow, Mist }

/** The icon of a WMO code, by day or by night; null for an unknown code (nothing drawn). */
fun skyOf(code: Int?, day: Boolean): Sky? =
  when {
    code == null -> null
    code <= 1 -> if (day) Sky.Sun else Sky.Moon
    code == 2 -> if (day) Sky.FewClouds else Sky.CloudyNight
    code == 3 -> Sky.Cloud
    code == 45 || code == 48 -> Sky.Mist
    code in 51..67 -> Sky.Rain
    code in 71..77 || code == 85 || code == 86 -> Sky.Snow
    code in 80..82 -> Sky.Showers
    code >= 95 -> Sky.Storm
    else -> Sky.Cloud
  }

private val SUN = Color(0xFFFFC83D)
private val MOON = Color(0xFFEFE9CF)
private val CLOUD = Color(0xFFE6EDF5)
private val CLOUD_DARK = Color(0xFFA9B7CB)
private val DROP = Color(0xFF62BCFF)
private val BOLT = Color(0xFFFFD93D)
private val SNOW = Color(0xFFFFFFFF)
private val MIST = Color(0xFFB4C0CE)

private val MOON_PATH: Path by lazy { PathParser().parsePathString("M12 -26 A28 28 0 1 0 26 12 A22 22 0 1 1 12 -26 Z").toPath() }

/** Draws [sky] centred on ([cx], [cy]), [size] pixels wide. */
fun DrawScope.weatherIcon(sky: Sky, cx: Float, cy: Float, size: Float) {
  withTransform({
    translate(cx - size / 2, cy - size / 2)
    scale(size / 100f, size / 100f, pivot = Offset.Zero)
  }) {
    when (sky) {
      Sky.Sun -> {
        drawCircle(SUN, 19f, Offset(50f, 50f))
        rays(50f, 50f, 29f, 41f, 6f)
      }
      Sky.Moon -> moon(50f, 50f, 1.15f)
      Sky.Cloud -> {
        cloud(CLOUD_DARK, -8f, -10f, 0.82f)
        cloud(CLOUD, 2f, 4f)
      }
      Sky.FewClouds -> {
        drawCircle(SUN, 15f, Offset(38f, 38f))
        rays(38f, 38f, 22f, 31f, 5f)
        cloud(CLOUD, 6f, 8f)
      }
      Sky.CloudyNight -> {
        moon(38f, 38f, 0.62f)
        cloud(CLOUD, 6f, 8f)
      }
      Sky.Rain -> {
        cloud(CLOUD_DARK, 0f, -12f)
        drop(34f, 70f)
        drop(52f, 74f)
        drop(70f, 70f)
      }
      Sky.Showers -> {
        cloud(CLOUD_DARK, 0f, -14f)
        drop(30f, 68f, 20f, 7f)
        drop(48f, 72f, 20f, 7f)
        drop(66f, 68f, 20f, 7f)
        drop(80f, 74f, 14f, 6f)
      }
      Sky.Storm -> {
        cloud(CLOUD_DARK, 0f, -14f)
        val bolt =
          Path().apply {
            moveTo(56f, 58f)
            lineTo(40f, 82f)
            lineTo(51f, 82f)
            lineTo(45f, 100f)
            lineTo(68f, 72f)
            lineTo(56f, 72f)
            lineTo(64f, 58f)
            close()
          }
        drawPath(bolt, BOLT)
      }
      Sky.Snow -> {
        cloud(CLOUD_DARK, 0f, -12f)
        drawCircle(SNOW, 5.5f, Offset(34f, 76f))
        drawCircle(SNOW, 5.5f, Offset(52f, 82f))
        drawCircle(SNOW, 5.5f, Offset(70f, 76f))
      }
      Sky.Mist -> {
        drawLine(MIST, Offset(20f, 38f), Offset(76f, 38f), 7f, StrokeCap.Round)
        drawLine(MIST, Offset(30f, 54f), Offset(86f, 54f), 7f, StrokeCap.Round)
        drawLine(MIST, Offset(20f, 70f), Offset(70f, 70f), 7f, StrokeCap.Round)
      }
    }
  }
}

private fun DrawScope.cloud(fill: Color, dx: Float, dy: Float, k: Float = 1f) {
  withTransform({
    translate(dx, dy)
    scale(k, k, pivot = Offset.Zero)
  }) {
    drawCircle(fill, 16f, Offset(36f, 58f))
    drawCircle(fill, 22f, Offset(55f, 48f))
    drawCircle(fill, 14f, Offset(74f, 60f))
    drawRoundRect(fill, Offset(22f, 58f), Size(64f, 22f), CornerRadius(11f))
  }
}

private fun DrawScope.rays(cx: Float, cy: Float, r0: Float, r1: Float, width: Float) {
  for (i in 0 until 8) {
    val a = Math.toRadians(i * 45.0)
    val c = cos(a).toFloat()
    val s = sin(a).toFloat()
    drawLine(SUN, Offset(cx + c * r0, cy + s * r0), Offset(cx + c * r1, cy + s * r1), width, StrokeCap.Round)
  }
}

private fun DrawScope.moon(cx: Float, cy: Float, k: Float) {
  withTransform({
    translate(cx, cy)
    scale(k, k, pivot = Offset.Zero)
  }) {
    drawPath(MOON_PATH, MOON)
  }
}

private fun DrawScope.drop(x: Float, y: Float, l: Float = 16f, width: Float = 6f) {
  drawLine(DROP, Offset(x, y), Offset(x - l * 0.38f, y + l), width, StrokeCap.Round)
}

/** A weather icon as a composable, for the reading under the frise and the header. */
@Composable
fun WeatherIcon(code: Int?, day: Boolean, size: Dp, modifier: Modifier = Modifier) {
  val sky = skyOf(code, day)
  Canvas(modifier.size(size)) { if (sky != null) weatherIcon(sky, this.size.width / 2, this.size.height / 2, this.size.width) }
}

/** The wind arrow: [degFrom] = where the wind comes from (0 = north); the arrow points where it goes, as the Tab5 does. */
fun DrawScope.windArrow(cx: Float, cy: Float, size: Float, degFrom: Double, color: Color) {
  val k = size / 2
  rotate(((degFrom + 180) % 360).toFloat(), pivot = Offset(cx, cy)) {
    val p =
      Path().apply {
        moveTo(cx, cy - k)
        lineTo(cx + 0.62f * k, cy + 0.85f * k)
        lineTo(cx, cy + 0.42f * k)
        lineTo(cx - 0.62f * k, cy + 0.85f * k)
        close()
      }
    drawPath(p, color)
  }
}

/** A wind arrow as a composable. */
@Composable
fun WindArrow(degFrom: Double?, size: Dp, color: Color, modifier: Modifier = Modifier) {
  Canvas(modifier.size(size)) { if (degFrom != null) windArrow(this.size.width / 2, this.size.height / 2, this.size.width, degFrom, color) }
}

private val GLYPHS: Map<String, Path> by lazy {
  mapOf(
    "boat" to PathParser().parsePathString("M12 3 V17 M12 3 L19 14 H12 M10 6 L5 14 H10 M3 18 H21 L19 21 H5 Z").toPath(),
    "shore_fishing" to PathParser().parsePathString("M5 9 h14 l-1.6 11 H6.6 Z M8 9 a4 4 0 0 1 8 0").toPath(),
  )
}

/** The stroke glyph of an activity (board, sailing boat, bucket), on the family's 24 × 24 grid. */
@Composable
fun ActivityGlyph(id: String, color: Color, size: Dp, modifier: Modifier = Modifier) {
  Canvas(modifier.size(size)) {
    val k = this.size.width / 24f
    withTransform({ scale(k, k, pivot = Offset.Zero) }) {
      val stroke = Stroke(2f, cap = StrokeCap.Round, join = StrokeJoin.Round)
      when (id) {
        "surf" -> {
          rotate(35f, pivot = Offset(12f, 12f)) { drawOval(color, Offset(8.4f, 2f), Size(7.2f, 20f), style = stroke) }
          drawLine(color, Offset(7f, 7f), Offset(17f, 17f), 2f, StrokeCap.Round)
        }
        else -> GLYPHS[id]?.let { drawPath(it, color, style = stroke) }
      }
    }
  }
}

/** Monotone cubic through [pts] (Fritsch–Carlson, as the Tab5's weather popup): never overshoots between two points. */
fun smoothPath(pts: List<Offset>): Path {
  val path = Path()
  val n = pts.size
  if (n == 0) return path
  path.moveTo(pts[0].x, pts[0].y)
  if (n == 1) return path
  val dx = FloatArray(n - 1) { pts[it + 1].x - pts[it].x }
  val m = FloatArray(n - 1) { (pts[it + 1].y - pts[it].y) / dx[it] }
  val t = FloatArray(n)
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (i in 1 until n - 1) t[i] = if (m[i - 1] * m[i] <= 0) 0f else (m[i - 1] + m[i]) / 2
  for (i in 0 until n - 1) {
    if (m[i] == 0f) {
      t[i] = 0f
      t[i + 1] = 0f
    } else {
      val a = t[i] / m[i]
      val b = t[i + 1] / m[i]
      val s = a * a + b * b
      if (s > 9) {
        val k = 3 / sqrt(s)
        t[i] = k * a * m[i]
        t[i + 1] = k * b * m[i]
      }
    }
  }
  for (i in 0 until n - 1) {
    val h = dx[i] / 3
    path.cubicTo(pts[i].x + h, pts[i].y + t[i] * h, pts[i + 1].x - h, pts[i + 1].y - t[i + 1] * h, pts[i + 1].x, pts[i + 1].y)
  }
  return path
}
