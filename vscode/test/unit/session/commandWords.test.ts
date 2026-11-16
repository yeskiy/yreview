import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { commandWords, isFile } from '../../../src/session/commandWords'

interface WordsCase {
  name: string
  value: string
  files: string[]
  words: string[]
}

describe('command words', () => {
  describe('shared vectors', () =>
    (
      JSON.parse(
        readFileSync(path.resolve(__dirname, '../../../../spec/vectors/commands.json'), 'utf8'),
      ) as WordsCase[]
    ).forEach((c) =>
      it(c.name, () =>
        assert.deepEqual(
          commandWords(c.value, (file) => c.files.includes(file)),
          c.words,
        ),
      ),
    ))

  it('a real file with a space in its path is a file, and a folder or a missing path is not', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'yreview words '))
    const file = path.join(folder, 'my agent.cmd')
    writeFileSync(file, '')
    try {
      assert.equal(await isFile(file), true)
      assert.equal(await isFile(folder), false)
      assert.equal(await isFile(path.join(folder, 'none.cmd')), false)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })
})
