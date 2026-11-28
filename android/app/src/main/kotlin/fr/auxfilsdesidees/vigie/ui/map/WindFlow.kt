package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.FieldGrid
import fr.auxfilsdesidees.vigie.data.WindField
import java.util.Random
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sinh
import kotlin.math.sqrt
import kotlin.math.tan

/**
 * Where the map lies on the screen for one image, in pixels: the sea map is a flat Mercator map, north up (its rotation and
 * tilt are off), so one point of the map and the size of a degree place every other. [cx], [cy] is where the point [lon0],
 * [lat0] is drawn; [pxPerDeg] the pixels of a degree of longitude.
 */
class FlowView(
  val cx: Double,
  val cy: Double,
  val lon0: Double,
  val lat0: Double,
  val pxPerDeg: Double,
  val width: Int,
  val height: Int,
  /** Pixels of a dp, so that the trails move as fast on every screen. */
  val density: Double,
) {
  private val y0 = merc(lat0)
  /** Pixels of a unit of Mercator's y: the world's width over 2π. */
  private val pxPerMerc = pxPerDeg * 180 / PI

  fun x(lon: Double): Double = cx + (lon - lon0) * pxPerDeg

  fun y(lat: Double): Double = cy + (y0 - merc(lat)) * pxPerMerc

  fun lon(x: Double): Double = lon0 + (x - cx) / pxPerDeg

  fun lat(y: Double): Double = atan(sinh(y0 - (y - cy) / pxPerMerc)) / DEG

  companion object {
    const val DEG = PI / 180

    fun merc(lat: Double): Double = ln(tan(PI / 4 + lat * DEG / 2))
  }
}

/**
 * The forecast wind drawn over the sea map, as the site's (`windFlow.ts`): thin trails that follow the wind, laid over the map
 * and under its cards, with nothing to touch. About 30 images a second while the map is shown; each trail lives 1.5 to 3.5
 * seconds, then starts again at a random place of the screen, so that the density stays even. A trail is a short line through
 * the last positions of its head, fainter with age, drawn again whole at each image. While the map moves nothing is drawn (no
 * trail lags behind the base map), and the trails grow again from where they are once it stops. With the system's animations
 * off ([still]), the trails are drawn once, still, and again after each move.
 *
 * The segments of an image are listed as the site gives them to the graphics card ([segments], [SEGMENT_FLOATS] each: the two
 * ends, their opacities, the ink), drawn by [FlowMesh] in one go.
 */
class WindFlow(val still: Boolean, private val random: Random = Random()) {
  private var grids: List<FieldGrid> = emptyList()
  private var n = 0
  private var lon = DoubleArray(0)
  private var lat = DoubleArray(0)
  private var speed = FloatArray(0)
  private var age = IntArray(0)
  private var life = IntArray(0)
  private var hx = FloatArray(0)
  private var hy = FloatArray(0)
  private var len = IntArray(0)
  private var head = IntArray(0)
  private var w = 0
  private var h = 0
  private var moving = false
  /** In [still] mode, the trails are to be drawn again. */
  private var stale = true
  private val wind = FloatArray(2)
  private val scratch = FloatArray(2)
  private var segs = FloatArray(0)
  private var m = 0

  /** Changes each time the picture changes: the screen draws it again then. */
  var version = 0
    private set

  /** The trails living now (for the tests). */
  val trails: Int
    get() = n

  /** The grids to follow, the finest first; none: nothing drawn. The same grids again (the map moved): nothing changes. */
  fun setGrids(next: List<FieldGrid>) {
    val same = next.size == grids.size && next.indices.all { next[it] === grids[it] }
    grids = next
    if (same) return
    // Every trail starts again on the new wind.
    life.copyInto(age)
    len.fill(0)
    stale = true
    if (next.isEmpty()) clear()
  }

  /** The map started to move: nothing is drawn until it stops. */
  fun moveStart() {
    if (moving) return
    moving = true
    clear()
  }

  /** The map stopped: the trails grow again from where they are. */
  fun moveEnd() {
    moving = false
    len.fill(0)
    stale = true
  }

  /** One image, [dt] seconds after the one before. */
  fun frame(view: FlowView, dt: Double) {
    resize(view)
    if (moving || grids.isEmpty() || w < 2 || h < 2) return
    if (still) {
      if (!stale) return
      stale = false
      for (i in 0 until n) place(view, i)
      repeat(HISTORY) { step(view, FRAME_S, respawn = false) }
    } else {
      step(view, min(0.1, dt))
    }
    build()
  }

  /** The segments of the image: x0, y0 (the end nearer the head), x1, y1 in pixels, their opacities, the ink (0, 1, 2). */
  fun segments(): FloatArray = segs

  /** How many segments [segments] holds. */
  val segmentCount: Int
    get() = m / SEGMENT_FLOATS

  private fun clear() {
    m = 0
    version++
  }

  private fun resize(view: FlowView) {
    w = view.width
    h = view.height
    val count = WindField.flowCount(w / view.density, h / view.density)
    if (count == n) return
    n = count
    lon = DoubleArray(n)
    lat = DoubleArray(n)
    speed = FloatArray(n)
    age = IntArray(n)
    life = IntArray(n) // all at 0: each trail is placed at the first image
    hx = FloatArray(n * HISTORY)
    hy = FloatArray(n * HISTORY)
    len = IntArray(n)
    head = IntArray(n)
    segs = FloatArray(n * (HISTORY - 1) * SEGMENT_FLOATS)
    m = 0
    stale = true
  }

  /** A new start for trail [i], at a random place of the screen where the model has a wind; false when none was found. */
  private fun place(view: FlowView, i: Int): Boolean {
    // The first trails of a screen do not all end together: a trail never placed starts somewhere in its life.
    val spread = !still && life[i] == 0
    repeat(4) {
      val x = random.nextDouble() * w
      val y = random.nextDouble() * h
      val la = view.lat(y)
      val lo = view.lon(x)
      if (!la.isFinite() || abs(la) > 85) return@repeat
      if (!WindField.sampleWind(grids, wrapLon(lo), la, wind, scratch)) return@repeat
      lon[i] = lo
      lat[i] = la
      speed[i] = WindField.speed(wind[0], wind[1]).toFloat()
      life[i] = LIFE_MIN + random.nextInt(LIFE_SPREAD)
      age[i] = if (spread) random.nextInt(life[i]) else 0
      len[i] = 0
      push(i, x.toFloat(), y.toFloat())
      return true
    }
    len[i] = 0
    life[i] = 1
    age[i] = 1
    return false
  }

  private fun push(i: Int, x: Float, y: Float) {
    val at = (head[i] + 1) % HISTORY
    head[i] = at
    hx[i * HISTORY + at] = x
    hy[i * HISTORY + at] = y
    if (len[i] < HISTORY) len[i]++
  }

  /** Every head moves with the wind of its place for [dt] seconds: the same speed on screen at every zoom. */
  private fun step(view: FlowView, dt: Double, respawn: Boolean = true) {
    // Degrees of longitude a wind of 1 m/s moves a head in dt.
    val f = WindField.PX_PER_S * view.density * dt / view.pxPerDeg
    for (i in 0 until n) {
      if (age[i] >= life[i]) {
        if (respawn) place(view, i)
        continue
      }
      val la = lat[i]
      if (!WindField.sampleWind(grids, wrapLon(lon[i]), la, wind, scratch)) {
        age[i] = life[i]
        len[i] = 0
        continue
      }
      val u = wind[0]
      val v = wind[1]
      speed[i] = WindField.speed(u, v).toFloat()
      val cosLat = max(0.05, cos(la * FlowView.DEG))
      // A pixel is the same length both ways: in Mercator a degree of latitude spans 1/cos(lat) pixels of one of longitude.
      val lo = lon[i] + u * f
      val next = la + v * f * cosLat
      age[i]++
      if (abs(next) > 85) {
        age[i] = life[i]
        continue
      }
      lon[i] = lo
      lat[i] = next
      val x = view.x(lo)
      val y = view.y(next)
      if (x < 0 || y < 0 || x > w || y > h) {
        age[i] = life[i]
        continue
      }
      push(i, x.toFloat(), y.toFloat())
    }
  }

  /** Every segment of every trail, its opacity running evenly from head to tail (the site's `drawSegments`). */
  private fun build() {
    val out = segs
    var k0 = 0
    for (i in 0 until n) {
      val length = len[i]
      if (length < 2) continue
      val s = speed[i].toDouble()
      val base = WindField.flowAlpha(s).toFloat()
      val ink = WindField.flowClass(s).toFloat()
      var at = head[i]
      var x = hx[i * HISTORY + at]
      var y = hy[i * HISTORY + at]
      for (k in 0 until length - 1) {
        at = (at + HISTORY - 1) % HISTORY
        val px = hx[i * HISTORY + at]
        val py = hy[i * HISTORY + at]
        out[k0++] = x
        out[k0++] = y
        out[k0++] = px
        out[k0++] = py
        out[k0++] = base * (1 - k.toFloat() / (HISTORY - 1))
        out[k0++] = base * (1 - (k + 1).toFloat() / (HISTORY - 1))
        out[k0++] = ink
        x = px
        y = py
      }
    }
    m = k0
    version++
  }

  companion object {
    /** Positions kept per trail: at 30 images a second, 0.4 s of its way. */
    const val HISTORY = 12
    const val FRAME_MS = 1000L / 30
    private const val FRAME_S = 1.0 / 30
    private const val LIFE_MIN = 45
    private const val LIFE_SPREAD = 60
    /** A segment: x0, y0, x1, y1, the opacities at both ends, the ink. */
    const val SEGMENT_FLOATS = 7

    /** The width of a trail in dp: the quiet ink, then the colours of a strong wind. */
    fun widthDp(ink: Int): Float = if (ink == 0) 1.1f else 1.5f

    private fun wrapLon(lon: Double): Double = ((((lon + 180) % 360) + 360) % 360) - 180
  }
}

/**
 * The trails' segments as triangles for the graphics card (`Canvas.drawVertices`, one call for thousands of them, as the site's
 * WebGL painter): each segment a band of its width, its colour fading from one end to the other. Stroked one by one instead,
 * thousands of thin lines with round ends cost the phone some 16 ms an image.
 */
class FlowMesh {
  /** x, y of four corners per segment, in pixels. */
  var xy = FloatArray(0)
    private set

  /** The colour of each corner (ARGB, not premultiplied). */
  var colors = IntArray(0)
    private set

  /** How many segments the mesh holds. */
  var count = 0
    private set

  /** Two triangles per segment, the same for every chunk of [CHUNK] segments (a short indexes their corners). */
  val indices =
    ShortArray(CHUNK * 6).also {
      for (k in 0 until CHUNK) {
        val v = k * 4
        it[k * 6] = v.toShort()
        it[k * 6 + 1] = (v + 1).toShort()
        it[k * 6 + 2] = (v + 2).toShort()
        it[k * 6 + 3] = (v + 2).toShort()
        it[k * 6 + 4] = (v + 1).toShort()
        it[k * 6 + 5] = (v + 3).toShort()
      }
    }

  /** The mesh of the first [segmentCount] [segments] in the three [inks] (RGB), [density] pixels to a dp. */
  fun build(segments: FloatArray, segmentCount: Int, inks: IntArray, density: Float) {
    if (xy.size < segmentCount * 8) {
      xy = FloatArray(segmentCount * 8)
      colors = IntArray(segmentCount * 4)
    }
    var c = 0
    for (k in 0 until segmentCount) {
      val o = k * WindFlow.SEGMENT_FLOATS
      val x0 = segments[o]
      val y0 = segments[o + 1]
      val x1 = segments[o + 2]
      val y1 = segments[o + 3]
      val dx = x1 - x0
      val dy = y1 - y0
      val length = sqrt(dx * dx + dy * dy)
      // A head that did not move: nothing to draw.
      if (length < 0.01f) continue
      val ink = segments[o + 6].toInt()
      val half = WindFlow.widthDp(ink) * density / 2
      val nx = -dy / length * half
      val ny = dx / length * half
      val v = c * 8
      xy[v] = x0 + nx
      xy[v + 1] = y0 + ny
      xy[v + 2] = x0 - nx
      xy[v + 3] = y0 - ny
      xy[v + 4] = x1 + nx
      xy[v + 5] = y1 + ny
      xy[v + 6] = x1 - nx
      xy[v + 7] = y1 - ny
      val rgb = inks[ink] and 0xffffff
      val a0 = ((segments[o + 4] * 255 + 0.5f).toInt().coerceIn(0, 255) shl 24) or rgb
      val a1 = ((segments[o + 5] * 255 + 0.5f).toInt().coerceIn(0, 255) shl 24) or rgb
      colors[c * 4] = a0
      colors[c * 4 + 1] = a0
      colors[c * 4 + 2] = a1
      colors[c * 4 + 3] = a1
      c++
    }
    count = c
  }

  companion object {
    /** Segments drawn by one call: their corners are indexed by a short. */
    const val CHUNK = 8000
  }
}
