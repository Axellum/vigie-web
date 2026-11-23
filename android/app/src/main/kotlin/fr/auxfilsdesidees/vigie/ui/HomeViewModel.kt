package fr.auxfilsdesidees.vigie.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PlaceHit
import fr.auxfilsdesidees.vigie.data.PlacesStore
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.VigieRepository
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface HomeState {
  data object Loading : HomeState

  data class Failed(val message: String) : HomeState

  /** Data to show; [refreshing] while a new read runs, [error] when the last one failed (the old data stays, with its time). */
  data class Ready(val snapshot: Snapshot, val refreshing: Boolean = false, val error: String? = null) : HomeState
}

/** The followed places and what was read for each (by [FollowedPlace.key]). No place yet = the first-launch steps. */
data class AppState(val choices: Choices, val states: Map<String, HomeState> = emptyMap()) {
  val firstLaunch: Boolean
    get() = choices.places.isEmpty()

  fun stateOf(place: FollowedPlace): HomeState = states[place.key] ?: HomeState.Loading
}

sealed interface CatalogueState {
  data object Idle : CatalogueState

  data object Loading : CatalogueState

  data class Failed(val message: String) : CatalogueState

  data class Ready(val spots: List<CatalogueSpot>) : CatalogueState
}

/** The place search: [done] once an answer came for [query] (an empty [hits] then means « nothing found »). */
data class SearchState(
  val query: String = "",
  val hits: List<PlaceHit> = emptyList(),
  val busy: Boolean = false,
  val done: Boolean = false,
  val error: String? = null,
)

/**
 * The app's state, shared by the tabs, the settings page and the first-launch steps. The choices are saved on the phone
 * at every change; each place is read on its own, when it is first shown and on « pull to refresh ».
 *
 * [onChange] runs after a new read is kept and after a place is removed: the home-screen widgets show the same data.
 */
class HomeViewModel(
  private val repository: VigieRepository,
  private val store: PlacesStore,
  private val onChange: suspend () -> Unit = {},
) : ViewModel() {
  private val _app = MutableStateFlow(AppState(store.load()))
  val app: StateFlow<AppState> = _app.asStateFlow()

  private val _catalogue = MutableStateFlow<CatalogueState>(CatalogueState.Idle)
  val catalogue: StateFlow<CatalogueState> = _catalogue.asStateFlow()

  private val _search = MutableStateFlow(SearchState())
  val search: StateFlow<SearchState> = _search.asStateFlow()

  private val jobs = mutableMapOf<String, Job>()
  private var searchJob: Job? = null

  init {
    _app.value.choices.currentPlace?.let(::load)
    viewModelScope.launch { repository.keepOnly(_app.value.choices.places.map { it.place }) }
  }

  // ---------------------------------------------------------------------------------------------------- reading places

  /** Show the place at [index] (the Accueil's pages, the settings' list); read it if it was never read. */
  fun select(index: Int) {
    val choices = _app.value.choices
    if (index != choices.current) save(choices.select(index))
    _app.value.choices.currentPlace?.let { if (it.key !in _app.value.states) load(it) }
  }

  /** Show the followed place of this [key] (a widget touched); nothing when it is no longer followed. */
  fun show(key: String) {
    val index = _app.value.choices.places.indexOfFirst { it.key == key }
    if (index >= 0) select(index)
  }

  fun refresh() {
    _app.value.choices.currentPlace?.let(::load)
  }

  private fun load(place: FollowedPlace) {
    val key = place.key
    val previous = (_app.value.states[key] as? HomeState.Ready)?.snapshot
    jobs[key]?.cancel()
    setState(key, if (previous == null) HomeState.Loading else HomeState.Ready(previous, refreshing = true))
    jobs[key] =
      viewModelScope.launch {
        // The last good read kept on the phone shows at once while the network answers, and stays when it does not.
        val shown = previous ?: repository.saved(place.place, place.spots)?.also { setState(key, HomeState.Ready(it, refreshing = true)) }
        val next =
          try {
            HomeState.Ready(repository.load(place.place, place.spots))
          } catch (err: CancellationException) {
            throw err
          } catch (err: Exception) {
            val message = describe(err)
            if (shown != null) HomeState.Ready(shown, error = message) else HomeState.Failed(message)
          }
        setState(key, next)
        if (next.isFresh()) tell()
      }
  }

  private fun HomeState.isFresh(): Boolean = this is HomeState.Ready && error == null

  /** The widgets redraw; their failure never reaches the app's screens. */
  private suspend fun tell() {
    try {
      onChange()
    } catch (err: CancellationException) {
      throw err
    } catch (_: Exception) {}
  }

  private fun setState(key: String, state: HomeState) {
    _app.update { app -> if (app.choices.places.none { it.key == key }) app else app.copy(states = app.states + (key to state)) }
  }

  private fun save(choices: Choices) {
    store.save(choices)
    _app.update { it.copy(choices = choices) }
  }

  // ------------------------------------------------------------------------------------------------- changing choices

  /** Follow a new place with [spots] and show it; false when a place at the same point is already followed. */
  fun addPlace(place: Place, spots: List<String>): Boolean {
    val next = _app.value.choices.add(FollowedPlace(place, spots)) ?: return false
    save(next)
    next.currentPlace?.let(::load)
    return true
  }

  fun removePlace(index: Int) {
    val choices = _app.value.choices
    val gone = choices.places.getOrNull(index) ?: return
    jobs.remove(gone.key)?.cancel()
    val next = choices.remove(index)
    save(next)
    _app.update { it.copy(states = it.states - gone.key) }
    viewModelScope.launch {
      repository.forget(gone.place)
      tell()
    }
    next.currentPlace?.let { if (it.key !in _app.value.states) load(it) }
  }

  fun follow(spot: String) = changeSpots { c, i -> c.follow(i, spot) }

  fun unfollow(spot: String) = changeSpots { c, i -> c.unfollow(i, spot) }

  fun star(spot: String) = changeSpots { c, i -> c.star(i, spot) }

  /** A change of the shown place's spots: saved, then the place is read again (its old data stays meanwhile). */
  private fun changeSpots(change: (Choices, Int) -> Choices) {
    val choices = _app.value.choices
    val next = change(choices, choices.current)
    if (next == choices) return
    save(next)
    next.currentPlace?.let(::load)
  }

  // ------------------------------------------------------------------------------------------ the spots and the search

  fun loadCatalogue(force: Boolean = false) {
    val now = _catalogue.value
    if (!force && (now is CatalogueState.Ready || now is CatalogueState.Loading)) return
    _catalogue.value = CatalogueState.Loading
    viewModelScope.launch {
      _catalogue.value =
        try {
          CatalogueState.Ready(repository.catalogue())
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          CatalogueState.Failed(describe(err))
        }
    }
  }

  /** Ask the site's place search for [query], a moment after the last letter typed. */
  fun search(query: String) {
    searchJob?.cancel()
    if (query.trim().length < 2) {
      _search.value = SearchState(query = query)
      return
    }
    _search.value = SearchState(query = query, busy = true)
    searchJob =
      viewModelScope.launch {
        delay(SEARCH_PAUSE_MS)
        _search.value =
          try {
            SearchState(query = query, hits = repository.searchPlaces(query).first, done = true)
          } catch (err: CancellationException) {
            throw err
          } catch (err: Exception) {
            SearchState(query = query, done = true, error = describe(err))
          }
      }
  }

  fun clearSearch() {
    searchJob?.cancel()
    _search.value = SearchState()
  }

  private fun describe(err: Exception): String =
    when (err) {
      is ApiException -> "Le serveur de Vigie a répondu une erreur (${err.status})."
      is IOException -> "Pas de réponse du serveur de Vigie. Vérifiez la connexion."
      else -> "Réponse illisible du serveur de Vigie."
    }

  private companion object {
    const val SEARCH_PAUSE_MS = 300L
  }
}
