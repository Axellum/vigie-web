package fr.auxfilsdesidees.vigie.ui.map

import fr.auxfilsdesidees.vigie.data.FieldGrid
import fr.auxfilsdesidees.vigie.data.FieldLevelId
import fr.auxfilsdesidees.vigie.data.WindField
import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The trails of the forecast wind: where they are drawn, how they move, when they are not drawn, and their triangles. */
class WindFlowTest {
  // A phone of 400 x 800 dp at 3 pixels a dp, the map centred on Brittany at about zoom 7 (512 dp a tile).
  private val pxPerDeg = 512.0 * 128 * 3 / 360
  private val view = FlowView(600.0, 1200.0, -3.0, 47.5, pxPerDeg, 1200, 2400, 3.0)

  /** A whole-world grid of one wind everywhere: [u] east and [v] north, m/s. */
  private fun steady(u: Float, v: Float, nan: Boolean = false): FieldGrid {
    val width = 720
    val height = 361
    return FieldGrid(
      FieldLevelId.World,
      "/data/wind-field/world/2026112200-2026112118.png",
      -180.0,
      -90.0,
      179.5,
      90.0,
      0.5,
      width,
      height,
      true,
      0.0,
      FloatArray(width * height) { if (nan) Float.NaN else u },
      FloatArray(width * height) { if (nan) Float.NaN else v },
    )
  }

  /** Each segment drawn: x0, y0, x1, y1, its opacities and its ink. */
  private fun segments(flow: WindFlow): List<FloatArray> =
    (0 until flow.segmentCount).map { k -> flow.segments().copyOfRange(k * WindFlow.SEGMENT_FLOATS, (k + 1) * WindFlow.SEGMENT_FLOATS) }

  @Test
  fun `the map's projection goes there and back, north up, Mercator`() {
    assertEquals(600.0, view.x(-3.0), 1e-9)
    assertEquals(1200.0, view.y(47.5), 1e-9)
    for ((x, y) in listOf(0.0 to 0.0, 1200.0 to 2400.0, 333.0 to 1777.0)) {
      assertEquals(x, view.x(view.lon(x)), 1e-6)
      assertEquals(y, view.y(view.lat(y)), 1e-6)
    }
    // North is up, and a degree of latitude is longer than one of longitude here (1 / cos 47.5°).
    assertTrue(view.y(48.5) < view.y(47.5))
    assertEquals(1 / Math.cos(Math.toRadians(47.5)), (view.y(47.0) - view.y(48.0)) / pxPerDeg, 0.01)
  }

  @Test
  fun `the trails follow the wind at the same speed on screen at every zoom, fading from head to tail`() {
    val flow = WindFlow(still = false, Random(1))
    flow.setGrids(listOf(steady(10f, 0f)))
    flow.frame(view, 1 / 30.0)
    // An even density: one trail per 650 dp².
    assertEquals(492, flow.trails)
    // One position each: nothing to draw yet.
    assertEquals(0, flow.segmentCount)
    flow.frame(view, 1 / 30.0)
    val drawn = segments(flow)
    assertTrue(drawn.size > 300)
    for (s in drawn) {
      // 10 m/s east for 1/30 s: 80 dp/s, 2.67 dp, 8 pixels to the east, none to the north.
      assertEquals(8.0, (s[0] - s[2]).toDouble(), 0.01)
      assertEquals(0.0, (s[1] - s[3]).toDouble(), 0.01)
      // 36 km/h: the quiet ink, its head as clear as the site's (0.2 + 0.46 x 10 / 15), its tail fainter.
      assertEquals(0f, s[6], 0f)
      assertEquals(WindField.flowAlpha(10.0).toFloat(), s[4], 1e-5f)
      assertTrue(s[5] < s[4])
    }
  }

  @Test
  fun `a strong wind takes its colours, and its trails are longer`() {
    val flow = WindFlow(still = false, Random(2))
    flow.setGrids(listOf(steady(0f, 20f)))
    repeat(WindFlow.HISTORY) { flow.frame(view, 1 / 30.0) }
    val drawn = segments(flow)
    assertTrue(drawn.isNotEmpty())
    // 72 km/h: the third ink only, the wider trail.
    assertTrue(drawn.all { it[6] == 2f })
    assertEquals(1.5f, WindFlow.widthDp(2), 0f)
    assertEquals(1.1f, WindFlow.widthDp(0), 0f)
    // Northward: from its head, each segment goes back down the screen.
    assertTrue(drawn.all { it[1] < it[3] })
    // A whole trail: eleven segments, the last nearly clear.
    assertTrue(drawn.any { it[5] == 0f })
  }

  @Test
  fun `nothing is drawn while the map moves, nor where the model has no wind`() {
    val flow = WindFlow(still = false, Random(3))
    flow.setGrids(listOf(steady(5f, 5f)))
    repeat(3) { flow.frame(view, 1 / 30.0) }
    assertTrue(flow.segmentCount > 0)
    val before = flow.version
    flow.moveStart()
    assertEquals(0, flow.segmentCount)
    assertTrue(flow.version > before)
    flow.frame(view, 1 / 30.0)
    assertEquals(0, flow.segmentCount)
    // Stopped: the trails grow again from where they are.
    flow.moveEnd()
    flow.frame(view, 1 / 30.0)
    assertEquals(0, flow.segmentCount)
    flow.frame(view, 1 / 30.0)
    assertTrue(flow.segmentCount > 0)
    // No wind anywhere: no trail.
    flow.setGrids(listOf(steady(0f, 0f, nan = true)))
    repeat(3) { flow.frame(view, 1 / 30.0) }
    assertEquals(0, flow.segmentCount)
    flow.setGrids(emptyList())
    assertEquals(0, flow.segmentCount)
  }

  @Test
  fun `with the phone's animations off, the trails are drawn once, still, and again after a move`() {
    val flow = WindFlow(still = true, Random(4))
    flow.setGrids(listOf(steady(8f, 0f)))
    flow.frame(view, 1 / 30.0)
    assertTrue(flow.segmentCount > 0)
    val version = flow.version
    flow.frame(view, 1 / 30.0)
    assertEquals(version, flow.version)
    flow.moveStart()
    flow.moveEnd()
    flow.frame(view, 1 / 30.0)
    assertTrue(flow.segmentCount > 0)
    assertTrue(flow.version > version)
  }

  @Test
  fun `each segment is a band of its width for the graphics card, its colour fading from head to tail`() {
    val mesh = FlowMesh()
    // A segment of the quiet ink going east, one of the strongest going north, one that did not move.
    val segments = floatArrayOf(100f, 200f, 92f, 200f, 0.6f, 0.5f, 0f, 50f, 50f, 50f, 60f, 0.66f, 0.6f, 2f, 10f, 10f, 10f, 10f, 0.5f, 0.4f, 0f)
    mesh.build(segments, 3, WindField.INKS_DARK, 3f)
    assertEquals(2, mesh.count)
    // 1.1 dp at 3 pixels a dp: 1.65 pixels on each side of the line.
    val corners = listOf(100f, 198.35f, 100f, 201.65f, 92f, 198.35f, 92f, 201.65f)
    corners.forEachIndexed { i, v -> assertEquals(v, mesh.xy[i], 1e-4f) }
    assertEquals(0x99D2E1EA.toInt(), mesh.colors[0])
    assertEquals(0x80D2E1EA.toInt(), mesh.colors[2])
    // The strongest: 1.5 dp wide, the third ink.
    assertEquals(-2.25f, mesh.xy[8] - 50f, 1e-4f)
    assertEquals(0xA8D04A8C.toInt(), mesh.colors[4])
    assertEquals(listOf<Short>(0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7), mesh.indices.take(12))
  }
}
