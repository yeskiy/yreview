import assert from 'node:assert/strict'

import { FETCH_REFSPEC, FORCED_REFSPEC } from '../../../src/git/sharing'
import { exactly } from '../../../src/git/valuePattern'

describe('exactly', () => {
  it('a plain value stands between the two anchors', () => {
    assert.equal(exactly('origin'), '^origin$')
  })

  it('the plus and the star lose their pattern meaning', () => {
    assert.equal(exactly(FORCED_REFSPEC), '^\\+refs/notes/devtools/\\*:refs/notes/devtools/\\*$')
  })

  it('the pattern of the forced refspec matches that refspec alone', () => {
    const pattern = new RegExp(exactly(FORCED_REFSPEC))
    assert.ok(pattern.test(FORCED_REFSPEC))
    assert.ok(!pattern.test(FETCH_REFSPEC), 'the safe refspec must stay')
    assert.ok(!pattern.test('+refs/heads/*:refs/remotes/origin/*'), 'the branch refspec must stay')
  })
})
