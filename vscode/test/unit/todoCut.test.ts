import assert from 'node:assert/strict'

import { apartCuts, cutOf, rowCut, type TextCut } from '../../src/core/todoCut'

const remove = (text: string, cut: TextCut): string =>
  text.slice(0, cut.start) + text.slice(cut.end)

const cut = (text: string, comment: string): string => {
  const start = text.indexOf(comment)
  return remove(text, cutOf(text, start, start + comment.length))
}

const lineStart = (text: string, line: number): number =>
  text
    .split('\n')
    .slice(0, line)
    .reduce((sum, row) => sum + row.length + 1, 0)

const lineEnd = (text: string, line: number): number =>
  lineStart(text, line) + (text.split('\n')[line] ?? '').length

const rowOf = (text: string, comment: string, first: number, last: number): TextCut | undefined => {
  const start = text.indexOf(comment)
  return rowCut(text, start, start + comment.length, lineStart(text, first), lineEnd(text, last))
}

const rowText = (
  text: string,
  comment: string,
  first: number,
  last: number,
): string | undefined => {
  const found = rowOf(text, comment, first, last)
  return found === undefined ? undefined : remove(text, found)
}

const before = (text: string, mark: string): string => text.slice(0, text.indexOf(mark))

const trimBreaks = (text: string): string => text.replace(/\n+$/u, '')

describe('todoCut', () => {
  it('a comment alone on its line takes the whole line', () => {
    const text = 'fun a() {\n    // TODO: drop this\n    work()\n}\n'
    assert.equal(cut(text, '// TODO: drop this'), 'fun a() {\n    work()\n}\n')
  })

  it('a comment alone on its line leaves no blank line', () => {
    assert.equal(cut('a()\n// TODO: drop this\nb()\n', '// TODO: drop this'), 'a()\nb()\n')
  })

  it('a comment on the first line takes that line', () => {
    assert.equal(cut('// TODO: drop this\nwork()\n', '// TODO: drop this'), 'work()\n')
  })

  it('a comment on the last line without a line break takes that line', () => {
    assert.equal(cut('work()\n// TODO: drop this', '// TODO: drop this'), 'work()\n')
  })

  it('a comment that follows code keeps the code', () => {
    const text = 'val x = 1   // TODO: drop this\nwork()\n'
    assert.equal(cut(text, '// TODO: drop this'), 'val x = 1\nwork()\n')
  })

  it('a comment in front of code keeps the code and the indent', () => {
    const text = '    /* TODO: drop this */ work()\n'
    assert.equal(cut(text, '/* TODO: drop this */'), '    work()\n')
  })

  it('a comment between code keeps both sides', () => {
    assert.equal(cut('a(/* TODO: drop this */ b)\n', '/* TODO: drop this */'), 'a( b)\n')
  })

  it('a block comment over several lines takes every line', () => {
    const text = 'a()\n  /* TODO: one\n     two */\nb()\n'
    assert.equal(cut(text, '/* TODO: one\n     two */'), 'a()\nb()\n')
  })

  it('the cut of one whole line names the offsets of that line', () => {
    assert.deepEqual(cutOf('a()\n// TODO: x\nb()\n', 4, 14), { start: 4, end: 15 })
  })

  it('two cuts of one file run from the last one to the first one', () => {
    const text = '// TODO: one\nwork()\n// TODO: two\n'
    const first = cutOf(text, 0, 12)
    const second = cutOf(text, 20, 32)
    const cuts = apartCuts([first, second])
    assert.deepEqual(cuts, [second, first])
    assert.equal(
      cuts.reduce((kept, each) => remove(kept, each), text),
      'work()\n',
    )
  })

  it('two cuts that lie over each other become one', () => {
    const one = { start: 10, end: 40 }
    assert.deepEqual(apartCuts([one, { start: 20, end: 30 }]), [one])
    assert.deepEqual(apartCuts([one, one]), [one])
    assert.deepEqual(apartCuts([one, { start: 20, end: 45 }]), [{ start: 10, end: 45 }])
  })

  it('two cuts that touch each other both stay', () => {
    const first = { start: 0, end: 10 }
    const second = { start: 10, end: 20 }
    assert.deepEqual(apartCuts([first, second]), [second, first])
  })

  // --- The lines of one row ---

  const doc = '/**\n * Docs\n * TODO: fix this\n * More docs\n */\nfun a() {}\n'

  it('a row inside a comment takes the line of the row only', () => {
    assert.equal(
      rowText(doc, before(doc, '\nfun'), 2, 2),
      '/**\n * Docs\n * More docs\n */\nfun a() {}\n',
    )
  })

  it('a row over several lines takes every one of them', () => {
    const text = '/**\n * Docs\n * TODO: fix this\n *     and this too\n */\n'
    assert.equal(rowText(text, trimBreaks(text), 2, 3), '/**\n * Docs\n */\n')
  })

  it('a documentation tag inside the lines of the row goes with the row', () => {
    const text = '/**\n * TODO: fix this\n *   @param name the name\n * More docs\n */\n'
    assert.equal(rowText(text, trimBreaks(text), 1, 2), '/**\n * More docs\n */\n')
  })

  it('a row that fills the whole comment takes the whole comment', () => {
    const text = '/**\n * TODO: fix this\n */\nfun a() {}\n'
    assert.equal(rowText(text, before(text, '\nfun'), 1, 1), 'fun a() {}\n')
  })

  it('a row on the line that opens the comment leaves the comment alone', () => {
    const text = '/* TODO: fix this\n   another note */\nfun a() {}\n'
    assert.equal(rowOf(text, before(text, '\nfun'), 0, 0), undefined)
  })

  it('a row on the line that closes the comment leaves the comment alone', () => {
    const text = '/* another note\n   TODO: fix this */\nfun a() {}\n'
    assert.equal(rowOf(text, before(text, '\nfun'), 1, 1), undefined)
  })

  it('a row of a comment alone on its line still takes the whole line', () => {
    const text = 'fun a() {\n    // TODO: drop this\n    work()\n}\n'
    assert.equal(rowText(text, '// TODO: drop this', 1, 1), 'fun a() {\n    work()\n}\n')
  })

  it('a row of a comment that follows code still keeps the code', () => {
    const text = 'val x = 1   // TODO: drop this\nwork()\n'
    assert.equal(rowText(text, '// TODO: drop this', 0, 0), 'val x = 1\nwork()\n')
  })

  // --- CRLF line ends of a VS Code document ---

  it('a comment alone on a CRLF line takes the whole line and its CRLF', () => {
    const text = 'a\r\n// TODO: x\r\nb\r\n'
    assert.deepEqual(cutOf(text, 3, 13), { start: 3, end: 15 })
    assert.equal(text.slice(0, 3) + text.slice(15), 'a\r\nb\r\n')
  })

  it('a comment after code on a CRLF line keeps the CRLF', () => {
    const text = 'x = 1 // TODO: y\r\nz\r\n'
    assert.equal(remove(text, cutOf(text, 6, 16)), 'x = 1\r\nz\r\n')
  })

  it('a row inside a block comment of CRLF lines takes its line and its CRLF', () => {
    const text = '/*\r\n * keep\r\n * TODO: drop\r\n */\r\n'
    const start = text.indexOf(' * TODO')
    const found = rowCut(text, 0, text.indexOf('*/') + 2, start, start + ' * TODO: drop'.length)
    assert.ok(found)
    assert.equal(remove(text, found), '/*\r\n * keep\r\n */\r\n')
  })
})
