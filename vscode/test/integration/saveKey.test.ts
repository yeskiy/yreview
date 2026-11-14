import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { parse } from 'jsonc-parser'
import * as vscode from 'vscode'

import type { Log } from '../../src/log'
import { installedExtensions, offerSaveKey, type SaveKeyParts } from '../../src/saveKey'
import { SAVE_COMMAND, SAVE_WHEN } from '../../src/saveKeyCore'

const START =
  '// Place your key bindings in this file to override the defaults\n[\n    { "key": "f5", "command": "a.b" }\n]\n'

const KEYMAP = {
  id: 'k--kato.intellij-idea-keybindings',
  name: 'IntelliJ IDEA Keybindings',
  bindings: [
    {
      key: 'ctrl+enter',
      mac: 'cmd+enter',
      command: 'editor.action.goToDeclaration',
      when: 'editorTextFocus',
    },
  ],
}

const memory = (): vscode.Memento => {
  const values = new Map<string, unknown>()
  return {
    keys: () => [...values.keys()],
    get: <T>(key: string, fallback?: T) => (values.has(key) ? (values.get(key) as T) : fallback),
    update: (key: string, value: unknown) => {
      values.set(key, value)
      return Promise.resolve()
    },
  }
}

const errors: unknown[] = []
const log: Log = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: (message, failure) => errors.push(message, failure),
}

const setup = (choice: string | undefined) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'yreview-keys-')), 'keybindings.json')
  writeFileSync(file, START)
  const asked: string[] = []
  const parts: SaveKeyParts = {
    platform: 'win32',
    installed: () => [KEYMAP],
    ask: (message) => {
      asked.push(message)
      return Promise.resolve(choice)
    },
    openKeybindings: () => Promise.resolve(vscode.workspace.openTextDocument(file)),
  }
  return { file, asked, parts, state: memory() }
}

describe('save key offer', () => {
  beforeEach(() => errors.splice(0))

  it('without the Add answer, the keybindings file does not change', async () => {
    await Promise.all(
      [undefined, 'Not now', 'Never'].map(async (choice) => {
        const { file, asked, parts, state } = setup(choice)
        await offerSaveKey(state, log, parts)
        assert.equal(asked.length, 1)
        assert.equal(readFileSync(file, 'utf8'), START)
        assert.equal(state.get('yreview.saveKeyAnswer'), choice === 'Never' ? 'never' : undefined)
      }),
    )
  })

  it('Add writes one entry and saves the file, and a second Add writes no duplicate', async () => {
    const { file, asked, parts, state } = setup('Add')
    await offerSaveKey(state, log, parts)
    assert.deepEqual(errors, [])
    const written = readFileSync(file, 'utf8')
    assert.ok(written.startsWith('// Place your key bindings'))
    assert.deepEqual(parse(written), [
      { key: 'f5', command: 'a.b' },
      { key: 'ctrl+enter', command: SAVE_COMMAND, when: SAVE_WHEN },
    ])
    assert.equal(state.get('yreview.saveKeyAnswer'), 'added')
    await offerSaveKey(memory(), log, parts)
    assert.equal(asked.length, 2)
    assert.equal(readFileSync(file, 'utf8'), written)
  })

  it('the installed extensions of the test host give no conflict, so nothing asks', async () => {
    const { asked, parts, state } = setup('Add')
    await offerSaveKey(state, log, { ...parts, installed: installedExtensions })
    assert.equal(asked.length, 0)
  })
})
