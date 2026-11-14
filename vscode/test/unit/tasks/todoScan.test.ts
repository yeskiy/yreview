import assert from 'node:assert/strict'

import { assignTodoIds } from '../../../src/core/taskIds'
import { DEFAULT_PATTERNS, compilePatterns } from '../../../src/tasks/todoPatterns'
import { type CompiledPattern } from '../../../src/tasks/todoPatterns'
import { hitsOfLine, parseGrep, todoWord, todosOfText } from '../../../src/tasks/todoScan'

const defaults = compilePatterns(DEFAULT_PATTERNS).patterns
const NUL = String.fromCharCode(0)
const CR = '\r'
const NIHON = String.fromCharCode(0x65e5, 0x672c)

const brief = (content: string, patterns: readonly CompiledPattern[] = defaults) =>
  hitsOfLine(content, 1, patterns).map((hit) => [hit.text, hit.word, hit.column])

describe('todoWord', () => {
  it('reads the word of a todo line', () => {
    assert.equal(todoWord('TODO: drop this'), 'TODO')
  })

  it('reads the word of a fixme line', () => {
    assert.equal(todoWord('FIXME the anchor moves'), 'FIXME')
  })

  it('puts the word in capital letters', () => {
    assert.equal(todoWord('todo: drop this'), 'TODO')
  })

  it('passes the space in front of the word', () => {
    assert.equal(todoWord('   TODO drop this'), 'TODO')
  })

  it('gives nothing for a line that starts with a digit', () => {
    assert.equal(todoWord('42 is the answer'), undefined)
  })

  it('gives nothing for an empty line', () => {
    assert.equal(todoWord(''), undefined)
  })
})

describe('todosOfText', () => {
  it('two todo items on one line get two identifiers', () => {
    const hits = todosOfText('/* TODO: a */ /* TODO: a */ /* TODO: b */\nclass Main {}\n', defaults)
    const ids = assignTodoIds(
      '',
      hits.map((hit) => ({ path: 'Main.java', text: hit.text })),
    ).map((item) => item.id)
    assert.deepEqual(
      hits.map((hit) => hit.text),
      ['TODO: a', 'TODO: a', 'TODO: b'],
    )
    assert.equal(new Set(ids).size, 3)
    assert.ok(hits.every((hit) => hit.line === 1))
  })

  it('new lines above a todo item keep its identifier', () => {
    const before = 'class Main {}\n// TODO: drop this\n'
    const after = 'import a;\nimport b;\nclass Main {}\n// TODO: drop this\n'
    const idOf = (text: string): string | undefined =>
      assignTodoIds(
        '',
        todosOfText(text, defaults).map((hit) => ({ path: 'Main.java', text: hit.text })),
      )[0]?.id
    assert.equal(todosOfText(before, defaults)[0]?.line, 2)
    assert.equal(todosOfText(after, defaults)[0]?.line, 4)
    assert.equal(idOf(before), idOf(after))
  })
})

describe('hitsOfLine', () => {
  it('a line comment runs to the end of the line', () => {
    assert.deepEqual(brief('x = 1 // TODO: fix the bound'), [['TODO: fix the bound', 'TODO', 9]])
  })

  it('a block closer leaves the text', () => {
    assert.deepEqual(brief('/* FIXME check */'), [['FIXME check', 'FIXME', 3]])
  })

  it('an HTML closer leaves the text', () => {
    assert.deepEqual(brief('<!-- todo: alt text -->'), [['todo: alt text', 'TODO', 5]])
  })

  it('a carriage return leaves the text', () => {
    assert.deepEqual(brief(`# TODO: one${CR}`), [['TODO: one', 'TODO', 2]])
  })

  it('a word inside another word is no TODO', () => {
    assert.deepEqual(brief('const todoList = []'), [])
  })

  it('the case of the word does not matter by default', () => {
    assert.deepEqual(brief('// Todo: later'), [['Todo: later', 'TODO', 3]])
  })

  it('a match inside an earlier match is no second hit', () => {
    assert.deepEqual(brief('// TODO FIXME both'), [['TODO FIXME both', 'TODO', 3]])
  })

  it('an empty match is no hit', () => {
    assert.deepEqual(brief('abc', [{ rule: 'x*', regex: /x*/g, words: ['x'] }]), [])
  })

  it('a non-ASCII text stays whole', () => {
    assert.deepEqual(brief(`// TODO: ${NIHON}`), [[`TODO: ${NIHON}`, 'TODO', 3]])
  })
})

describe('parseGrep', () => {
  const record = (...parts: string[]): string => parts.join(NUL)

  it('reads a normal record', () => {
    assert.deepEqual(parseGrep(`${record('src/a.ts', '3', '// TODO: x')}\n`), [
      { path: 'src/a.ts', line: 3, content: '// TODO: x' },
    ])
  })

  it('reads a path with a space', () => {
    assert.deepEqual(parseGrep(record('src/my file.ts', '1', 'TODO')), [
      { path: 'src/my file.ts', line: 1, content: 'TODO' },
    ])
  })

  it('reads a path with a non-ASCII character', () => {
    const name = `src/${String.fromCharCode(0xe4)}.ts`
    assert.deepEqual(parseGrep(record(name, '2', 'TODO')), [
      { path: name, line: 2, content: 'TODO' },
    ])
  })

  it('keeps a colon in the line', () => {
    assert.deepEqual(parseGrep(record('a.ts', '5', 'x: 1 // TODO: y')), [
      { path: 'a.ts', line: 5, content: 'x: 1 // TODO: y' },
    ])
  })

  it('drops a record with no NUL', () => {
    assert.deepEqual(parseGrep('a.ts:5:TODO\n'), [])
  })

  it('drops a record with the line number 0', () => {
    assert.deepEqual(parseGrep(record('a.ts', '0', 'TODO')), [])
  })

  it('gives nothing for an empty output', () => {
    assert.deepEqual(parseGrep(''), [])
  })
})
