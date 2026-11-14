import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

import { readIfFile, writeAtomic } from '../../../src/core/atomicWrite'
import { scratchDir } from '../../fixtures/scratch'

describe('atomic write', () => {
  const held = { dir: '' }
  beforeEach(() => {
    held.dir = scratchDir()
  })
  afterEach(() => rmSync(held.dir, { recursive: true, force: true }))

  it('makes the folder of the file', async () => {
    const file = path.join(held.dir, 'a', 'b', 'c.json')
    await writeAtomic(file, 'one')
    assert.equal(readFileSync(file, 'utf8'), 'one')
  })

  it('replaces the text of a second write and leaves no temporary file', async () => {
    const file = path.join(held.dir, 'c.json')
    await writeAtomic(file, 'one')
    await writeAtomic(file, 'two')
    assert.equal(readFileSync(file, 'utf8'), 'two')
    assert.deepEqual(readdirSync(held.dir), ['c.json'])
  })

  it('reads the text of a file', async () => {
    const file = path.join(held.dir, 'c.json')
    await writeAtomic(file, 'one')
    assert.equal(await readIfFile(file), 'one')
  })

  it('reads nothing from a missing file', async () =>
    assert.equal(await readIfFile(path.join(held.dir, 'gone.json')), undefined))

  it('reads nothing from a folder', async () => assert.equal(await readIfFile(held.dir), undefined))
})
