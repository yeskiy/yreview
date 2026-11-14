import assert from 'node:assert/strict'

import { RefspecAsks } from '../../../src/store/refspecAsks'

const ROOT = '/work/one'
const OTHER = '/work/two'

describe('RefspecAsks', () => {
  it('the first share of a session asks, and later shares stay quiet', () => {
    const asks = new RefspecAsks()
    assert.equal(asks.mayAsk(ROOT), true)
    assert.equal(asks.mayAsk(ROOT), false, 'a question of this session does not come back')
    assert.equal(asks.mayAsk(OTHER), true, 'each repository gets its own question')
  })

  it('do not ask again stops later questions, also in a new session', () => {
    const asks = new RefspecAsks()
    asks.decline(ROOT)
    assert.equal(asks.mayAsk(ROOT), false)
    const next = new RefspecAsks(asks.declined())
    assert.equal(next.mayAsk(ROOT), false, 'the answer is kept in the editor state')
    assert.equal(next.mayAsk(OTHER), true)
    assert.deepEqual(next.declined(), [ROOT])
  })
})
