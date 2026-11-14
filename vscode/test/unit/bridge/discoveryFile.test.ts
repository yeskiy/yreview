import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

import {
  bridgeFilePath,
  deleteBridgeFile,
  homeDirectory,
  writeBridgeFile,
} from '../../../src/bridge/discoveryFile'
import { discoveryFileName } from '../../../src/core/paths'
import { scratchDir } from '../../fixtures/scratch'

const TOKEN = 'a'.repeat(64)
const entry = {
  url: 'http://127.0.0.1:4100',
  token: TOKEN,
  projectPath: 'E:/work/demo',
  pid: 4242,
}

describe('discovery file (DiscoveryFileTest.kt)', () => {
  const held = { home: '' }
  const file = (): string => bridgeFilePath(entry.projectPath, held.home)
  beforeEach(() => {
    held.home = scratchDir()
  })
  afterEach(() => rmSync(held.home, { recursive: true, force: true }))

  it('puts the file in the bridge folder of the user profile', () =>
    assert.equal(
      file(),
      path.join(held.home, '.y-review', 'bridge', 'vscode', discoveryFileName('E:/work/demo')),
    ))

  it('the home folder of windows comes from the profile variable', () =>
    assert.equal(homeDirectory('C:\\Users\\a', '/x'), 'C:\\Users\\a'))

  it('a home folder without a profile variable comes from the fallback', () => {
    assert.equal(homeDirectory(undefined, '/home/a'), '/home/a')
    assert.equal(homeDirectory('  ', '/home/a'), '/home/a')
  })

  it('writes the four fields the session reads', async () => {
    await writeBridgeFile(file(), entry)
    assert.equal(
      readFileSync(file(), 'utf8'),
      `{"url":"http://127.0.0.1:4100","token":"${TOKEN}","projectPath":"E:/work/demo","pid":4242}`,
    )
  })

  it('makes the folder when it is missing', async () => {
    await writeBridgeFile(file(), entry)
    assert.equal(statSync(file()).isFile(), true)
  })

  it('replaces the file of an earlier run', async () => {
    await writeBridgeFile(file(), entry)
    await writeBridgeFile(file(), { ...entry, pid: 7 })
    assert.equal(JSON.parse(readFileSync(file(), 'utf8')).pid, 7)
  })

  it('deletes the file', async () => {
    await writeBridgeFile(file(), entry)
    await deleteBridgeFile(file())
    assert.deepEqual(readdirSync(path.dirname(file())), [])
  })

  it('deletes a file that is already gone', async () => {
    await deleteBridgeFile(file())
  })

  it('leaves no other file behind', async () => {
    await writeBridgeFile(file(), entry)
    await writeBridgeFile(file(), { ...entry, pid: 2 })
    await writeBridgeFile(file(), { ...entry, pid: 3 })
    assert.deepEqual(readdirSync(path.dirname(file())), [path.basename(file())])
  })

  it('the file is private', async function privateFile() {
    if (process.platform === 'win32') this.skip()
    await writeBridgeFile(file(), entry)
    assert.equal(statSync(file()).mode % 0o1000, 0o600)
  })

  it('the file stands under the home folder and never in a workspace', () => {
    const relative = path.relative(held.home, file())
    assert.equal(relative.startsWith('..') || path.isAbsolute(relative), false)
  })
})
