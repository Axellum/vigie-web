package fr.auxfilsdesidees.vigie.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.VigieRepository
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface HomeState {
  data object Loading : HomeState

  data class Failed(val message: String) : HomeState

  /** Data to show; [refreshing] while a new read runs, [error] when the last one failed (the old data stays, with its time). */
  data class Ready(val snapshot: Snapshot, val refreshing: Boolean = false, val error: String? = null) : HomeState
}

class HomeViewModel(private val repository: VigieRepository = VigieRepository()) : ViewModel() {
  private val _state = MutableStateFlow<HomeState>(HomeState.Loading)
  val state: StateFlow<HomeState> = _state.asStateFlow()

  init {
    refresh()
  }

  fun refresh() {
    val previous = (_state.value as? HomeState.Ready)?.snapshot
    if (previous != null && (_state.value as HomeState.Ready).refreshing) return
    _state.value = if (previous == null) HomeState.Loading else HomeState.Ready(previous, refreshing = true)
    viewModelScope.launch {
      _state.value =
        try {
          HomeState.Ready(repository.load())
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          val message = describe(err)
          if (previous != null) HomeState.Ready(previous, error = message) else HomeState.Failed(message)
        }
    }
  }

  private fun describe(err: Exception): String =
    when (err) {
      is ApiException -> "Le serveur de Vigie a répondu une erreur (${err.status})."
      is IOException -> "Pas de réponse du serveur de Vigie. Vérifiez la connexion."
      else -> "Réponse illisible du serveur de Vigie."
    }
}
