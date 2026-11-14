import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { AGENTS } from '../../../src/session/catalog'

describe('agent vectors', () => {
  it('the catalog equals spec/vectors/agents.json', () => {
    const file = path.resolve(__dirname, '../../../../spec/vectors/agents.json')
    assert.deepEqual(AGENTS, JSON.parse(readFileSync(file, 'utf8')))
  })
})
