import assert from 'node:assert/strict'
import { realpath } from 'node:fs/promises'
import path from 'node:path'

import { ProcessGitRunner } from '../../../src/git/runner'
import { makeRepo, removeDir, shortForm } from '../../fixtures/scratch'

describe('a short-form path of a repository', () => {
  const repo = makeRepo()
  after(() => removeDir(repo))

  // The root of a file and the lock key compare a Node.js real path with a path from git.
  it('gives the same long path from git and from Node.js', async function longForms() {
    const short = shortForm(repo)
    // 8.3 names exist only on Windows volumes that make them.
    if (short === undefined) this.skip()
    const runner = new ProcessGitRunner(short)
    const answer = async (...args: string[]): Promise<string> =>
      path.resolve((await runner.run(args)).stdout.trim())
    assert.equal(await answer('rev-parse', '--show-toplevel'), repo)
    assert.equal(
      await answer('rev-parse', '--path-format=absolute', '--git-common-dir'),
      path.join(repo, '.git'),
    )
    assert.equal(await realpath(path.join(short, 'src', 'a.txt')), path.join(repo, 'src', 'a.txt'))
  })
})
