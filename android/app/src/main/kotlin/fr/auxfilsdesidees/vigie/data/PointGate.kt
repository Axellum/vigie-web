package fr.auxfilsdesidees.vigie.data

import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * The sea map's share of `/v1/point`, the one route the public server limits (10 a minute per address): [max] reads in any
 * [windowMs], so that the sheets of the map, opened one after another, never take what the Accueil and the Mer tab need.
 * The sheet of a town waits for its turn ([take]); the water of a beach is skipped when there is none ([tryTake]), and
 * the beach shows without it.
 */
class PointGate(
  private val max: Int = MAX,
  private val windowMs: Long = 60_000L,
  private val clock: () -> Long = System::currentTimeMillis,
  private val sleep: suspend (Long) -> Unit = { delay(it) },
) {
  private val lock = Mutex()
  private val times = ArrayDeque<Long>()

  /** A read now if the window has room; false otherwise (nothing is counted). */
  suspend fun tryTake(): Boolean = lock.withLock { room(clock()).also { if (it) times.addLast(clock()) } }

  /** Waits until the window has room, then counts a read. */
  suspend fun take() {
    while (true) {
      val wait =
        lock.withLock {
          val now = clock()
          if (room(now)) {
            times.addLast(now)
            return
          }
          times.first() + windowMs - now
        }
      sleep(wait.coerceAtLeast(1))
    }
  }

  private fun room(now: Long): Boolean {
    while (times.isNotEmpty() && now - times.first() >= windowMs) times.removeFirst()
    return times.size < max
  }

  /** [fetch] with the gate on `/v1/point`: a read past the gate fails at once, as a refused request would. */
  fun gated(fetch: suspend (String) -> String): suspend (String) -> String = { url ->
    if ("/v1/point?" in url && !tryTake()) throw ApiException(429)
    fetch(url)
  }

  companion object {
    /** Four of the server's ten a minute: the rest stays for the places and the beaches of the tabs. */
    const val MAX = 4
  }
}
