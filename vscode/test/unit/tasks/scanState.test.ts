import assert from 'node:assert/strict'

import {
  FAILED_LONG,
  LOADING_TEXT,
  READ_LONG,
  ScanState,
  emptyText,
  isLoading,
  readScope,
} from '../../../src/tasks/scanRuns'

const found = 'This scope has no open review task.'
const failing = (): Promise<readonly string[] | undefined> =>
  Promise.reject(new Error('git did not answer'))

/** Starts a scan and finishes it, as a view does after its first read. */
const scanned = (failed = false): ScanState => {
  const state = new ScanState()
  state.finish(state.start(), failed)
  return state
}

describe('ScanState', () => {
  // --- A view that never scanned ---

  it('a new view waits for its first scan', () => {
    const state = new ScanState()
    assert.equal(state.phase, 'new')
    assert.equal(isLoading(state.phase, 0), true)
  })

  it('a new view does not say that the scope is empty', () => {
    assert.equal(emptyText(new ScanState().phase, found), READ_LONG)
  })

  // --- A scan in flight ---

  it('a scan in flight keeps the loading state', () => {
    const state = new ScanState()
    state.start()
    assert.equal(state.phase, 'running')
    assert.equal(isLoading(state.phase, 0), true)
    assert.equal(emptyText(state.phase, found), READ_LONG)
    assert.equal(LOADING_TEXT, 'The extension reads the review tasks.')
  })

  it('a scan in flight keeps the loading state of a view that scanned before', () => {
    const state = scanned()
    state.start()
    assert.equal(isLoading(state.phase, 0), true)
    assert.equal(emptyText(state.phase, found), READ_LONG)
  })

  // --- A scan that failed ---

  it('a scan that failed stops the loading state', () => {
    const state = scanned(true)
    assert.equal(state.phase, 'failed')
    assert.equal(isLoading(state.phase, 0), false)
  })

  it('a scan that failed says so and does not name an empty scope', () => {
    assert.equal(emptyText(scanned(true).phase, found), FAILED_LONG)
  })

  // --- A read that throws ---

  it('a read that throws gives no rows and keeps the reason', async () => {
    const outcome = await readScope(failing)
    assert.equal(outcome.rows, undefined)
    assert.equal((outcome.failure as Error).message, 'git did not answer')
  })

  it('a read that throws stops the spinner of its own scan', async () => {
    const state = new ScanState()
    const ticket = state.start()
    const outcome = await readScope(failing)
    assert.equal(state.finish(ticket, outcome.rows === undefined), true)
    assert.equal(isLoading(state.phase, 0), false)
    assert.equal(emptyText(state.phase, found), FAILED_LONG)
  })

  it('a read that gives rows keeps no reason', async () => {
    const outcome = await readScope(() => Promise.resolve(['a.kt']))
    assert.deepEqual(outcome.rows, ['a.kt'])
    assert.equal(outcome.failure, undefined)
  })

  it('a read of a repository that went away gives no rows and no reason', async () => {
    const outcome = await readScope<readonly string[]>(() => Promise.resolve(undefined))
    assert.equal(outcome.rows, undefined)
    assert.equal(outcome.failure, undefined)
  })

  it('a read that throws under a later scan leaves that scan alone', async () => {
    const state = new ScanState()
    const first = state.start()
    state.start()
    const outcome = await readScope(failing)
    assert.equal(state.finish(first, outcome.rows === undefined), false)
    assert.equal(state.phase, 'running')
    assert.equal(isLoading(state.phase, 0), true)
  })

  // --- A scan that finished and found nothing ---

  it('a finished scan keeps the words of the caller', () => {
    const state = scanned()
    assert.equal(state.phase, 'ready')
    assert.equal(isLoading(state.phase, 0), false)
    assert.equal(emptyText(state.phase, found), found)
  })

  it('a finished scan of the Local Changes view keeps the words of that view', () => {
    const changes = 'No changed file has an open review task.'
    assert.equal(emptyText(scanned().phase, changes), changes)
  })

  // --- Two scans that overlap ---

  it('only the newest scan carries a current ticket', () => {
    const state = new ScanState()
    const first = state.start()
    const second = state.start()
    assert.equal(state.current(first), false)
    assert.equal(state.current(second), true)
  })

  it('a late scan does not stop the spinner of a later scan', () => {
    const state = new ScanState()
    const first = state.start()
    state.start()
    assert.equal(state.finish(first, false), false)
    assert.equal(state.phase, 'running')
    assert.equal(isLoading(state.phase, 0), true)
  })

  it('a late scan that failed does not write over a later scan', () => {
    const state = new ScanState()
    const first = state.start()
    state.finish(state.start(), false)
    assert.equal(state.finish(first, true), false)
    assert.equal(state.phase, 'ready')
    assert.equal(emptyText(state.phase, found), found)
  })

  it('the newest scan writes its result', () => {
    const state = new ScanState()
    state.start()
    assert.equal(state.finish(state.start(), false), true)
    assert.equal(state.phase, 'ready')
  })

  it('a view that never scanned rejects every ticket of a scan', () => {
    assert.equal(new ScanState().current(1), false)
  })

  // --- A view that holds rows ---

  it('a new view with no row shows the spinner', () => {
    assert.equal(isLoading(new ScanState().phase, 0), true)
  })

  it('a view with no row runs its next scan with a spinner', () => {
    const state = scanned()
    state.start()
    assert.equal(isLoading(state.phase, 0), true)
  })

  it('a view with rows runs its next scan without a spinner', () => {
    const state = scanned()
    state.start()
    assert.equal(state.phase, 'running')
    assert.equal(isLoading(state.phase, 3), false)
  })

  it('a scan that empties the tree stops the spinner', () => {
    const state = new ScanState()
    const ticket = state.start()
    assert.equal(isLoading(state.phase, 3), false)
    assert.equal(state.finish(ticket, false), true)
    assert.equal(isLoading(state.phase, 0), false)
    assert.equal(emptyText(state.phase, found), found)
  })

  it('a view that lost its rows runs its next scan with a spinner', () => {
    const state = scanned()
    assert.equal(isLoading(state.phase, 3), false)
    state.start()
    assert.equal(isLoading(state.phase, 0), true)
    assert.equal(emptyText(state.phase, found), READ_LONG)
  })

  it('a scan that failed over rows runs no spinner', () => {
    const state = scanned(true)
    assert.equal(state.phase, 'failed')
    assert.equal(isLoading(state.phase, 3), false)
  })
})
