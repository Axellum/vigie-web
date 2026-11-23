package fr.auxfilsdesidees.vigie.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import fr.auxfilsdesidees.vigie.notify.AccountLinking
import fr.auxfilsdesidees.vigie.notify.AccountState
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** What the part « Compte Vigie » says after an action, besides the state. */
enum class AccountNote {
  /** The code expired before it was entered. */
  EXPIRED,

  /** The server no longer knew the phone: it was removed on the account page, or the account deleted. */
  DROPPED,

  /** The person unlinked the phone here. */
  UNLINKED,

  /** Just linked: the phone now gets the alerts of the account's zones. */
  LINKED,
  TEST_SENT,

  /** The server knew the phone but Firebase did not take the message. */
  TEST_NONE,
}

/** The part « Compte Vigie » of the page of the places: [busy] while an action runs, [error] when it failed. */
data class AccountUi(
  val state: AccountState = AccountState.Unlinked,
  val busy: Boolean = false,
  val note: AccountNote? = null,
  val error: String? = null,
)

/**
 * The link of the app to an account, for the page of the places: ask a code, ask the server where it stands while the
 * page is shown, read the account, send a test, unlink. One talk with the server at a time.
 */
class AccountViewModel(private val linking: AccountLinking, private val describe: (Exception) -> String) : ViewModel() {
  private val _ui = MutableStateFlow(AccountUi(linking.state()))
  val ui: StateFlow<AccountUi> = _ui.asStateFlow()

  private val talk = Mutex()
  private var read = false

  /** The page opens: a linked phone reads its account once (its zones may have changed, or it was unlinked). */
  fun open() {
    if (read || _ui.value.state !is AccountState.Linked) return
    read = true
    act(quiet = true) { linking.refresh() }
  }

  /** A new code to show. */
  fun begin() = act { linking.begin() }

  /** The code is no longer shown. */
  fun cancel() {
    linking.cancel()
    _ui.value = AccountUi(AccountState.Unlinked)
  }

  /** One question to the server while a code is shown (the page asks every few seconds); a network failure is said. */
  suspend fun poll() {
    if (_ui.value.state !is AccountState.Waiting || _ui.value.busy) return
    val before = _ui.value.state
    val after =
      try {
        talk.withLock { linking.poll() }
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        _ui.update { it.copy(error = describe(err)) }
        return
      }
    _ui.update { it.copy(state = after, note = noteOf(before, after) ?: it.note, error = null) }
  }

  fun unlink() = act(after = { AccountNote.UNLINKED }) { linking.unlink() }

  fun test() {
    if (_ui.value.busy) return
    _ui.update { it.copy(busy = true, note = null, error = null) }
    viewModelScope.launch {
      try {
        val sent = talk.withLock { linking.test() }
        val note =
          when (sent) {
            null -> AccountNote.DROPPED
            0 -> AccountNote.TEST_NONE
            else -> AccountNote.TEST_SENT
          }
        _ui.update { it.copy(state = linking.state(), busy = false, note = note) }
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        _ui.update { it.copy(busy = false, error = describe(err)) }
      }
    }
  }

  /** Runs [step]; [quiet]: no « busy » while it runs (the account read on opening). */
  private fun act(quiet: Boolean = false, after: (() -> AccountNote)? = null, step: suspend () -> AccountState) {
    if (_ui.value.busy) return
    val before = _ui.value.state
    if (!quiet) _ui.update { it.copy(busy = true, note = null, error = null) }
    viewModelScope.launch {
      try {
        val state = talk.withLock { step() }
        _ui.update { it.copy(state = state, busy = false, note = after?.invoke() ?: noteOf(before, state), error = null) }
      } catch (err: CancellationException) {
        throw err
      } catch (err: Exception) {
        // The quiet read keeps the last account shown: offline, the page says nothing more.
        _ui.update { it.copy(busy = false, error = if (quiet) it.error else describe(err)) }
      }
    }
  }

  private fun noteOf(before: AccountState, after: AccountState): AccountNote? =
    when {
      before is AccountState.Waiting && after is AccountState.Linked -> AccountNote.LINKED
      before is AccountState.Waiting && after is AccountState.Unlinked -> AccountNote.EXPIRED
      before is AccountState.Linked && after is AccountState.Unlinked -> AccountNote.DROPPED
      else -> null
    }
}
