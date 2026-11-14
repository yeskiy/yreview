import assert from 'node:assert/strict'

import {
  DEFAULT_PATTERNS,
  compilePatterns,
  readPatterns,
  refusedMessage,
  searchWords,
  wordsOf,
} from '../../../src/tasks/todoPatterns'

const refused = (pattern: string): readonly string[] =>
  compilePatterns([{ pattern, caseSensitive: false }]).refused

describe('todoPatterns', () => {
  it('the word of \\btodo\\b.* is todo', () => {
    assert.deepEqual(wordsOf('\\btodo\\b.*'), ['todo'])
  })

  it('the word of \\bfixme\\b.* is fixme', () => {
    assert.deepEqual(wordsOf('\\bfixme\\b.*'), ['fixme'])
  })

  it('each branch of TODO|FIXME gives its word', () => {
    assert.deepEqual(wordsOf('TODO|FIXME'), ['TODO', 'FIXME'])
  })

  it('refuses words that are inside a group', () => {
    assert.deepEqual(refused('\\b(todo|fixme)\\b'), ['\\b(todo|fixme)\\b'])
  })

  it('an optional last character leaves the word', () => {
    assert.deepEqual(wordsOf('todos?:'), ['todo'])
  })

  it('the first of two runs of equal length wins', () => {
    assert.deepEqual(wordsOf('xx+yy'), ['xx'])
  })

  it('refuses a class', () => {
    assert.deepEqual(refused('[todo]+'), ['[todo]+'])
  })

  it('an optional first character leaves the run', () => {
    assert.deepEqual(wordsOf('A?BC'), ['BC'])
  })

  it('refuses a run of one character', () => {
    assert.deepEqual(refused('a'), ['a'])
  })

  it('refuses a pattern that does not compile', () => {
    assert.deepEqual(refused('('), ['('])
  })

  it('the default patterns are the IntelliJ defaults and compile', () => {
    const compiled = compilePatterns(DEFAULT_PATTERNS)
    assert.deepEqual(compiled.refused, [])
    assert.deepEqual(searchWords(compiled.patterns), ['todo', 'fixme'])
    assert.equal(compiled.patterns[0]?.rule, '\\btodo\\b.*')
    assert.equal(compiled.patterns[0]?.regex.flags, 'gi')
  })

  it('a case-sensitive pattern compiles without the i flag', () => {
    assert.equal(
      compilePatterns([{ pattern: 'TODO', caseSensitive: true }]).patterns[0]?.regex.flags,
      'g',
    )
  })

  it('reads the patterns of the settings and drops a bad entry', () => {
    assert.deepEqual(
      readPatterns([
        { pattern: 'TODO' },
        { pattern: 4 },
        'x',
        { pattern: 'BUG', caseSensitive: true },
      ]),
      [
        { pattern: 'TODO', caseSensitive: false },
        { pattern: 'BUG', caseSensitive: true },
      ],
    )
    assert.deepEqual(readPatterns(undefined), DEFAULT_PATTERNS)
  })

  it('names each refused pattern in one message', () => {
    assert.equal(
      refusedMessage(['a', '\\b(todo|fixme)\\b']),
      'The extension does not use the TODO patterns a, \\b(todo|fixme)\\b. Each pattern needs a word of two or more letters or digits outside every group. Write each word as its own pattern.',
    )
  })
})
