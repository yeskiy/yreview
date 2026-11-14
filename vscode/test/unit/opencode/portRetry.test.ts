import { strict as assert } from 'node:assert'

import { MAX_TRIES, SHORT_MS, startAgain } from '../../../src/session/portRetry'

describe('port retry (PortRetryTest.kt)', () => {
  it('a session that died at once on a loopback port starts again', () =>
    assert.equal(startAgain('local_http', 891, 1), true))

  it('an agent that runs no server of its own never starts again', () => {
    assert.equal(startAgain('channel', 891, 1), false)
    assert.equal(startAgain('none', 891, 1), false)
  })

  it('a session that ran and then ended stays ended', () =>
    assert.equal(startAgain('local_http', 60_000, 1), false))

  it('the limit itself is already too long', () => {
    assert.equal(startAgain('local_http', SHORT_MS - 1, 1), true)
    assert.equal(startAgain('local_http', SHORT_MS, 1), false)
    assert.equal(startAgain('local_http', SHORT_MS + 1, 1), false)
  })

  it('the count at the cap stops the chain', () => {
    assert.equal(startAgain('local_http', 891, MAX_TRIES - 1), true)
    assert.equal(startAgain('local_http', 891, MAX_TRIES), false)
    assert.equal(startAgain('local_http', 891, MAX_TRIES + 1), false)
  })

  it('one press on Start makes five starts and no more', () => {
    assert.equal(MAX_TRIES, 5)
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((tries) => startAgain('local_http', 891, tries)),
      [true, true, true, true, false, false],
    )
  })
})
