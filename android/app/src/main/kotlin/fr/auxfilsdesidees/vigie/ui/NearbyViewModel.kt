package fr.auxfilsdesidees.vigie.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.data.KeptNearby
import fr.auxfilsdesidees.vigie.data.NearbyReader
import fr.auxfilsdesidees.vigie.data.Stamped
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * One read of the fourth tab: its value once read ([value], parsed), when it was read, whether it is being read, whether the
 * last read failed (the copy then stays). [value] stays null when the answer holds nothing to show (no bulletin here).
 */
data class NearbyRead(val value: Any? = null, val readUtc: Long = 0, val reading: Boolean = false, val failed: Boolean = false, val known: Boolean = false)

/** The value of a read, as the type the page asked it with. */
inline fun <reified T> NearbyRead?.of(): T? = this?.value as? T

/**
 * The reads of the Plages and Pistes tab, each asked only when the page shows it, as the Mer tab asks its beaches: its copy
 * on the phone first, at once, then the network when that copy is older than asked. A failed read keeps the copy. The beaches
 * and areas kept (the star) are on the phone too ([kept]).
 */
class NearbyViewModel(
  private val reader: NearbyReader,
  private val keptStore: KeptNearby?,
  private val clock: () -> Long = System::currentTimeMillis,
) : ViewModel() {
  private val _reads = MutableStateFlow<Map<String, NearbyRead>>(emptyMap())
  val reads: StateFlow<Map<String, NearbyRead>> = _reads.asStateFlow()
  private val _kept = MutableStateFlow(keptStore?.load() ?: emptyList())
  val kept: StateFlow<List<String>> = _kept.asStateFlow()
  private val jobs = mutableMapOf<String, Job>()

  /** The API the reads go to (the public one, or a local one in a debug build): the pages build their asks with it. */
  val baseUrl: String
    get() = reader.baseUrl

  init {
    viewModelScope.launch { reader.prune() }
  }

  /**
   * Shows the read [ask] (its name and address, from [NearbyReader.Asks]): its copy, then a new read when it was read more
   * than [maxAgeS] seconds ago. [parse] turns the text into what the page draws, off the screen's thread.
   */
  fun ask(ask: Pair<String, String>, maxAgeS: Long, parse: (String) -> Any?) {
    val (name, url) = ask
    if (jobs[name]?.isActive == true) return
    jobs[name] = viewModelScope.launch {
      var at = _reads.value[name]?.takeIf { it.known }?.readUtc
      if (at == null) {
        reader.saved(name)?.let { copy ->
          parsed(copy, parse)?.let { v ->
            set(name) { it.copy(value = v.first, readUtc = copy.readUtc, known = true) }
            at = copy.readUtc
          }
        }
      }
      if (at != null && clock() / 1000 - at!! < maxAgeS) return@launch
      set(name) { it.copy(reading = true) }
      try {
        val got = reader.read(name, url)
        val v = parsed(got, parse) ?: throw IllegalStateException("unreadable answer")
        set(name) { NearbyRead(v.first, got.readUtc, known = true) }
      } catch (err: CancellationException) {
        set(name) { it.copy(reading = false) }
        throw err
      } catch (err: Exception) {
        set(name) { it.copy(reading = false, failed = true) }
      }
    }
  }

  /** Keeps a beach or an area (its star), or lets it go. */
  fun toggle(id: String) {
    val store = keptStore ?: return
    viewModelScope.launch { _kept.value = withContext(Dispatchers.IO) { store.toggle(id) } }
  }

  /** The value parsed, in a box so that an answer with nothing to show (null) still counts as read; null when it does not parse. */
  private suspend fun parsed(s: Stamped, parse: (String) -> Any?): Pair<Any?, Unit>? =
    withContext(Dispatchers.Default) {
      try {
        parse(s.text) to Unit
      } catch (err: Exception) {
        null
      }
    }

  private fun set(name: String, change: (NearbyRead) -> NearbyRead) = _reads.update { it + (name to change(it[name] ?: NearbyRead())) }
}
