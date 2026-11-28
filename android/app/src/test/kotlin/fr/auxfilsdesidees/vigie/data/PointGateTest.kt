package fr.auxfilsdesidees.vigie.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The sea map's share of `/v1/point`: four reads in any minute, on a clock the test moves by hand. */
class PointGateTest {
  @Test
  fun `four reads a minute, then none until the oldest is a minute old`() = runTest {
    var now = 0L
    val gate = PointGate(clock = { now })
    for (t in listOf(0L, 10_000L, 20_000L, 30_000L)) {
      now = t
      assertTrue(gate.tryTake())
    }
    assertFalse(gate.tryTake())
    now = 59_999
    assertFalse(gate.tryTake())
    // The read of 0 s is a minute old: one more, not two.
    now = 60_000
    assertTrue(gate.tryTake())
    assertFalse(gate.tryTake())
  }

  @Test
  fun `a town's sheet waits for its turn instead of failing`() = runTest {
    var now = 0L
    val waits = mutableListOf<Long>()
    val gate = PointGate(max = 2, clock = { now }, sleep = { ms -> waits += ms; now += ms })
    gate.take()
    now = 10_000
    gate.take()
    gate.take()
    assertEquals(listOf(50_000L), waits)
    assertEquals(60_000L, now)
  }

  @Test
  fun `only the point is gated, and a read past the gate fails as a refused request`() = runTest {
    var now = 0L
    val asked = mutableListOf<String>()
    val fetch = PointGate(max = 1, clock = { now }).gated { url -> asked += url; "{}" }
    fetch("https://example.test/v1/point?lat=1&lon=2")
    val refused = runCatching { fetch("https://example.test/v1/point?lat=1&lon=2") }.exceptionOrNull()
    assertEquals(429, (refused as ApiException).status)
    fetch("https://example.test/v1/surf/spots/x?days=2")
    assertEquals(2, asked.size)
  }
}
