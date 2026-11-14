import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { chmodSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { userInfo } from 'node:os'
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

  it('throws for a file that does not read, so no caller writes over it', async function denied() {
    if (process.platform !== 'win32' && process.getuid?.() === 0) this.skip()
    const file = path.join(held.dir, 'mcp.json')
    writeFileSync(file, '{"mcpServers":{"other":{}}}')
    const user = userInfo().username
    const lock = (on: boolean): unknown =>
      process.platform === 'win32'
        ? execFileSync('icacls', [file, on ? '/deny' : '/remove:d', on ? `${user}:(RD)` : user])
        : chmodSync(file, on ? 0o000 : 0o600)
    lock(true)
    try {
      await assert.rejects(readIfFile(file))
    } finally {
      lock(false)
    }
    assert.equal(readFileSync(file, 'utf8'), '{"mcpServers":{"other":{}}}')
  })
})
