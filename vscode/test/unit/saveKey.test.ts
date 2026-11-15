import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import path from 'node:path'

import { applyEdits, parse } from 'jsonc-parser'

import {
  findSaveKeyConflicts,
  hasUserEntry,
  type Installed,
  ownSaveIndex,
  placeholderText,
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
    const calls = {
      asked: [] as string[],
      added: 0,
      manual: 0,
      saved: [] as string[],
      notes: [] as string[],
    }
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
        return options.fails === true ? Promise.reject(new Error('no edit')) : Promise.resolve(true)
      },
      showManual: (line) => {
        calls.manual += 1
        assert.equal(line, saveKeyLine('win32'))
        return Promise.resolve()
      },
      note: (message) => calls.notes.push(message),
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
      { ...calls, asked: calls.asked.length, notes: calls.notes.length },
      { asked: 1, added: 1, manual: 0, saved: ['added'], notes: 7 },
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

  it('logs each step: the conflict, the stored answer, the message, the choice and the write', async () => {
    const { host, calls } = fake('Add')
    await runSaveKeyOffer(host)
    assert.deepEqual(calls.notes, [
      'Save key: the extension k--kato.intellij-idea-keybindings takes the save key with editor.action.goToDeclaration.',
      'Save key: the stored answer is none.',
      'Save key: the offer message is shown.',
      'Save key: the choice is Add.',
      'Save key: the entry is added to keybindings.json.',
    ])
    const closed = fake(undefined)
    await runSaveKeyOffer({ ...closed.host, conflicts: () => [] })
    await runSaveKeyOffer(closed.host)
    assert.deepEqual(closed.calls.notes, [
      'Save key: no extension takes the save key in the comment box.',
      'Save key: the stored answer is none.',
      'Save key: the extension k--kato.intellij-idea-keybindings takes the save key with editor.action.goToDeclaration.',
      'Save key: the stored answer is none.',
      'Save key: the offer message is shown.',
      'Save key: the choice is none, the message closed.',
    ])
    const failed = fake('Add', { fails: true })
    await runSaveKeyOffer(failed.host)
    assert.equal(failed.calls.notes.at(-1), 'Save key: the entry could not be added.')
  })

  it('the forced run of the command asks again after Never, and Add then writes', async () => {
    const { host, calls } = fake('Add', { stored: 'never' })
    await runSaveKeyOffer(host)
    assert.equal(calls.asked.length, 0)
    await runSaveKeyOffer(host, true)
    assert.deepEqual(
      { asked: calls.asked.length, added: calls.added, saved: calls.saved },
      { asked: 1, added: 1, saved: ['added'] },
    )
  })

  it('the forced run writes nothing without the Add click', async () => {
    await Promise.all(
      [undefined, 'Not now', 'Never'].map(async (choice) => {
        const { host, calls } = fake(choice, { stored: 'never' })
        await runSaveKeyOffer(host, true)
        assert.deepEqual({ asked: calls.asked.length, added: calls.added }, { asked: 1, added: 0 })
      }),
    )
  })

  it('the forced run shows nothing without a conflict', async () => {
    const { host, calls } = fake('Add')
    await runSaveKeyOffer({ ...host, conflicts: () => [] }, true)
    assert.deepEqual({ asked: calls.asked.length, added: calls.added }, { asked: 0, added: 0 })
  })
})

describe('save key rank', () => {
  const SAVE = { key: 'ctrl+enter', mac: 'cmd+enter', command: SAVE_COMMAND, when: SAVE_WHEN }

  it('finds the index of the own save entry', () => {
    assert.equal(ownSaveIndex([{ command: 'a' }, SAVE, { command: SAVE_COMMAND }], 'win32'), 1)
    assert.equal(ownSaveIndex([{ command: 'a' }, SAVE], 'darwin'), 1)
    assert.equal(ownSaveIndex([{ ...SAVE, when: 'commentEditorFocused' }], 'win32'), -1)
    assert.equal(ownSaveIndex(undefined, 'win32'), -1)
  })

  it('a keymap entry below the own index loses, an entry at or above it wins', () => {
    const at = (index: number): Installed => ({
      ...one({}),
      bindings: [
        ...Array.from({ length: index }, () => ({ command: 'x.pad' })),
        { key: 'ctrl+enter', command: 'x.run', when: 'editorTextFocus' },
      ],
    })
    assert.deepEqual(findSaveKeyConflicts([at(139)], 'win32', 203), [])
    assert.equal(findSaveKeyConflicts([at(203)], 'win32', 203).length, 1)
    assert.equal(findSaveKeyConflicts([at(250)], 'win32', 203).length, 1)
    assert.equal(findSaveKeyConflicts([at(139)], 'win32').length, 1)
  })
})

describe('save key hint', () => {
  const [conflict] = findSaveKeyConflicts([INTELLIJ], 'win32')

  it('names the keymap and the command while a conflict exists', () => {
    assert.equal(
      placeholderText(conflict, 'win32'),
      'Write a review comment. Markdown works. Ctrl+Enter is taken by IntelliJ IDEA Keybindings: run Yreview: Use Ctrl+Enter to Save Comments.',
    )
    assert.match(placeholderText(conflict, 'darwin'), /Cmd\+Enter is taken by/u)
    assert.equal(placeholderText(undefined, 'win32'), 'Write a review comment. Markdown works.')
  })

  it('finds a user save entry in keybindings.json', () => {
    const entry = `{ "key": "ctrl+enter", "command": "${SAVE_COMMAND}" }`
    assert.equal(hasUserEntry(`// note\n[\n  ${entry},\n]`, 'win32'), true)
    assert.equal(hasUserEntry(`[${entry}]`, 'darwin'), false)
    assert.equal(hasUserEntry('[{ "key": "ctrl+enter", "command": "a.b" }]', 'win32'), false)
    assert.equal(hasUserEntry('', 'win32'), false)
    assert.equal(hasUserEntry('{ "broken": ', 'win32'), false)
  })
})

describe('save key entry of the manifest', () => {
  // IntelliJ IDEA Keybindings 1.7.8 has its Ctrl+Enter entry at index 139 of its list.
  const KEYMAP_SAVE_INDEX = 139
  const MARGIN = 50
  const bindings = (
    JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as {
      contributes: { keybindings: Record<string, unknown>[] }
    }
  ).contributes.keybindings

  it('puts the scoped save entry last, above the keymap index with a margin', () => {
    const last = bindings.length - 1
    assert.deepEqual(bindings[last], {
      command: SAVE_COMMAND,
      key: 'ctrl+enter',
      mac: 'cmd+enter',
      when: SAVE_WHEN,
    })
    ;['win32', 'linux', 'darwin'].forEach((platform) =>
      assert.equal(ownSaveIndex(bindings, platform), last),
    )
    assert.ok(last > KEYMAP_SAVE_INDEX + MARGIN, `index ${last}`)
  })

  it('each padding entry has no key and binds nothing', () => {
    const first = bindings.findIndex((binding) => Object.keys(binding).length === 1)
    assert.ok(first > 0, `${first}`)
    bindings
      .slice(first, -1)
      .forEach((binding) => assert.deepEqual(binding, { command: SAVE_COMMAND }))
    bindings
      .slice(0, first)
      .forEach((binding) => assert.equal(typeof binding.key, 'string', JSON.stringify(binding)))
  })
})
