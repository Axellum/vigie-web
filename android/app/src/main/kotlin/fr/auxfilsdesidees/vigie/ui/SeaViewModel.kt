package fr.auxfilsdesidees.vigie.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.data.Beach
import fr.auxfilsdesidees.vigie.data.BeachReader
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** What the Sea page has of a beach: the last good read (null before one), whether it is being read, whether the last read failed. */
data class BeachState(val beach: Beach? = null, val reading: Boolean = false, val failed: Boolean = false)

/**
 * The beaches of the Sea page, asked only when the page shows one (as the card asks `vigie/card/beach`): its copy on the phone
 * first, at once, then the network when that copy is older than asked. A failed read keeps the copy.
 */
class SeaViewModel(private val reader: BeachReader, private val clock: () -> Long = System::currentTimeMillis) : ViewModel() {
  private val _beaches = MutableStateFlow<Map<String, BeachState>>(emptyMap())
  val beaches: StateFlow<Map<String, BeachState>> = _beaches.asStateFlow()
  private val jobs = mutableMapOf<String, Job>()

  /** Shows [spotId]: its copy, then a new read when the beach was read more than [maxAgeS] seconds ago. */
  fun ask(spotId: String, maxAgeS: Long) {
    if (jobs[spotId]?.isActive == true) return
    jobs[spotId] = viewModelScope.launch {
      var beach = _beaches.value[spotId]?.beach
      if (beach == null) {
        beach = reader.saved(spotId)
        if (beach != null) set(spotId) { it.copy(beach = beach) }
      }
      if (beach != null && clock() / 1000 - beach.readUtc < maxAgeS) return@launch
      set(spotId) { it.copy(reading = true) }
      try {
        val read = reader.read(spotId)
        set(spotId) { BeachState(read) }
      } catch (err: CancellationException) {
        set(spotId) { it.copy(reading = false) }
        throw err
      } catch (err: Exception) {
        set(spotId) { it.copy(reading = false, failed = true) }
      }
    }
  }

  /** Only the copies of [spotIds] stay on the phone (the spots no longer followed lose theirs). */
  fun keepOnly(spotIds: Set<String>) {
    viewModelScope.launch { reader.keepOnly(spotIds) }
  }

  private fun set(spotId: String, change: (BeachState) -> BeachState) = _beaches.update { it + (spotId to change(it[spotId] ?: BeachState())) }
}
