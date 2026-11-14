import assert from 'node:assert/strict'

import { GUIDE_TEXT, RULES, TITLE } from '../../../src/handoff/agentGuide'

describe('agent guide', () => {
  const lines = GUIDE_TEXT.split('\n')

  it('stays under sixty lines', () => {
    assert.ok(lines.length < 60, `the guide holds ${lines.length} lines`)
  })

  it('carries the shared rules whole', () => {
    assert.ok(GUIDE_TEXT.includes(RULES), 'the file and the prompt read different rules')
  })

  it('opens with the title the clipboard prompt uses', () => {
    assert.equal(lines[0], TITLE)
  })

  it('names no single folder in the shared rules', () => {
    assert.ok(!RULES.includes('this folder'), 'the rules of every folder name one folder')
  })

  it('names the two files the extension writes', () => {
    assert.ok(GUIDE_TEXT.includes('tasks.json'))
    assert.ok(GUIDE_TEXT.includes('done.txt'))
  })

  it('names every field of a task record', () => {
    ;[
      '`id`',
      '`kind`',
      '`path`',
      '`startLine`',
      '`startColumn`',
      '`endLine`',
      '`endColumn`',
      '`text`',
      '`pattern`',
      '`author`',
    ].forEach((field) => assert.ok(GUIDE_TEXT.includes(field), `the guide misses ${field}`))
  })

  it('names the folder store and the key its records carry', () => {
    assert.ok(GUIDE_TEXT.includes('`.y-review` folder'), 'the guide misses the folder store')
    assert.ok(GUIDE_TEXT.includes('`worktree`'), 'the guide misses the key of a folder record')
  })

  it('states that a folder task closes through the done file', () => {
    assert.ok(
      GUIDE_TEXT.includes('Close a task of that'),
      'the guide does not say how a folder task closes',
    )
  })

  it('states the character set of an identifier', () => {
    assert.ok(
      GUIDE_TEXT.includes('letters, digits, underscores and hyphens only'),
      'the guide does not name the character set of an identifier',
    )
  })

  it('states that a todo closes when the line leaves the source', () => {
    assert.ok(GUIDE_TEXT.includes('Remove that comment line from the source file.'))
  })

  it('states that the extension reads the done file by itself', () => {
    assert.ok(GUIDE_TEXT.includes('The extension picks up every new line by itself.'))
  })

  it('warns before it names the reason', () => {
    assert.ok(GUIDE_TEXT.includes('Never delete `done.txt` and never edit it, because'))
  })

  it('holds no character the style rules ban', () => {
    // The code points are the em dash, the en dash, and the four curly quotation marks.
    ;[0x2014, 0x2013, 0x201c, 0x201d, 0x2018, 0x2019].forEach((code) =>
      assert.equal(
        GUIDE_TEXT.indexOf(String.fromCharCode(code)),
        -1,
        `the guide holds the code point ${code}`,
      ),
    )
  })

  it('holds no contraction', () => {
    ;["don't", "doesn't", "isn't", "won't", "can't", "it's"].forEach((word) =>
      assert.ok(!GUIDE_TEXT.includes(word), `the guide holds ${word}`),
    )
  })
})
