package fr.auxfilsdesidees.vigie.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.data.ApiException
import fr.auxfilsdesidees.vigie.data.Bell
import fr.auxfilsdesidees.vigie.data.CatalogueSpot
import fr.auxfilsdesidees.vigie.data.Choices
import fr.auxfilsdesidees.vigie.data.FollowedPlace
import fr.auxfilsdesidees.vigie.data.Geo
import fr.auxfilsdesidees.vigie.data.Place
import fr.auxfilsdesidees.vigie.data.PlaceHit
import fr.auxfilsdesidees.vigie.data.PlacesStore
import fr.auxfilsdesidees.vigie.data.Snapshot
import fr.auxfilsdesidees.vigie.data.VigieRepository
import fr.auxfilsdesidees.vigie.notify.BellState
import java.io.IOException
import kotlin.math.abs
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

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

/** What a test notification gave, for the page of the places. */
sealed interface TestNote {
  data object Sent : TestNote

  /** The server knew the phone but could not send (Firebase refused): tried again later. */
  data object NotSent : TestNote

  /** The server no longer knew the phone: the bells are sent again. */
  data object Forgotten : TestNote

  data class Failed(val message: String) : TestNote
}

/** The bells seen from the page of the places: [state] after the last sync (null before the first one). */
data class BellsUi(val state: BellState? = null, val busy: Boolean = false, val testing: Boolean = false, val test: TestNote? = null)

/** The bells' server seen from the view model: [fr.auxfilsdesidees.vigie.notify.PhoneBells] in the app, a fake in the tests. */
class BellLink(val sync: suspend () -> BellState, val test: suspend () -> Result<Int?>) {
  companion object {
    val NONE = BellLink({ BellState.Off }, { Result.success(null) })
  }
}

/**
 * The app's state, shared by the tabs, the settings page and the first-launch steps. The choices are saved on the phone
 * at every change; each place is read on its own, when it is first shown and on « pull to refresh ».
 *
 * [onChange] runs after a new read is kept and after a place is removed: the home-screen widgets show the same data.
 * [bellLink] tells the site's server which places have a bell, after each change of a bell. [phone] gives the phone's
 * position (null without the permission or without a position): the place « Ici » goes there at each [followPhone].
 */
class HomeViewModel(
  private val repository: VigieRepository,
  private val store: PlacesStore,
  private val onChange: suspend () -> Unit = {},
  private val bellLink: BellLink = BellLink.NONE,
  private val phone: suspend () -> Pair<Double, Double>? = { null },
) : ViewModel() {
  private val _app = MutableStateFlow(AppState(store.load()))
  val app: StateFlow<AppState> = _app.asStateFlow()

  private val _catalogue = MutableStateFlow<CatalogueState>(CatalogueState.Idle)
  val catalogue: StateFlow<CatalogueState> = _catalogue.asStateFlow()

  private val _search = MutableStateFlow(SearchState())
  val search: StateFlow<SearchState> = _search.asStateFlow()

  private val _bells = MutableStateFlow(BellsUi())
  val bells: StateFlow<BellsUi> = _bells.asStateFlow()

  private val jobs = mutableMapOf<String, Job>()
  private var searchJob: Job? = null
  private var hereJob: Job? = null

  /** One talk with the bells' server at a time, in the order asked: the last change is the one the server keeps. */
  private val bellTalk = Mutex()
  private var syncsWaiting = 0

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
        val kept = previous ?: repository.saved(place.place, place.spots)?.also { setState(key, HomeState.Ready(it, refreshing = true).namedNow(key)) }
        val next =
          try {
            HomeState.Ready(repository.load(place.place, place.spots))
          } catch (err: CancellationException) {
            throw err
          } catch (err: Exception) {
            val message = describe(err)
            if (kept != null) HomeState.Ready(kept, error = message) else HomeState.Failed(message)
          }
        setState(key, next.namedNow(key))
        if (next.isFresh()) tell()
      }
  }

  private fun HomeState.isFresh(): Boolean = this is HomeState.Ready && error == null

  private fun Snapshot.named(place: Place): Snapshot = if (this.place == place) this else copy(place = place)

  /**
   * A read started before its place got its town (« Ici », named by the site while its weather was read) takes the name
   * the place has now, when the point is the same; without this the page said « Ici » alone until the next opening.
   */
  private fun HomeState.namedNow(key: String): HomeState {
    if (this !is HomeState.Ready) return this
    val now = _app.value.choices.places.firstOrNull { it.key == key }?.place ?: return this
    if (now.lat != snapshot.place.lat || now.lon != snapshot.place.lon) return this
    return copy(snapshot = snapshot.named(now))
  }

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

  /**
   * Follow a new place with [spots] and show it; false when a place at the same point is already followed. The phone's
   * position ([Place.here]) is the place « Ici »: the first time it is added, after that the one there is moved and
   * shown; its town is asked to the site.
   */
  fun addPlace(place: Place, spots: List<String>): Boolean {
    val choices = _app.value.choices
    if (place.here) {
      val before = choices.herePlace
      val catalogue = (_catalogue.value as? CatalogueState.Ready)?.spots
      val next = choices.useHere(place, spots, catalogue)
      save(next)
      if (before != null && far(before.place, place)) _app.update { it.copy(states = it.states - FollowedPlace.HERE_KEY) }
      next.herePlace?.let(::load)
      hereJob?.cancel()
      hereJob = viewModelScope.launch { moveHere(place.lat, place.lon) }
      viewModelScope.launch { repository.keepOnly(next.places.map { it.place }) }
      if (before?.bell != null) syncBells()
      return true
    }
    val next = choices.add(FollowedPlace(place, spots)) ?: return false
    save(next)
    next.currentPlace?.let(::load)
    return true
  }

  // ------------------------------------------------------------------------------------------- the place « Ici »

  /**
   * The app comes to the front: the place « Ici » goes where the phone is now, rounded to about 1 km, and takes the name
   * of the nearest town. Nothing without a place « Ici », without the permission (it is asked only when « Utiliser ma
   * position » is touched) or without a position; never in the background.
   */
  fun followPhone() {
    if (_app.value.choices.herePlace == null || hereJob?.isActive == true) return
    hereJob =
      viewModelScope.launch {
        val at = bonus { phone() } ?: return@launch
        moveHere(Geo.roundKm(at.first), Geo.roundKm(at.second))
      }
  }

  /**
   * The place « Ici » at the point [lat], [lon] (rounded already): named by the site's nearest town, its spots following
   * it ([Choices.moveHere]), read again. A point that did not change only asks again for a town it does not have yet.
   */
  private suspend fun moveHere(lat: Double, lon: Double) {
    val before = _app.value.choices.herePlace ?: return
    val moved = abs(before.place.lat - lat) > SAME_POINT || abs(before.place.lon - lon) > SAME_POINT
    if (!moved && before.place.name.isNotBlank()) return
    val town = bonus { repository.nearestPlace(lat, lon) }
    val name = town?.name ?: if (moved) "" else before.place.name
    val region =
      if (town != null) Words.placeWhere(town.region, town.country).ifEmpty { null } else if (moved) null else before.place.region
    val catalogue = if (moved) bonus { repository.catalogue() } else null
    val choices = _app.value.choices
    val next = choices.moveHere(Place(name, lat, lon, region, here = true), catalogue)
    if (next == choices) return
    save(next)
    val here = next.herePlace ?: return
    if (moved) {
      // Far away, the old page would show another sky under the new name: it waits for the new read instead.
      if (far(before.place, here.place)) _app.update { it.copy(states = it.states - FollowedPlace.HERE_KEY) }
      load(here)
      repository.keepOnly(next.places.map { it.place })
    } else {
      // Only the town is new: the page takes the name, the weather stays.
      _app.update { app ->
        val state = app.states[FollowedPlace.HERE_KEY]
        if (state is HomeState.Ready) app.copy(states = app.states + (FollowedPlace.HERE_KEY to state.copy(snapshot = state.snapshot.named(here.place)))) else app
      }
      tell()
    }
    // The server names the place of a bell and keeps its point: it learns the new ones.
    if (here.bell != null) syncBells()
  }

  private fun far(a: Place, b: Place): Boolean = Geo.km(a.lat, a.lon, b.lat, b.lon) > KEEP_SHOWN_KM

  /** A read that may fail without harm: null then; the cancellation still cancels. */
  private suspend fun <T> bonus(read: suspend () -> T?): T? =
    try {
      read()
    } catch (err: CancellationException) {
      throw err
    } catch (_: Exception) {
      null
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
    if (gone.bell != null) syncBells()
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

  // ------------------------------------------------------------------------------------------------------- the bells

  /** The bell of the place at [index] (null: « jamais »), then the server is told. */
  fun setBell(index: Int, bell: Bell?) {
    val choices = _app.value.choices
    val next = choices.bell(index, bell)
    if (next == choices) return
    save(next)
    _bells.update { it.copy(test = null) }
    syncBells()
  }

  /** The page of the places opens: the server is asked once what it keeps, when a bell is on. */
  fun openBells() {
    if (_bells.value.state == null && _app.value.choices.belled.isNotEmpty()) syncBells()
  }

  /** Tells the server the bells of now; a failure is tried again in the background by [BellLink.sync]. */
  fun syncBells() {
    syncsWaiting++
    _bells.update { it.copy(busy = true) }
    viewModelScope.launch {
      val state =
        try {
          bellTalk.withLock { bellLink.sync() }
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          BellState.Failed(describe(err))
        } finally {
          syncsWaiting--
        }
      _bells.update { it.copy(state = state, busy = syncsWaiting > 0) }
    }
  }

  /** A test notification to this phone. */
  fun testBell() {
    if (_bells.value.testing) return
    _bells.update { it.copy(testing = true, test = null) }
    viewModelScope.launch {
      val result =
        try {
          bellTalk.withLock { bellLink.test() }
        } catch (err: CancellationException) {
          throw err
        } catch (err: Exception) {
          Result.failure(err)
        }
      val note =
        result.fold(
          { sent ->
            when (sent) {
              null -> TestNote.Forgotten
              0 -> TestNote.NotSent
              else -> TestNote.Sent
            }
          },
          { TestNote.Failed(it.message ?: "Pas de réponse du serveur de Vigie. Vérifiez la connexion.") },
        )
      _bells.update { it.copy(testing = false, test = note) }
      if (note == TestNote.Forgotten) syncBells()
    }
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

    /** Two rounded positions closer than this are the same point. */
    const val SAME_POINT = 1e-6

    /** A move shorter than this keeps the page of « Ici » on screen while it is read again. */
    const val KEEP_SHOWN_KM = 5.0
  }
}
