import { strict as assert } from 'node:assert'
import { existsSync, readFileSync, readdirSync, rmSync, statSync, utimesSync } from 'node:fs'
import path from 'node:path'

import {
  ensureLauncher,
  launcherPath,
  launcherText,
  refreshLauncher,
} from '../../../src/session/launcher'
import { scratchDir } from '../../fixtures/scratch'

const EXEC = '/usr/share/code/code'
const SCRIPT = '/home/one/.vscode/extensions/yeskiy.y-review/dist/channel.js'

describe('channel launcher', () => {
  const held = { home: '' }
  beforeEach(() => {
    held.home = scratchDir()
  })
  afterEach(() => rmSync(held.home, { recursive: true, force: true }))

  it('the posix path stands in the bin folder of VS Code', () =>
    assert.equal(
      launcherPath(held.home, false),
      path.join(held.home, '.y-review', 'vscode', 'bin', 'y-review-channel'),
    ))

  it('the windows path ends with .cmd', () =>
    assert.equal(
      launcherPath(held.home, true),
      path.join(held.home, '.y-review', 'vscode', 'bin', 'y-review-channel.cmd'),
    ))

  it('the posix text is a shebang, a comment and one exec line', () => {
    const lines = launcherText(EXEC, SCRIPT, false).split('\n')
    assert.equal(lines.length, 4)
    assert.equal(lines[0], '#!/bin/sh')
    assert.match(lines[1] ?? '', /^# /)
    assert.equal(lines[2], `ELECTRON_RUN_AS_NODE=1 exec '${EXEC}' '${SCRIPT}' "$@"`)
    assert.equal(lines[3], '')
  })

  it('a posix path with an apostrophe stays one word', () =>
    assert.equal(
      launcherText("/home/O'Brien/code", SCRIPT, false).split('\n')[2],
      `ELECTRON_RUN_AS_NODE=1 exec '/home/O'\\''Brien/code' '${SCRIPT}' "$@"`,
    ))

  it('the windows text sets the variable and passes every argument, with CRLF line ends', () =>
    assert.equal(
      launcherText('C:\\VS Code\\Code.exe', 'C:\\ext\\channel.js', true),
      '@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"C:\\VS Code\\Code.exe" "C:\\ext\\channel.js" %*\r\n',
    ))

  it('a percent sign in a windows path is doubled', () =>
    assert.equal(
      launcherText('C:\\100%\\Code.exe', SCRIPT, true).split('\r\n')[2],
      `"C:\\100%%\\Code.exe" "${SCRIPT}" %*`,
    ))

  it('the launcher holds no token and no bridge variable', () =>
    [true, false].forEach((windows) => {
      assert.doesNotMatch(launcherText(EXEC, SCRIPT, windows), /[0-9a-f]{64}/)
      assert.equal(launcherText(EXEC, SCRIPT, windows).includes('Y_REVIEW_BRIDGE'), false)
    }))

  it('ensureLauncher writes the file once and gives its path', async () => {
    const file = await ensureLauncher(held.home, EXEC, SCRIPT, false)
    assert.equal(file, launcherPath(held.home, false))
    assert.equal(readFileSync(file, 'utf8'), launcherText(EXEC, SCRIPT, false))
    assert.deepEqual(readdirSync(path.dirname(file)), ['y-review-channel'])
  })

  it('ensureLauncher writes nothing when the text is equal', async () => {
    const file = await ensureLauncher(held.home, EXEC, SCRIPT, false)
    utimesSync(file, 0, 0)
    await ensureLauncher(held.home, EXEC, SCRIPT, false)
    assert.equal(statSync(file).mtimeMs, 0)
  })

  it('ensureLauncher writes again when the runtime moves', async () => {
    const file = await ensureLauncher(held.home, EXEC, SCRIPT, false)
    await ensureLauncher(held.home, '/opt/code/code', SCRIPT, false)
    assert.equal(readFileSync(file, 'utf8'), launcherText('/opt/code/code', SCRIPT, false))
  })

  it('a refresh writes an old launcher again with the new script', async () => {
    const file = await ensureLauncher(held.home, EXEC, SCRIPT, false)
    const moved = SCRIPT.replace('y-review', 'y-review-1.0.1')
    await refreshLauncher(held.home, EXEC, moved, false)
    assert.equal(readFileSync(file, 'utf8'), launcherText(EXEC, moved, false))
  })

  it('a refresh makes no launcher when none exists', async () => {
    await refreshLauncher(held.home, EXEC, SCRIPT, false)
    assert.equal(existsSync(launcherPath(held.home, false)), false)
  })

  it('the posix launcher runs for the user only', async function privateLauncher() {
    if (process.platform === 'win32') this.skip()
    assert.equal(
      statSync(await ensureLauncher(held.home, EXEC, SCRIPT, false)).mode % 0o1000,
      0o700,
    )
  })
})
