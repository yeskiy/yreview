import assert from 'node:assert/strict'

import { applyEdits, parse } from 'jsonc-parser'

import {
  findSaveKeyConflicts,
  type Installed,
  runSaveKeyOffer,
  SAVE_COMMAND,
  SAVE_WHEN,
  type SaveKeyHost,
  saveKeyEdits,
  saveKeyLine,
  whenCanHold,
} from '../../src/saveKeyCore'

const INTELLIJ: Installed = {
  id: 'k--kato.intellij-idea-keybindings',
  name: 'IntelliJ IDEA Keybindings',
  bindings: [
    {
      key: 'ctrl+enter',
      mac: 'cmd+enter',
      command: 'editor.action.goToDeclaration',
      when: 'editorTextFocus',
    },
    { key: 'ctrl+enter', command: 'lineBreakInsert', when: 'editorTextFocus && !editorReadonly' },
  ],
}

const one = (binding: Record<string, unknown>, id = 'some.keymap'): Installed => ({
  id,
  name: 'Some Keymap',
  bindings: [binding],
})

const FORMAT = { insertSpaces: true, tabSize: 4, eol: '\n' }

describe('save key conflict detection', () => {
  it('finds the IntelliJ keymap on Windows and on macOS', () => {
    assert.deepEqual(
      findSaveKeyConflicts([INTELLIJ], 'win32').map((found) => found.command),
      ['editor.action.goToDeclaration', 'lineBreakInsert'],
    )
    assert.deepEqual(
      findSaveKeyConflicts([INTELLIJ], 'darwin').map((found) => found.command),
      ['editor.action.goToDeclaration'],
    )
  })

  it('reads the platform keys and accepts other spellings of the same key', () => {
    const shape = { key: 'alt+x', win: 'Enter+Ctrl', linux: 'ctrl + enter', mac: 'meta+enter' }
    const keymap = one({ ...shape, command: 'x.run', when: 'editorFocus' })
    assert.equal(findSaveKeyConflicts([keymap], 'win32').length, 1)
    assert.equal(findSaveKeyConflicts([keymap], 'linux').length, 1)
    assert.equal(findSaveKeyConflicts([keymap], 'darwin').length, 1)
  })

  it('reads a single binding object in place of a list', () => {
    const keymap = { ...one({}), bindings: { key: 'ctrl+enter', command: 'x.run' } }
    assert.equal(findSaveKeyConflicts([keymap], 'win32').length, 1)
  })

  it('ignores other keys, chords, removals, its own bindings and the submit command', () => {
    const ignored: Installed[] = [
      one({ key: 'ctrl+shift+enter', command: 'x.run', when: 'editorTextFocus' }),
      one({ key: 'ctrl+k ctrl+enter', command: 'x.run', when: 'editorTextFocus' }),
      one({ key: 'ctrl+enter', command: '-x.run', when: 'editorTextFocus' }),
      one({ key: 'ctrl+enter', command: SAVE_COMMAND, when: 'editorTextFocus' }),
      one({ key: 'ctrl+enter', command: 'x.run', when: 'editorTextFocus' }, 'yeskiy.yreview'),
      one({ key: 'cmd+enter', command: 'x.run', when: 'editorTextFocus' }),
      { id: 'a.b', name: 'Broken', bindings: 'ctrl+enter' },
      { id: 'a.c', name: 'None', bindings: undefined },
    ]
    assert.deepEqual(findSaveKeyConflicts(ignored, 'win32'), [])
  })

  it('ignores a when clause that excludes the comment editor', () => {
    const excluded = [
      'editorTextFocus && !commentEditorFocused',
      'editorTextFocus && editorReadonly',
      'editorTextFocus && commentController != yreview',
      'notebookEditorFocused',
      'editorTextFocus && editorLangId == java',
      'editorTextFocus && suggestWidgetVisible',
      'editorTextFocus && (editorLangId == java || editorLangId == kotlin)',
      'false',
    ]
    excluded.forEach((when) => assert.equal(whenCanHold(when), false, when))
  })

  it('accepts a when clause that holds in the comment editor', () => {
    const held = [
      undefined,
      '',
      'editorTextFocus',
      'textInputFocus && !editorReadonly && !suggestWidgetVisible',
      'terminalFocus || editorTextFocus',
      "commentController == 'yreview' && commentEditorFocused",
      'editorTextFocus && editorLangId != java',
      'true',
    ]
    held.forEach((when) => assert.equal(whenCanHold(when), true, String(when)))
  })

  it('names the extension that adds the binding', () => {
    assert.equal(
      findSaveKeyConflicts([INTELLIJ], 'win32')[0]?.extension,
      'IntelliJ IDEA Keybindings',
    )
  })
})

describe('save key edit', () => {
  const entries = (text: string): unknown => parse(text, [], { allowTrailingComma: true })

  it('appends the entry to a file with comments and keeps the comments', () => {
    const text =
      '// Place your key bindings in this file to override the defaults\n[\n    { "key": "f5", "command": "a.b" }\n]\n'
    const result = applyEdits(text, saveKeyEdits(text, 'win32', FORMAT))
    assert.ok(result.startsWith('// Place your key bindings'))
    assert.deepEqual(entries(result), [
      { key: 'f5', command: 'a.b' },
      { key: 'ctrl+enter', command: SAVE_COMMAND, when: SAVE_WHEN },
    ])
  })

  it('writes cmd+enter on macOS', () => {
    const text = '[]'
    assert.deepEqual(entries(applyEdits(text, saveKeyEdits(text, 'darwin', FORMAT))), [
      { key: 'cmd+enter', command: SAVE_COMMAND, when: SAVE_WHEN },
    ])
  })

  it('fills an empty file', () => {
    assert.deepEqual(entries(applyEdits('', saveKeyEdits('', 'linux', FORMAT))), [
      { key: 'ctrl+enter', command: SAVE_COMMAND, when: SAVE_WHEN },
    ])
  })

  it('adds nothing when the file has the entry, also in the form of the old manual line', () => {
    const manual =
      '[{ "key": "Ctrl+Enter", "command": "editor.action.submitComment", "when": "commentEditorFocused" }]'
    assert.deepEqual(saveKeyEdits(manual, 'win32', FORMAT), [])
    const once = applyEdits('[]', saveKeyEdits('[]', 'win32', FORMAT))
    assert.deepEqual(saveKeyEdits(once, 'win32', FORMAT), [])
  })

  it('refuses a file that is not a JSON array', () => {
    assert.throws(() => saveKeyEdits('{ "key": 1 }', 'win32', FORMAT))
    assert.throws(() => saveKeyEdits('[ { "key": ', 'win32', FORMAT))
  })

  it('gives the line to add by hand', () => {
    assert.equal(
      saveKeyLine('darwin'),
      '{ "key": "cmd+enter", "command": "editor.action.submitComment", "when": "commentEditorFocused && commentController == yreview" }',
    )
  })
})

describe('save key offer', () => {
  const fake = (choice: string | undefined, options: { stored?: string; fails?: boolean } = {}) => {
    const calls = { asked: [] as string[], added: 0, manual: 0, saved: [] as string[] }
    const host: SaveKeyHost = {
      answer: () => options.stored ?? calls.saved.slice(-1)[0],
      saveAnswer: (value) => {
        calls.saved.push(value)
        return Promise.resolve()
      },
      conflicts: () => findSaveKeyConflicts([INTELLIJ], 'win32'),
      platform: 'win32',
      ask: (message, ...items) => {
        calls.asked.push(`${message} [${items.join('|')}]`)
        return Promise.resolve(choice)
      },
      addEntry: () => {
        calls.added += 1
        return options.fails === true ? Promise.reject(new Error('no edit')) : Promise.resolve()
      },
      showManual: (line) => {
        calls.manual += 1
        assert.equal(line, saveKeyLine('win32'))
        return Promise.resolve()
      },
    }
    return { host, calls }
  }

  it('names the extension and offers Add, Not now and Never', async () => {
    const { host, calls } = fake(undefined)
    await runSaveKeyOffer(host)
    assert.equal(calls.asked.length, 1)
    assert.match(calls.asked[0] ?? '', /IntelliJ IDEA Keybindings/u)
    assert.match(calls.asked[0] ?? '', /Ctrl\+Enter/u)
    assert.match(calls.asked[0] ?? '', /\[Add\|Not now\|Never\]$/u)
    assert.deepEqual(calls.saved, [])
  })

  it('Add adds the entry and keeps the answer', async () => {
    const { host, calls } = fake('Add')
    await runSaveKeyOffer(host)
    await runSaveKeyOffer(host)
    assert.deepEqual(
      { ...calls, asked: calls.asked.length },
      { asked: 1, added: 1, manual: 0, saved: ['added'] },
    )
  })

  it('a failed Add shows the line and keeps no answer', async () => {
    const { host, calls } = fake('Add', { fails: true })
    await runSaveKeyOffer(host)
    assert.deepEqual(
      { added: calls.added, manual: calls.manual, saved: calls.saved },
      { added: 1, manual: 1, saved: [] },
    )
  })

  it('Not now adds nothing and keeps no answer', async () => {
    const { host, calls } = fake('Not now')
    await runSaveKeyOffer(host)
    assert.deepEqual({ added: calls.added, saved: calls.saved }, { added: 0, saved: [] })
  })

  it('Never adds nothing and keeps the answer', async () => {
    const { host, calls } = fake('Never')
    await runSaveKeyOffer(host)
    await runSaveKeyOffer(host)
    assert.deepEqual(
      { asked: calls.asked.length, added: calls.added, saved: calls.saved },
      { asked: 1, added: 0, saved: ['never'] },
    )
  })

  it('a stored answer or no conflict shows nothing', async () => {
    const stored = fake('Add', { stored: 'never' })
    await runSaveKeyOffer(stored.host)
    assert.equal(stored.calls.asked.length, 0)
    const clear = fake('Add')
    await runSaveKeyOffer({ ...clear.host, conflicts: () => [] })
    assert.equal(clear.calls.asked.length, 0)
  })
})
