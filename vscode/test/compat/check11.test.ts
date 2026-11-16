import assert from 'node:assert/strict'
import { existsSync, writeFileSync } from 'node:fs'

import { api } from '../integration/previewKit'
import { config } from './kit'

// The launcher reads the record after the window closes, and checks that the file is gone.
describe('check 11', () => {
  it('The bridge file goes when the window goes', async () => {
    const lookup = (await (await api()).bridge?.start()) ?? assert.fail('no bridge')
    if (lookup.kind !== 'available') return assert.fail(lookup.kind)
    assert.equal(existsSync(lookup.path), true)
    return writeFileSync(config().bridgeRecord, JSON.stringify({ path: lookup.path }))
  })
})
