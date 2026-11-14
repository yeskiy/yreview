import assert from 'node:assert/strict'

import { gitAuthor } from '../../../src/git/author'
import { NotesWriteError } from '../../../src/git/errors'
import {
  DID_NOT_START,
  type GitResult,
  type GitRunner,
  ProcessGitRunner,
  TIMED_OUT,
} from '../../../src/git/runner'
import { makeRepo, removeDir } from '../../fixtures/scratch'

const answering = (result: GitResult): GitRunner => ({ run: () => Promise.resolve(result) })

const refused = (pattern?: RegExp) => (error: unknown) =>
  error instanceof NotesWriteError && (pattern === undefined || pattern.test(error.message))

describe('gitAuthor', () => {
  it('the author is the email that git gives', async () => {
    const repo = makeRepo()
    try {
      assert.equal(await gitAuthor(new ProcessGitRunner(repo)), 'reviewer@example.com')
    } finally {
      removeDir(repo)
    }
  })

  it('a git that does not start gives no author', async () => {
    const runner = answering({
      exitCode: DID_NOT_START,
      stdout: '',
      stderr: 'The extension could not start git.',
    })
    await assert.rejects(gitAuthor(runner), refused(/start git/))
  })

  it('a git without user email gives no author', async () => {
    await assert.rejects(
      gitAuthor(answering({ exitCode: 1, stdout: '', stderr: '' })),
      refused(/user\.email/),
    )
  })

  it('a stopped run gives no author', async () => {
    await assert.rejects(
      gitAuthor(answering({ exitCode: TIMED_OUT, stdout: 'a@b.c', stderr: 'stopped' })),
      refused(),
    )
  })
})
