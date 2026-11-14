import assert from 'node:assert/strict'

import { ANALYSES, DISCUSS, LOCAL, isShared, refFor } from '../../../src/store/noteRefs'

// The values of the setting yreview.newComments.
const shareByDefault = (setting: 'local' | 'shared'): boolean => setting === 'shared'

describe('note refs', () => {
  it('a comment that is not shared goes to the local ref', () => {
    assert.equal(refFor(false), LOCAL)
  })

  it('a shared comment goes to the discuss ref', () => {
    assert.equal(refFor(true), DISCUSS)
  })

  it('only the local ref stays out of the remote', () => {
    assert.equal(isShared(LOCAL), false)
    assert.equal(isShared(DISCUSS), true)
    assert.equal(isShared(ANALYSES), true)
  })

  it('the local setting writes the local ref', () => {
    assert.equal(refFor(shareByDefault('local')), LOCAL)
  })

  it('the shared setting writes the discuss ref', () => {
    assert.equal(refFor(shareByDefault('shared')), DISCUSS)
  })
})
