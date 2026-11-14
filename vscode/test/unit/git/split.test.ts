import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { splitNote } from '../../../src/git/notes'

interface NoteCase {
  name: string
  stdout: string
  lines: string[]
}

describe('note split vectors', () => {
  ;(
    JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../../spec/vectors/notes.json'), 'utf8'),
    ) as NoteCase[]
  ).forEach((c) => it(c.name, () => assert.deepEqual(splitNote(c.stdout), c.lines)))
})
