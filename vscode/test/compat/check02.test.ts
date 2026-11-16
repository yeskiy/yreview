import assert from 'node:assert/strict'
import path from 'node:path'

import { reviewComments } from '../integration/previewKit'
import { config, eventually, fileOf, git } from './kit'

const NOTES = 'refs/notes/devtools/discuss'

describe('check 2', () => {
  it('A shared comment reaches a second clone', async () => {
    const text = `Shared probe ${Date.now()}.`
    const comments = await reviewComments()
    await comments.addAt(fileOf(path.join('src', 'a.txt')), { start: 1, end: 1 }, text, true)
    const { second } = config()
    const reached = await eventually(async () => {
      git(second, 'fetch', '-q', 'origin', `+${NOTES}:${NOTES}`)
      return git(second, 'notes', '--ref', NOTES, 'show', 'HEAD').includes(text)
    }, 120)
    assert.ok(reached, 'the second clone does not get the shared comment from the remote')
  })
})
