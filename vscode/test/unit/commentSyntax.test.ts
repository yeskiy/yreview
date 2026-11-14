import assert from 'node:assert/strict'

import { commentAround, syntaxOf } from '../../src/core/commentSyntax'

const WHOLE = Symbol('whole')

const cases: readonly (readonly [string, string, string, string | typeof WHOLE | undefined])[] = [
  ['a line comment runs to the end of the line', 'typescript', 'x = 1 // TODO: a\ny', '// TODO: a'],
  ['a line comment stops before a CR', 'typescript', '// TODO: a\r\n', '// TODO: a'],
  ['a block comment on one line', 'java', 'a /* TODO */ b', '/* TODO */'],
  ['a block comment over three lines', 'java', '/*\n * TODO: a\n */', WHOLE],
  ['a line mark inside a block belongs to the block', 'java', '/* a // TODO */', WHOLE],
  ['a block mark with no end inside a line comment', 'java', '// see /* TODO', WHOLE],
  ['a line mark inside a string before a block', 'java', 's = "//"; /* TODO */', '/* TODO */'],
  ['a hash comment', 'python', 'x = 1  # TODO: a', '# TODO: a'],
  ['an HTML comment', 'html', '<!-- TODO: alt -->', WHOLE],
  ['a SQL line comment', 'sql', 'select 1 -- TODO: index', '-- TODO: index'],
  ['a Lisp comment', 'clojure', '(a) ; TODO: b', '; TODO: b'],
  ['a LaTeX comment', 'latex', 'text % TODO: cite', '% TODO: cite'],
  ['a closed block before the TODO is no comment of it', 'java', '/* a */ TODO()', undefined],
  ['code with no comment mark', 'typescript', 'const TODO = 1', undefined],
  ['an unknown language uses the default marks', 'unknown-id', '# TODO: a', WHOLE],
  ['a semicolon is no comment mark in C', 'c', 'f(); TODO();', undefined],
]

describe('commentSyntax', () => {
  cases.forEach(([name, id, text, expected]) =>
    it(name, () => {
      const comment = expected === WHOLE ? text : expected
      assert.deepEqual(
        commentAround(text, text.indexOf('TODO'), syntaxOf(id)),
        comment === undefined
          ? undefined
          : { start: text.indexOf(comment), end: text.indexOf(comment) + comment.length },
      )
    }),
  )
})
